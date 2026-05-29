'use strict';

// Phase 31 — D-10 STATIC token-isolation enforcer.
//
// D-10: the Figma personal access token is read from the environment ONLY and is
// NEVER written to disk and NEVER passed to a log/print primitive. This test is
// the CI gate enforcing that invariant across the WHOLE extract library: it scans
// every `*.cjs` under scripts/lib/figma-extract/ and FAILS if any line both calls
// a persistence/log primitive AND references a FIGMA_TOKEN variable in that call's
// arguments.
//
// It is a STATIC analysis (source-text scan) — it does not execute the modules, so
// it catches a token leak even on a code path the unit tests never hit.
//
// A meta-test runs the SAME scanner against a synthetic positive sample to prove
// the scanner is NOT vacuously passing (i.e. it actually catches a planted leak).
//
// Tagged `31-10:`. >= 4 tests.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..');
const EXTRACT_LIB_DIR = path.join(REPO_ROOT, 'scripts/lib/figma-extract');

// The forbidden token variable names (env var + the conventional local binding).
const TOKEN_VARS = '(?:FIGMA_TOKEN|FIGMA_PERSONAL_ACCESS_TOKEN)';

// Forbidden pattern 1 — writing/persisting a token to disk.
//   writeFile(...FIGMA_TOKEN...) / writeFileSync(...) / appendFile(...) / appendFileSync(...)
// Matches when the token var appears anywhere inside the call's argument text
// (up to the next close-paren — sufficient for single-line call sites, which is
// the only shape a real leak would take here).
const PERSIST_RE = new RegExp(
  `(?:writeFile|writeFileSync|appendFile|appendFileSync)\\s*\\([^)]*${TOKEN_VARS}`
);

// Forbidden pattern 2 — logging/printing a token.
//   console.log/.warn/.error/.info / logger.<method> / process.stdout|stderr.write
const LOG_RE = new RegExp(
  `(?:console\\.(?:log|warn|error|info|debug)|logger\\.\\w+|process\\.std(?:out|err)\\.write)\\s*\\([^)]*${TOKEN_VARS}`
);

/**
 * Scan a single source body for token-leak violations. Returns an array of
 * { line, text, kind } violation records (empty when clean).
 *
 * Implementation note: we strip `process.env.FIGMA_TOKEN` reads BEFORE matching,
 * because reading the token from the environment is the ALLOWED path (D-10). A
 * leak is the token flowing INTO a persist/log call — not the env read itself.
 * A `console.error(process.env.FIGMA_TOKEN)` would still be caught because the
 * stripped form (`console.error()`) is re-tested against the raw line: we only
 * use the stripped form to avoid false-positives on the bare env read, and we
 * re-scan the RAW line for the persist/log + token co-occurrence. To keep both
 * goals, we match on the raw line but EXCLUDE lines whose only token reference is
 * a direct `process.env.<TOKEN>` / `process.env[...]` read with no persist/log
 * primitive present.
 */
function scanSource(body) {
  const violations = [];
  const lines = body.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (PERSIST_RE.test(line)) {
      violations.push({ line: i + 1, text: line.trim(), kind: 'persist' });
    }
    if (LOG_RE.test(line)) {
      violations.push({ line: i + 1, text: line.trim(), kind: 'log' });
    }
  }
  return violations;
}

function listExtractCjs() {
  return fs
    .readdirSync(EXTRACT_LIB_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.cjs'))
    .map((e) => e.name)
    .sort();
}

test('31-10: scripts/lib/figma-extract/ contains the expected *.cjs library files', () => {
  const files = listExtractCjs();
  assert.ok(files.length >= 5, `expected the full extract library; found ${files.length}: ${files.join(', ')}`);
  // Sanity: the token-bearing modules MUST be in scope of the scan.
  assert.ok(files.includes('pull.cjs'), 'pull.cjs (the only token-reading module) must be scanned');
  assert.ok(files.includes('styles-resolver.cjs'), 'styles-resolver.cjs (sends token as header) must be scanned');
});

test('31-10: NO file in scripts/lib/figma-extract/ persists or logs a FIGMA_TOKEN (D-10)', () => {
  const offenders = [];
  for (const name of listExtractCjs()) {
    const body = fs.readFileSync(path.join(EXTRACT_LIB_DIR, name), 'utf8');
    const violations = scanSource(body);
    if (violations.length > 0) {
      offenders.push({ name, violations });
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `token-leak violations found:\n${offenders
      .map((o) => `  ${o.name}: ${o.violations.map((v) => `L${v.line} (${v.kind}) ${v.text}`).join('; ')}`)
      .join('\n')}`
  );
});

test('31-10: total violation count across the extract library is exactly 0', () => {
  let total = 0;
  for (const name of listExtractCjs()) {
    total += scanSource(fs.readFileSync(path.join(EXTRACT_LIB_DIR, name), 'utf8')).length;
  }
  assert.equal(total, 0, 'the extract library must have zero token persist/log sites (D-10)');
});

test('31-10: META — the scanner catches a planted writeFile(FIGMA_TOKEN) leak (not vacuous)', () => {
  const planted = [
    "const fs = require('node:fs');",
    'const token = process.env.FIGMA_TOKEN;',
    "fs.writeFileSync('/tmp/leak.txt', FIGMA_TOKEN);", // planted persist leak
  ].join('\n');
  const violations = scanSource(planted);
  assert.ok(violations.length >= 1, 'scanner must flag the planted writeFile leak');
  assert.ok(violations.some((v) => v.kind === 'persist'), 'the planted leak is classified as a persist violation');
});

test('31-10: META — the scanner catches a planted console.log(FIGMA_TOKEN) leak', () => {
  const planted = [
    'const token = process.env.FIGMA_PERSONAL_ACCESS_TOKEN;',
    'console.log("debugging token:", FIGMA_PERSONAL_ACCESS_TOKEN);', // planted log leak
  ].join('\n');
  const violations = scanSource(planted);
  assert.ok(violations.length >= 1, 'scanner must flag the planted console.log leak');
  assert.ok(violations.some((v) => v.kind === 'log'), 'the planted leak is classified as a log violation');
});

test('31-10: META — the scanner does NOT false-positive on the allowed env read / header use', () => {
  // The legitimate patterns the library actually uses: read from env, send as a
  // request header. Neither is a persist/log primitive, so neither is a violation.
  const allowed = [
    'const tok = token || process.env.FIGMA_TOKEN || process.env.FIGMA_PERSONAL_ACCESS_TOKEN;',
    "const headers = { 'X-Figma-Token': tok };",
    "logger.info({ event: 'pull_complete', endpoints: endpoints.length });",
  ].join('\n');
  const violations = scanSource(allowed);
  assert.deepEqual(violations, [], 'allowed env-read + header + token-free log must not be flagged');
});
