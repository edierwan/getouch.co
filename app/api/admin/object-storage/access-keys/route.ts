import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { eq, sql } from 'drizzle-orm';
import { objectStorageAccessKeys } from '@/lib/object-storage/schema';
import { requireAdmin } from '../_helpers';
import { logActivity } from '../_activity';

export const dynamic = 'force-dynamic';

const PERMISSIONS = ['read', 'write', 'read-write', 'presign'] as const;
type Permission = (typeof PERMISSIONS)[number];

function isPermission(value: unknown): value is Permission {
  return typeof value === 'string' && (PERMISSIONS as readonly string[]).includes(value);
}

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  try {
    const rows = await db
      .select()
      .from(objectStorageAccessKeys)
      .orderBy(sql`created_at DESC`);
    // Never expose secret_hash.
    const safe = rows.map(({ secretHash: secretHashOmitted, ...rest }) => {
      void secretHashOmitted;
      return rest;
    });
    return NextResponse.json({ keys: safe });
  } catch {
    return NextResponse.json({ keys: [], degraded: true, blocker: 'migrations_pending' });
  }
}

export async function POST(req: NextRequest) {
  const { error, session } = await requireAdmin();
  if (error) return error;
  const body = (await req.json().catch(() => ({}))) as {
    label?: string;
    tenantId?: string;
    bucket?: string;
    prefix?: string;
    permission?: string;
    service?: string;
    expiresAt?: string;
    ipAllowlist?: string[];
  };
  if (!body.label) return NextResponse.json({ error: 'label_required' }, { status: 400 });

  // Generate AWS-style key id + secret. We hash the secret at rest and
  // return the plaintext exactly once. The actual S3 backend (SeaweedFS
  // s3.json) must be updated out-of-band by ops; this record is portal
  // metadata only — see Settings tab for the operational caveat.
  const accessKeyId = `AKIA${crypto.randomBytes(8).toString('hex').toUpperCase().slice(0, 16)}`;
  const secret = crypto.randomBytes(30).toString('base64').replace(/[+/=]/g, '').slice(0, 40);
  const secretHash = crypto.createHash('sha256').update(secret).digest('hex');

  const permission: Permission = isPermission(body.permission) ? body.permission : 'read-write';

  try {
    const [row] = await db
      .insert(objectStorageAccessKeys)
      .values({
        label: body.label,
        tenantId: body.tenantId ?? null,
        bucket: body.bucket ?? null,
        prefix: body.prefix ?? null,
        permission,
        keyPrefix: accessKeyId,
        secretHash,
        service: body.service ?? null,
        ipAllowlist: body.ipAllowlist ?? [],
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        createdBy: session?.email ?? null,
      })
      .returning();
    await logActivity({
      eventType: 'access_key.created',
      tenantId: body.tenantId ?? null,
      bucket: body.bucket ?? null,
      actor: session?.email ?? null,
      actorKeyPrefix: accessKeyId,
      details: { label: body.label, permission },
    });
    const { secretHash: _omit, ...safeRow } = row;
    void _omit;
    // Plaintext secret is returned ONLY in this response.
    return NextResponse.json({
      ok: true,
      key: { ...safeRow, accessKeyId, secretAccessKey: secret },
      notice:
        'Secret shown ONCE. Update SeaweedFS s3.json out-of-band to authorize the key against the gateway.',
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'insert_failed' },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const { error, session } = await requireAdmin();
  if (error) return error;
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  const action = url.searchParams.get('action') ?? 'revoke';
  if (!id) return NextResponse.json({ error: 'id_required' }, { status: 400 });
  try {
    await db
      .update(objectStorageAccessKeys)
      .set({
        status: action === 'rotate' ? 'rotating' : 'revoked',
        updatedAt: new Date(),
      })
      .where(eq(objectStorageAccessKeys.id, id));
    await logActivity({
      eventType: action === 'rotate' ? 'access_key.rotated' : 'access_key.revoked',
      actor: session?.email ?? null,
      details: { id },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'update_failed' },
      { status: 500 },
    );
  }
}
