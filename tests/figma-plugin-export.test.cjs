'use strict';
/**
 * tests/figma-plugin-export.test.cjs — Plan 31-05 (Wave B.2)
 *
 * Offline coverage for the Figma plugin's Path C export logic
 * (figma-plugin/src/export-variables.ts + payload-schema.ts). No live Figma, no
 * network, no @figma/plugin-typings at runtime.
 *
 * STRATEGY (Task 3 option (a) — compile-then-import the REAL shipped code):
 *   A before() hook compiles the two TS src files to CommonJS into
 *   figma-plugin/.test-build/ via the locally-installed tsc (the same compiler
 *   the build uses), pointing --typeRoots at @figma so `figma`/`fetch` globals
 *   resolve. The emitted JS is then require()'d. globalThis.figma + globalThis
 *   .fetch are injected BEFORE requiring export-variables.js so its module-level
 *   global references bind to the mock. This exercises the actual production
 *   logic rather than a re-implementation.
 *
 * The dual-consumer contract is asserted directly:
 *   - the emitted payload validates against scripts/lib/figma-extract/payload-schema.json
 *     (Ajv) — the RECEIVER half of the contract;
 *   - the emitted payload's flat tokens[] flow through the REAL digest.cjs
 *     (normalizePluginPayload) into tokens.json — the DIGEST half. This is the
 *     make-or-break interop requirement (digest reads tokens[], not variables[]).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { REPO_ROOT } = require('./helpers.ts');

const Ajv = require('ajv');
const AjvCtor = Ajv.default || Ajv;

const PLUGIN_DIR = path.join(REPO_ROOT, 'figma-plugin');
const SRC_DIR = path.join(PLUGIN_DIR, 'src');
const BUILD_DIR = path.join(PLUGIN_DIR, '.test-build');
const SCHEMA_PATH = path.join(
  REPO_ROOT,
  'scripts',
  'lib',
  'figma-extract',
  'payload-schema.json'
);
const DIGEST_PATH = path.join(
  REPO_ROOT,
  'scripts',
  'lib',
  'figma-extract',
  'digest.cjs'
);

// Modules under test, populated by the before() compile hook.
let payloadSchemaMod;
let exportVarsMod;
let payloadSchemaJson;
let validateSchema;

// ── Figma mock ────────────────────────────────────────────────────────────────
// One collection, two modes (light/dark), four variables:
//   - red:    COLOR, both modes, plain RGBA
//   - bg:     COLOR, alias -> red in both modes (alias resolution case)
//   - space:  FLOAT, both modes (primitive passthrough)
//   - label:  STRING, single mode value present only for light — but the var is
//             still LOCAL and unpublished (D-13: must be emitted regardless)
function makeFigmaMock(overrides = {}) {
  const collections = [
    {
      id: 'VariableCollectionId:1:1',
      name: 'Core',
      modes: [
        { modeId: '1:0', name: 'light' },
        { modeId: '1:1', name: 'dark' },
      ],
    },
  ];
  const variables = [
    {
      id: 'VariableID:1',
      name: 'red',
      resolvedType: 'COLOR',
      variableCollectionId: 'VariableCollectionId:1:1',
      // not published — D-13 says it must still be emitted.
      hiddenFromPublishing: true,
      remote: false,
      valuesByMode: {
        '1:0': { r: 1, g: 0, b: 0, a: 1 },
        '1:1': { r: 0.1, g: 0, b: 0, a: 1 },
      },
    },
    {
      id: 'VariableID:2',
      name: 'bg',
      resolvedType: 'COLOR',
      variableCollectionId: 'VariableCollectionId:1:1',
      valuesByMode: {
        '1:0': { type: 'VARIABLE_ALIAS', id: 'VariableID:1' },
        '1:1': { type: 'VARIABLE_ALIAS', id: 'VariableID:1' },
      },
    },
    {
      id: 'VariableID:3',
      name: 'space-sm',
      resolvedType: 'FLOAT',
      variableCollectionId: 'VariableCollectionId:1:1',
      valuesByMode: { '1:0': 8, '1:1': 8 },
    },
    {
      id: 'VariableID:4',
      name: 'enabled',
      resolvedType: 'BOOLEAN',
      variableCollectionId: 'VariableCollectionId:1:1',
      valuesByMode: { '1:0': true, '1:1': false },
    },
  ];
  const byId = new Map(variables.map((v) => [v.id, v]));

  const notes = [];
  const figma = {
    // 'fileKey' in overrides distinguishes "not passed" (default) from an
    // explicit undefined (the no-file-key case).
    fileKey: 'fileKey' in overrides ? overrides.fileKey : 'FILEKEY123',
    notify: (m) => notes.push(m),
    variables: {
      getLocalVariableCollectionsAsync: async () => collections,
      getLocalVariablesAsync: async () => variables,
      getVariableByIdAsync: async (id) => byId.get(id) || null,
    },
  };
  return { figma, notes, collections, variables };
}

/** Install a capturing fetch on globalThis; returns the capture box. */
function installFetch(impl) {
  const box = { calls: [] };
  globalThis.fetch = async (url, init) => {
    box.calls.push({ url, init });
    return impl
      ? impl(url, init)
      : { ok: true, status: 200, json: async () => ({ ok: true }) };
  };
  return box;
}

