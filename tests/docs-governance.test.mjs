// SERAPOD-INFRA-GOV-001 — documentation checks for the canonical tracker and agent rules.
// Run: npm test (also runs in CI). Keeps the tracker structurally complete and public-repo safe.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');

const TRACKER = 'docs/PROJECT_STATUS.md';
const GOVERNANCE_DOCS = [
  TRACKER,
  'AGENTS.md',
  'CLAUDE.md',
  'docs/ops/coolify-auto-deploy-audit-2026-11-21.md',
  'docs/proposals/project-control-page.md',
];

const tracker = read(TRACKER);
const section = (heading) => {
  const start = tracker.indexOf(`\n## ${heading}`);
  assert.ok(start >= 0, `tracker section missing: ${heading}`);
  const next = tracker.indexOf('\n## ', start + 4);
  return tracker.slice(start, next < 0 ? undefined : next);
};

const STAGES = new Set(['PLANNED', 'IMPLEMENTED', 'MERGED', 'DEPLOYED', 'VERIFIED', 'APPLIED', 'BLOCKED']);
const REQUIRED_FIELDS = ['Owner', 'Branch / PR', 'Implementation', 'Tests', 'Deployment', 'Verification', 'Rollback', 'Blockers', 'Next safe action'];
const IMPLEMENTATION = /^(PLANNED|IMPLEMENTED|MERGED|APPLIED|BLOCKED|N\/A)\b/;
const DEPLOYMENT = /^(NOT DEPLOYED|DEPLOYED|N\/A)\b/;
const VERIFICATION = /^(UNVERIFIED|VERIFIED \(LIMITED\)|VERIFIED|N\/A|edge part VERIFIED|suspected cause)/;

const boardRows = () => section('2. Board')
  .split('\n')
  .filter((l) => l.startsWith('| ') && !l.startsWith('| Task ID') && !l.startsWith('|---'))
  .map((l) => l.split('|').map((c) => c.trim()))
  .map((c) => ({ id: c[1], stage: c[3] }));

const records = () => {
  const body = section('3. Task records');
  return body.split('\n### ').slice(1).map((chunk) => {
    const heading = chunk.split('\n')[0];
    return { id: heading.split(' — ')[0].trim(), text: chunk };
  });
};

const field = (text, name) => {
  const m = text.match(new RegExp(`\\*\\*${name.replace(/[/]/g, '\\/')}:\\*\\*\\s*([^·\\n]+)`));
  return m ? m[1].trim() : null;
};

test('tracker header has a last-reconciled date and the precedence and public-repo rules', () => {
  assert.match(tracker, /\*\*Last reconciled:\*\* \d{4}-\d{2}-\d{2}/);
  assert.match(tracker, /Live evidence wins/);
  assert.match(tracker, /This repository is public/);
  assert.match(tracker, /deploys are \*\*manual\*\*/);
});

test('board stages use the legend', () => {
  const rows = boardRows();
  assert.ok(rows.length >= 10, 'board looks empty');
  for (const r of rows) assert.ok(STAGES.has(r.stage), `${r.id}: unknown stage "${r.stage}"`);
});

test('every board task has a complete task record', () => {
  const recs = new Map(records().map((r) => [r.id, r.text]));
  for (const { id } of boardRows()) {
    const text = recs.get(id);
    assert.ok(text, `no task record for ${id}`);
    for (const f of REQUIRED_FIELDS) assert.ok(field(text, f) !== null, `${id}: missing field "${f}"`);
    assert.match(field(text, 'Implementation'), IMPLEMENTATION, `${id}: bad Implementation value`);
    assert.match(field(text, 'Deployment'), DEPLOYMENT, `${id}: bad Deployment value`);
    assert.match(field(text, 'Verification'), VERIFICATION, `${id}: bad Verification value`);
  }
});

test('agent rules require the full handover record', () => {
  const agents = read('AGENTS.md');
  for (const f of ['Task ID', ...REQUIRED_FIELDS]) assert.ok(agents.includes(`| ${f} |`), `AGENTS.md missing field ${f}`);
  assert.match(agents, /live evidence wins/i);
  assert.match(agents, /This repository is public/);
  assert.match(agents, /Deploys are manual/);
  assert.match(read('CLAUDE.md'), /@AGENTS\.md/);
});

test('governance docs are safe for a public repository', () => {
  const forbidden = [
    ['IPv4 address', /\b(?:\d{1,3}\.){3}\d{1,3}\b/],
    ['host path', /(?:^|[\s`(])\/(?:data|srv|home|etc|var|opt)\/[\w.-]/m],
    ['UUID', /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i],
    ['long hex id', /\b[0-9a-f]{24,}\b/],
    ['Coolify-style resource id', /\b(?=[a-z0-9]*\d)(?=[a-z0-9]*[a-z])[a-z0-9]{24}\b/],
    ['platform key', /\bpk_[a-z0-9]{3,}/i],
    ['API key prefix', /\b(?:sk|pos)_[A-Za-z0-9]{8,}|\bsk-[A-Za-z0-9]{8,}/],
    ['private key block', /BEGIN [A-Z ]*PRIVATE KEY/],
    ['assigned secret', /(?:password|secret|token)\s*[=:]\s*['"]?[A-Za-z0-9+/_-]{8,}/i],
    ['email address', /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/],
    ['component version', /\bv?\d+\.\d+\.\d+\b/],
    // Generic terms only: this file is public too, so it must not hint at specific findings.
    ['vulnerability wording', /\b(?:superuser|root-equivalent|privilege escalation|exploitable|unpatched)\b/i],
    ['access-bypass detail', /\bAccess bypass\b|\bbypass (?:rule|policy|app) for\b/i],
  ];
  for (const doc of GOVERNANCE_DOCS) {
    const text = read(doc);
    for (const [label, re] of forbidden) {
      const m = text.match(re);
      assert.ok(!m, `${doc}: ${label} found: "${m?.[0]}"`);
    }
  }
});

test('relative links in governance docs resolve', () => {
  for (const doc of GOVERNANCE_DOCS) {
    const text = read(doc);
    for (const [, target] of text.matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)) {
      if (/^[a-z]+:/i.test(target)) continue;
      assert.ok(existsSync(resolve(root, dirname(doc), target)), `${doc}: broken link ${target}`);
    }
  }
});
