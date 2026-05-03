#!/usr/bin/env php
<?php
declare(strict_types=1);

use App\Models\Application;
use App\Models\EnvironmentVariable;
use Illuminate\Contracts\Console\Kernel;

const USAGE_ERROR = 64;

function fail(string $message, int $exitCode = 1): never
{
    fwrite(STDERR, $message.PHP_EOL);
    exit($exitCode);
}

function usage(): string
{
    return <<<'TXT'
Safe Coolify application env upsert.

Usage:
  php set-coolify-app-env.php --app-id 2 --key KEY --value-file /tmp/value.txt
  php set-coolify-app-env.php --app-uuid mqmo5bwkxysedbg7vvh6tk1f --key KEY --stdin

Required selectors:
  --app-id <id>           Coolify application id.
  --app-uuid <uuid>       Coolify application uuid.
  --key <ENV_KEY>         Environment variable key.

Value input: choose exactly one.
  --value <value>         Only for non-secret values. Shell history/process list risk.
  --value-file <path>     Reads the value from a file.
  --stdin                 Reads the value from STDIN.

Optional flags:
  --preview               Target the preview env row instead of the main row.
  --buildtime             Target the build-time env row instead of runtime-only.
  --literal               Mark the row as literal.
  --multiline             Mark the row as multiline.
  --shown-once            Mark the row as shown once.
  --comment <text>        Store a non-secret operator comment.
  --allow-empty           Allow an empty value.
  --dry-run               Validate and report action without saving.
  --help                  Show this help.

Notes:
  - Run this inside the coolify container so it uses Coolify's own model path.
  - Non-literal values are encrypted by Coolify automatically.
  - Output never includes the value.
TXT;
}

function readValue(array $options): string
{
    $hasValue = array_key_exists('value', $options);
    $hasValueFile = array_key_exists('value-file', $options);
    $hasStdin = array_key_exists('stdin', $options);
    $sources = ($hasValue ? 1 : 0) + ($hasValueFile ? 1 : 0) + ($hasStdin ? 1 : 0);

    if ($sources !== 1) {
        fail('Choose exactly one of --value, --value-file, or --stdin.', USAGE_ERROR);
    }

    if ($hasValue) {
        return (string) $options['value'];
    }

    if ($hasValueFile) {
        $path = (string) $options['value-file'];
        if ($path === '' || ! is_file($path) || ! is_readable($path)) {
            fail("Value file is not readable: {$path}", USAGE_ERROR);
        }

        $contents = file_get_contents($path);
        if ($contents === false) {
            fail("Failed to read value file: {$path}");
        }

        return rtrim($contents, "\r\n");
    }

    $contents = stream_get_contents(STDIN);
    if ($contents === false) {
        fail('Failed to read value from STDIN.');
    }

    return rtrim($contents, "\r\n");
}

$options = getopt('', [
    'app-id:',
    'app-uuid:',
    'key:',
    'value:',
    'value-file:',
    'stdin',
    'preview',
    'buildtime',
    'literal',
    'multiline',
    'shown-once',
    'comment:',
    'allow-empty',
    'dry-run',
    'help',
]);

if (array_key_exists('help', $options)) {
    fwrite(STDOUT, usage().PHP_EOL);
    exit(0);
}

$appId = $options['app-id'] ?? null;
$appUuid = $options['app-uuid'] ?? null;
if (($appId === null && $appUuid === null) || ($appId !== null && $appUuid !== null)) {
    fail('Provide exactly one of --app-id or --app-uuid.', USAGE_ERROR);
}

$key = isset($options['key']) ? strtoupper(trim((string) $options['key'])) : '';
if ($key === '' || ! preg_match('/^[A-Z][A-Z0-9_]*$/', $key)) {
    fail('Key must match ^[A-Z][A-Z0-9_]*$.', USAGE_ERROR);
}

$value = readValue($options);
if ($value === '' && ! array_key_exists('allow-empty', $options)) {
    fail('Refusing to set an empty value without --allow-empty.', USAGE_ERROR);
}

$app = require '/var/www/html/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

$applicationQuery = Application::query();
$application = $appId !== null
    ? $applicationQuery->find((int) $appId)
    : $applicationQuery->where('uuid', (string) $appUuid)->first();

if (! $application instanceof Application) {
    fail('Application not found.', 2);
}

$isPreview = array_key_exists('preview', $options);
$isBuildtime = array_key_exists('buildtime', $options);
$literalOption = array_key_exists('literal', $options) ? true : null;
$multilineOption = array_key_exists('multiline', $options) ? true : null;
$shownOnceOption = array_key_exists('shown-once', $options) ? true : null;
$commentOption = array_key_exists('comment', $options) ? trim((string) $options['comment']) : null;
$dryRun = array_key_exists('dry-run', $options);

$environmentVariable = $application->environment_variables()
    ->where('key', $key)
    ->where('is_preview', $isPreview)
    ->where('is_buildtime', $isBuildtime)
    ->first();

$isNew = ! $environmentVariable instanceof EnvironmentVariable;
if ($isNew) {
    $environmentVariable = new EnvironmentVariable([
        'key' => $key,
        'is_runtime' => true,
        'is_buildtime' => $isBuildtime,
        'is_preview' => $isPreview,
        'is_literal' => false,
        'is_multiline' => false,
        'is_shown_once' => false,
    ]);
    $environmentVariable->resourceable()->associate($application);
}

$dirty = false;
if ($isNew || $environmentVariable->value !== $value) {
    $environmentVariable->value = $value;
    $dirty = true;
}

if ($literalOption !== null && (bool) $environmentVariable->is_literal !== $literalOption) {
    $environmentVariable->is_literal = $literalOption;
    $dirty = true;
}

if ($multilineOption !== null && (bool) $environmentVariable->is_multiline !== $multilineOption) {
    $environmentVariable->is_multiline = $multilineOption;
    $dirty = true;
}

if ($shownOnceOption !== null && (bool) $environmentVariable->is_shown_once !== $shownOnceOption) {
    $environmentVariable->is_shown_once = $shownOnceOption;
    $dirty = true;
}

if ($commentOption !== null && trim((string) $environmentVariable->comment) !== $commentOption) {
    $environmentVariable->comment = $commentOption;
    $dirty = true;
}

$action = $isNew ? 'created' : 'updated';
if (! $dirty) {
    $action = 'unchanged';
} elseif ($dryRun) {
    $action = $isNew ? 'would_create' : 'would_update';
} else {
    $environmentVariable->save();
}

$savedId = $environmentVariable->id;
if ($savedId === null && ! $dryRun) {
    fail('Environment variable save did not return an id.');
}

fwrite(STDOUT, json_encode([
    'action' => $action,
    'application_id' => $application->id,
    'application_uuid' => $application->uuid,
    'environment_variable_id' => $savedId,
    'key' => $key,
    'is_preview' => (bool) $environmentVariable->is_preview,
    'is_buildtime' => (bool) $environmentVariable->is_buildtime,
    'is_literal' => (bool) $environmentVariable->is_literal,
    'is_multiline' => (bool) $environmentVariable->is_multiline,
    'is_shown_once' => (bool) $environmentVariable->is_shown_once,
    'dry_run' => $dryRun,
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES).PHP_EOL);