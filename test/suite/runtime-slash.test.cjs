'use strict';

// tests/runtime-slash.test.cjs — Phase 28.7 (Plan 28.7-03).
//
// Coverage for scripts/lib/install/runtime-slash.cjs:
//   - claude / 13 default runtimes emit `/hone-<name>`.
//   - codex emits `$hone-<name>` (shell-variable form, token lowercased).
//   - Idempotency: `/hone-x`, `hone-x`, `/hone:x`, `gdd:x`, `$hone-x`, `$gdd:x`
//     all normalize to canonical form for the target runtime.
//   - Argument tails (including Windows paths) round-trip untouched.
//   - Empty / whitespace-only / degenerate (`hone-`) inputs → empty string.
//   - Non-string inputs pass through unchanged (type-guard).
//   - resolveRuntime precedence: GDD_RUNTIME > .planning/config.json > default 'claude'.
//   - Malformed JSON in config.json does NOT throw — falls back to 'claude'.
//   - formatGddSlashFor delegates correctly.
//
// Env discipline: every test that touches GDD_RUNTIME snapshots + restores it.
// Tmp-dir discipline: every test that creates a project fixture cleans up via
// `t.after(...)`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  formatGddSlash,
  resolveRuntime,
  formatGddSlashFor,
} = require('../../scripts/lib/install/runtime-slash.cjs');

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Snapshot + clear GDD_RUNTIME. Returns a restore function.
 */
function snapshotGddRuntime() {
  const prior = process.env.GDD_RUNTIME;
  delete process.env.GDD_RUNTIME;
  return () => {
    if (prior === undefined) delete process.env.GDD_RUNTIME;
    else process.env.GDD_RUNTIME = prior;
  };
}

/**
 * Create a tmp project dir with `.planning/config.json` containing `body`.
 * `body` can be any string (JSON or malformed). Returns the absolute dir path.
 */
function tmpProjectWithConfigBody(body) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hone-slash-'));
  fs.mkdirSync(path.join(dir, '.planning'));
  fs.writeFileSync(path.join(dir, '.planning', 'config.json'), body);
  return dir;
}

/**
 * Create a tmp project dir with `.planning/config.json` containing
 * `{ runtime: <rt> }`. Returns the absolute dir path.
 */
function tmpProjectWithRuntime(rt) {
  return tmpProjectWithConfigBody(JSON.stringify({ runtime: rt }));
}

// ── formatGddSlash — runtime emission ──────────────────────────────────────

test('runtime-slash: claude emits /hone-<name>', () => {
  assert.equal(formatGddSlash('explore', 'claude'), '/hone-explore');
});

test('runtime-slash: codex emits $hone-<name> with lowercased token', () => {
  assert.equal(formatGddSlash('explore', 'codex'), '$hone-explore');
  assert.equal(formatGddSlash('Explore', 'codex'), '$hone-explore');
});

test('runtime-slash: 5-runtime sample all emit /hone-<name> (cursor, windsurf, kilo, opencode, antigravity)', () => {
  for (const rt of ['cursor', 'windsurf', 'kilo', 'opencode', 'antigravity']) {
    assert.equal(
      formatGddSlash('debug', rt),
      '/hone-debug',
      `${rt} should emit /hone-debug`
    );
  }
});

test('runtime-slash: unknown / falsy runtime defaults to claude shape', () => {
  assert.equal(formatGddSlash('explore', 'hermes'), '/hone-explore');
  assert.equal(formatGddSlash('explore', undefined), '/hone-explore');
  assert.equal(formatGddSlash('explore', ''), '/hone-explore');
});

// ── formatGddSlash — idempotency ───────────────────────────────────────────

test('runtime-slash: /hone-debug stays /hone-debug under claude (idempotent)', () => {
  assert.equal(formatGddSlash('/hone-debug', 'claude'), '/hone-debug');
});

test('runtime-slash: $hone-debug normalizes to /hone-debug under claude', () => {
  assert.equal(formatGddSlash('$hone-debug', 'claude'), '/hone-debug');
});

test('runtime-slash: $hone-debug stays $hone-debug under codex (idempotent)', () => {
  assert.equal(formatGddSlash('$hone-debug', 'codex'), '$hone-debug');
});

test('runtime-slash: legacy /hone:foo input normalizes to /hone-foo under claude', () => {
  assert.equal(formatGddSlash('/hone:foo', 'claude'), '/hone-foo');
  assert.equal(formatGddSlash('gdd:foo', 'claude'), '/hone-foo');
});

// ── formatGddSlash — argument tail preservation ────────────────────────────

test('runtime-slash: argument tail preserved under claude', () => {
  assert.equal(
    formatGddSlash('do --phase 1', 'claude'),
    '/hone-do --phase 1'
  );
});