// ── compile-then-import (the real shipped code) ───────────────────────────────
test.before(() => {
  fs.rmSync(BUILD_DIR, { recursive: true, force: true });
  // Run tsc by invoking its JS entrypoint with the CURRENT node (process
  // .execPath) rather than the .bin shim. On Windows the shim is a .cmd batch
  // file that execFileSync refuses to spawn (EINVAL); node + bin/tsc is robust
  // cross-platform.
  const tscJs = path.join(PLUGIN_DIR, 'node_modules', 'typescript', 'bin', 'tsc');
  // Compile both files to CommonJS so node can require() them. --typeRoots +
  // --types make the `figma`/`fetch` ambient globals resolve (clean emit).
  execFileSync(
    process.execPath,
    [
      tscJs,
      path.join(SRC_DIR, 'payload-schema.ts'),
      path.join(SRC_DIR, 'export-variables.ts'),
      '--module',
      'commonjs',
      '--target',
      'ES2017',
      '--moduleResolution',
      'node',
      '--esModuleInterop',
      '--skipLibCheck',
      '--typeRoots',
      path.join(PLUGIN_DIR, 'node_modules', '@figma'),
      '--types',
      'plugin-typings',
      '--outDir',
      BUILD_DIR,
    ],
    { cwd: PLUGIN_DIR, stdio: 'pipe' }
  );

  payloadSchemaMod = require(path.join(BUILD_DIR, 'payload-schema.js'));
  // export-variables.js references the `figma`/`fetch` globals only INSIDE its
  // functions, so requiring it before injecting globals is safe; we inject per
  // test for the exportVariables() cases.
  exportVarsMod = require(path.join(BUILD_DIR, 'export-variables.js'));

  payloadSchemaJson = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  const ajv = new AjvCtor({ strict: false, allErrors: true });
  validateSchema = ajv.compile(payloadSchemaJson);
});

test.after(() => {
  fs.rmSync(BUILD_DIR, { recursive: true, force: true });
  delete globalThis.fetch;
  delete globalThis.figma;
});

/** Build a payload from the mock via the plugin's async gatherPayload(). */
async function gatherFromMock(overrides) {
  const m = makeFigmaMock(overrides);
  globalThis.figma = m.figma;
  const payload = await exportVarsMod.gatherPayload();
  return { payload, mock: m };
}

// ── tests ─────────────────────────────────────────────────────────────────────

test("31-05: buildPayload emits source:'gdd-plugin'", async () => {
  const { payload } = await gatherFromMock();
  assert.equal(payload.source, 'gdd-plugin');
});

