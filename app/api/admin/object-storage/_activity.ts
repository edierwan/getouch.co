import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';
import { objectStorageActivity } from '@/lib/schema';

export async function logActivity(input: {
  eventType: string;
  tenantId?: string | null;
  bucket?: string | null;
  objectKey?: string | null;
  actor?: string | null;
  actorKeyPrefix?: string | null;
  sourceIp?: string | null;
  status?: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(objectStorageActivity).values({
      eventType: input.eventType,
      tenantId: input.tenantId ?? null,
      bucket: input.bucket ?? null,
      objectKey: input.objectKey ?? null,
      actor: input.actor ?? null,
      actorKeyPrefix: input.actorKeyPrefix ?? null,
      sourceIp: input.sourceIp ?? null,
      status: input.status ?? 'ok',
      details: input.details ?? {},
    });
  } catch {
    /* table may not exist yet — non-fatal */
  }
  void NextResponse;
  void sql;
}
