'use strict';

// Phase 31 — Figma Off-Context Extractor: OFFLINE end-to-end pipeline test.
//
// Drives the two-stage pipeline (pull → digest) entirely against the committed
// offline fixtures (test/fixtures/figma/*.json) with a STUBBED fetch — NO live
// Figma, NO network. Proves:
//   - pull.cjs writes a raw/ cache (Variables 403 → Path A skipped gracefully)
//   - digest.cjs produces a non-empty DESIGN.md with a `## Tokens` section
//     populated via Path B (the spike's 0-tokens bug is fixed — D-04 Path B)
//   - components.json reflects VARIANT ROLLUP (1 set + 1 singleton, NOT the
//     inflated naive-walk count — D-02)
//   - a SECOND digest run against the same raw cache is BYTE-IDENTICAL (D-01,
//     the two-stage separation means re-digest without re-pull is deterministic)
//   - Path C: a plugin-shaped payload (built via the plugin's buildPayload,
//     carrying the flat tokens[] the digest consumes) flows through to DESIGN.md
//
// Hermetic: every test uses a fresh os.tmpdir() workspace and the injected fetch
// stub; the FIGMA_TOKEN never leaves the header (D-10). Tagged `31-10:`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { pull } = require('../../scripts/lib/figma-extract/pull.cjs');
const { digest } = require('../../scripts/lib/figma-extract/digest.cjs');
const { buildStylesResolver } = require('../../scripts/lib/figma-extract/styles-resolver.cjs');

const REPO_ROOT = path.join(__dirname, '../..');
const FIXTURE_DIR = path.join(REPO_ROOT, 'test/fixtures/figma');
const FILE_KEY = 'SAMPLEKEY';
const FETCHED_AT = '2026-05-29T00:00:00Z';

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, `${name}.json`), 'utf8'));
}

// A response factory mirroring the slice of WHATWG fetch the puller/resolver use.
function jsonRes(body) {
  return {
    ok: true,
    status: 200,
    async json() {
      return body;
    },
    async text() {
      return JSON.stringify(body);
    },
  };
}
function errRes(status) {
  return {
    ok: false,
    status,
    async json() {
      return {};
    },
    async text() {
      return `error ${status}`;
    },
  };
}

// Routes the 5 pull endpoints + the styles-resolver /nodes lookup to fixtures.
// Variables → 403 so Path A is skipped and Path B (styles) is exercised — the
// exact spike condition that produced 0 tokens before 31-03's two-step fix.
function makeFetchStub() {
  const files = loadFixture('files-response');
  const styles = loadFixture('styles-response');
  const nodes = loadFixture('nodes-response');
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.includes('/variables/local')) return errRes(403);
    if (url.includes('/nodes?ids=')) return jsonRes(nodes);
    if (url.includes('/styles')) return jsonRes(styles);
    if (url.includes('/components')) return jsonRes({ meta: { components: {} } });
    if (url.includes('/component_sets')) return jsonRes({ meta: { component_sets: {} } });
    // /files/<key> and /files/<key>?depth=1 (version probe) → the file body.
    if (/\/files\/[^/?]+(\?depth=1)?$/.test(url)) return jsonRes(files);
    return errRes(404);
  };
  return { fetchImpl, calls };
}

function freshWorkspace() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fx-e2e-'));
  return {
    tmp,
    rawDir: path.join(tmp, 'raw'),
    outDir: path.join(tmp, 'digest'),
    cleanup() {
      fs.rmSync(tmp, { recursive: true, force: true });
    },
  };
}

// Run the full offline pipeline once and return artifact contents + paths.
async function runPipeline(ws) {
  const { fetchImpl } = makeFetchStub();
  const pullResult = await pull({
    input: FILE_KEY,
    outDir: ws.rawDir,
    token: 'figd_OFFLINE_TEST_ONLY',
    fetchImpl,
  });
  const stylesResolver = buildStylesResolver({
    fileKey: FILE_KEY,
    token: 'figd_OFFLINE_TEST_ONLY',
    fetchImpl,
  });
  const digestResult = await digest({
    rawDir: ws.rawDir,
    outDir: ws.outDir,
    stylesResolver,
    fetchedAtOverride: FETCHED_AT,
  });
  return { pullResult, digestResult };
}

