// SERAPOD-INFRA-SEC-001 — the management UI must not claim protection that runtime code does not enforce.
// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const appAccessUi = read('app/admin/api-keys/AppAccessControlConsoleSimple.tsx');
const centralKeysUi = read('app/admin/api-keys/ApiKeyManagerConsole.tsx');
const centralKeysLib = read('lib/api-keys.ts');
const broker = read('lib/platform-broker.ts');

test('App Access UI makes no tenant-isolation or routing claims', () => {
  for (const phrase of [
    'control-plane header for tenant isolation',
    'Isolation island inside the app',
    'used internally for logs, routing',
  ]) {
    assert.ok(!appAccessUi.includes(phrase), `misleading phrase still present: ${phrase}`);
  }
});

test('App Access UI labels registry-only features', () => {
  assert.match(appAccessUi, /Not enforced yet:<\/strong> key expiry, rate limits, tenant bindings, service links and secret references/);
  assert.match(appAccessUi, /broker does not check tenant bindings/);
  assert.match(appAccessUi, /broker does not use these links to route or restrict requests/);
  assert.match(appAccessUi, /does not resolve these references/);
});

test('Central API Keys UI marks rate limits and allowed origins as not enforced', () => {
  assert.match(centralKeysUi, /Rate Limit \(req \/ minute\) — stored only, not enforced yet/);
  assert.match(centralKeysUi, /Rate limits and allowed origins are stored but <strong>not enforced<\/strong>/);
});

// Coupling checks: if enforcement is implemented, these fail so the UI copy gets updated in the same change.
test('central key rate limiting is still unenforced (update UI copy when this changes)', () => {
  assert.ok(!/fail\('rate_limited'\)/.test(centralKeysLib), 'validateApiKey now enforces rate limits: update the UI notes');
});

test('broker still has no tenant-binding or rate-limit enforcement (update UI copy when this changes)', () => {
  assert.ok(!/platformAppTenantBindings|rateLimit/i.test(broker), 'broker now enforces tenancy or rate limits: update the UI notes');
});
