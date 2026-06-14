// test/suite/recipe-loader.test.cjs — contract tests for the recipes/ scaffold
// loader (Plan 31-5-03, RECIPE-01 / SC#14).
//
// The recipes/ directory ships EMPTY of recipes; it is populated downstream by
// Phase 32 / 33.6 / 26 / 23.5. This suite pins the loader contract those phases
// build against:
//   - loadRecipe(name, opts) resolves <recipesDir>/<name>.json, validates it
//     against reference/schemas/recipe.schema.json (ajv), returns the parsed obj
//   - SHA-keyed cache: unchanged bytes -> cache HIT (parse+validate run once,
//     same object reference returned); changed bytes -> cache MISS (re-validate)
//   - malformed recipe -> throws with validation detail
//   - missing name -> throws a clear not-found error
//   - an empty recipes/ dir is a valid scaffold state (listable, no throw)
//
// All tests tagged `31-5-03:`. Temp dirs via mkdtempSync (mirrors
// test/suite/helpers.ts convention).

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCHEMA_PATH = path.join(REPO_ROOT, 'reference', 'schemas', 'recipe.schema.json');
const LOADER_PATH = path.join(REPO_ROOT, 'scripts', 'lib', 'recipe-loader.cjs');

// Lazy require so the file can be authored/committed (RED) before the loader
// exists — the require throws inside each test, surfacing as a clean failure.
function loadLoader() {
  delete require.cache[require.resolve(LOADER_PATH)];
  return require(LOADER_PATH);
}

/** Make a fresh temp recipes dir; registered for cleanup by the caller's after(). */
function mkRecipesDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hone-recipes-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** Write recipes/<name>.json with the given JS object (or raw string). */
function writeRecipe(dir, name, body) {
  const content = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  fs.writeFileSync(path.join(dir, name + '.json'), content, 'utf8');
}

/** A counting wrapper around node:fs that records readFileSync calls. */
function spyFs() {
  const reads = [];
  const wrapped = Object.create(fs);
  wrapped.readFileSync = function (...args) {
    reads.push(String(args[0]));
    return fs.readFileSync(...args);
  };
  return { fs: wrapped, reads };
}

const validRecipe = {
  name: 'demo',
  version: '1',
  steps: [{ kind: 'noop' }, { id: 'step-2' }],
};

test('31-5-03: loadRecipe returns the parsed Recipe for a valid file', (t) => {
  const { loadRecipe, _clearCache } = loadLoader();
  if (_clearCache) _clearCache();
  const dir = mkRecipesDir(t);
  writeRecipe(dir, 'demo', validRecipe);

  const got = loadRecipe('demo', { recipesDir: dir, schemaPath: SCHEMA_PATH });
  assert.deepEqual(got, validRecipe);
});

test('31-5-03: malformed recipe (missing required `steps`) is rejected with a validation error', (t) => {
  const { loadRecipe, _clearCache } = loadLoader();
  if (_clearCache) _clearCache();
  const dir = mkRecipesDir(t);
  writeRecipe(dir, 'broken', { name: 'broken', version: '1' });

  assert.throws(
    () => loadRecipe('broken', { recipesDir: dir, schemaPath: SCHEMA_PATH }),
    (err) => /validation/i.test(err.message) && /steps/.test(err.message),
  );
});

test('31-5-03: malformed recipe (wrong type for `steps`) is rejected', (t) => {
  const { loadRecipe, _clearCache } = loadLoader();
  if (_clearCache) _clearCache();
  const dir = mkRecipesDir(t);
  writeRecipe(dir, 'wrongtype', { name: 'wrongtype', version: '1', steps: 'nope' });

  assert.throws(
    () => loadRecipe('wrongtype', { recipesDir: dir, schemaPath: SCHEMA_PATH }),
    (err) => /validation/i.test(err.message),
  );
});

test('31-5-03: repeated load of an UNCHANGED recipe is a SHA cache HIT — no re-parse/re-validate', (t) => {
  const { loadRecipe, _clearCache, _stats } = loadLoader();
  if (_clearCache) _clearCache();
  const dir = mkRecipesDir(t);
  writeRecipe(dir, 'cached', validRecipe);

  const before = _stats ? _stats().validations : 0;
  const a = loadRecipe('cached', { recipesDir: dir, schemaPath: SCHEMA_PATH });
  const b = loadRecipe('cached', { recipesDir: dir, schemaPath: SCHEMA_PATH });
  const after = _stats ? _stats().validations : 0;

  // Same object reference proves the second call short-circuited to the cache.
  assert.equal(a, b, 'cache HIT must return the same cached object reference');
  // Parse+validate ran exactly once across two identical loads (SHA-keyed hit).
  assert.equal(after - before, 1, 'unchanged bytes must validate exactly once');
});

test('31-5-03: editing the recipe between loads is a cache MISS — re-reads + re-validates', (t) => {
  const { loadRecipe, _clearCache, _stats } = loadLoader();
  if (_clearCache) _clearCache();
  const dir = mkRecipesDir(t);
  writeRecipe(dir, 'edited', validRecipe);

  const first = loadRecipe('edited', { recipesDir: dir, schemaPath: SCHEMA_PATH });
  assert.deepEqual(first, validRecipe);

  const before = _stats ? _stats().validations : 0;
  const next = { name: 'edited', version: '2', steps: [{ kind: 'changed' }] };
  writeRecipe(dir, 'edited', next);
  const second = loadRecipe('edited', { recipesDir: dir, schemaPath: SCHEMA_PATH });
  const after = _stats ? _stats().validations : 0;

  assert.deepEqual(second, next, 'changed bytes must reflect the NEW content');
  assert.equal(after - before, 1, 'changed bytes must trigger a re-validate (cache MISS)');
});

test('31-5-03: empty recipes/ directory is listable without error', (t) => {
  const { loadRecipe, _clearCache } = loadLoader();
  if (_clearCache) _clearCache();
  const dir = mkRecipesDir(t); // empty temp dir, no recipe files

  // Merely having zero recipe files is a valid scaffold state — listing it does
  // not throw.
  assert.doesNotThrow(() => fs.readdirSync(dir));
  // But loadRecipe of a name that is not present IS the not-found error.
  assert.throws(
    () => loadRecipe('absent', { recipesDir: dir, schemaPath: SCHEMA_PATH }),
    /recipe not found: absent/,
  );
});

test('31-5-03: loadRecipe of a non-existent name throws a clear not-found error', (t) => {
  const { loadRecipe, _clearCache } = loadLoader();
  if (_clearCache) _clearCache();
  const dir = mkRecipesDir(t);
  writeRecipe(dir, 'present', validRecipe);

  assert.throws(
    () => loadRecipe('missing', { recipesDir: dir, schemaPath: SCHEMA_PATH }),
    /recipe not found: missing/,
  );
});

test('31-5-03: cache uses the injectable fs (read-spy observes the file read)', (t) => {
  const { loadRecipe, _clearCache } = loadLoader();
  if (_clearCache) _clearCache();
  const dir = mkRecipesDir(t);
  writeRecipe(dir, 'spied', validRecipe);

  const spy = spyFs();
  loadRecipe('spied', { recipesDir: dir, schemaPath: SCHEMA_PATH, fs: spy.fs });
  assert.ok(
    spy.reads.some((p) => p.endsWith(path.join(dir, 'spied.json')) || p.endsWith('spied.json')),
    'loader must read the recipe file through the injected fs',
  );
});
