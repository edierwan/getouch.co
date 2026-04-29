/**
 * Getouch WA Gateway — multi-session HTTP runtime.
 *
 * Replaces the previous single-session module-scoped Baileys design with a
 * SessionManager that owns per-session sockets and per-session auth dirs.
 *
 * - WAPI routes (require X-WAPI-Secret):
 *     POST   /api/sessions/:id
 *     GET    /api/sessions/:id/status
 *     GET    /api/sessions/:id/qr
 *     POST   /api/sessions/:id/reset
 *     DELETE /api/sessions/:id
 *     POST   /api/sessions/:id/messages
 *     GET    /api/sessions
 *     GET    /api/webhook-stats
 *   Aliases: /sessions/...
 *   Public: /health, /healthz, /
 *
 * - Legacy single-session routes are kept for compatibility, but route
 *   through SessionManager.getOrCreate(DEFAULT_SESSION_ID). They are marked
 *   deprecated in the admin Tools page.
 */

import http from 'node:http';
import { URL } from 'node:url';
import { mkdir, readdir, copyFile, stat } from 'node:fs/promises';
import path from 'node:path';
import pino from 'pino';

import { SessionManager, isValidSessionId } from './session-manager.mjs';
import { WebhookDispatcher } from './webhook-dispatcher.mjs';
import * as legacyDb from './db.mjs';
import * as freshDb from './baileys-db.mjs';
import { consoleHtml } from './ui.mjs';

function parseBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }
  if (typeof value === 'number') return value !== 0;
  return fallback;
}

