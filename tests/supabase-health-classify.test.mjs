// GETOUCH-UAT-001 — unit tests for Supabase stack health classification.
// Run: npm test   (node --test --experimental-strip-types)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyGateway, classifyAuth, classifyRest, classifyDatabase, classifyStudio, summarizeStack, STUDIO_NOT_CONFIGURED,
} from '../lib/supabase-health-classify.ts';
import { SUPABASE_STACKS } from '../app/admin/databases/supabase-stacks.ts';

const ACCESS = 'https://getouch.cloudflareaccess.com/cdn-cgi/access/login';

for (const stack of SUPABASE_STACKS) {
  test(`[${stack.id}] Studio URL is never the Kong gateway`, () => {
    assert.ok(stack.studioUrl === null || new URL(stack.studioUrl).hostname !== new URL(stack.apiUrl).hostname);
  });
  test(`[${stack.id}] distinct container prefix and API`, () => {
    assert.match(stack.apiUrl, /^https:\/\/sb-/);
    assert.ok(stack.containerPrefix.length > 0);
  });
}

test('stacks are distinct environments', () => {
  const [a, b] = SUPABASE_STACKS;
  assert.notEqual(a.apiUrl, b.apiUrl);
  assert.notEqual(a.studioUrl, b.studioUrl);
  assert.notEqual(a.containerPrefix, b.containerPrefix);
});

test('gateway: missing key rejected (401) = ONLINE; 200 without key = OPEN (critical)', () => {
  assert.equal(classifyGateway(401).ok, true);
  assert.equal(classifyGateway(200).label, 'OPEN');
  assert.equal(classifyGateway(200).ok, false);
  assert.equal(classifyGateway(404).ok, false);
  assert.equal(classifyGateway(null).label, 'UNREACHABLE');
});

test('auth / rest with authorized key', () => {
  assert.equal(classifyAuth(200).ok, true);
  assert.equal(classifyAuth(401).ok, false);
  assert.equal(classifyAuth(null).label, 'NOT CHECKED');
  assert.equal(classifyRest(200).ok, true);
  assert.equal(classifyRest(500).tone, 'critical');
});

test('database: pg_isready', () => {
  assert.equal(classifyDatabase('127.0.0.1:5432 - accepting connections').ok, true);
  assert.equal(classifyDatabase('127.0.0.1:5432 - no response').ok, false);
  assert.equal(classifyDatabase(null).label, 'NOT CHECKED');
});

test('studio: enabled ONLY on a Cloudflare Access login for the same host', () => {
  const url = 'https://studio-sso.getouch.co';
  const ok = classifyStudio(url, { code: 302, location: `${ACCESS}/studio-sso.getouch.co?kid=x` });
  assert.equal(ok.enabled, true);
  assert.equal(ok.url, url);
  assert.equal(ok.label, 'ACCESS-PROTECTED');
});

test('studio: Access login for a DIFFERENT host is not accepted', () => {
  const r = classifyStudio('https://studio-sso.getouch.co', { code: 302, location: `${ACCESS}/db.getouch.co` });
  assert.equal(r.enabled, false);
});

test('studio: redirect to a lookalike Access domain is not accepted', () => {
  const r = classifyStudio('https://studio-sso.getouch.co', { code: 302, location: 'https://evil.example/cdn-cgi/access/login/studio-sso.getouch.co' });
  assert.equal(r.enabled, false);
});

test('studio: unprotected 200 is blocked and flagged critical', () => {
  const r = classifyStudio('https://studio-sso.getouch.co', { code: 200, location: null });
  assert.equal(r.enabled, false);
  assert.equal(r.tone, 'critical');
  assert.equal(r.url, null);
});

test('studio: no DNS / proxy 503 / null URL => "Studio access not configured", disabled', () => {
  for (const r of [
    classifyStudio('https://studio-preprod.getouch.co', { code: null, location: null, error: 'ENOTFOUND' }),
    classifyStudio('https://studio-preprod.getouch.co', { code: 503, location: null }),
    classifyStudio(null, { code: null, location: null }),
  ]) {
    assert.equal(r.enabled, false);
    assert.equal(r.url, null);
    assert.ok(r.detail.startsWith(STUDIO_NOT_CONFIGURED));
  }
});

test('summary is ONLINE only when every component passed', () => {
  const g = classifyGateway(401), a = classifyAuth(200), r = classifyRest(200), d = classifyDatabase('accepting connections');
  assert.equal(summarizeStack([g, a, r, d]).label, 'ONLINE');
  assert.equal(summarizeStack([g, classifyAuth(503), r, d]).label, 'DEGRADED');
  assert.equal(summarizeStack([g, classifyAuth(null), r, d]).label, 'PARTIAL');
});

import { buildSupabaseHostScript } from '../lib/supabase-health-classify.ts';
import { SUPABASE_HEALTH_TARGETS } from '../app/admin/databases/supabase-stacks.ts';

test('host script: only allowlisted prefixes, never prints the key', () => {
  const script = buildSupabaseHostScript([
    ...SUPABASE_HEALTH_TARGETS,
    { id: 'evil', apiUrl: 'https://x.example', containerPrefix: 'x; rm -rf /' },
  ]);
  assert.match(script, /check 'sso' 'getouch-sso' 'https:\/\/sb-sso\.getouch\.co'/);
  assert.match(script, /check 'preprod' 'serapod-preprod' 'https:\/\/sb-stg-serapod\.getouch\.co'/);
  assert.doesNotMatch(script, /rm -rf/);
  assert.doesNotMatch(script, /printf[^\n]*\$key/);
});
