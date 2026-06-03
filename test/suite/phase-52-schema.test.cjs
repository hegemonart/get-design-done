// test/suite/phase-52-schema.test.cjs — Phase 52 (Typed DesignContext Graph): schema + validator
//
// Proves reference/schemas/design-context.schema.json and
// scripts/validate-design-context.cjs:
//   - the Draft-07 schema Ajv-compiles (the orchestrator wires it into the
//     validate-schemas PAIRS table),
//   - a well-formed graph validates clean (no errors, no warnings),
//   - a dangling edge endpoint is a hard ERROR (exit 2),
//   - a duplicate node id is a hard ERROR (exit 2),
//   - a stub summary (empty or == name) is a soft WARN (exit 1, no error),
//   - an out-of-vocab tag is a soft WARN (exit 1, no error),
//   - exit-code mapping: 0 clean / 1 warnings only / 2 errors.
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

let Ajv;
try {
  Ajv = require('ajv');
} catch {
  throw new Error('ajv missing — scripts/validate-schemas.ts already imports it; run `npm install`.');
}
let addFormats = null;
try {
  addFormats = require('ajv-formats');
} catch {
  addFormats = null;
}

const validator = require('../../scripts/validate-design-context.cjs');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCHEMA_PATH = path.join(REPO_ROOT, 'reference', 'schemas', 'design-context.schema.json');
const SCHEMA = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));

/** A minimal, fully valid graph: two nodes + one edge, all enums/ids legal. */
function validGraph() {
  return {
    schema_version: '52.0',
    generated_at: '2026-06-03T00:00:00Z',
    nodes: [
      {
        id: 'token.color.brand',
        type: 'token',
        name: 'Brand color',
        summary: 'Primary brand color token used across interactive surfaces.',
        tags: ['color', 'brand'],
        complexity: 'simple',
        subtype: 'color',
      },
      {
        id: 'component.button',
        type: 'component',
        name: 'Button',
        summary: 'Interactive button that consumes the brand color token.',
        tags: ['interactive', 'control'],
        complexity: 'moderate',
      },
    ],
    edges: [
      {
        source: 'component.button',
        target: 'token.color.brand',
        type: 'uses-token',
        direction: 'forward',
        weight: 0.9,
      },
    ],
  };
}

test('the Draft-07 schema Ajv-compiles', () => {
  const ajv = new Ajv({ allErrors: true, strict: false });
  if (addFormats) addFormats(ajv);
  const compiled = ajv.compile(SCHEMA);
  assert.equal(typeof compiled, 'function');
  // and a valid graph passes the compiled schema
  assert.ok(compiled(validGraph()), JSON.stringify(compiled.errors));
});

test('a valid graph passes the validator clean', () => {
  const { errors, warnings } = validator.validateGraph(validGraph());
  assert.deepEqual(errors, [], `unexpected errors: ${errors.join('; ')}`);
  assert.deepEqual(warnings, [], `unexpected warnings: ${warnings.join('; ')}`);
});

test('a dangling edge endpoint is a hard error', () => {
  const g = validGraph();
  g.edges[0].target = 'token.color.ghost'; // not a node id
  const { errors } = validator.validateGraph(g);
  assert.ok(errors.some((e) => /dangling/.test(e) && /token\.color\.ghost/.test(e)), errors.join('; '));
});

test('a duplicate node id is a hard error', () => {
  const g = validGraph();
  g.nodes.push({
    id: 'component.button', // duplicate
    type: 'component',
    name: 'Button (dupe)',
    summary: 'A second node reusing an existing id.',
    complexity: 'simple',
  });
  const { errors } = validator.validateGraph(g);
  assert.ok(errors.some((e) => /duplicate node id/.test(e) && /component\.button/.test(e)), errors.join('; '));
});

test('an empty summary is a soft warning, not an error', () => {
  const g = validGraph();
  g.nodes[0].summary = '';
  const { errors, warnings } = validator.validateGraph(g);
  assert.deepEqual(errors, [], `should not error: ${errors.join('; ')}`);
  assert.ok(warnings.some((w) => /stub/.test(w)), warnings.join('; '));
});

test('a summary equal to name is a soft warning (stub)', () => {
  const g = validGraph();
  g.nodes[0].summary = g.nodes[0].name;
  const { errors, warnings } = validator.validateGraph(g);
  assert.deepEqual(errors, []);
  assert.ok(warnings.some((w) => /stub/.test(w)), warnings.join('; '));
});

test('an unknown tag is a soft warning, not an error', () => {
  const g = validGraph();
  g.nodes[0].tags = ['color', 'totally-made-up-tag'];
  const { errors, warnings } = validator.validateGraph(g);
  assert.deepEqual(errors, [], `should not error: ${errors.join('; ')}`);
  assert.ok(warnings.some((w) => /unknown tag/.test(w) && /totally-made-up-tag/.test(w)), warnings.join('; '));
});

test('a bad enum value is a hard error', () => {
  const g = validGraph();
  g.nodes[0].complexity = 'gigantic'; // not in {simple,moderate,complex}
  g.edges[0].direction = 'sideways'; // not in {forward,backward,bidirectional}
  const { errors } = validator.validateGraph(g);
  assert.ok(errors.some((e) => /complexity/.test(e)), errors.join('; '));
  assert.ok(errors.some((e) => /direction/.test(e)), errors.join('; '));
});

test('an out-of-range weight is a hard error', () => {
  const g = validGraph();
  g.edges[0].weight = 1.5;
  const { errors } = validator.validateGraph(g);
  assert.ok(errors.some((e) => /weight/.test(e)), errors.join('; '));
});

// ---- CLI exit-code mapping (0 clean / 1 warnings / 2 errors) ----

function writeTmpGraph(graph) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-p52-'));
  const file = path.join(dir, 'context-graph.json');
  fs.writeFileSync(file, JSON.stringify(graph), 'utf8');
  return { dir, file };
}

function runMain(file) {
  const chunks = [];
  const io = {
    stdout: { write: (s) => chunks.push(s) },
    stderr: { write: (s) => chunks.push(s) },
  };
  const code = validator.main([file, '--json'], io);
  return { code, out: chunks.join('') };
}

test('CLI exits 0 on a clean graph', () => {
  const { dir, file } = writeTmpGraph(validGraph());
  try {
    const { code } = runMain(file);
    assert.equal(code, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI exits 1 on warnings only', () => {
  const g = validGraph();
  g.nodes[0].summary = ''; // stub -> warning
  const { dir, file } = writeTmpGraph(g);
  try {
    const { code } = runMain(file);
    assert.equal(code, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI exits 2 on errors', () => {
  const g = validGraph();
  g.edges[0].target = 'nope'; // dangling -> error
  const { dir, file } = writeTmpGraph(g);
  try {
    const { code } = runMain(file);
    assert.equal(code, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI exits 2 on a missing or unparseable file', () => {
  const missing = validator.main([path.join(os.tmpdir(), 'gdd-p52-does-not-exist.json'), '--json'], {
    stdout: { write() {} },
    stderr: { write() {} },
  });
  assert.equal(missing, 2);
});
