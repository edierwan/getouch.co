import crypto from 'node:crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { hashApiKey } from './api-keys';
import { db, getDb } from './db';
import { platformAppKeys, platformApps } from './schema';

type JsonRecord = Record<string, unknown>;

const DEFAULT_PLATFORM_APP_KEY_NAME = 'Default Platform App Key';
const DEFAULT_PLATFORM_APP_SCOPES = ['platform:*'];

export interface GeneratedPlatformAppKey {
  plaintext: string;
  keyPrefix: string;
  keyHash: string;
  keyLast4: string;
  masked: string;
}

function normalizePlatformAppCodeSegment(appCode: string): string {
  const normalized = appCode
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

  return normalized || 'app';
}

export function maskPlatformAppKey(keyPrefix: string, keyLast4: string): string {
  return `${keyPrefix}_****${keyLast4}`;
}

export function generatePlatformAppKey(appCode: string): GeneratedPlatformAppKey {
  const normalizedAppCode = normalizePlatformAppCodeSegment(appCode);
  const random = crypto.randomBytes(24).toString('base64url');
  const plaintext = `pk_${normalizedAppCode}_${random}`;
  const keyPrefix = `pk_${normalizedAppCode}`;
  const keyLast4 = plaintext.slice(-4);

  return {
    plaintext,
    keyPrefix,
    keyHash: hashApiKey(plaintext),
    keyLast4,
    masked: maskPlatformAppKey(keyPrefix, keyLast4),
  };
}

export function buildPlatformAppKeyInsert(input: {
  appId: string;
  appCode: string;
  name?: string | null;
  scopes?: string[] | null;
  metadata?: JsonRecord | null;
}) {
  const generated = generatePlatformAppKey(input.appCode);
  const scopes = Array.from(new Set((input.scopes ?? DEFAULT_PLATFORM_APP_SCOPES).filter(Boolean)));

  return {
    plaintext: generated.plaintext,
    masked: generated.masked,
    keyPrefix: generated.keyPrefix,
    keyLast4: generated.keyLast4,
    scopes,
    values: {
      appId: input.appId,
      name: input.name?.trim() || DEFAULT_PLATFORM_APP_KEY_NAME,
      keyPrefix: generated.keyPrefix,
      keyHash: generated.keyHash,
      keyLast4: generated.keyLast4,
      scopes,
      status: 'active',
      metadata: input.metadata ?? {},
    },
  };
}

export async function listPlatformAppKeysForApps(appIds: string[]) {
  if (appIds.length === 0) return [];

  return db
    .select()
    .from(platformAppKeys)
    .where(inArray(platformAppKeys.appId, appIds))
    .orderBy(desc(platformAppKeys.createdAt));
}

export async function getLatestPlatformAppKey(appId: string) {
  const rows = await db
    .select()
    .from(platformAppKeys)
    .where(eq(platformAppKeys.appId, appId))
    .orderBy(desc(platformAppKeys.createdAt))
    .limit(1);

  return rows[0] ?? null;
}

export async function rotatePlatformAppKey(input: {
  appId: string;
  actorEmail?: string | null;
}) {
  const appRows = await db.select().from(platformApps).where(eq(platformApps.id, input.appId)).limit(1);
  const app = appRows[0] ?? null;
  if (!app) return null;

  return getDb().transaction(async (tx) => {
    await tx
      .update(platformAppKeys)
      .set({
        status: 'revoked',
        revokedAt: new Date(),
      })
      .where(and(eq(platformAppKeys.appId, app.id), eq(platformAppKeys.status, 'active')));

    const generated = buildPlatformAppKeyInsert({
      appId: app.id,
      appCode: app.appCode,
      metadata: input.actorEmail ? { rotatedByEmail: input.actorEmail } : {},
    });

    const rows = await tx.insert(platformAppKeys).values(generated.values).returning();
    const row = rows[0] ?? null;
    if (!row) return null;

    return {
      row,
      plaintext: generated.plaintext,
      masked: generated.masked,
      keyPrefix: generated.keyPrefix,
      keyLast4: generated.keyLast4,
      scopes: generated.scopes,
      app,
    };
  });
}

export async function validatePlatformAppKey(plaintext: string) {
  const normalized = plaintext.trim();
  if (!normalized) return null;

  const keyHash = hashApiKey(normalized);
  const rows = await db
    .select({
      app: platformApps,
      key: platformAppKeys,
    })
    .from(platformAppKeys)
    .innerJoin(platformApps, eq(platformAppKeys.appId, platformApps.id))
    .where(eq(platformAppKeys.keyHash, keyHash))
    .limit(1);

  const match = rows[0] ?? null;
  if (!match) return null;
  if (match.key.status !== 'active') return null;
  if (match.app.status !== 'active') return null;

  await db
    .update(platformAppKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(platformAppKeys.id, match.key.id));

  return match;
}