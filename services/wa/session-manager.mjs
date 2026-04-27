/**
 * SessionManager / SessionRuntime — multi-tenant Baileys runtime.
 *
 * Replaces the previous module-scoped `let sock = null` design in server.mjs.
 * Each SessionRuntime owns its own Baileys socket, auth directory, status,
 * QR cache, paired phone, reconnect timer, last error, message counters,
 * and a small recent-event ring buffer.
 *
 * Identity rules:
 *   - sessionId must match /^[A-Za-z0-9_-]{1,128}$/.
 *   - on disk, each session lives under `${SESSIONS_DIR}/${sessionId}`.
 *   - the resolved auth path must stay inside `SESSIONS_DIR` (path-traversal
 *     guard).
 *
 * Public API:
 *   manager = new SessionManager({ sessionsDir, logger, onEvent, onMessage })
 *   manager.startSession(sessionId)
 *   manager.getOrCreate(sessionId)
 *   manager.getSession(sessionId)
 *   manager.getStatus(sessionId)
 *   manager.getQr(sessionId)
 *   manager.resetSession(sessionId)
 *   manager.deleteSession(sessionId)
 *   manager.sendMessage(sessionId, payload)
 *   manager.listSessions()
 *   manager.discoverExisting({ autoStart })
 */

import path from 'node:path';
import { rm, mkdir, readdir } from 'node:fs/promises';
import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
} from 'baileys';
import QRCode from 'qrcode';

const SESSION_ID_REGEX = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_RECENT_EVENTS = 30;

export function isValidSessionId(id) {
  return typeof id === 'string' && SESSION_ID_REGEX.test(id);
}

function safeAuthDir(sessionsDir, sessionId) {
  if (!isValidSessionId(sessionId)) {
    throw new Error(`Invalid sessionId: ${sessionId}`);
  }
  const resolved = path.resolve(sessionsDir, sessionId);
  const root = path.resolve(sessionsDir);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error('Path traversal blocked');
  }
  if (resolved === root) {
    throw new Error('Session directory cannot be the sessions root');
  }
  return resolved;
}

export class SessionRuntime {
  constructor({ sessionId, authDir, logger, onEvent, onMessage }) {
    this.sessionId = sessionId;
    this.authDir = authDir;
    this.logger = logger.child({ sessionId });
    this.onEvent = onEvent || (() => {});
    this.onMessage = onMessage || (() => {});
    this.sock = null;
    this.status = 'pending';
    this.lastError = null;
    this.lastDisconnect = null;
    this.phoneNumber = null;
    this.qr = null;
    this.qrDataUrl = null;
    this.lastSeenAt = null;
    this.createdAt = new Date().toISOString();
    this.startedAt = null;
    this.connectedAt = null;
    this.reconnectTimer = null;
    this.starting = false;
    this.authClearing = false;
    this.destroyed = false;
    this.messageCounters = { inbound: 0, outbound: 0, inbound24h: [], outbound24h: [] };
    this.recentEvents = [];
    this.socketReadyPromise = null;
    this.socketReadyResolve = null;
    this._resetReadyPromise();
  }

  _resetReadyPromise() {
    this.socketReadyPromise = new Promise((r) => { this.socketReadyResolve = r; });
  }

  _addEvent(type, detail) {
    const entry = { ts: new Date().toISOString(), type, detail };
    this.recentEvents.unshift(entry);
    if (this.recentEvents.length > MAX_RECENT_EVENTS) this.recentEvents.length = MAX_RECENT_EVENTS;
    try { this.onEvent(this.sessionId, type, detail, entry); } catch (err) {
      this.logger.warn({ err }, 'session event handler failed');
    }
  }

  _trimWindow(arr) {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    while (arr.length && arr[0] < cutoff) arr.shift();
  }

  noteInbound() {
    this.messageCounters.inbound += 1;
    this.messageCounters.inbound24h.push(Date.now());
    this._trimWindow(this.messageCounters.inbound24h);
  }

