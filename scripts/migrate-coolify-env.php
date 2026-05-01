<?php
// Coolify env reconciler — runs inside the coolify container via `docker exec`.
// Reads /tmp/migrate-getouchweb.env (compose .env), upserts into Application::find(2)
// environment_variables. Never prints values. Forces AUTH_SECRET to compose value.

require '/var/www/html/vendor/autoload.php';
$app = require '/var/www/html/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\Application;
use App\Models\EnvironmentVariable;

$path = '/tmp/migrate-getouchweb.env';
if (!is_file($path)) { echo "missing $path\n"; exit(1); }

$lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
$pairs = [];
foreach ($lines as $line) {
    $line = trim($line);
    if ($line === '' || $line[0] === '#') continue;
    if (!preg_match('/^([A-Z][A-Z0-9_]*)=(.*)$/', $line, $m)) continue;
    $k = $m[1];
    $v = $m[2];
    // Strip surrounding quotes if present.
    if (strlen($v) >= 2) {
        $first = $v[0];
        $last = $v[strlen($v) - 1];
        if (($first === '"' && $last === '"') || ($first === "'" && $last === "'")) {
            $v = substr($v, 1, -1);
        }
    }
    $pairs[$k] = $v;
}

$app = Application::find(2);
$existing = [];
foreach ($app->environment_variables as $ev) { $existing[$ev->key] = $ev; }

// Keys that exist in compose but Coolify wants different (skip if already set).
// AUTH_SECRET is intentionally force-overwritten to preserve sessions.
$forceOverwrite = ['AUTH_SECRET'];

// Coolify-only / build-tooling keys that must not be overwritten by compose values.
$coolifySkip = ['NODE_ENV', 'NIXPACKS_NODE_VERSION'];

$added = []; $updated = []; $skipped = []; $unchanged = [];

foreach ($pairs as $key => $value) {
    if (in_array($key, $coolifySkip, true)) { $skipped[] = $key; continue; }
    if (isset($existing[$key])) {
        if (in_array($key, $forceOverwrite, true)) {
            $ev = $existing[$key];
            if ($ev->value !== $value) {
                $ev->value = $value;
                $ev->save();
                $updated[] = $key;
            } else {
                $unchanged[] = $key;
            }
        } else {
            $unchanged[] = $key;
        }
    } else {
        EnvironmentVariable::create([
            'key'                 => $key,
            'value'               => $value,
            'is_runtime'          => true,
            'is_buildtime'        => false,
            'resourceable_type'   => 'App\\Models\\Application',
            'resourceable_id'     => 2,
        ]);
        $added[] = $key;
    }
}

echo "ADDED (" . count($added) . "): " . implode(',', $added) . "\n";
echo "UPDATED (" . count($updated) . "): " . implode(',', $updated) . "\n";
echo "UNCHANGED (" . count($unchanged) . "): " . implode(',', $unchanged) . "\n";
echo "SKIPPED-coolify-managed (" . count($skipped) . "): " . implode(',', $skipped) . "\n";
echo "TOTAL keys after merge: " . count($app->fresh()->environment_variables) . "\n";
