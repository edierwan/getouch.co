import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../_helpers';
import { logActivity } from '../_activity';

const FILER_URL = process.env.SEAWEED_FILER_URL ?? 'http://seaweed-filer:8888';

export const dynamic = 'force-dynamic';

function buildObjectUrl(bucket: string, key: string) {
  const safeKey = key
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');

  return `${FILER_URL}/buckets/${encodeURIComponent(bucket)}/${safeKey}`;
}

function sanitizeFilename(key: string) {
  return (key.split('/').filter(Boolean).pop() ?? 'download').replace(/"/g, '');
}

export async function GET(req: NextRequest) {
  const { error, session } = await requireAdmin();
  if (error) return error;

  const url = new URL(req.url);
  const bucket = url.searchParams.get('bucket') ?? '';
  const key = url.searchParams.get('key') ?? '';

  if (!bucket || !key) {
    return NextResponse.json({ error: 'params_required' }, { status: 400 });
  }

  const upstream = await fetch(buildObjectUrl(bucket, key), {
    cache: 'no-store',
    signal: AbortSignal.timeout(30_000),
  });

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: upstream.ok ? 'empty_body' : `HTTP ${upstream.status}` },
      { status: upstream.ok ? 502 : upstream.status },
    );
  }

  await logActivity({
    eventType: 'object.downloaded',
    bucket,
    objectKey: key,
    actor: session?.email ?? null,
  });

  const headers = new Headers();
  const contentType = upstream.headers.get('content-type');
  const contentLength = upstream.headers.get('content-length');

  if (contentType) headers.set('Content-Type', contentType);
  if (contentLength) headers.set('Content-Length', contentLength);
  headers.set('Content-Disposition', `inline; filename="${sanitizeFilename(key)}"`);
  headers.set('Cache-Control', 'no-store');

  return new Response(upstream.body, {
    status: 200,
    headers,
  });
}