test('runtime-slash: Windows path in argument tail preserved verbatim under codex', () => {
  // Case in the tail MUST round-trip untouched — only the leading token is
  // lowercased on codex. Phase 28.6 macOS-symlink / Windows-path lesson.
  const input = 'open C:\\Users\\Me\\file.txt';
  const got = formatGddSlash(input, 'codex');
  assert.equal(got, '$hone-open C:\\Users\\Me\\file.txt');
});

test('runtime-slash: tab-separated argument tail preserved', () => {
  // The split regex matches \s (any whitespace), so tab tails round-trip too.
  assert.equal(
    formatGddSlash('do\targ', 'claude'),
    '/hone-do\targ'
  );
});

// ── formatGddSlash — degenerate inputs ─────────────────────────────────────

test('runtime-slash: empty string returns empty string', () => {
  assert.equal(formatGddSlash('', 'claude'), '');
  assert.equal(formatGddSlash('', 'codex'), '');
});

test('runtime-slash: whitespace-only input returns empty string', () => {
  assert.equal(formatGddSlash('   ', 'claude'), '');
  assert.equal(formatGddSlash('\t\t', 'codex'), '');
});

test('runtime-slash: bare prefix hone- with no token returns empty string', () => {
  // Never re-emit `/hone-` or `$hone-` with nothing after.
  assert.equal(formatGddSlash('hone-', 'claude'), '');
  assert.equal(formatGddSlash('/hone-', 'claude'), '');
  assert.equal(formatGddSlash('$hone-', 'codex'), '');
});

test('runtime-slash: non-string input passes through unchanged (type-guard)', () => {
  assert.equal(formatGddSlash(null, 'claude'), null);
  assert.equal(formatGddSlash(undefined, 'claude'), undefined);
  assert.deepEqual(formatGddSlash(42, 'claude'), 42);
});

// ── resolveRuntime — precedence ────────────────────────────────────────────

test('runtime-slash: resolveRuntime reads GDD_RUNTIME env first', () => {
  const restore = snapshotGddRuntime();
  try {
    process.env.GDD_RUNTIME = 'CODEX';
    assert.equal(resolveRuntime(undefined), 'codex');
    // Env wins even when a config.json on disk says otherwise.
    const dir = tmpProjectWithRuntime('cursor');
    try {
      assert.equal(resolveRuntime(dir), 'codex');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } finally {
    restore();
  }
});

test('runtime-slash: resolveRuntime reads .planning/config.json#runtime when env unset', (t) => {
  const restore = snapshotGddRuntime();
  const dir = tmpProjectWithRuntime('opencode');
  t.after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    restore();
  });
  assert.equal(resolveRuntime(dir), 'opencode');
});

test('runtime-slash: resolveRuntime defaults to claude when env unset + no projectDir', () => {
  const restore = snapshotGddRuntime();
  try {
    assert.equal(resolveRuntime(undefined), 'claude');
    assert.equal(resolveRuntime(null), 'claude');
  } finally {
    restore();
  }
});

test('runtime-slash: resolveRuntime defaults to claude on malformed JSON (no throw)', (t) => {
  const restore = snapshotGddRuntime();
  const dir = tmpProjectWithConfigBody('not valid json {[}');
  t.after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    restore();
  });
  assert.equal(resolveRuntime(dir), 'claude');
});

test('runtime-slash: resolveRuntime defaults to claude when config missing runtime key', (t) => {
  const restore = snapshotGddRuntime();
  const dir = tmpProjectWithConfigBody(JSON.stringify({ other: 'value' }));
  t.after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    restore();
  });
  assert.equal(resolveRuntime(dir), 'claude');
});

test('runtime-slash: resolveRuntime defaults to claude when projectDir has no .planning/', (t) => {
  const restore = snapshotGddRuntime();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hone-slash-noplanning-'));
  t.after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    restore();
  });
  assert.equal(resolveRuntime(dir), 'claude');
});

// ── formatGddSlashFor — delegation ─────────────────────────────────────────

test('runtime-slash: formatGddSlashFor delegates via resolveRuntime + formatGddSlash', (t) => {
  const restore = snapshotGddRuntime();
  const dir = tmpProjectWithRuntime('codex');
  t.after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    restore();
  });
  // resolveRuntime(dir) → 'codex', formatGddSlash('explore','codex') → $hone-explore
  assert.equal(formatGddSlashFor(dir, 'explore'), '$hone-explore');
  // Same dir, different command — verifies it's not a cache hit on first arg.
  assert.equal(formatGddSlashFor(dir, 'debug'), '$hone-debug');
});

test('runtime-slash: formatGddSlashFor with no projectDir uses claude default', () => {
  const restore = snapshotGddRuntime();
  try {
    assert.equal(formatGddSlashFor(undefined, 'explore'), '/hone-explore');
  } finally {
    restore();
  }
});