  noteOutbound() {
    this.messageCounters.outbound += 1;
    this.messageCounters.outbound24h.push(Date.now());
    this._trimWindow(this.messageCounters.outbound24h);
  }

  _destroySocket() {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.sock) {
      try { this.sock.ev.removeAllListeners(); } catch {}
      try { this.sock.end(undefined); } catch {}
      this.sock = null;
    }
  }

  async _clearAuthDir() {
    this.authClearing = true;
    try { await rm(this.authDir, { recursive: true, force: true }); } catch {}
    try { await mkdir(this.authDir, { recursive: true }); } catch {}
    this.authClearing = false;
  }

  async start() {
    if (this.destroyed) throw new Error('Session destroyed');
    if (this.starting) {
      this.logger.info('start already in progress — skipping');
      return;
    }
    this.starting = true;
    try {
      this._destroySocket();
      await mkdir(this.authDir, { recursive: true });

      const { state, saveCreds: _saveCreds } = await useMultiFileAuthState(this.authDir);
      const { version } = await fetchLatestBaileysVersion();

      const safeSaveCreds = async () => {
        if (this.authClearing) return;
        try { await _saveCreds(); } catch (err) {
          this.logger.warn({ err }, 'saveCreds failed (auth dir may have been cleared)');
        }
      };

      this.status = 'connecting';
      this.qr = null;
      this.qrDataUrl = null;
      this.startedAt = new Date().toISOString();
      this._resetReadyPromise();
      this._addEvent('connection', 'Connecting to WhatsApp…');

      const newSock = makeWASocket({
        version,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, this.logger),
        },
        logger: this.logger,
        printQRInTerminal: false,
        browser: ['Getouch WA', this.sessionId, '1.0.0'],
        generateHighQualityLinkPreview: false,
      });

      this.sock = newSock;
      const mySock = newSock;

      newSock.ev.on('creds.update', safeSaveCreds);

      newSock.ev.on('connection.update', async (update) => {
        if (this.sock !== mySock || this.destroyed) return;
        const { connection, lastDisconnect: ld, qr } = update;

        if (qr) {
          this.qr = qr;
          try { this.qrDataUrl = await QRCode.toDataURL(qr, { width: 320, margin: 2 }); } catch { this.qrDataUrl = null; }
          if (this.socketReadyResolve) { this.socketReadyResolve(); this.socketReadyResolve = null; }
          this.lastSeenAt = new Date().toISOString();
          this._addEvent('qr', 'QR code generated');
        }

        if (connection === 'open') {
          this.status = 'connected';
          this.qr = null;
          this.qrDataUrl = null;
          this.lastError = null;
          this.connectedAt = new Date().toISOString();
          this.lastSeenAt = this.connectedAt;
          try {
            const me = mySock.user;
            if (me?.id) this.phoneNumber = me.id.split(':')[0].split('@')[0];
          } catch {}
          this._addEvent('connected', `Connected${this.phoneNumber ? ' as +' + this.phoneNumber : ''}`);
        }

        if (connection === 'close') {
          this.status = 'disconnected';
          this.lastDisconnect = ld;
          const statusCode = ld?.error?.output?.statusCode;
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
          this.lastError = ld?.error?.message || null;
          this.lastSeenAt = new Date().toISOString();
          this._addEvent('disconnected', `Closed (code ${statusCode})${shouldReconnect ? ' — reconnecting' : ' — logged out'}`);

          if (shouldReconnect) {
            this.reconnectTimer = setTimeout(() => {
              this.start().catch((err) => this.logger.error({ err }, 'reconnect failed'));
            }, 3000);
          } else {
            this.phoneNumber = null;
            this.logger.info('Logged out — clearing auth state');
            await this._clearAuthDir();
            this.reconnectTimer = setTimeout(() => {
              this.start().catch((err) => this.logger.error({ err }, 'restart after logout failed'));
            }, 2000);
          }
        }
      });

      newSock.ev.on('messages.upsert', ({ messages }) => {
        if (this.sock !== mySock || this.destroyed) return;
        for (const msg of messages) {
          if (!msg.key.fromMe && msg.message) {
            this.noteInbound();
            this.lastSeenAt = new Date().toISOString();
            try {
              this.onMessage(this.sessionId, msg, mySock);
            } catch (err) {
              this.logger.error({ err }, 'onMessage handler failed');
            }
          }
        }
      });

      newSock.ev.on('messages.update', (updates) => {
        if (this.sock !== mySock || this.destroyed) return;
        for (const u of updates) {
          this._addEvent('message_status', `${u.key?.id || ''}: ${u.update?.status || ''}`);
          try {
            this.onEvent(this.sessionId, 'message.status', {
              messageId: u.key?.id,
              remoteJid: u.key?.remoteJid,
              status: u.update?.status,
            });
          } catch {}
        }
      });
    } finally {
      this.starting = false;
    }
  }

  async logout() {
    if (this.sock) {
      try { await this.sock.logout(); } catch {}
    }
    this._destroySocket();
    this.status = 'disconnected';
    this.phoneNumber = null;
  }

  async destroy() {
    this.destroyed = true;
    if (this.sock) { try { await this.sock.logout(); } catch {} }
    this._destroySocket();
    await rm(this.authDir, { recursive: true, force: true }).catch(() => {});
  }

  toStatusJson() {
    return {
      sessionId: this.sessionId,
      status: this.status,
      phoneNumber: this.phoneNumber,
      lastSeenAt: this.lastSeenAt,
      lastError: this.lastError,
      qrAvailable: Boolean(this.qrDataUrl),
      connectedAt: this.connectedAt,
      startedAt: this.startedAt,
      createdAt: this.createdAt,
      messages24h: {
        inbound: this.messageCounters.inbound24h.length,
        outbound: this.messageCounters.outbound24h.length,
      },
      messagesTotal: {
        inbound: this.messageCounters.inbound,
        outbound: this.messageCounters.outbound,
      },
    };
  }
}

