import { NextRequest, NextResponse } from 'next/server';
import { listMessages } from '@/lib/evolution';
import { requireAdmin } from '../_helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const url = new URL(req.url);
  const tenantId = url.searchParams.get('tenantId') ?? undefined;
  const sessionId = url.searchParams.get('sessionId') ?? undefined;
  const status = url.searchParams.get('status') ?? undefined;
  const limit = Number(url.searchParams.get('limit') ?? 100);

  const rows = await listMessages({ tenantId, sessionId, status, limit });
  // Sanitize: trim preview, never return full body unless caller asks for it.
  const sanitized = rows.map((r) => ({
    ...r,
    preview: r.preview ? r.preview.slice(0, 140) : null,
  }));
  return NextResponse.json({ messages: sanitized });
}