test('31-10: pull writes a raw cache and skips a 403 Variables endpoint (Path A graceful skip)', async () => {
  const ws = freshWorkspace();
  try {
    const { pullResult } = await runPipeline(ws);
    assert.equal(pullResult.cached, false, 'first pull should not be a cache hit');
    // file/styles/components/component_sets persisted; variables.json skipped (403).
    assert.ok(fs.existsSync(path.join(ws.rawDir, 'file.json')), 'file.json written');
    assert.ok(fs.existsSync(path.join(ws.rawDir, 'styles.json')), 'styles.json written');
    assert.ok(fs.existsSync(path.join(ws.rawDir, '_meta.json')), '_meta.json written');
    assert.ok(
      !fs.existsSync(path.join(ws.rawDir, 'variables.json')),
      'variables.json should be ABSENT (Path A 403 skipped — Free tier)'
    );
    const variablesEndpoint = pullResult.endpoints.find((e) => e.name === 'variables');
    assert.ok(variablesEndpoint && variablesEndpoint.skipped, 'variables endpoint recorded as skipped');
  } finally {
    ws.cleanup();
  }
});

test('31-10: digest produces a non-empty DESIGN.md with a populated ## Tokens section (Path B fix)', async () => {
  const ws = freshWorkspace();
  try {
    const { digestResult } = await runPipeline(ws);
    assert.equal(digestResult.ok, true, 'digest must succeed');
    const designMd = fs.readFileSync(path.join(ws.outDir, 'DESIGN.md'), 'utf8');
    assert.ok(designMd.length > 0, 'DESIGN.md is non-empty');
    assert.match(designMd, /^# DESIGN\.md/m, 'has the DESIGN.md header');
    assert.match(designMd, /^## Tokens/m, 'has a ## Tokens section');
    // Path B fix: the section is POPULATED (the spike produced 0 tokens here).
    assert.ok(digestResult.counts.tokens >= 1, 'at least one token resolved via Path B');
    assert.match(designMd, /Sample\/Color\/Primary/, 'the FILL style token surfaces in DESIGN.md');
  } finally {
    ws.cleanup();
  }
});

test('31-10: tokens.json is non-empty and contains a FILL token (spike 0-tokens bug fixed)', async () => {
  const ws = freshWorkspace();
  try {
    await runPipeline(ws);
    const tokens = JSON.parse(fs.readFileSync(path.join(ws.outDir, 'tokens.json'), 'utf8'));
    assert.ok(Array.isArray(tokens) && tokens.length >= 1, 'tokens.json non-empty');
    const fill = tokens.find((t) => t.type === 'FILL');
    assert.ok(fill, 'a FILL token is present (Path B resolved the published fill style)');
    assert.ok(typeof fill.value === 'string' && fill.value.startsWith('#'), 'FILL value is a hex string');
  } finally {
    ws.cleanup();
  }
});

test('31-10: components.json reflects variant rollup — 1 set + 1 singleton, not inflated (D-02)', async () => {
  const ws = freshWorkspace();
  try {
    const { digestResult } = await runPipeline(ws);
    const components = JSON.parse(fs.readFileSync(path.join(ws.outDir, 'components.json'), 'utf8'));
    // The fixture has ONE COMPONENT_SET (with 2 variant children) + ONE singleton
    // COMPONENT. A naive walk would yield 4 (set + 2 variants + singleton); rollup
    // yields exactly 2.
    assert.equal(components.length, 2, 'exactly 2 component entries after rollup');
    assert.equal(digestResult.counts.components, 2, 'digest count matches rolled-up shape');
    const set = components.find((c) => c.type === 'COMPONENT_SET');
    assert.ok(set, 'a COMPONENT_SET entry exists');
    assert.deepEqual(set.variants, ['Size=sm', 'Size=md'], 'variant names rolled onto the parent set');
    const singletons = components.filter((c) => c.type === 'COMPONENT');
    assert.equal(singletons.length, 1, 'exactly 1 singleton component');
  } finally {
    ws.cleanup();
  }
});

test('31-10: a second digest run against the same raw cache is BYTE-IDENTICAL (D-01 two-stage re-run)', async () => {
  const ws = freshWorkspace();
  try {
    // First full pipeline (pull + digest).
    await runPipeline(ws);
    const firstDesign = fs.readFileSync(path.join(ws.outDir, 'DESIGN.md'));
    const firstTokens = fs.readFileSync(path.join(ws.outDir, 'tokens.json'));
    const firstComponents = fs.readFileSync(path.join(ws.outDir, 'components.json'));

    // Re-digest the SAME raw cache WITHOUT re-pulling. With a fixed
    // fetchedAtOverride the renderer is deterministic, so output must be
    // byte-identical (proves the digest stage is a pure function of raw/).
    const { fetchImpl } = makeFetchStub();
    const stylesResolver = buildStylesResolver({
      fileKey: FILE_KEY,
      token: 'figd_OFFLINE_TEST_ONLY',
      fetchImpl,
    });
    const reOutDir = path.join(ws.tmp, 'digest-2');
    const second = await digest({
      rawDir: ws.rawDir,
      outDir: reOutDir,
      stylesResolver,
      fetchedAtOverride: FETCHED_AT,
    });
    assert.equal(second.ok, true, 're-digest succeeds');

    assert.ok(firstDesign.equals(fs.readFileSync(path.join(reOutDir, 'DESIGN.md'))), 'DESIGN.md byte-identical on re-run');
    assert.ok(firstTokens.equals(fs.readFileSync(path.join(reOutDir, 'tokens.json'))), 'tokens.json byte-identical on re-run');
    assert.ok(firstComponents.equals(fs.readFileSync(path.join(reOutDir, 'components.json'))), 'components.json byte-identical on re-run');
  } finally {
    ws.cleanup();
  }
});

test('31-10: Path C — a plugin payload (buildPayload, with tokens[]) surfaces tokens through digest', async () => {
  const ws = freshWorkspace();
  try {
    // The plugin's buildPayload is the canonical Path C producer — it emits BOTH
    // the receiver-schema shape (collections[]/variables[]) AND the flat tokens[]
    // the digest's normalizePluginPayload consumes ("one object, both ends").
    // Loaded via experimental-strip-types since it's a .ts module.
    const { buildPayload } = require('../../figma-plugin/src/payload-schema.ts');
    const cols = [{ id: 'C1', name: 'Brand', modes: [{ modeId: 'm1', name: 'Light' }] }];
    const vars = [
      { id: 'V1', name: 'color/brand/primary', resolvedType: 'COLOR', collectionId: 'C1', valuesByMode: { m1: { r: 0.1, g: 0.4, b: 0.9, a: 1 } } },
      { id: 'V2', name: 'space/md', resolvedType: 'FLOAT', collectionId: 'C1', valuesByMode: { m1: 16 } },
    ];
    const payload = buildPayload(cols, vars, { fileKey: FILE_KEY });
    assert.equal(payload.source, 'hone-plugin', 'payload carries the Path C marker');
    assert.ok(Array.isArray(payload.tokens) && payload.tokens.length === 2, 'buildPayload emits the flat tokens[] for the digest');

    // Lay down a raw cache: file.json (for components) + variables.json = the
    // receiver-written Path C payload (carrying source:'hone-plugin').
    fs.mkdirSync(ws.rawDir, { recursive: true });
    fs.writeFileSync(path.join(ws.rawDir, 'file.json'), JSON.stringify(loadFixture('files-response')));
    fs.writeFileSync(path.join(ws.rawDir, 'variables.json'), JSON.stringify(payload));
    fs.writeFileSync(path.join(ws.rawDir, '_meta.json'), JSON.stringify({ file_key: FILE_KEY, fetched_at: FETCHED_AT }));

    const res = await digest({ rawDir: ws.rawDir, outDir: ws.outDir, fetchedAtOverride: FETCHED_AT });
    assert.equal(res.ok, true, 'Path C digest succeeds');
    assert.equal(res.counts.tokens, 2, 'both plugin variables surface as tokens via Path C');
    const designMd = fs.readFileSync(path.join(ws.outDir, 'DESIGN.md'), 'utf8');
    assert.match(designMd, /color\/brand\/primary/, 'a plugin-sourced color token appears in DESIGN.md');
  } finally {
    ws.cleanup();
  }
});

test('31-10: re-pull against an unchanged cache is a version-match cache hit (D-11)', async () => {
  const ws = freshWorkspace();
  try {
    await runPipeline(ws); // writes _meta.json with version from the fixture
    const { fetchImpl } = makeFetchStub();
    const second = await pull({
      input: FILE_KEY,
      outDir: ws.rawDir,
      token: 'figd_OFFLINE_TEST_ONLY',
      fetchImpl,
    });
    assert.equal(second.cached, true, 'unchanged file version → cache hit (no re-pull)');
  } finally {
    ws.cleanup();
  }
});
