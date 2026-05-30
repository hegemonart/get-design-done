/**
 * recipe-loader.cjs — recipes/ scaffold loader (Plan 31-5-03, RECIPE-01 / SC#14).
 *
 * The top-level recipes/ directory ships EMPTY of recipes; it is populated
 * downstream by Phase 32 (skill-trigger recipes), Phase 33.6 (per-provider),
 * Phase 26 (per-runtime/per-model), and Phase 23.5 (bandit-arm shape). This
 * module fixes the loading contract those phases build against so each does not
 * reinvent it. Modelled on Storybloq's src/autonomous/recipes/ loader.ts.
 *
 * Contract:
 *   loadRecipe(name, opts?) -> Recipe
 *     name : recipe stem; resolves <repoRoot>/recipes/<name>.json
 *     opts : { recipesDir, schemaPath, fs } — all injectable for tests
 *     returns : the validated, parsed Recipe object
 *     throws  : Error('recipe not found: <name>')              if the file is absent
 *               Error('recipe <name> failed schema validation: …') if invalid
 *
 * Cache (SC#14 "caches by SHA"):
 *   Keyed by name + ':' + sha256(fileBytes). Each call reads the file once to
 *   compute the content hash; on a HIT (unchanged bytes) it returns the cached
 *   object WITHOUT re-parsing / re-validating. On a MISS (changed bytes) it
 *   parses + validates + stores. Keying by content SHA — not just name — means
 *   an edited recipe is correctly re-validated.
 *
 * Empty-dir safety: this module requires cleanly when recipes/ is empty, and a
 * directory listing of an empty (just-.gitkeep) dir does not throw. loadRecipe
 * of a missing name throws the clear not-found error — distinct from "the empty
 * dir is broken" (it is a valid scaffold state).
 *
 * Uses the repo's existing `ajv` dependency (package.json "ajv": "^8.18.0") —
 * no new dependency. The schema is compiled once per schemaPath (singleton).
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Ajv = require('ajv');

// recipe-loader.cjs lives in scripts/lib/ → two levels up is the repo root.
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_RECIPES_DIR = path.join(REPO_ROOT, 'recipes');
const DEFAULT_SCHEMA_PATH = path.join(REPO_ROOT, 'reference', 'schemas', 'recipe.schema.json');

// Ajv 8 CJS: require('ajv') is (or wraps) the constructor.
const AjvCtor = Ajv.default || Ajv;

// SHA-keyed cache: `name + ':' + sha256(bytes)` → parsed Recipe object.
const cache = new Map();

// Compiled-validator singletons, keyed by resolved schemaPath. The schema is a
// small trusted local file, so allErrors:true (full error list → clear message)
// is safe here — unlike the untrusted-HTTP receiver which fails fast.
const validators = new Map();

// Test-observability counter: increments once per parse+validate (i.e. per
// cache MISS). A cache HIT does not bump it. Tests assert on the delta to prove
// SHA-keyed hit/miss semantics without depending on raw read counts (a hit must
// still read the file once to hash it).
let _validations = 0;

/**
 * Get (compiling once) the validator for a schema path.
 * @param {string} schemaPath
 * @param {typeof fs} fsImpl
 * @returns {import('ajv').ValidateFunction}
 */
function getValidator(schemaPath, fsImpl) {
  const resolved = path.resolve(schemaPath);
  let validate = validators.get(resolved);
  if (validate) return validate;

  const schema = JSON.parse(fsImpl.readFileSync(resolved, 'utf8'));
  const ajv = new AjvCtor({ allErrors: true, strict: false });
  validate = ajv.compile(schema);
  validators.set(resolved, validate);
  return validate;
}

/**
 * Load + validate a recipe by name.
 * @param {string} name - recipe stem; resolves <recipesDir>/<name>.json
 * @param {{ recipesDir?: string, schemaPath?: string, fs?: typeof fs }} [opts]
 * @returns {Record<string, unknown>} the validated, parsed Recipe object
 */
function loadRecipe(name, opts = {}) {
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error('recipe name must be a non-empty string');
  }

  const fsImpl = opts.fs || fs;
  const dir = opts.recipesDir || DEFAULT_RECIPES_DIR;
  const schemaPath = opts.schemaPath || DEFAULT_SCHEMA_PATH;
  const file = path.join(dir, name + '.json');

  if (!fsImpl.existsSync(file)) {
    throw new Error('recipe not found: ' + name);
  }

  // Read once per call to compute the content hash (the cache key).
  const bytes = fsImpl.readFileSync(file);
  const sha = crypto.createHash('sha256').update(bytes).digest('hex');
  const key = name + ':' + sha;

  // Cache HIT: unchanged bytes → return cached object, skip parse + validate.
  if (cache.has(key)) {
    return cache.get(key);
  }

  // Cache MISS: parse + validate + store.
  let parsed;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch (err) {
    throw new Error('recipe ' + name + ' is not valid JSON: ' + err.message);
  }

  const validate = getValidator(schemaPath, fsImpl);
  _validations += 1;
  const ok = validate(parsed) === true;
  if (!ok) {
    throw new Error(
      'recipe ' + name + ' failed schema validation: ' + JSON.stringify(validate.errors || []),
    );
  }

  cache.set(key, parsed);
  return parsed;
}

/** Test hook: clear the SHA cache (does not drop compiled validators). */
function _clearCache() {
  cache.clear();
}

/** Test hook: introspect parse+validate counts (one per cache MISS). */
function _stats() {
  return { validations: _validations, cacheSize: cache.size };
}

module.exports = { loadRecipe, _clearCache, _stats };
