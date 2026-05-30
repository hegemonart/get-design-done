'use strict';
// test/suite/sdk-barrel-exports.test.cjs — Plan 31-5-04 Task 3 (SDK-01/02).
//
// 31-5-04: assert that every public helper name documented in the
// sdk/README.md import-path table for the barrel-covered modules
// (cli / state / event-stream / errors) resolves through the sdk/index.ts
// barrel. The barrel is the Storybloq-style single entry point (SC#15);
// the README table is the contract (D-04, D-06). This test couples the two
// so a documented name that stops resolving through the barrel fails CI.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { REPO_ROOT } = require('./helpers.ts');

// The barrel is a .ts ESM module; the test runner runs under
// --experimental-strip-types so require() of a .ts entry resolves.
const barrel = require(path.join(REPO_ROOT, 'sdk', 'index.ts'));

// Modules whose public surface the barrel re-exports (export * from …).
// Primitives + mcp are NOT in the barrel by design (explicit-path only,
// D-04) so we exclude their README rows from the barrel assertion.
const BARREL_MODULES = new Set(['cli', 'state', 'event-stream', 'errors']);

/**
 * Parse the README import-path table. Returns rows as
 * { module, importPath, helpers: string[] } where `helpers` is every
 * backtick-quoted identifier in the Helpers column (type names included —
 * types erase at runtime so we filter those out against the barrel).
 */
function parseReadmeTable() {
  const md = fs.readFileSync(
    path.join(REPO_ROOT, 'sdk', 'README.md'),
    'utf8',
  );
  const rows = [];
  for (const line of md.split('\n')) {
    const cells = line.split('|').map((c) => c.trim());
    // A data row is `| Module | import | Helpers | Stability |` → 6 cells
    // (leading + trailing empties from the outer pipes).
    if (cells.length !== 6) continue;
    const moduleName = cells[1];
    const importCell = cells[2];
    const helpersCell = cells[3];
    // Skip the header + separator rows.
    if (moduleName === 'Module' || /^-+$/.test(moduleName)) continue;
    if (!importCell.includes('/sdk/')) continue;
    const helpers = [...helpersCell.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
    rows.push({ module: moduleName, importPath: importCell, helpers });
  }
  return rows;
}

test('31-5-04: README table parses to >= 9 module rows', () => {
  const rows = parseReadmeTable();
  assert.ok(
    rows.length >= 9,
    `expected >= 9 documented module rows, parsed ${rows.length}`,
  );
});

test('31-5-04: every barrel-module helper documented in README resolves through sdk/index.ts', () => {
  const rows = parseReadmeTable();
  const barrelRows = rows.filter((r) => BARREL_MODULES.has(r.module));
  assert.ok(
    barrelRows.length === BARREL_MODULES.size,
    `expected a README row for each barrel module (${[...BARREL_MODULES].join(', ')}), got ${barrelRows.map((r) => r.module).join(', ')}`,
  );

  const missing = [];
  for (const row of barrelRows) {
    for (const name of row.helpers) {
      // Type-only names (e.g. ParsedState, Stage, DispatcherDeps) erase at
      // runtime and never appear on the module namespace object. We only
      // require VALUE exports to resolve; a documented name that is neither
      // a value nor a known type alias is a contract drift.
      if (Object.prototype.hasOwnProperty.call(barrel, name)) continue;
      if (TYPE_ONLY_NAMES.has(name)) continue;
      missing.push(`${row.module}: ${name}`);
    }
  }
  assert.deepEqual(
    missing,
    [],
    `README documents helpers that do not resolve through the sdk/index.ts barrel:\n  - ${missing.join('\n  - ')}`,
  );
});

// Documented names that are TS types (erased at runtime). Listed explicitly
// so a NEW value export that we forgot to wire still fails the test above.
const TYPE_ONLY_NAMES = new Set(['ParsedState', 'Stage', 'DispatcherDeps']);

test('31-5-04: barrel re-exports a representative value from each of state / event-stream / errors / cli', () => {
  // One canonical value per barrel module — proves all four `export *`
  // statements are live (not just one of them).
  assert.equal(typeof barrel.read, 'function', 'state.read missing from barrel');
  assert.equal(typeof barrel.appendEvent, 'function', 'event-stream.appendEvent missing from barrel');
  assert.equal(typeof barrel.GDDError, 'function', 'errors.GDDError missing from barrel');
  assert.equal(typeof barrel.dispatch, 'function', 'cli.dispatch missing from barrel');
  assert.equal(typeof barrel.USAGE, 'string', 'cli.USAGE missing from barrel');
});
