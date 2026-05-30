'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { REPO_ROOT } = require('./helpers.ts');
const REG_PATH = path.join(REPO_ROOT, 'reference', 'registry.json');
const SCHEMA_PATH = path.join(REPO_ROOT, 'reference', 'registry.schema.json');
const LIB = path.join(REPO_ROOT, 'scripts', 'lib', 'reference-registry.cjs');
const { list, find, validateRegistry } = require(LIB);

test('registry: schema file exists and is valid JSON Schema draft-07', () => {
  assert.ok(fs.existsSync(SCHEMA_PATH), 'registry.schema.json must exist');
  const s = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  assert.equal(s.$schema, 'http://json-schema.org/draft-07/schema#');
  assert.ok(s.properties.entries.items.properties.type.enum.includes('heuristic'));
  assert.ok(s.properties.entries.items.properties.type.enum.includes('preamble'));
  assert.ok(s.properties.entries.items.properties.type.enum.includes('meta-rules'));
});

test('registry: registry.json validates round-trip against current reference/ contents', () => {
  const v = validateRegistry({ cwd: REPO_ROOT });
  assert.ok(v.ok, `registry round-trip failed: ${JSON.stringify(v)}`);
});

test('registry: registry.json matches its schema', () => {
  // Lightweight schema check — we don't pull in a full ajv runtime for a single test.
  const reg = JSON.parse(fs.readFileSync(REG_PATH, 'utf8'));
  const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  assert.equal(reg.version, 1);
  assert.ok(Array.isArray(reg.entries) && reg.entries.length >= 15);
  const validTypes = new Set(schema.properties.entries.items.properties.type.enum);
  for (const e of reg.entries) {
    assert.ok(e.name && typeof e.name === 'string');
    assert.ok(e.path && typeof e.path === 'string');
    assert.ok(validTypes.has(e.type), `type out of enum: ${e.type} (entry ${e.name})`);
  }
});

test('registry: list({type}) returns filtered entries', () => {
  const heuristics = list({ type: 'heuristic' });
  assert.ok(heuristics.length >= 5, `expected ≥5 heuristic entries, got ${heuristics.length}`);
  for (const e of heuristics) assert.equal(e.type, 'heuristic');

  const preambles = list({ type: 'preamble' });
  assert.ok(preambles.length >= 3, 'shared-preamble + cycle-handoff-preamble + retrieval-contract');

  const defaults = list({ type: 'defaults' });
  assert.ok(defaults.length >= 3, 'protected-paths + figma-sandbox + mcp-budget');
});

test('registry: find(name) returns the entry', () => {
  const h = find('heuristics');
  assert.ok(h, 'find("heuristics") must not be null');
  assert.equal(h.path, 'reference/heuristics.md');

  const mr = find('meta-rules');
  assert.ok(mr);
  assert.equal(mr.tier, 'L0');
});

test('registry: missingInRegistry detects a new file', () => {
  const stub = path.join(REPO_ROOT, 'reference', '_tmp-test-orphan.md');
  fs.writeFileSync(stub, '# tmp\n', 'utf8');
  try {
    const v = validateRegistry({ cwd: REPO_ROOT });
    assert.ok(v.missingInRegistry.includes('reference/_tmp-test-orphan.md'));
  } finally {
    fs.unlinkSync(stub);
  }
});

test('registry: danglingInRegistry detects a stale entry', () => {
  // Mutate a registry copy in a temp dir and re-validate against it
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-reg-'));
  try {
    fs.mkdirSync(path.join(dir, 'reference'), { recursive: true });
    const reg = JSON.parse(fs.readFileSync(REG_PATH, 'utf8'));
    reg.entries.push({ name: 'ghost', path: 'reference/does-not-exist.md', type: 'heuristic' });
    fs.writeFileSync(path.join(dir, 'reference', 'registry.json'), JSON.stringify(reg), 'utf8');
    // seed one real file into temp reference so validate doesn't blow up with tons of missing
    for (const e of reg.entries) {
      if (e.path.endsWith('.md') || e.path.endsWith('.json')) {
        const target = path.join(dir, e.path);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        if (e.path !== 'reference/does-not-exist.md') fs.writeFileSync(target, 'stub\n', 'utf8');
      }
    }
    const v = validateRegistry({ cwd: dir });
    const names = v.danglingInRegistry.map(d => d.name);
    assert.ok(names.includes('ghost'), `expected ghost entry dangling, got ${JSON.stringify(v.danglingInRegistry)}`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('registry: loadRegistry returns the parsed document', () => {
  const { loadRegistry } = require(LIB);
  const reg = loadRegistry({ cwd: REPO_ROOT });
  assert.equal(reg.version, 1);
  assert.ok(reg.entries.find(e => e.name === 'shared-preamble'));
});
