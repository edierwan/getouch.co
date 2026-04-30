import { NextRequest, NextResponse } from 'next/server';
import { getBaileysDbPortalData } from '@/lib/baileys-db';
import { requireAdmin, waProxy } from '../_helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(req.url);
  const direction = searchParams.get('direction') || undefined;
  const phone = searchParams.get('phone') || undefined;
  const limit = Number(searchParams.get('limit') || '50');

  const dbData = await getBaileysDbPortalData();
  let dbRows = dbData.messages;

  if (direction) {
    dbRows = dbRows.filter((row) => row.direction === direction);
  }
  if (phone) {
    dbRows = dbRows.filter((row) => `${row.toNumber ?? ''} ${row.fromNumber ?? ''}`.includes(phone));
  }

  if (dbRows.length > 0) {
    return NextResponse.json({
      ok: true,
      source: 'baileys_db',
      messages: dbRows.slice(0, Math.max(1, Math.min(limit, 100))).map((row) => ({
        id: row.id,
        direction: row.direction,
        phone: row.direction === 'outbound' ? row.toNumber : row.fromNumber,
        text: row.preview,
        status: row.status,
        createdAt: row.createdAt,
        sessionId: row.sessionId,
      })),
    });
  }

  const runtime = await waProxy<{ rows?: Array<{ id?: string | number; direction?: string; phone?: string; content?: string; status?: string; created_at?: string; createdAt?: string }>; total?: number }>('/admin/messages', {
    query: { direction, phone, limit },
  });

  if (!runtime.ok) {
    return NextResponse.json({ ok: true, source: 'baileys_db', messages: [] }, { status: 200 });
  }

  return NextResponse.json({
    ok: true,
    source: 'baileys_runtime',
    messages: (runtime.data?.rows ?? []).map((row) => ({
      id: row.id,
      direction: row.direction,
      phone: row.phone,
      text: row.content,
      status: row.status,
      createdAt: row.createdAt ?? row.created_at,
      sessionId: null,
    })),
  });
}
