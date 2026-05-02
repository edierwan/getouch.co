import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { PlatformRegistryError } from '@/lib/platform-app-access-mutations';

export async function requireAdmin() {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (session.role !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { session };
}

export async function readJsonBody(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) return {};
    return body as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function handlePlatformRegistryError(scope: string, err: unknown) {
  if (err instanceof PlatformRegistryError) {
    return NextResponse.json({ error: err.code, message: err.message }, { status: err.status });
  }
  console.error(`[${scope}] failed:`, err);
  return NextResponse.json({ error: 'internal_error' }, { status: 500 });
}