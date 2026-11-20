// SERAPOD-INFRA-008 — unit tests for evidence-based service status classification.
// Run: npm test   (node --test --experimental-strip-types)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeServiceProbe } from '../lib/platform-service-shared.ts';

const container = (name, status = 'running', health = 'healthy') => ({
  name, image: null, status, health, runtimeSource: 'standalone',
  composeProject: null, composeService: null, networks: [],
});

const probe = (overrides = {}) => ({
  found: true, containers: [], publicUrl: 'https://svc.getouch.co', publicOriginCode: 200,
  publicEdgeCode: 200, internalUrl: null, notes: [], ...overrides,
});

const airbyteOpts = { requirePublicRoute: true };

test('Airbyte: kind node up + app health ok + Access 302 => ONLINE', () => {
  const s = describeServiceProbe(probe({
    containers: [container('airbyte-abctl-control-plane', 'running', null)],
    publicEdgeCode: 302, healthOk: true,
  }), airbyteOpts);
  assert.equal(s.label, 'ONLINE');
});

test('Airbyte: kind node up but /api/v1/health failing => DEGRADED, never ONLINE', () => {
  const s = describeServiceProbe(probe({
    containers: [container('airbyte-abctl-control-plane', 'running', null)],
    publicEdgeCode: 302, healthOk: false,
  }), airbyteOpts);
  assert.equal(s.label, 'DEGRADED');
});

test('a stale "created" leftover does not mask the running runtime', () => {
  const s = describeServiceProbe(probe({
    containers: [container('e22ff0999a6a_open-webui', 'created', null), container('open-webui')],
  }), { requirePublicRoute: true });
  assert.equal(s.label, 'ONLINE');
});

test('installed but no container running and no live route => OFFLINE', () => {
  const s = describeServiceProbe(probe({
    containers: [container('grafana', 'exited', null)], publicOriginCode: 502, publicEdgeCode: 502,
  }), { requirePublicRoute: true });
  assert.equal(s.label, 'OFFLINE');
});

test('running but unhealthy container => DEGRADED, not OFFLINE', () => {
  const s = describeServiceProbe(probe({
    containers: [container('svc', 'running', 'unhealthy')], publicOriginCode: 502, publicEdgeCode: 502,
  }), { requirePublicRoute: true });
  assert.equal(s.label, 'DEGRADED');
});

test('probe failure => UNKNOWN, not a guessed state', () => {
  const s = describeServiceProbe(probe({
    found: false, publicOriginCode: null, publicEdgeCode: null,
    notes: ['Live probe unavailable: ssh exited with code 255'],
  }));
  assert.equal(s.label, 'UNKNOWN');
});

test('nothing detected => NOT INSTALLED', () => {
  const s = describeServiceProbe(probe({ found: false, publicOriginCode: null, publicEdgeCode: null }));
  assert.equal(s.label, 'NOT INSTALLED');
});