export class SessionManager {
  constructor({ sessionsDir, logger, onEvent, onMessage, maxConcurrent }) {
    this.sessionsDir = path.resolve(sessionsDir);
    this.logger = logger;
    this.onEvent = onEvent || (() => {});
    this.onMessage = onMessage || (() => {});
    this.maxConcurrent = Number(maxConcurrent) || 0; // 0 = unlimited
    this.sessions = new Map();
  }

  async ensureRoot() {
    await mkdir(this.sessionsDir, { recursive: true });
  }

  _assertCapacity() {
    if (this.maxConcurrent > 0 && this.sessions.size >= this.maxConcurrent) {
      throw new Error(`Max concurrent sessions reached (${this.maxConcurrent})`);
    }
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  async getOrCreate(sessionId) {
    if (!isValidSessionId(sessionId)) throw new Error('Invalid sessionId');
    let runtime = this.sessions.get(sessionId);
    if (runtime) return runtime;
    this._assertCapacity();
    const authDir = safeAuthDir(this.sessionsDir, sessionId);
    runtime = new SessionRuntime({
      sessionId,
      authDir,
      logger: this.logger,
      onEvent: this.onEvent,
      onMessage: this.onMessage,
    });
    this.sessions.set(sessionId, runtime);
    return runtime;
  }

  async startSession(sessionId) {
    const runtime = await this.getOrCreate(sessionId);
    if (runtime.status !== 'connected' && !runtime.starting) {
      runtime.start().catch((err) => {
        runtime.lastError = err.message;
        runtime.status = 'error';
        this.logger.error({ err, sessionId }, 'session start failed');
      });
    }
    return runtime;
  }

  getStatus(sessionId) {
    const r = this.sessions.get(sessionId);
    if (!r) return null;
    return r.toStatusJson();
  }

  getQr(sessionId) {
    const r = this.sessions.get(sessionId);
    if (!r) return null;
    return { sessionId, qr: r.qrDataUrl || null, status: r.status };
  }

  async resetSession(sessionId) {
    const runtime = await this.getOrCreate(sessionId);
    runtime._destroySocket();
    runtime.status = 'disconnected';
    runtime.phoneNumber = null;
    runtime.qr = null;
    runtime.qrDataUrl = null;
    await runtime._clearAuthDir();
    runtime._addEvent('reset', 'Session force-reset');
    runtime.start().catch((err) => {
      runtime.lastError = err.message;
      runtime.status = 'error';
      this.logger.error({ err, sessionId }, 'restart after reset failed');
    });
    return runtime;
  }

  async deleteSession(sessionId) {
    const runtime = this.sessions.get(sessionId);
    if (runtime) {
      await runtime.destroy().catch(() => {});
      this.sessions.delete(sessionId);
      try { this.onEvent(sessionId, 'session.deleted', {}); } catch {}
      return true;
    }
    // Even if not in memory, delete the dir if it exists (per-session only)
    try {
      const authDir = safeAuthDir(this.sessionsDir, sessionId);
      await rm(authDir, { recursive: true, force: true });
    } catch {}
    return false;
  }

  async sendMessage(sessionId, payload) {
    const runtime = this.sessions.get(sessionId);
    if (!runtime || runtime.status !== 'connected' || !runtime.sock) {
      const err = new Error('Session not connected');
      err.code = 'NOT_CONNECTED';
      throw err;
    }
    const { to, type = 'text', text, media, caption, fileName, mimetype } = payload || {};
    if (!to) {
      const err = new Error('Missing "to"');
      err.code = 'BAD_REQUEST';
      throw err;
    }
    const jid = to.includes('@') ? to : `${String(to).replace(/[^0-9]/g, '')}@s.whatsapp.net`;

    let content;
    if (type === 'text') {
      if (!text) throw Object.assign(new Error('Missing "text" for text message'), { code: 'BAD_REQUEST' });
      content = { text };
    } else if (type === 'image') {
      const url = media?.url || payload.imageUrl;
      if (!url) throw Object.assign(new Error('Missing image url'), { code: 'BAD_REQUEST' });
      content = { image: { url } };
      if (caption || media?.caption) content.caption = caption || media?.caption;
    } else if (type === 'document') {
      const url = media?.url || payload.fileUrl;
      const name = fileName || media?.fileName || payload.fileName;
      if (!url || !name) throw Object.assign(new Error('Missing document url/fileName'), { code: 'BAD_REQUEST' });
      content = { document: { url }, fileName: name, mimetype: mimetype || media?.mimetype || 'application/octet-stream' };
      if (caption || media?.caption) content.caption = caption || media?.caption;
    } else {
      throw Object.assign(new Error(`Unsupported type: ${type}`), { code: 'BAD_REQUEST' });
    }

    const result = await runtime.sock.sendMessage(jid, content);
    runtime.noteOutbound();
    runtime.lastSeenAt = new Date().toISOString();
    runtime._addEvent('message_out', `To ${jid} (${type})`);
    return { sessionId, messageId: result?.key?.id, jid, status: 'sent' };
  }

  listSessions() {
    return Array.from(this.sessions.values()).map((r) => r.toStatusJson());
  }

  async discoverExisting({ autoStart = false } = {}) {
    await this.ensureRoot();
    let entries = [];
    try { entries = await readdir(this.sessionsDir, { withFileTypes: true }); } catch { return []; }
    const discovered = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const id = entry.name;
      if (!isValidSessionId(id)) continue;
      discovered.push(id);
      const runtime = await this.getOrCreate(id);
      runtime.status = 'pending';
      if (autoStart) {
        runtime.start().catch((err) => this.logger.warn({ err, sessionId: id }, 'auto-start failed'));
      }
    }
    return discovered;
  }
}
