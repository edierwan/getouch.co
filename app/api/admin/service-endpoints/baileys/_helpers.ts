import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

/**
 * Internal helper for the Baileys Gateway portal console.
 *
 * The Baileys runtime is the `baileys-gateway` container exposed publicly
 * at wa.getouch.co. We proxy admin reads/writes through this Next.js
 * layer so that:
 *   - browser code never sees the WA admin/api keys
 *   - we can swap the runtime container without touching the UI
 *   - portal session/role checks are enforced before each call
 */

export const WA_BASE_URL = process.env.WA_URL || 'http://baileys-gateway:3001';
export const WA_API_KEY = process.env.WA_API_KEY || '';
export const WA_ADMIN_KEY = process.env.WA_ADMIN_KEY || process.env.WA_API_KEY || '';
export const WA_PUBLIC_URL = process.env.WA_PUBLIC_URL || 'https://wa.getouch.co';
export const BAILEYS_DB_NAME = process.env.BAILEYS_DB_NAME || 'baileys';
export const BAILEYS_DB_URL = process.env.BAILEYS_DATABASE_URL || '';

export async function requireAdmin() {
  const session = await getSession();
  if (!session) {
    return { error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }), session: null };
  }
  if (session.role !== 'admin') {
    return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }), session: null };
  }
  return { error: null, session };
}

export interface WaProxyOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Optional override for which key header to send. */
  auth?: 'api' | 'admin';
  /** Forward additional query string. */
  query?: Record<string, string | number | boolean | undefined | null>;
}

export interface WaProxyResult<T = unknown> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
}

/** Configured = we have at least an API key for the wa runtime. */
export function isWaConfigured(): boolean {
  return Boolean(WA_API_KEY);
}

/** Low-level proxy. Returns parsed JSON or null. */
export async function waProxy<T = unknown>(path: string, opts: WaProxyOptions = {}): Promise<WaProxyResult<T>> {
  if (!isWaConfigured()) {
    return { ok: false, status: 503, data: null, error: 'wa_runtime_not_configured' };
  }

  const url = new URL(path.startsWith('http') ? path : `${WA_BASE_URL}${path}`);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const isAdminPath = url.pathname === '/admin' || url.pathname.startsWith('/admin/');
  const useAdmin = (opts.auth === 'admin' || (opts.auth !== 'api' && isAdminPath)) && WA_ADMIN_KEY;
  if (useAdmin) {
    headers['X-Admin-Key'] = WA_ADMIN_KEY;
  } else {
    headers['X-API-Key'] = WA_API_KEY;
  }

  try {
    const res = await fetch(url.toString(), {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      cache: 'no-store',
      // Reasonable upstream timeout via AbortSignal.timeout
      signal: AbortSignal.timeout(15_000),
    });

    let payload: unknown = null;
    const text = await res.text();
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { raw: text };
      }
    }

    return {
      ok: res.ok,
      status: res.status,
      data: payload as T | null,
      error: res.ok ? undefined : (payload as { error?: string })?.error || `upstream_${res.status}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'network_error';
    return { ok: false, status: 502, data: null, error: msg };
  }
}
