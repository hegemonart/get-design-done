// test/suite/phase-47-scope.test.cjs — Phase 47 (Live Mode): write-scope guard
//
// Proves scripts/lib/live/scope-guard.cjs holds the live-session write boundary:
//   - a write under .design/live-sessions/ is ALLOWED,
//   - a write under .design/telemetry/ is ALLOWED,
//   - a write to an `implicated` source file (the element->source mapping) is ALLOWED,
//   - a write to an arbitrary repo file is REJECTED,
//   - a `../` escape out of the project is REJECTED (resolved before compare),
//   - a sibling dir sharing a name prefix (.design/live-sessions-evil/) is REJECTED,
//   - paths are joined cross-platform (relative + absolute implicated inputs both work),
//   - assertInScope throws with a diagnosable message; isInScope returns bool.
//
// Pure unit test — no fs, no temp dirs needed (scope-guard only uses `path`).
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const guard = require('../../scripts/lib/live/scope-guard.cjs');

// A platform-appropriate absolute project root (C:\ on win32, /srv on POSIX) so
// path.resolve produces stable absolute paths without depending on cwd.
const ROOT = process.platform === 'win32' ? 'C:\\proj\\app' : '/srv/proj/app';

const IMPLICATED = ['src/components/PricingCard.tsx', 'src/styles/pricing.css'];

// ---------------------------------------------------------------------------
// 1. Writes under the always-allowed .design subdirs are in scope.
// ---------------------------------------------------------------------------
test('47-scope: .design/live-sessions/<id>.json is allowed', () => {
  const target = path.join('.design', 'live-sessions', 'x.json');
  assert.equal(guard.isInScope({ projectRoot: ROOT, targetPath: target, implicated: IMPLICATED }), true);
  assert.doesNotThrow(() => guard.assertInScope({ projectRoot: ROOT, targetPath: target, implicated: IMPLICATED }));
});

test('47-scope: .design/telemetry/<file> is allowed', () => {
  const target = path.join('.design', 'telemetry', 'events.jsonl');
  assert.equal(guard.isInScope({ projectRoot: ROOT, targetPath: target, implicated: [] }), true);
});

// ---------------------------------------------------------------------------
// 2. Writes to an implicated source file are in scope — relative AND absolute.
// ---------------------------------------------------------------------------
test('47-scope: an implicated source file is allowed (relative input)', () => {
  assert.equal(
    guard.isInScope({ projectRoot: ROOT, targetPath: 'src/components/PricingCard.tsx', implicated: IMPLICATED }),
    true,
  );
});

test('47-scope: an implicated source file is allowed (absolute input)', () => {
  const abs = path.resolve(ROOT, 'src/styles/pricing.css');
  assert.equal(guard.isInScope({ projectRoot: ROOT, targetPath: abs, implicated: IMPLICATED }), true);
});

test('47-scope: an implicated entry given as an absolute path still matches', () => {
  const absImplicated = path.resolve(ROOT, 'src/components/Widget.tsx');
  assert.equal(
    guard.isInScope({ projectRoot: ROOT, targetPath: 'src/components/Widget.tsx', implicated: [absImplicated] }),
    true,
  );
});

// ---------------------------------------------------------------------------
// 3. A non-implicated, non-.design repo file is REJECTED.
// ---------------------------------------------------------------------------
test('47-scope: an arbitrary repo file is rejected', () => {
  assert.equal(guard.isInScope({ projectRoot: ROOT, targetPath: 'package.json', implicated: IMPLICATED }), false);
  assert.throws(
    () => guard.assertInScope({ projectRoot: ROOT, targetPath: 'package.json', implicated: IMPLICATED }),
    /refusing to write/,
  );
});

test('47-scope: a source file NOT in implicated is rejected', () => {
  assert.equal(
    guard.isInScope({ projectRoot: ROOT, targetPath: 'src/components/OtherCard.tsx', implicated: IMPLICATED }),
    false,
  );
});

// ---------------------------------------------------------------------------
// 4. A `../` escape out of the project is REJECTED (resolved before compare).
// ---------------------------------------------------------------------------
test('47-scope: a ../ escape out of the project is rejected', () => {
  const escape = path.join('..', '..', 'etc', 'passwd');
  assert.equal(guard.isInScope({ projectRoot: ROOT, targetPath: escape, implicated: IMPLICATED }), false);
  assert.throws(
    () => guard.assertInScope({ projectRoot: ROOT, targetPath: escape, implicated: IMPLICATED }),
    /refusing to write/,
  );
});

test('47-scope: a ../ escape that climbs out of .design/live-sessions is rejected', () => {
  // Resolves to <root>/.design/secrets.txt — outside the live-sessions dir.
  const sneaky = path.join('.design', 'live-sessions', '..', 'secrets.txt');
  assert.equal(guard.isInScope({ projectRoot: ROOT, targetPath: sneaky, implicated: [] }), false);
});

// ---------------------------------------------------------------------------
// 5. Sibling dir sharing a name prefix must NOT count as inside (separator-safe).
// ---------------------------------------------------------------------------
test('47-scope: a sibling dir sharing a name prefix is rejected', () => {
  const sibling = path.join('.design', 'live-sessions-evil', 'x.json');
  assert.equal(guard.isInScope({ projectRoot: ROOT, targetPath: sibling, implicated: [] }), false);
});

// ---------------------------------------------------------------------------
// 6. enumerateScope normalizes to resolved dirs + a set of resolved files.
// ---------------------------------------------------------------------------
test('47-scope: enumerateScope returns resolved dirs + resolved implicated files', () => {
  const { dirs, files } = guard.enumerateScope({ projectRoot: ROOT, implicated: IMPLICATED });
  assert.ok(dirs.includes(path.resolve(ROOT, '.design', 'live-sessions')));
  assert.ok(dirs.includes(path.resolve(ROOT, '.design', 'telemetry')));
  assert.ok(files.has(path.resolve(ROOT, 'src/components/PricingCard.tsx')));
  assert.ok(files.has(path.resolve(ROOT, 'src/styles/pricing.css')));
  // Empty / nullish implicated entries are dropped.
  const empty = guard.enumerateScope({ projectRoot: ROOT, implicated: ['', null, undefined] });
  assert.equal(empty.files.size, 0);
});

// ---------------------------------------------------------------------------
// 7. The exact allowed directory itself (not just descendants) is in scope.
// ---------------------------------------------------------------------------
test('47-scope: the live-sessions dir itself is in scope (isWithin same-path)', () => {
  const dir = path.join('.design', 'live-sessions');
  assert.equal(guard.isInScope({ projectRoot: ROOT, targetPath: dir, implicated: [] }), true);
  // isWithin is exported and treats identical paths as contained.
  const abs = path.resolve(ROOT, dir);
  assert.equal(guard.isWithin(abs, abs), true);
  assert.equal(guard.isWithin(abs, abs + 'x'), false, 'prefix without separator is not containment');
});

// ---------------------------------------------------------------------------
// 8. Required-arg guards.
// ---------------------------------------------------------------------------
test('47-scope: missing projectRoot / targetPath throw TypeErrors', () => {
  assert.throws(() => guard.isInScope({ targetPath: 'x' }), /projectRoot is required/);
  assert.throws(() => guard.isInScope({ projectRoot: ROOT }), /targetPath is required/);
  assert.throws(() => guard.assertInScope({ projectRoot: ROOT }), /targetPath is required/);
  assert.throws(() => guard.enumerateScope({}), /projectRoot is required/);
});