function deriveDatabaseName(databaseUrl, fallback = 'unknown') {
  if (!databaseUrl) return fallback;
  try {
    const parsed = new URL(databaseUrl);
    return parsed.pathname.replace(/^\//, '') || fallback;
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const PORT = Number(process.env.PORT || 3001);
const GATEWAY_MODE = process.env.WA_GATEWAY_MODE === 'baileys' ? 'baileys' : 'legacy';
const API_KEY = process.env.WA_API_KEY || '';
const ADMIN_KEY = process.env.WA_ADMIN_KEY || API_KEY;
const LEGACY_AUTH_DIR = process.env.WA_AUTH_DIR || '/app/data/auth';
const SESSIONS_DIR = process.env.SESSIONS_DIR || '/data/sessions';
const DEFAULT_SESSION_ID = (process.env.DEFAULT_SESSION_ID || 'default').trim() || 'default';
const MAX_CONCURRENT_SESSIONS = Number(process.env.MAX_CONCURRENT_SESSIONS || 0);
const AUTO_START_SESSIONS = parseBoolean(process.env.AUTO_START_SESSIONS, false);
const AUTO_START_DEFAULT = parseBoolean(process.env.AUTO_START_DEFAULT_SESSION, true);
const WAPI_SECRET = process.env.WAPI_SECRET || '';
const WAPI_WEBHOOK_URL = process.env.WAPI_WEBHOOK_URL || '';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

const DIFY_BASE_URL = (process.env.DIFY_BASE_URL || 'http://dify-nginx').replace(/\/$/, '');
const DIFY_APP_API_KEY = process.env.DIFY_APP_API_KEY || '';
const DIFY_AUTO_REPLY_ENABLED = process.env.WA_DIFY_AUTO_REPLY_ENABLED === 'true';
const WA_ACTIVE_RESPONDER = parseBoolean(process.env.WA_ACTIVE_RESPONDER, true);
const WA_DEPLOYMENT_LABEL = String(process.env.WA_DEPLOYMENT_LABEL || 'unknown').trim() || 'unknown';
const WA_DIFY_APP_NAME = String(process.env.WA_DIFY_APP_NAME || '').trim() || null;
const WA_ASSISTANT_MODEL_HINT = String(process.env.WA_ASSISTANT_MODEL_HINT || '').trim() || null;
const AI_TRIGGER_NAME = String(process.env.AI_TRIGGER_NAME || 'Sera').trim() || 'Sera';
const AI_GREETING_REPLY = 'Hi! 👋 Ini Serapod AI Support. Nak tanya apa-apa boleh terus je 😊';
const AI_SESSION_TIMEOUT_MINUTES = Math.max(1, Number(process.env.AI_SESSION_TIMEOUT_MINUTES || '30'));
const AI_SESSION_TIMEOUT_MS = AI_SESSION_TIMEOUT_MINUTES * 60 * 1000;
const AI_GROUP_REPLY_CONTEXT_MINUTES = Math.max(1, Number(process.env.AI_GROUP_REPLY_CONTEXT_MINUTES || '10'));
const AI_GROUP_REPLY_CONTEXT_MS = AI_GROUP_REPLY_CONTEXT_MINUTES * 60 * 1000;
const AI_GROUP_PARTICIPANT_WINDOW_MINUTES = Math.max(1, Number(process.env.AI_GROUP_PARTICIPANT_WINDOW_MINUTES || '5'));
const AI_GROUP_PARTICIPANT_WINDOW_MS = AI_GROUP_PARTICIPANT_WINDOW_MINUTES * 60 * 1000;
const SERVICE_NAME = GATEWAY_MODE === 'baileys'
  ? (process.env.WA_SERVICE_NAME || 'baileys-gateway')
  : 'getouch-wa';

const db = GATEWAY_MODE === 'baileys' ? freshDb : legacyDb;
const {
  initDb,
  isDbReady,
  logMessage,
  logEvent,
  getMessages,
  getStats,
  getPersistedEvents,
  createApiKey,
  listApiKeys,
  revokeApiKey,
  disableApiKey,
  enableApiKey,
  regenerateApiKey,
  assignKeyToApp,
  deleteApiKey,
  validateApiKey,
  recordKeyUsage,
  createApp,
  listApps,
  getApp,
  updateApp,
  deleteApp,
  toggleAppStatus,
  getOverviewStats,
  getSetting,
  getSettings,
  setSetting,
  hashApiKey,
  upsertSessionRecord: persistSessionRecord = async () => null,
  deleteSessionRecord: persistDeleteSessionRecord = async () => false,
  recordSendAttempt: persistSendAttempt = async () => null,
} = db;
const RUNTIME_DATABASE = GATEWAY_MODE === 'baileys'
  ? (typeof freshDb.getDatabaseName === 'function' ? freshDb.getDatabaseName() : process.env.BAILEYS_DB_NAME || 'baileys')
  : deriveDatabaseName(process.env.DATABASE_URL, 'getouch.co');

const logger = pino({ level: LOG_LEVEL });

if (!API_KEY) logger.warn('WA_API_KEY is not set — protected endpoints will reject all requests');
if (!WAPI_SECRET) logger.warn('WAPI_SECRET is not set — /api/sessions/* will reject all WAPI requests');
if (!WAPI_WEBHOOK_URL) logger.warn('WAPI_WEBHOOK_URL is not set — outbound gateway events will not be delivered');

// ---------------------------------------------------------------------------
// Per-session AI state (still in-memory; keyed by sessionId+phone)
// ---------------------------------------------------------------------------
const difyConversationIds = new Map(); // key = `${sessionId}:${phone}`
const aiSessions = new Map();
const groupReplyContexts = new Map();
const groupParticipantThreads = new Map();
const startTime = Date.now();
const BUILD_ID = process.env.BUILD_ID || process.env.GIT_COMMIT || process.env.SOURCE_COMMIT || 'dev';

// Global event ring buffer (for legacy /api/events admin display).
const MAX_EVENTS = 80;
const events = [];
function addEvent(type, detail) {
  events.unshift({ ts: new Date().toISOString(), type, detail });
  if (events.length > MAX_EVENTS) events.length = MAX_EVENTS;
  logEvent(logger, type, detail);
}

// ---------------------------------------------------------------------------
// Phone helpers (Malaysian-aware)
// ---------------------------------------------------------------------------
function normalizePhone(raw) {
  let digits = String(raw || '').replace(/[^0-9]/g, '');
  if (!digits || digits.length < 8 || digits.length > 15) return null;
  if (digits.startsWith('0') && digits.length >= 9 && digits.length <= 12) {
    digits = '60' + digits.slice(1);
  } else if (!digits.startsWith('60') && digits.length >= 9 && digits.length <= 10) {
    digits = '60' + digits;
  }
  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
}

function toJid(phone) {
  const digits = normalizePhone(phone);
  if (!digits) return null;
  return `${digits}@s.whatsapp.net`;
}

function isFreshMessage(messageTimestamp) {
  const raw = typeof messageTimestamp === 'object' && messageTimestamp !== null && 'low' in messageTimestamp
    ? Number(messageTimestamp.low)
    : Number(messageTimestamp);
  if (!Number.isFinite(raw) || raw <= 0) return false;
  return Math.abs(Date.now() / 1000 - raw) <= 180;
}

function getTextContent(msg) {
  return (
    msg?.message?.conversation ||
    msg?.message?.extendedTextMessage?.text ||
    ''
  ).trim();
}

function getSenderPhone(msg) {
  return normalizePhone(
    String(
      msg?.key?.senderPn ||
      msg?.participant ||
      msg?.key?.participant ||
      msg?.key?.remoteJid ||
      '',
    ).split('@')[0],
  );
}

function getReplyJid(msg, phone) {
  if (phone) return `${phone}@s.whatsapp.net`;
  return msg?.key?.remoteJid || null;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const AI_TRIGGER_PATTERN = `(^|[^\\p{L}\\p{N}])${escapeRegex(AI_TRIGGER_NAME)}([^\\p{L}\\p{N}]|$)`;
const AI_TRIGGER_REGEX = new RegExp(AI_TRIGGER_PATTERN, 'iu');
const AI_TRIGGER_STRIP_REGEX = new RegExp(AI_TRIGGER_PATTERN, 'giu');
const AI_SIMPLE_GREETING_REGEX = /^(?:hi|hello|hai|salam)(?:\s+sera)?[!.?, ]*$/iu;

async function getAutoReplyConfig() {
  const saved = await getSetting('dify_auto_reply').catch(() => null);
  return {
    enabled: typeof saved?.enabled === 'boolean' ? saved.enabled : DIFY_AUTO_REPLY_ENABLED,
  };
}

async function getAiRoutingStatus() {
  const config = await getAutoReplyConfig().catch(() => ({ enabled: DIFY_AUTO_REPLY_ENABLED }));
  return {
    deployment: WA_DEPLOYMENT_LABEL,
    responderActive: WA_ACTIVE_RESPONDER,
    autoReplyEnabled: config.enabled,
    difyBaseUrl: DIFY_BASE_URL,
    difyConfigured: Boolean(DIFY_APP_API_KEY),
    difyAppName: WA_DIFY_APP_NAME,
    assistantModel: WA_ASSISTANT_MODEL_HINT,
    triggerName: AI_TRIGGER_NAME,
  };
}

function isDirectChatJid(jid) {
  return typeof jid === 'string' && (jid.endsWith('@s.whatsapp.net') || jid.endsWith('@lid'));
}
function isGroupChatJid(jid) {
  return typeof jid === 'string' && jid.endsWith('@g.us');
}
function hasAiTrigger(text) {
  if (!text) return false;
  return AI_TRIGGER_REGEX.test(text.normalize('NFKC'));
}
function stripAiTrigger(text) {
  if (!text) return '';
  const stripped = text.normalize('NFKC').replace(AI_TRIGGER_STRIP_REGEX, ' ').replace(/\s+/g, ' ').trim();
  return stripped || text.trim();
}
function isSimpleGreeting(text) {
  if (!text) return false;
  return AI_SIMPLE_GREETING_REGEX.test(text.normalize('NFKC').trim());
}

function pruneExpiredGroupReplyContexts() {
  const now = Date.now();
  for (const [messageId, context] of groupReplyContexts.entries()) {
    if (now - context.createdAt > AI_GROUP_REPLY_CONTEXT_MS) groupReplyContexts.delete(messageId);
  }
}
function createGroupParticipantKey(sessionId, groupJid, participantPhone) {
  return `${sessionId}:${groupJid}:${participantPhone || 'unknown'}`;
}
function pruneExpiredGroupParticipantThreads() {
  const now = Date.now();
  for (const [k, v] of groupParticipantThreads.entries()) {
    if (now - v.lastActivityAt > AI_GROUP_PARTICIPANT_WINDOW_MS) groupParticipantThreads.delete(k);
  }
}
function getMessageContextInfo(msg) {
  if (!msg?.message || typeof msg.message !== 'object') return null;
  for (const value of Object.values(msg.message)) {
    if (value && typeof value === 'object' && value.contextInfo) return value.contextInfo;
  }
  return null;
}
function getQuotedMessageId(msg) {
  return getMessageContextInfo(msg)?.stanzaId || null;
}
function createGroupThreadKey(groupJid, participantPhone, messageId) {
  return `${groupJid}:${participantPhone || 'unknown'}:${messageId || Date.now()}`;
}
function getGroupReplyContext(groupJid, quotedMessageId) {
  pruneExpiredGroupReplyContexts();
  if (!quotedMessageId) return null;
  const ctx = groupReplyContexts.get(quotedMessageId);
  if (!ctx || ctx.groupJid !== groupJid) return null;
  return ctx;
}
function rememberGroupReplyContext(groupJid, participantPhone, threadKey, outboundMessageId) {
  if (!outboundMessageId) return;
  pruneExpiredGroupReplyContexts();
  groupReplyContexts.set(outboundMessageId, { groupJid, participantPhone, threadKey, createdAt: Date.now() });
}
function getGroupParticipantThread(sessionId, groupJid, participantPhone) {
  pruneExpiredGroupParticipantThreads();
  return groupParticipantThreads.get(createGroupParticipantKey(sessionId, groupJid, participantPhone)) || null;
}
function rememberGroupParticipantThread(sessionId, groupJid, participantPhone, threadKey) {
  pruneExpiredGroupParticipantThreads();
  groupParticipantThreads.set(createGroupParticipantKey(sessionId, groupJid, participantPhone), {
    threadKey, lastActivityAt: Date.now(),
  });
}

function aiKey(sessionId, phone) { return `${sessionId}:${phone}`; }
function clearAiSession(sessionId, phone) {
  const k = aiKey(sessionId, phone);
  aiSessions.delete(k);
  difyConversationIds.delete(k);
}
function getAiSession(sessionId, phone) {
  const k = aiKey(sessionId, phone);
  const session = aiSessions.get(k);
  if (!session) return null;
  if (Date.now() - session.lastActivityAt > AI_SESSION_TIMEOUT_MS) {
    clearAiSession(sessionId, phone);
    addEvent('ai_session_expired', `[${sessionId}] AI session expired for ${phone}`);
    return null;
  }
  return session;
}
function activateAiSession(sessionId, phone) {
  const now = Date.now();
  aiSessions.set(aiKey(sessionId, phone), { activatedAt: now, lastActivityAt: now });
  addEvent('ai_session_activated', `[${sessionId}] AI session activated for ${phone}`);
}
function touchAiSession(sessionId, phone) {
  const k = aiKey(sessionId, phone);
  const s = aiSessions.get(k);
  if (!s) return;
  s.lastActivityAt = Date.now();
  aiSessions.set(k, s);
}

async function generateDifyReply(conversationKey, text, userId) {
  if (!DIFY_APP_API_KEY) throw new Error('DIFY_APP_API_KEY is not configured');
  const res = await fetch(`${DIFY_BASE_URL}/v1/chat-messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${DIFY_APP_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      inputs: {},
      query: text,
      response_mode: 'blocking',
      conversation_id: difyConversationIds.get(conversationKey) || '',
      user: userId || `whatsapp-${conversationKey}`,
    }),
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) throw new Error(typeof payload?.message === 'string' ? payload.message : `Dify failed with ${res.status}`);
  if (typeof payload?.conversation_id === 'string' && payload.conversation_id) {
    difyConversationIds.set(conversationKey, payload.conversation_id);
  }
  return typeof payload?.answer === 'string' ? payload.answer.trim() : '';
}

async function sendAiTextReply({ sock, sessionId, replyJid, phone, content, metadata, quotedMsg }) {
  const sendOptions = quotedMsg ? { quoted: quotedMsg } : undefined;
  const result = await sock.sendMessage(replyJid, { text: content }, sendOptions);
  addEvent('wa_reply_sent', `[${sessionId}] AI reply to ${replyJid}: ${content.slice(0, 80)}`);
  logMessage(logger, {
    direction: 'out',
    phone,
    jid: replyJid,
    messageType: 'text',
    content,
    messageId: result?.key?.id,
    metadata: { ...(metadata || {}), sessionId },
  });
  return result;
}

async function maybeRunDifyAutoReply(sessionId, msg, sock) {
  const sender = msg?.key?.remoteJid;
  if (!sender || !sock) return;
  if (msg?.key?.fromMe) return;
  if (!isFreshMessage(msg?.messageTimestamp)) return;

  const phone = getSenderPhone(msg);
  const text = getTextContent(msg);
  if (!text) return;

  const config = await getAutoReplyConfig();
  if (!config.enabled) return;

  if (!WA_ACTIVE_RESPONDER) {
    if (hasAiTrigger(text)) addEvent('ai_standby', `[${sessionId}] Standby ignored AI-triggered message for ${phone || sender}`);
    return;
  }

  if (isGroupChatJid(sender)) {
    const triggerMatched = hasAiTrigger(text);
    const participantPhone = phone || 'unknown';
    const quotedMessageId = getQuotedMessageId(msg);
    const replyContext = getGroupReplyContext(sender, quotedMessageId);
    const replyToBotMatched = Boolean(replyContext);
    const participantThread = getGroupParticipantThread(sessionId, sender, participantPhone);
    const participantWindowMatched = Boolean(participantThread);

    if (!triggerMatched && !replyToBotMatched && !participantWindowMatched) return;

    const routeReason = triggerMatched ? 'group-trigger' : replyToBotMatched ? 'group-reply-continue' : 'group-participant-continue';
    const threadKey = replyContext?.threadKey || participantThread?.threadKey || createGroupThreadKey(sender, participantPhone, msg?.key?.id);
    const prompt = triggerMatched ? stripAiTrigger(text) : text;

    try {
      if (isSimpleGreeting(text)) {
        const result = await sendAiTextReply({
          sock, sessionId,
          replyJid: sender, phone: participantPhone, content: AI_GREETING_REPLY, quotedMsg: msg,
          metadata: { source: 'dify-auto-reply', routeReason, triggerName: AI_TRIGGER_NAME, threadKey, responseType: 'simple-greeting' },
        });
        rememberGroupReplyContext(sender, participantPhone, threadKey, result?.key?.id);
        rememberGroupParticipantThread(sessionId, sender, participantPhone, threadKey);
        return;
      }
      const reply = await generateDifyReply(`${sessionId}:${threadKey}`, prompt, `whatsapp-group-${sessionId}-${sender}-${participantPhone}`);
      if (!reply) return;
      const result = await sendAiTextReply({
        sock, sessionId,
        replyJid: sender, phone: participantPhone, content: reply, quotedMsg: msg,
        metadata: { source: 'dify-auto-reply', routeReason, triggerName: AI_TRIGGER_NAME, threadKey, quotedMessageId },
      });
      rememberGroupReplyContext(sender, participantPhone, threadKey, result?.key?.id);
      rememberGroupParticipantThread(sessionId, sender, participantPhone, threadKey);
    } catch (err) {
      addEvent('dify_error', `[${sessionId}] Group AI route failed for ${sender}: ${err.message}`);
      logger.error({ err, sessionId, groupJid: sender }, 'Dify group auto-reply failed');
    }
    return;
  }

  if (!isDirectChatJid(sender)) return;
  const replyJid = getReplyJid(msg, phone);
  if (!phone || !replyJid) return;

  const triggerMatched = hasAiTrigger(text);
  const existingSession = getAiSession(sessionId, phone);
  if (!existingSession && !triggerMatched) return;

  const routeReason = existingSession ? 'continue' : 'activate';
  if (!existingSession) activateAiSession(sessionId, phone);

  try {
    if (isSimpleGreeting(text)) {
      if (!existingSession) activateAiSession(sessionId, phone); else touchAiSession(sessionId, phone);
      await sendAiTextReply({
        sock, sessionId, replyJid, phone,
        content: AI_GREETING_REPLY,
        metadata: { source: 'dify-auto-reply', routeReason, triggerName: AI_TRIGGER_NAME, responseType: 'simple-greeting' },
      });
      return;
    }
    const reply = await generateDifyReply(aiKey(sessionId, phone), text, `whatsapp-${sessionId}-${phone}`);
    if (!reply) return;
    touchAiSession(sessionId, phone);
    await sendAiTextReply({
      sock, sessionId, replyJid, phone, content: reply,
      metadata: { source: 'dify-auto-reply', routeReason, triggerName: AI_TRIGGER_NAME },
    });
  } catch (err) {
    if (!existingSession) clearAiSession(sessionId, phone);
    addEvent('dify_error', `[${sessionId}] AI route failed for ${phone}: ${err.message}`);
    logger.error({ err, sessionId, phone }, 'Dify auto-reply failed');
  }
}

// ---------------------------------------------------------------------------
// Webhook dispatcher + SessionManager wiring
// ---------------------------------------------------------------------------
const webhooks = new WebhookDispatcher({
  url: WAPI_WEBHOOK_URL,
  secret: WAPI_SECRET,
  logger,
});

const manager = new SessionManager({
  sessionsDir: SESSIONS_DIR,
  logger,
  maxConcurrent: MAX_CONCURRENT_SESSIONS,
  onEvent: (sessionId, type, detail, entry) => {
    addEvent(`[${sessionId}] ${type}`, typeof detail === 'string' ? detail : JSON.stringify(detail || {}));
    // Map session events to outbound webhook types when meaningful.
    if (type === 'qr') {
      const r = manager.getSession(sessionId);
      webhooks.enqueue(sessionId, 'qr', { qr: r?.qrDataUrl || null, status: r?.status || null });
      syncFreshSessionRecord(sessionId, { status: 'pending_qr', lastQrAt: new Date().toISOString() });
    } else if (type === 'connected') {
      const r = manager.getSession(sessionId);
      webhooks.enqueue(sessionId, 'connected', { phoneNumber: r?.phoneNumber || null });
      syncFreshSessionRecord(sessionId, {
        status: 'connected',
        phone: r?.phoneNumber || null,
        lastConnectedAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
      });
    } else if (type === 'disconnected') {
      webhooks.enqueue(sessionId, 'disconnected', { detail });
      syncFreshSessionRecord(sessionId, { status: 'disconnected', lastActivityAt: new Date().toISOString() });
    } else if (type === 'message.status') {
      webhooks.enqueue(sessionId, 'message.status', detail || {});
      syncFreshSessionRecord(sessionId, { lastActivityAt: new Date().toISOString() });
    } else if (type === 'session.deleted') {
      webhooks.enqueue(sessionId, 'session.deleted', {});
      removeFreshSessionRecord(sessionId);
    }
  },
  onMessage: (sessionId, msg, sock) => {
    const senderJid = msg?.key?.remoteJid;
    const phone = getSenderPhone(msg) || (senderJid ? senderJid.split('@')[0] : null);
    const text = getTextContent(msg);
    addEvent(`[${sessionId}] message_in`, `From ${senderJid}: ${text.slice(0, 80)}`);
    logMessage(logger, {
      direction: 'in',
      phone,
      jid: senderJid,
      messageType: 'text',
      content: text,
      messageId: msg.key.id,
      metadata: { sessionId },
    });
    syncFreshSessionRecord(sessionId, {
      phone,
      status: 'connected',
      lastActivityAt: new Date().toISOString(),
    });
    webhooks.enqueue(sessionId, 'message.inbound', {
      from: senderJid,
      phone,
      text,
      messageId: msg.key.id,
      timestamp: msg.messageTimestamp,
    });
    maybeRunDifyAutoReply(sessionId, msg, sock).catch((err) => {
      addEvent('dify_error', `[${sessionId}] Unhandled auto-reply error: ${err.message}`);
      logger.error({ err, sessionId }, 'Unhandled Dify auto-reply error');
    });
  },
});

// ---------------------------------------------------------------------------
// Migrate legacy single-session auth dir (one-time, best-effort)
// ---------------------------------------------------------------------------
async function migrateLegacyAuthIfPresent() {
  try {
    const target = path.join(SESSIONS_DIR, DEFAULT_SESSION_ID);
    await mkdir(SESSIONS_DIR, { recursive: true });
    const targetExists = await stat(target).then(() => true).catch(() => false);
    const legacyExists = await stat(LEGACY_AUTH_DIR).then(() => true).catch(() => false);
    if (targetExists || !legacyExists) return;
    const entries = await readdir(LEGACY_AUTH_DIR).catch(() => []);
    if (!entries.length) return;
    await mkdir(target, { recursive: true });
    for (const name of entries) {
      try {
        const src = path.join(LEGACY_AUTH_DIR, name);
        const dst = path.join(target, name);
        const s = await stat(src);
        if (s.isFile()) await copyFile(src, dst);
      } catch (err) {
        logger.warn({ err, name }, 'legacy auth migration: file copy failed');
      }
    }
    addEvent('migration', `Legacy auth dir migrated to default session "${DEFAULT_SESSION_ID}"`);
    logger.info({ from: LEGACY_AUTH_DIR, to: target }, 'Migrated legacy auth dir');
  } catch (err) {
    logger.warn({ err }, 'Legacy auth migration failed (non-fatal)');
  }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
initDb(logger).catch(() => {});
(async () => {
  await migrateLegacyAuthIfPresent();
  const discovered = await manager.discoverExisting({ autoStart: AUTO_START_SESSIONS });
  logger.info({ discovered, autoStart: AUTO_START_SESSIONS }, 'Discovered existing sessions');
  if (GATEWAY_MODE === 'baileys') {
    for (const sessionId of discovered) syncFreshSessionRecord(sessionId);
  }
  if (AUTO_START_DEFAULT) {
    try {
      await manager.startSession(DEFAULT_SESSION_ID);
      addEvent('boot', `Default session "${DEFAULT_SESSION_ID}" auto-started`);
      syncFreshSessionRecord(DEFAULT_SESSION_ID);
    } catch (err) {
      addEvent('error', `Failed to auto-start default session: ${err.message}`);
      logger.error({ err }, 'Failed to auto-start default session');
    }
  }
})().catch((err) => logger.error({ err }, 'Boot failed'));

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
function json(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 5 * 1024 * 1024) {
        reject(new Error('Body too large'));
        req.destroy();
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString();
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function errorJson(res, status, code, message) {
  return json(res, status, { error: { code, message } });
}

function requireWapiSecret(req, res) {
  if (!WAPI_SECRET) {
    errorJson(res, 503, 'NOT_CONFIGURED', 'WAPI_SECRET is not configured on the gateway');
    return false;
  }
  const provided = req.headers['x-wapi-secret'];
  if (!provided) { errorJson(res, 401, 'UNAUTHORIZED', 'Missing or invalid WAPI secret'); return false; }
  if (provided !== WAPI_SECRET) { errorJson(res, 401, 'UNAUTHORIZED', 'Missing or invalid WAPI secret'); return false; }
  return true;
}

async function requireAuth(req, res) {
  const provided = req.headers['x-api-key'];
  if (!provided) { json(res, 401, { error: 'Unauthorized — missing X-API-Key header' }); return false; }
  if (API_KEY && provided === API_KEY) return true;
  if (ADMIN_KEY && provided === ADMIN_KEY) return true;
  // WAPI calls gateway with header `x-api-key: <WAPI_SECRET>` (the
  // shared HMAC secret used by /api/sessions/* via X-WAPI-Secret).
  // Accept it on the legacy /api/* surface too so WAPI's OTP send
  // path works without needing a second separate gateway API key.
  if (WAPI_SECRET && provided === WAPI_SECRET) return true;
  if (isDbReady()) {
    try {
      const dbKey = await validateApiKey(provided);
      if (dbKey) {
        recordKeyUsage(hashApiKey(provided)).catch(() => {});
        return true;
      }
    } catch {}
  }
  json(res, 401, { error: 'Unauthorized — invalid or missing X-API-Key' });
  return false;
}

function requireAdmin(req, res) {
  const key = ADMIN_KEY || API_KEY;
  if (!key) { json(res, 500, { error: 'Admin key not configured' }); return false; }
  const providedAdmin = req.headers['x-admin-key'];
  const providedApi = req.headers['x-api-key'];
  const matches = (value) => {
    if (Array.isArray(value)) return value.some((entry) => entry === key);
    return value === key;
  };
  if ((!providedAdmin && !providedApi) || (!matches(providedAdmin) && !matches(providedApi))) {
    json(res, 401, { error: 'Unauthorized — invalid or missing admin key' });
    return false;
  }
  return true;
}

async function ensureDbReady(res) {
  if (isDbReady()) return true;
  const ok = await initDb(logger).catch(() => false);
  if (ok) return true;
  json(res, 503, { error: 'Database not available' });
  return false;
}

function fmtUptime(ms) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  return `${m}m ${sec}s`;
}

function defaultRuntime() {
  return manager.getSession(DEFAULT_SESSION_ID);
}

function syncFreshSessionRecord(sessionId, extra = {}) {
  if (GATEWAY_MODE !== 'baileys' || !sessionId) return;
  const runtime = manager.getSession(sessionId);
  void persistSessionRecord({
    sessionId,
    tenantId: typeof extra.tenantId === 'string' && extra.tenantId ? extra.tenantId : null,
    phone: typeof extra.phone === 'string' && extra.phone ? extra.phone : (runtime?.phoneNumber || null),
    purpose: typeof extra.purpose === 'string' && extra.purpose ? extra.purpose : null,
    notes: typeof extra.notes === 'string' ? extra.notes : null,
    status: typeof extra.status === 'string' && extra.status ? extra.status : (runtime?.status || null),
    lastQrAt: extra.lastQrAt || null,
    lastConnectedAt: extra.lastConnectedAt || runtime?.connectedAt || null,
    lastActivityAt: extra.lastActivityAt || runtime?.lastSeenAt || null,
  }).catch((err) => logger.error({ err, sessionId }, 'Failed to sync Baileys session record'));
}

function removeFreshSessionRecord(sessionId) {
  if (GATEWAY_MODE !== 'baileys' || !sessionId) return;
  void persistDeleteSessionRecord(sessionId).catch((err) => logger.error({ err, sessionId }, 'Failed to delete Baileys session record'));
}

function recordFreshSendAttempt(payload) {
  if (GATEWAY_MODE !== 'baileys') return;
  void persistSendAttempt(payload).catch((err) => logger.error({ err, payload }, 'Failed to record Baileys send attempt'));
}

// ---------------------------------------------------------------------------
// Sessions route handler (shared between /api/sessions and /sessions aliases)
// ---------------------------------------------------------------------------
async function handleSessionRoute({ req, res, method, path, sessionId, sub }) {
  if (sessionId !== undefined && !isValidSessionId(sessionId)) {
    return errorJson(res, 400, 'BAD_REQUEST', 'Invalid sessionId format');
  }

  // POST /sessions  (body { sessionId })  → start
  if (sessionId === undefined && method === 'POST') {
    const body = await readBody(req).catch(() => ({}));
    const id = body?.sessionId;
    if (!isValidSessionId(id)) return errorJson(res, 400, 'BAD_REQUEST', 'Invalid sessionId in body');
    const runtime = await manager.startSession(id);
    syncFreshSessionRecord(id, {
      tenantId: typeof body?.tenantId === 'string' ? body.tenantId : null,
      purpose: typeof body?.purpose === 'string' ? body.purpose : null,
      notes: typeof body?.notes === 'string' ? body.notes : null,
      status: runtime.status,
    });
    return json(res, 200, { sessionId: id, status: runtime.status, qr: runtime.qrDataUrl || null });
  }

  // GET /sessions → list
  if (sessionId === undefined && method === 'GET') {
    return json(res, 200, { sessions: manager.listSessions() });
  }

  if (sessionId === undefined) {
    return errorJson(res, 405, 'METHOD_NOT_ALLOWED', `Method ${method} not allowed on ${path}`);
  }

  // POST /sessions/:id  (start/ensure)
  if (!sub && method === 'POST') {
    const body = await readBody(req).catch(() => ({}));
    const runtime = await manager.startSession(sessionId);
    syncFreshSessionRecord(sessionId, {
      tenantId: typeof body?.tenantId === 'string' ? body.tenantId : null,
      purpose: typeof body?.purpose === 'string' ? body.purpose : null,
      notes: typeof body?.notes === 'string' ? body.notes : null,
      status: runtime.status,
    });
    return json(res, 200, { sessionId, status: runtime.status, qr: runtime.qrDataUrl || null });
  }

  // GET /sessions/:id  (status)
  if (!sub && method === 'GET') {
    const runtime = manager.getSession(sessionId);
    if (!runtime) return errorJson(res, 404, 'NOT_FOUND', 'Session not found');
    return json(res, 200, runtime.toStatusJson());
  }

  // DELETE /sessions/:id
  if (!sub && method === 'DELETE') {
    const existed = await manager.deleteSession(sessionId);
    removeFreshSessionRecord(sessionId);
    return json(res, 200, { ok: true, existed });
  }

  // GET /sessions/:id/status
  if (sub === 'status' && method === 'GET') {
    let runtime = manager.getSession(sessionId);
    if (!runtime) {
      runtime = await manager.getOrCreate(sessionId);
    }
    return json(res, 200, runtime.toStatusJson());
  }

  // GET /sessions/:id/qr
  if (sub === 'qr' && method === 'GET') {
    let runtime = manager.getSession(sessionId);
    if (!runtime) runtime = await manager.startSession(sessionId);
    return json(res, 200, { sessionId, qr: runtime.qrDataUrl || null, status: runtime.status });
  }

  // POST /sessions/:id/reset
  if (sub === 'reset' && method === 'POST') {
    const runtime = await manager.resetSession(sessionId);
    syncFreshSessionRecord(sessionId, { status: runtime.status });
    return json(res, 200, { sessionId, status: runtime.status, qr: runtime.qrDataUrl || null });
  }

  // POST /sessions/:id/messages
  if (sub === 'messages' && method === 'POST') {
    const body = await readBody(req).catch(() => null);
    if (!body) return errorJson(res, 400, 'BAD_REQUEST', 'Invalid JSON body');
    try {
      const result = await manager.sendMessage(sessionId, body);
      logMessage(logger, {
        direction: 'out',
        phone: normalizePhone(body.to),
        jid: result.jid,
        messageType: body.type || 'text',
        content: body.text || body.caption || null,
        messageId: result.messageId,
        metadata: { sessionId, source: 'wapi-multi' },
      });
      syncFreshSessionRecord(sessionId, { lastActivityAt: new Date().toISOString() });
      recordFreshSendAttempt({ sessionId, toNumber: normalizePhone(body.to), status: 'accepted', detail: body.type || 'text' });
      return json(res, 200, result);
    } catch (err) {
      const code = err.code || 'INTERNAL';
      const status = code === 'BAD_REQUEST' ? 400 : code === 'NOT_CONNECTED' ? 503 : 500;
      recordFreshSendAttempt({ sessionId, toNumber: normalizePhone(body?.to), status: 'failed', detail: err.message });
      return errorJson(res, status, code, err.message);
    }
  }

  return errorJson(res, 404, 'NOT_FOUND', 'Route not found');
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const parsed = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const path = parsed.pathname;
  const method = req.method;

  try {
    // ───── Public ─────
    if ((path === '/health' || path === '/healthz') && method === 'GET') {
      const aiRouting = await getAiRoutingStatus().catch(() => null);
      const def = defaultRuntime();
      return json(res, 200, {
        status: 'ok',
        service: SERVICE_NAME,
        runtimeMode: GATEWAY_MODE,
        database: RUNTIME_DATABASE,
        sessions: manager.listSessions().length,
        defaultSessionId: DEFAULT_SESSION_ID,
        defaultStatus: def ? def.status : 'absent',
        defaultPhone: def ? def.phoneNumber : null,
        // Legacy fields for backward compatibility:
        whatsapp: def ? def.status : 'disconnected',
        phone: def ? def.phoneNumber : null,
        uptime: (Date.now() - startTime) / 1000,
        aiRouting,
        webhook: webhooks.snapshot(),
        lastEvent: events[0] || null,
      });
    }

    if (path === '/' && method === 'GET') {
      const def = defaultRuntime();
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        // The admin console is generated server-side and references
        // mutable state (status pill, sessions list). It must never be
        // cached by the browser or by Cloudflare/Caddy in front, or
        // operators will see a stale "LOADING" UI after we ship UI fixes.
        'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
        'pragma': 'no-cache',
        'expires': '0',
      });
      return res.end(consoleHtml({
        connectionState: def ? def.status : 'disconnected',
        pairedPhone: def ? def.phoneNumber : null,
        PORT,
        buildId: BUILD_ID,
      }));
    }

    // ───── WAPI multi-session routes ─────
    // /api/sessions[...] and /sessions[...]
    let sessionsMatch = path.match(/^\/api\/sessions(?:\/([^/]+)(?:\/([^/]+))?)?$/);
    if (!sessionsMatch) sessionsMatch = path.match(/^\/sessions(?:\/([^/]+)(?:\/([^/]+))?)?$/);
    if (sessionsMatch) {
      if (!requireWapiSecret(req, res)) return;
      const sessionId = sessionsMatch[1];
      const sub = sessionsMatch[2];
      return handleSessionRoute({ req, res, method, path, sessionId, sub });
    }

    if (path === '/api/webhook-stats' && method === 'GET') {
      if (!requireWapiSecret(req, res)) return;
      return json(res, 200, webhooks.snapshot());
    }

    // ───── Legacy single-session API (pinned to DEFAULT_SESSION_ID) ─────
    if (path === '/api/status' && method === 'GET') {
      if (!(await requireAuth(req, res))) return;
      const def = defaultRuntime();
      const aiRouting = await getAiRoutingStatus();
      return json(res, 200, {
        state: def?.status || 'disconnected',
        authenticated: def?.status === 'connected',
        phone: def?.phoneNumber || null,
        sessionId: DEFAULT_SESSION_ID,
        deprecated: true,
        deprecationNote: 'Use /api/sessions/:id/status with X-WAPI-Secret instead.',
        uptime: (Date.now() - startTime) / 1000,
        uptimeHuman: fmtUptime(Date.now() - startTime),
        aiRouting,
        lastDisconnect: def?.lastDisconnect
          ? { code: def.lastDisconnect?.error?.output?.statusCode, reason: def.lastDisconnect?.error?.message }
          : null,
      });
    }

    if (path === '/api/events' && method === 'GET') {
      if (!(await requireAuth(req, res))) return;
      return json(res, 200, events);
    }

    if (path === '/api/qr-code' && method === 'GET') {
      if (!(await requireAuth(req, res))) return;
      const def = await manager.startSession(DEFAULT_SESSION_ID);
      if (def.status === 'connected') return json(res, 400, { error: 'Already connected — logout first to re-pair', available: false });
      if (!def.qrDataUrl) return json(res, 503, { error: 'No QR code available yet — wait for connection', available: false });
      return json(res, 200, { available: true, qr: def.qrDataUrl });
    }

    if (path === '/api/pairing-code' && method === 'GET') {
      if (!(await requireAuth(req, res))) return;
      const rawPhone = parsed.searchParams.get('phone');
      const requestedSessionId = parsed.searchParams.get('session');
      const pairingSessionId = GATEWAY_MODE === 'baileys' && requestedSessionId && isValidSessionId(requestedSessionId)
        ? requestedSessionId
        : DEFAULT_SESSION_ID;
      const digits = normalizePhone(rawPhone);
      if (!digits) return json(res, 400, { error: 'Invalid phone number.' });
      const def = await manager.startSession(pairingSessionId);
      syncFreshSessionRecord(pairingSessionId, { status: def.status });
      if (def.status === 'connected') return json(res, 400, { error: 'Already connected — logout first to re-pair', sessionId: pairingSessionId });
      if (!def.sock) return json(res, 503, { error: 'WhatsApp socket not initialized — wait a moment and retry', sessionId: pairingSessionId });
      try {
        await Promise.race([
          def.socketReadyPromise,
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 15000)),
        ]);
      } catch {
        return json(res, 503, { error: 'WhatsApp is still connecting — please wait a few seconds and try again', sessionId: pairingSessionId });
      }
      try {
        const code = await def.sock.requestPairingCode(digits);
        addEvent('pairing', `[${pairingSessionId}] Pairing code generated for +${digits}`);
        syncFreshSessionRecord(pairingSessionId, { status: 'connecting' });
        return json(res, 200, { pairingCode: code, phone: digits, sessionId: pairingSessionId });
      } catch (err) {
        return json(res, 500, { error: 'Failed to generate pairing code', detail: err.message, sessionId: pairingSessionId });
      }
    }

    if (path === '/api/send-text' && method === 'POST') {
      if (!(await requireAuth(req, res))) return;
      const body = await readBody(req);
      const { to, text } = body;
      if (!to || !text) return json(res, 400, { error: 'Missing required fields: to, text' });
      try {
        const r = await manager.sendMessage(DEFAULT_SESSION_ID, { to, type: 'text', text });
        logMessage(logger, { direction: 'out', phone: normalizePhone(to), jid: r.jid, messageType: 'text', content: text, messageId: r.messageId, metadata: { sessionId: DEFAULT_SESSION_ID, source: 'legacy' } });
        syncFreshSessionRecord(DEFAULT_SESSION_ID, { lastActivityAt: new Date().toISOString() });
        recordFreshSendAttempt({ sessionId: DEFAULT_SESSION_ID, toNumber: normalizePhone(to), status: 'accepted', detail: 'text' });
        return json(res, 200, { success: true, messageId: r.messageId, to: r.jid });
      } catch (err) {
        const status = err.code === 'NOT_CONNECTED' ? 503 : err.code === 'BAD_REQUEST' ? 400 : 500;
        recordFreshSendAttempt({ sessionId: DEFAULT_SESSION_ID, toNumber: normalizePhone(to), status: 'failed', detail: err.message });
        return json(res, status, { error: err.message });
      }
    }

    if (path === '/api/send-image' && method === 'POST') {
      if (!(await requireAuth(req, res))) return;
      const body = await readBody(req);
      const { to, imageUrl, caption } = body;
      if (!to || !imageUrl) return json(res, 400, { error: 'Missing required fields: to, imageUrl' });
      try {
        const r = await manager.sendMessage(DEFAULT_SESSION_ID, { to, type: 'image', media: { url: imageUrl }, caption });
        logMessage(logger, { direction: 'out', phone: normalizePhone(to), jid: r.jid, messageType: 'image', content: caption || null, messageId: r.messageId, metadata: { sessionId: DEFAULT_SESSION_ID, source: 'legacy', imageUrl } });
        syncFreshSessionRecord(DEFAULT_SESSION_ID, { lastActivityAt: new Date().toISOString() });
        recordFreshSendAttempt({ sessionId: DEFAULT_SESSION_ID, toNumber: normalizePhone(to), status: 'accepted', detail: 'image' });
        return json(res, 200, { success: true, messageId: r.messageId, to: r.jid });
      } catch (err) {
        const status = err.code === 'NOT_CONNECTED' ? 503 : err.code === 'BAD_REQUEST' ? 400 : 500;
        recordFreshSendAttempt({ sessionId: DEFAULT_SESSION_ID, toNumber: normalizePhone(to), status: 'failed', detail: err.message });
        return json(res, status, { error: err.message });
      }
    }

    if (path === '/api/send-document' && method === 'POST') {
      if (!(await requireAuth(req, res))) return;
      const body = await readBody(req);
      const { to, fileUrl, fileName, caption } = body;
      if (!to || !fileUrl || !fileName) return json(res, 400, { error: 'Missing required fields: to, fileUrl, fileName' });
      try {
        const r = await manager.sendMessage(DEFAULT_SESSION_ID, { to, type: 'document', media: { url: fileUrl }, fileName, caption });
        logMessage(logger, { direction: 'out', phone: normalizePhone(to), jid: r.jid, messageType: 'document', content: caption || fileName, messageId: r.messageId, metadata: { sessionId: DEFAULT_SESSION_ID, source: 'legacy', fileUrl, fileName } });
        syncFreshSessionRecord(DEFAULT_SESSION_ID, { lastActivityAt: new Date().toISOString() });
        recordFreshSendAttempt({ sessionId: DEFAULT_SESSION_ID, toNumber: normalizePhone(to), status: 'accepted', detail: 'document' });
        return json(res, 200, { success: true, messageId: r.messageId, to: r.jid });
      } catch (err) {
        const status = err.code === 'NOT_CONNECTED' ? 503 : err.code === 'BAD_REQUEST' ? 400 : 500;
        recordFreshSendAttempt({ sessionId: DEFAULT_SESSION_ID, toNumber: normalizePhone(to), status: 'failed', detail: err.message });
        return json(res, status, { error: err.message });
      }
    }

    if (path === '/api/logout' && method === 'POST') {
      if (!(await requireAuth(req, res))) return;
      await manager.resetSession(DEFAULT_SESSION_ID);
      addEvent('logout', `Default session "${DEFAULT_SESSION_ID}" logged out`);
      syncFreshSessionRecord(DEFAULT_SESSION_ID, { status: 'disconnected' });
      return json(res, 200, { success: true, message: 'Logged out — session cleared' });
    }

    if (path === '/api/reset' && method === 'POST') {
      if (!(await requireAuth(req, res))) return;
      await manager.resetSession(DEFAULT_SESSION_ID);
      addEvent('reset', `Default session "${DEFAULT_SESSION_ID}" force-reset`);
      syncFreshSessionRecord(DEFAULT_SESSION_ID, { status: 'disconnected' });
      return json(res, 200, { success: true, message: 'Session reset — reconnecting' });
    }

    // ───── Admin API ─────

    // NEW: GET /admin/sessions — list all sessions for admin UI
    if (path === '/admin/sessions' && method === 'GET') {
      if (!requireAdmin(req, res)) return;
      return json(res, 200, {
        sessions: manager.listSessions(),
        defaultSessionId: DEFAULT_SESSION_ID,
        sessionsDir: SESSIONS_DIR,
        maxConcurrent: MAX_CONCURRENT_SESSIONS,
        webhook: webhooks.snapshot(),
        runtimeMode: GATEWAY_MODE,
        serviceName: SERVICE_NAME,
        databaseName: RUNTIME_DATABASE,
      });
    }

    // NEW: POST /admin/sessions — start session via admin
    if (path === '/admin/sessions' && method === 'POST') {
      if (!requireAdmin(req, res)) return;
      const body = await readBody(req);
      const id = body?.sessionId;
      if (!isValidSessionId(id)) return json(res, 400, { error: 'Invalid sessionId' });
      const r = await manager.startSession(id);
      syncFreshSessionRecord(id, {
        tenantId: typeof body?.tenantId === 'string' ? body.tenantId : null,
        purpose: typeof body?.purpose === 'string' ? body.purpose : null,
        notes: typeof body?.notes === 'string' ? body.notes : null,
        status: r.status,
      });
      return json(res, 200, r.toStatusJson());
    }

    // NEW: POST /admin/sessions/:id/reset
    let am = path.match(/^\/admin\/sessions\/([^/]+)\/reset$/);
    if (am && method === 'POST') {
      if (!requireAdmin(req, res)) return;
      const id = am[1];
      if (!isValidSessionId(id)) return json(res, 400, { error: 'Invalid sessionId' });
      const r = await manager.resetSession(id);
      syncFreshSessionRecord(id, { status: r.status });
      return json(res, 200, r.toStatusJson());
    }

    // NEW: DELETE /admin/sessions/:id
    am = path.match(/^\/admin\/sessions\/([^/]+)$/);
    if (am && method === 'DELETE') {
      if (!requireAdmin(req, res)) return;
      const id = am[1];
      if (!isValidSessionId(id)) return json(res, 400, { error: 'Invalid sessionId' });
      const existed = await manager.deleteSession(id);
      removeFreshSessionRecord(id);
      return json(res, 200, { ok: true, existed });
    }

    // GET /admin/sessions/:id/qr
    am = path.match(/^\/admin\/sessions\/([^/]+)\/qr$/);
    if (am && method === 'GET') {
      if (!requireAdmin(req, res)) return;
      const id = am[1];
      if (!isValidSessionId(id)) return json(res, 400, { error: 'Invalid sessionId' });
      const r = manager.getSession(id);
      if (!r) return json(res, 404, { error: 'Session not found' });
      return json(res, 200, { sessionId: id, qr: r.qrDataUrl || null, status: r.status });
    }

    // GET /admin/messages
    if (path === '/admin/messages' && method === 'GET') {
      if (!requireAdmin(req, res)) return;
      if (!(await ensureDbReady(res))) return;
      const direction = parsed.searchParams.get('direction') || undefined;
      const phone = parsed.searchParams.get('phone') || undefined;
      const appId = parsed.searchParams.get('app_id') || undefined;
      const limit = Math.min(parseInt(parsed.searchParams.get('limit') || '50', 10), 200);
      const offset = Math.max(parseInt(parsed.searchParams.get('offset') || '0', 10), 0);
      const data = await getMessages({ direction, phone, appId, limit, offset });
      return json(res, 200, data);
    }

    if (path === '/admin/stats' && method === 'GET') {
      if (!requireAdmin(req, res)) return;
      if (!(await ensureDbReady(res))) return;
      const days = Math.min(parseInt(parsed.searchParams.get('days') || '7', 10), 90);
      const appId = parsed.searchParams.get('app_id') || null;
      return json(res, 200, await getStats(days, appId));
    }

    if (path === '/admin/events' && method === 'GET') {
      if (!requireAdmin(req, res)) return;
      if (!(await ensureDbReady(res))) return;
      const limit = Math.min(parseInt(parsed.searchParams.get('limit') || '100', 10), 500);
      return json(res, 200, await getPersistedEvents(limit));
    }

    if (path === '/admin/overview' && method === 'GET') {
      if (!requireAdmin(req, res)) return;
      if (!(await ensureDbReady(res))) return;
      const data = await getOverviewStats();
      // Augment with per-session aggregates so the UI can render the multi-session overview cards.
      const list = manager.listSessions();
      const totals = list.reduce((acc, s) => {
        acc.total += 1;
        if (s.status === 'connected') acc.connected += 1;
        else if (s.qrAvailable || s.status === 'connecting' || s.status === 'pending') acc.pending += 1;
        else acc.disconnected += 1;
        acc.messages24h += (s.messages24h?.inbound || 0) + (s.messages24h?.outbound || 0);
        return acc;
      }, { total: 0, connected: 0, pending: 0, disconnected: 0, messages24h: 0 });
      return json(res, 200, {
        ...data,
        sessionTotals: totals,
        defaultSessionId: DEFAULT_SESSION_ID,
        webhook: webhooks.snapshot(),
        runtimeMode: GATEWAY_MODE,
        serviceName: SERVICE_NAME,
        databaseName: RUNTIME_DATABASE,
      });
    }

    // NEW: GET /admin/settings-public — non-secret config for Settings page
    if (path === '/admin/settings-public' && method === 'GET') {
      if (!requireAdmin(req, res)) return;
      return json(res, 200, {
        SESSIONS_DIR,
        DEFAULT_SESSION_ID,
        MAX_CONCURRENT_SESSIONS,
        AUTO_START_DEFAULT,
        AUTO_START_SESSIONS,
        WAPI_WEBHOOK_URL: WAPI_WEBHOOK_URL || null,
        webhookSigningEnabled: webhooks.isEnabled(),
        webhookStats: webhooks.snapshot().stats,
        deployment: WA_DEPLOYMENT_LABEL,
        runtimeMode: GATEWAY_MODE,
        serviceName: SERVICE_NAME,
        databaseName: RUNTIME_DATABASE,
      });
    }

    // ── existing API keys / apps / settings routes ──
    if (path === '/admin/api-keys' && method === 'GET') {
      if (!requireAdmin(req, res)) return;
      if (!(await ensureDbReady(res))) return;
      return json(res, 200, await listApiKeys());
    }
    if (path === '/admin/api-keys' && method === 'POST') {
      if (!requireAdmin(req, res)) return;
      if (!(await ensureDbReady(res))) return;
      const body = await readBody(req);
      const data = await createApiKey(body.label, body.scopes, body.app_id);
      addEvent('admin', `API key created: ${data.label} (${data.key_prefix}...)`);
      return json(res, 201, data);
    }
    if (/^\/admin\/api-keys\/\d+\/regenerate$/.test(path) && method === 'POST') {
      if (!requireAdmin(req, res)) return;
      if (!(await ensureDbReady(res))) return;
      const id = parseInt(path.split('/')[3], 10);
      const data = await regenerateApiKey(id);
      if (!data) return json(res, 404, { error: 'Key not found or revoked' });
      addEvent('admin', `API key regenerated: ${data.label}`);
      return json(res, 200, data);
    }
    if (/^\/admin\/api-keys\/\d+\/disable$/.test(path) && method === 'POST') {
      if (!requireAdmin(req, res)) return;
      if (!(await ensureDbReady(res))) return;
      const id = parseInt(path.split('/')[3], 10);
      const data = await disableApiKey(id);
      if (!data) return json(res, 404, { error: 'Key not found or not active' });
      return json(res, 200, data);
    }
    if (/^\/admin\/api-keys\/\d+\/enable$/.test(path) && method === 'POST') {
      if (!requireAdmin(req, res)) return;
      if (!(await ensureDbReady(res))) return;
      const id = parseInt(path.split('/')[3], 10);
      const data = await enableApiKey(id);
      if (!data) return json(res, 404, { error: 'Key not found or not disabled' });
      return json(res, 200, data);
    }
    if (/^\/admin\/api-keys\/\d+\/assign$/.test(path) && method === 'PATCH') {
      if (!requireAdmin(req, res)) return;
      if (!(await ensureDbReady(res))) return;
      const id = parseInt(path.split('/')[3], 10);
      const body = await readBody(req);
      const data = await assignKeyToApp(id, body.app_id);
      if (!data) return json(res, 404, { error: 'Key not found' });
      return json(res, 200, data);
    }
    if (path.startsWith('/admin/api-keys/') && method === 'DELETE') {
      if (!requireAdmin(req, res)) return;
      if (!(await ensureDbReady(res))) return;
      const id = parseInt(path.split('/').pop(), 10);
      if (!id) return json(res, 400, { error: 'Invalid key ID' });
      const data = await revokeApiKey(id);
      if (!data) return json(res, 404, { error: 'Key not found' });
      return json(res, 200, data);
    }

    if (path === '/admin/apps' && method === 'GET') {
      if (!requireAdmin(req, res)) return;
      if (!(await ensureDbReady(res))) return;
      return json(res, 200, await listApps());
    }
    if (path === '/admin/apps' && method === 'POST') {
      if (!requireAdmin(req, res)) return;
      if (!(await ensureDbReady(res))) return;
      const body = await readBody(req);
      if (!body.name) return json(res, 400, { error: 'App name is required' });
      const data = await createApp({
        name: body.name, domain: body.domain, description: body.description,
        apiKeyId: body.api_key_id, webhookUrl: body.webhook_url, settings: body.settings,
      });
      return json(res, 201, data);
    }
    if (path.startsWith('/admin/apps/') && method === 'GET') {
      if (!requireAdmin(req, res)) return;
      if (!(await ensureDbReady(res))) return;
      const id = parseInt(path.split('/').pop(), 10);
      if (!id) return json(res, 400, { error: 'Invalid app ID' });
      const data = await getApp(id);
      if (!data) return json(res, 404, { error: 'App not found' });
      return json(res, 200, data);
    }
    if (path.startsWith('/admin/apps/') && !path.includes('/toggle') && method === 'PATCH') {
      if (!requireAdmin(req, res)) return;
      if (!(await ensureDbReady(res))) return;
      const id = parseInt(path.split('/').pop(), 10);
      if (!id) return json(res, 400, { error: 'Invalid app ID' });
      const body = await readBody(req);
      const data = await updateApp(id, body);
      if (!data) return json(res, 404, { error: 'App not found' });
      return json(res, 200, data);
    }
    if (/^\/admin\/apps\/\d+\/toggle$/.test(path) && method === 'POST') {
      if (!requireAdmin(req, res)) return;
      if (!(await ensureDbReady(res))) return;
      const id = parseInt(path.split('/')[3], 10);
      const data = await toggleAppStatus(id);
      if (!data) return json(res, 404, { error: 'App not found' });
      return json(res, 200, data);
    }
    if (path.startsWith('/admin/apps/') && method === 'DELETE') {
      if (!requireAdmin(req, res)) return;
      if (!(await ensureDbReady(res))) return;
      const id = parseInt(path.split('/').pop(), 10);
      if (!id) return json(res, 400, { error: 'Invalid app ID' });
      await deleteApp(id);
      return json(res, 200, { success: true });
    }

    if (path === '/admin/settings' && method === 'GET') {
      if (!requireAdmin(req, res)) return;
      if (!(await ensureDbReady(res))) return;
      return json(res, 200, await getSettings());
    }
    if (path === '/admin/settings' && method === 'PUT') {
      if (!requireAdmin(req, res)) return;
      if (!(await ensureDbReady(res))) return;
      const body = await readBody(req);
      for (const [key, value] of Object.entries(body)) await setSetting(key, value);
      return json(res, 200, { success: true });
    }

    json(res, 404, { error: 'Not found' });
  } catch (err) {
    logger.error({ err }, 'Request handler error');
    json(res, 500, { error: 'Internal server error' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  logger.info(`Getouch WhatsApp gateway listening on port ${PORT} (multi-session, sessionsDir=${SESSIONS_DIR}, defaultSessionId=${DEFAULT_SESSION_ID})`);
});