test('31-05: ALL local variables emitted regardless of publication (D-13)', async () => {
  const { payload, mock } = await gatherFromMock();
  // the mock's `red` is hiddenFromPublishing:true — it MUST still appear.
  const names = payload.variables.map((v) => v.name);
  assert.ok(names.includes('red'), 'unpublished variable must be emitted (D-13)');
  assert.equal(
    payload.variables.length,
    mock.variables.length,
    'no published-only filter — every local variable is emitted'
  );
});

test('31-05: collections carry modes:[{modeId,name}]', async () => {
  const { payload } = await gatherFromMock();
  assert.equal(payload.collections.length, 1);
  const modes = payload.collections[0].modes;
  assert.deepEqual(modes, [
    { modeId: '1:0', name: 'light' },
    { modeId: '1:1', name: 'dark' },
  ]);
});

test('31-05: a multi-mode variable round-trips valuesByMode keyed by both modeIds', async () => {
  const { payload } = await gatherFromMock();
  const red = payload.variables.find((v) => v.name === 'red');
  assert.deepEqual(Object.keys(red.valuesByMode).sort(), ['1:0', '1:1']);
  assert.deepEqual(red.valuesByMode['1:0'], { r: 1, g: 0, b: 0, a: 1 });
  assert.deepEqual(red.valuesByMode['1:1'], { r: 0.1, g: 0, b: 0, a: 1 });
});

test("31-05: a VARIABLE_ALIAS value retains {type:'VARIABLE_ALIAS', id} and resolved name", async () => {
  const { payload } = await gatherFromMock();
  const bg = payload.variables.find((v) => v.name === 'bg');
  const aliasVal = bg.valuesByMode['1:0'];
  assert.equal(aliasVal.type, 'VARIABLE_ALIAS');
  assert.equal(aliasVal.id, 'VariableID:1');
  assert.equal(aliasVal.name, 'red', 'alias target name resolved via getVariableByIdAsync');
});

test('31-05: the flat tokens[] renders aliases as {targetName} for the digest', async () => {
  const { payload } = await gatherFromMock();
  const bgToken = payload.tokens.find((t) => t.name === 'bg');
  assert.deepEqual(bgToken.modes, { light: '{red}', dark: '{red}' });
});

test('31-05: the flat tokens[] renders colours as hex keyed by mode NAME', async () => {
  const { payload } = await gatherFromMock();
  const redToken = payload.tokens.find((t) => t.name === 'red');
  assert.equal(redToken.modes.light, '#ff0000');
  assert.equal(redToken.collection, 'Core', 'token collection is the NAME, not id');
});

test('31-05: variable count in payload equals the mock getLocalVariables() length', async () => {
  const { payload, mock } = await gatherFromMock();
  assert.equal(payload.variables.length, mock.variables.length);
  assert.equal(payload.tokens.length, mock.variables.length, 'one token per variable');
});

test('31-05: emitted payload VALIDATES against scripts/lib/figma-extract/payload-schema.json', async () => {
  const { payload } = await gatherFromMock();
  const ok = validateSchema(payload);
  assert.ok(
    ok,
    'payload must satisfy the receiver schema: ' +
      JSON.stringify(validateSchema.errors)
  );
});

