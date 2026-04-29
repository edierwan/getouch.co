import { NextRequest, NextResponse } from 'next/server';
import { listObjects, deleteObject, uploadObject } from '@/lib/object-storage/seaweed';
import { requireAdmin } from '../_helpers';
import { logActivity } from '../_activity';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;
  const url = new URL(req.url);
  const bucket = url.searchParams.get('bucket') ?? '';
  const prefix = url.searchParams.get('prefix') ?? '';
  if (!bucket) return NextResponse.json({ error: 'bucket_required' }, { status: 400 });
  const entries = await listObjects(bucket, prefix);
  const objects = entries.map((e) => ({
    name: e.FullPath.split('/').filter(Boolean).slice(-1)[0] ?? e.FullPath,
    fullPath: e.FullPath,
    isFolder: !e.Mime,
    type: e.Mime ?? 'folder',
    size: e.FileSize ?? 0,
    lastModified: e.Mtime ?? null,
  }));
  return NextResponse.json({ bucket, prefix, objects });
}

export async function DELETE(req: NextRequest) {
  const { error, session } = await requireAdmin();
  if (error) return error;
  const url = new URL(req.url);
  const bucket = url.searchParams.get('bucket') ?? '';
  const key = url.searchParams.get('key') ?? '';
  if (!bucket || !key) return NextResponse.json({ error: 'params_required' }, { status: 400 });
  const result = await deleteObject(bucket, key);
  if (!result.ok) return NextResponse.json({ error: result.error ?? 'failed' }, { status: 500 });
  await logActivity({
    eventType: 'object.deleted',
    bucket,
    objectKey: key,
    actor: session?.email ?? null,
  });
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const { error, session } = await requireAdmin();
  if (error) return error;

  const formData = await req.formData();
  const bucket = String(formData.get('bucket') ?? '');
  const prefix = String(formData.get('prefix') ?? '');
  const file = formData.get('file');
  if (!bucket || !(file instanceof File)) {
    return NextResponse.json({ error: 'params_required' }, { status: 400 });
  }
  if (file.size > 100 * 1024 * 1024) {
    return NextResponse.json({ error: 'file_too_large' }, { status: 413 });
  }
  const buffer = await file.arrayBuffer();
  const result = await uploadObject(bucket, prefix, file.name, buffer, file.type);
  if (!result.ok) return NextResponse.json({ error: result.error ?? 'failed' }, { status: 500 });
  await logActivity({
    eventType: 'object.uploaded',
    bucket,
    objectKey: result.key ?? file.name,
    actor: session?.email ?? null,
    details: { size: file.size, contentType: file.type },
  });
  return NextResponse.json({ ok: true, key: result.key });
}
