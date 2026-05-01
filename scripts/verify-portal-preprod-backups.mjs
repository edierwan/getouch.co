import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const EXPECTED_UPSTREAM = 'getouch-coolify-app:3000';
const EXPECTED_APP_DB_NAME = 'getouch.co';

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

function pass(message) {
  console.log(`OK: ${message}`);
}

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function extractHostBlock(caddyfile, host) {
  const marker = `http://${host} {`;
  const start = caddyfile.indexOf(marker);
  if (start === -1) {
    fail(`Caddy host block missing for ${host}`);
    return null;
  }

  const rest = caddyfile.slice(start);
  const end = rest.indexOf('\n}\n');
  return end === -1 ? rest : rest.slice(0, end + 3);
}

const caddyfile = read('infra/Caddyfile');
for (const host of ['getouch.co', 'auth.getouch.co', 'portal.getouch.co']) {
  const block = extractHostBlock(caddyfile, host);
  if (!block) continue;

  if (!block.includes(`reverse_proxy ${EXPECTED_UPSTREAM}`)) {
    fail(`${host} must reverse_proxy to ${EXPECTED_UPSTREAM}`);
  } else {
    pass(`${host} routes to ${EXPECTED_UPSTREAM}`);
  }
}

const composeYaml = read('compose.yaml');
if (composeYaml.includes('\n  web:\n') || /container_name:\s*getouch\S*web/.test(composeYaml)) {
  fail('compose.yaml must not define the deprecated compose-hosted portal service');
} else {
  pass('compose.yaml does not define the deprecated compose-hosted portal service');
}

if (!composeYaml.includes(`APP_DB_NAME:-${EXPECTED_APP_DB_NAME}`)) {
  fail(`compose.yaml must default APP_DB_NAME to ${EXPECTED_APP_DB_NAME}`);
} else {
  pass(`compose.yaml defaults APP_DB_NAME to ${EXPECTED_APP_DB_NAME}`);
}

const envExample = read('.env.example');
if (!envExample.includes(`APP_DB_NAME=${EXPECTED_APP_DB_NAME}`)) {
  fail(`.env.example must set APP_DB_NAME=${EXPECTED_APP_DB_NAME}`);
} else {
  pass(`.env.example sets APP_DB_NAME=${EXPECTED_APP_DB_NAME}`);
}

const bootstrapScript = read('infra/scripts/bootstrap-platform.sh');
if (!bootstrapScript.includes(`APP_DB_NAME=${EXPECTED_APP_DB_NAME}`)) {
  fail(`bootstrap-platform.sh must seed APP_DB_NAME=${EXPECTED_APP_DB_NAME}`);
} else {
  pass(`bootstrap-platform.sh seeds APP_DB_NAME=${EXPECTED_APP_DB_NAME}`);
}

const adminData = read('app/admin/data.ts');
if (!adminData.includes("{ label: 'Preprod Backups', href: '/admin/databases'")) {
  fail('ADMIN_NAV is missing the authoritative Preprod Backups route');
} else {
  pass('ADMIN_NAV contains Preprod Backups -> /admin/databases');
}

const databasesPage = path.join(repoRoot, 'app/admin/databases/page.tsx');
if (!fs.existsSync(databasesPage)) {
  fail('Route file app/admin/databases/page.tsx is missing');
} else {
  pass('Route file app/admin/databases/page.tsx exists');
}

const sidebarNav = read('app/admin/SidebarNav.tsx');
if (!sidebarNav.includes('window.location.assign(href)')) {
  fail('Portal sidebar hard navigation fallback is missing');
} else {
  pass('Portal sidebar hard navigation fallback is present');
}

if (process.exitCode) {
  process.exit(process.exitCode);
}