test('31-05: payload satisfies BOTH consumers — receiver schema AND digest tokens[] -> tokens.json', async () => {
  const { payload } = await gatherFromMock();
  // (a) receiver half
  assert.ok(validateSchema(payload), 'receiver schema');
  // (b) digest half: feed the payload as a Path C variables.json through the REAL digest.
  const { digest } = require(DIGEST_PATH);
  const raw = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-raw-'));
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-out-'));
  try {
    fs.writeFileSync(path.join(raw, 'variables.json'), JSON.stringify(payload));
    fs.writeFileSync(
      path.join(raw, 'file.json'),
      JSON.stringify({ name: 'Test DS', document: { type: 'DOCUMENT', children: [] } })
    );
    fs.writeFileSync(
      path.join(raw, '_meta.json'),
      JSON.stringify({ file_key: 'FK', fetched_at: '2026-01-01T00:00:00Z' })
    );
    const res = await digest({
      rawDir: raw,
      outDir: out,
      fetchedAtOverride: '2026-01-01T00:00:00Z',
    });
    assert.ok(res.ok, 'digest ran');
    const tokens = JSON.parse(fs.readFileSync(path.join(out, 'tokens.json'), 'utf8'));
    const names = tokens.map((t) => t.name);
    // The plugin's variables surface in the digest output via tokens[] (NOT variables[]).
    assert.ok(names.includes('red'), 'plugin token surfaced in digest');
    assert.ok(names.includes('bg'), 'alias token surfaced in digest');
    assert.ok(names.includes('space-sm'), 'float token surfaced in digest');
    const bg = tokens.find((t) => t.name === 'bg');
    assert.deepEqual(bg.modes, { light: '{red}', dark: '{red}' }, 'alias chain rendered in digest');
  } finally {
    fs.rmSync(raw, { recursive: true, force: true });
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('31-05: exportVariables POSTs to exactly http://127.0.0.1:5179/variables (method POST)', async () => {
  const m = makeFigmaMock();
  globalThis.figma = m.figma;
  const fetchBox = installFetch();
  await exportVarsMod.exportVariables();
  assert.equal(fetchBox.calls.length, 1, 'exactly one POST');
  assert.equal(fetchBox.calls[0].url, 'http://127.0.0.1:5179/variables');
  assert.equal(fetchBox.calls[0].init.method, 'POST');
  assert.equal(fetchBox.calls[0].init.headers['Content-Type'], 'application/json');
  // RECEIVER_URL constant matches the receiver bind + manifest allowedDomains.
  assert.equal(exportVarsMod.RECEIVER_URL, 'http://127.0.0.1:5179/variables');
});

test('31-05: exportVariables POST body is the built payload (source + arrays)', async () => {
  const m = makeFigmaMock();
  globalThis.figma = m.figma;
  const fetchBox = installFetch();
  await exportVarsMod.exportVariables();
  const body = JSON.parse(fetchBox.calls[0].init.body);
  assert.equal(body.source, 'gdd-plugin');
  assert.equal(body.variables.length, m.variables.length);
  assert.ok(Array.isArray(body.tokens), 'body carries the digest tokens[]');
  assert.ok(validateSchema(body), 'POSTed body validates against the receiver schema');
});

test('31-05: exportVariables on receiver-down (fetch throws) -> figma.notify error, no crash', async () => {
  const m = makeFigmaMock();
  globalThis.figma = m.figma;
  installFetch(() => {
    throw new Error('ECONNREFUSED');
  });
  await assert.doesNotReject(exportVarsMod.exportVariables());
  assert.ok(
    m.notes.some((n) => /no receiver/i.test(n)),
    'notifies the user that no receiver is listening'
  );
});

test('31-05: exportVariables on receiver 400 -> figma.notify rejection, no crash', async () => {
  const m = makeFigmaMock();
  globalThis.figma = m.figma;
  installFetch(() => ({
    ok: false,
    status: 400,
    json: async () => ({ error: 'schema' }),
  }));
  await assert.doesNotReject(exportVarsMod.exportVariables());
  assert.ok(
    m.notes.some((n) => /rejected|400/.test(n)),
    'notifies the user that the receiver rejected the payload'
  );
});

test('31-05: payload fileKey populated from figma.fileKey when present', async () => {
  const { payload } = await gatherFromMock({ fileKey: 'ABC-file-key' });
  assert.equal(payload.fileKey, 'ABC-file-key');
});

test('31-05: payload omits fileKey when figma.fileKey is undefined', async () => {
  const { payload } = await gatherFromMock({ fileKey: undefined });
  assert.ok(!('fileKey' in payload), 'undefined fileKey is not serialized');
});

test('31-05: isGddSyncPayload guard accepts a real payload, rejects junk', async () => {
  const { payload } = await gatherFromMock();
  assert.equal(payloadSchemaMod.isGddSyncPayload(payload), true);
  assert.equal(payloadSchemaMod.isGddSyncPayload({ source: 'nope' }), false);
  assert.equal(payloadSchemaMod.isGddSyncPayload(null), false);
});
