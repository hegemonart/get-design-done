'use strict';
/**
 * Plan 31-02 — offline behavioral test suite for the productionized digest stage
 * (walk.cjs + render-md.cjs + digest.cjs).
 *
 * Every test is tagged `31-02:` and runs FULLY OFFLINE — each test scaffolds its
 * own raw/ cache under fs.mkdtempSync() with only the *.json files it needs, runs
 * digest, asserts, and cleans up. No live Figma calls, no network (D-01).
 *
 * Decision coverage:
 *   D-01 — two-stage / offline re-digest, graceful missing-cache guard
 *   D-02 — variant rollup default-on (the count assertion: set+singleton = 2, not 4)
 *   D-04 — three-path token priority (Variables > plugin > styles) + --prefer-styles
 *          escape + Path C receiver-marker distinction + Path B resolver seam
 *   D-09 — digest/ artifact writes
 *   determinism — byte-identical DESIGN.md across runs; stable section order
 *
 * NOTE: test/fixtures/figma/files-response.json (31-01) had not landed when this
 * suite was written, so the document shape is inlined via makeDoc(). If that
 * fixture exists it is preferred (see loadFixtureDoc()), otherwise the inline
 * document is used so this suite never hard-blocks on 31-01.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const EXTRACT_DIR = path.join(__dirname, '../..', 'scripts', 'lib', 'figma-extract');
const { digest, assembleTokens, DEFAULT_TOKEN_PRIORITY, PLUGIN_PAYLOAD_MARKER } =
  require(path.join(EXTRACT_DIR, 'digest.cjs'));
const { collectComponents } = require(path.join(EXTRACT_DIR, 'walk.cjs'));
const { renderDesignMd } = require(path.join(EXTRACT_DIR, 'render-md.cjs'));

// ── fixtures / scaffolding ───────────────────────────────────────────────────

/**
 * An equivalent of 31-01's files-response.json document shape:
 *   - one COMPONENT_SET ("Button") with 2 variant COMPONENT children + props
 *   - one standalone COMPONENT ("Icon")
 *   - one top-level FRAME ("Home")
 * Variant rollup must collapse this to exactly 2 component entries (NOT 4).
 */
function makeDoc() {
  return {
    name: 'TestDS',
    document: {
      id: '0:0',
      type: 'DOCUMENT',
      children: [
        {
          id: '1:0',
          type: 'CANVAS',
          name: 'Page 1',
          children: [
            {
              id: '1:1',
              type: 'COMPONENT_SET',
              name: 'Button',
              description: 'Primary button',
              children: [
                { id: '1:11', type: 'COMPONENT', name: 'Size=sm' },
                { id: '1:12', type: 'COMPONENT', name: 'Size=md' },
              ],
              componentPropertyDefinitions: {
                'Size#1:0': {
                  type: 'VARIANT',
                  defaultValue: 'md',
                  variantOptions: ['sm', 'md'],
                },
              },
            },
            { id: '1:2', type: 'COMPONENT', name: 'Icon' },
            { id: '1:3', type: 'FRAME', name: 'Home' },
          ],
        },
      ],
    },
  };
}

/** Prefer 31-01's fixture if present; else the inline document. */
function loadFixtureDoc() {
  const fixturePath = path.join(
    __dirname,
    '../..',
    'test', 'fixtures',
    'figma',
    'files-response.json'
  );
  try {
    const raw = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    if (raw && raw.document) return raw;
  } catch {
    /* fall through to inline */
  }
  return makeDoc();
}

/** A Figma Variables-API body with a single COLOR variable named `c`. */
function makeVariablesBody(name, hexComponents) {
  const { r, g, b } = hexComponents;
  return {
    meta: {
      variableCollections: {
        col1: { id: 'col1', name: 'Core', modes: [{ modeId: 'm1', name: 'Default' }] },
      },
      variables: {
        v1: {
          id: 'v1',
          name,
          resolvedType: 'COLOR',
          variableCollectionId: 'col1',
          valuesByMode: { m1: { r, g, b } },
        },
      },
    },
  };
}

/** Write the given objects into a fresh mkdtemp raw cache; return its path. */
function scaffoldRawCache({ file, variables, styles, meta } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'figx-raw-'));
  if (file !== undefined) fs.writeFileSync(path.join(dir, 'file.json'), JSON.stringify(file));
  if (variables !== undefined) {
    fs.writeFileSync(path.join(dir, 'variables.json'), JSON.stringify(variables));
  }
  if (styles !== undefined) {
    fs.writeFileSync(path.join(dir, 'styles.json'), JSON.stringify(styles));
  }
  fs.writeFileSync(
    path.join(dir, '_meta.json'),
    JSON.stringify(meta || { file_key: 'KEY', fetched_at: '2026-01-01T00:00:00Z' })
  );
  return dir;
}

function rmrf(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup */
  }
}

/** Run digest against a scaffolded cache with a fixed fetched_at; return result. */
async function runDigest(scaffold = {}, opts = {}) {
  const raw = scaffoldRawCache({ file: loadFixtureDoc(), ...scaffold });
  const out = path.join(raw, 'out');
  const res = await digest({ rawDir: raw, outDir: out, fetchedAtOverride: 'FIXED', ...opts });
  return { raw, out, res };
}

// ── 1. variant rollup count (D-02) ───────────────────────────────────────────

test('31-02: variant rollup — fixture document yields 2 components (set + singleton), NOT 4', async () => {
  const { raw, res } = await runDigest();
  try {
    assert.equal(res.ok, true);
    assert.equal(res.counts.components, 2, 'COMPONENT children of the set must be rolled up');
  } finally {
    rmrf(raw);
  }
});

// ── 2. variants[] captured on the set ─────────────────────────────────────────

test('31-02: COMPONENT_SET entry carries variants[] of length 2', () => {
  const { components } = collectComponents(makeDoc().document);
  const set = components.find((c) => c.type === 'COMPONENT_SET');
  assert.ok(set, 'a COMPONENT_SET entry must exist');
  assert.deepEqual(set.variants, ['Size=sm', 'Size=md']);
});

// ── 3. props captured with name split on '#' ─────────────────────────────────

test("31-02: props captured with name split on '#' and default + options", () => {
  const { components } = collectComponents(makeDoc().document);
  const set = components.find((c) => c.type === 'COMPONENT_SET');
  assert.ok(Array.isArray(set.props) && set.props.length === 1);
  const p = set.props[0];
  assert.equal(p.name, 'Size', "name must be split on '#'");
  assert.equal(p.type, 'VARIANT');
  assert.equal(p.default, 'md');
  assert.deepEqual(p.options, ['sm', 'md']);
});

// ── 4. top-level FRAME → widget ──────────────────────────────────────────────

test('31-02: top-level FRAME collected as a widget', () => {
  const { widgets } = collectComponents(makeDoc().document);
  assert.equal(widgets.length, 1);
  assert.equal(widgets[0].name, 'Home');
  assert.equal(widgets[0].id, '1:3');
});

// ── 5. missing raw/file.json → graceful error (D-01) ─────────────────────────

test('31-02: missing raw/file.json → {ok:false, error matches /run pull.cjs first/}, no throw', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'figx-empty-'));
  try {
    const res = await digest({ rawDir: dir, outDir: path.join(dir, 'out') });
    assert.equal(res.ok, false);
    assert.match(res.error, /run pull\.cjs first/);
  } finally {
    rmrf(dir);
  }
});

// ── 6. artifact writes (D-09) ────────────────────────────────────────────────

test('31-02: digest writes DESIGN.md + tokens.json + components.json to outDir', async () => {
  const { raw, out, res } = await runDigest();
  try {
    assert.equal(res.ok, true);
    assert.ok(fs.existsSync(path.join(out, 'DESIGN.md')), 'DESIGN.md must exist');
    assert.ok(fs.existsSync(path.join(out, 'tokens.json')), 'tokens.json must exist');
    assert.ok(fs.existsSync(path.join(out, 'components.json')), 'components.json must exist');
    // components.json reflects the rolled-up set (2 entries, not 4)
    const comps = JSON.parse(fs.readFileSync(path.join(out, 'components.json'), 'utf8'));
    assert.equal(comps.length, 2);
  } finally {
    rmrf(raw);
  }
});

// ── 7. stable section order ──────────────────────────────────────────────────

test('31-02: DESIGN.md section order is Tokens → Components → Widgets', async () => {
  const { raw, out } = await runDigest();
  try {
    const md = fs.readFileSync(path.join(out, 'DESIGN.md'), 'utf8');
    const iTokens = md.indexOf('## Tokens');
    const iComponents = md.indexOf('## Components');
    const iWidgets = md.indexOf('## Widgets / Pages');
    assert.ok(iTokens >= 0 && iComponents >= 0 && iWidgets >= 0, 'all sections present');
    assert.ok(iTokens < iComponents, 'Tokens before Components');
    assert.ok(iComponents < iWidgets, 'Components before Widgets');
  } finally {
    rmrf(raw);
  }
});

// ── 8. determinism ───────────────────────────────────────────────────────────

test('31-02: identical input → byte-identical DESIGN.md (determinism, fetchedAtOverride fixed)', async () => {
  const a = await runDigest();
  const b = await runDigest();
  try {
    const mdA = fs.readFileSync(path.join(a.out, 'DESIGN.md'), 'utf8');
    const mdB = fs.readFileSync(path.join(b.out, 'DESIGN.md'), 'utf8');
    assert.equal(mdA, mdB, 'two digests of identical input must be byte-identical');
  } finally {
    rmrf(a.raw);
    rmrf(b.raw);
  }
});

// ── 9. Path A — variables.json present → color tokens appear ──────────────────

test('31-02: Path A — variables.json present → color tokens appear in tokens.json', async () => {
  const { raw, out, res } = await runDigest({
    variables: makeVariablesBody('color/primary', { r: 1, g: 1, b: 1 }),
  });
  try {
    assert.equal(res.ok, true);
    const tokens = JSON.parse(fs.readFileSync(path.join(out, 'tokens.json'), 'utf8'));
    const t = tokens.find((x) => x.name === 'color/primary');
    assert.ok(t, 'the Path A variable must appear as a token');
    assert.equal(t.type, 'COLOR');
    assert.equal(t.modes.Default, '#ffffff');
  } finally {
    rmrf(raw);
  }
});

// ── 10. 3-path priority: variables wins over styles (default) ─────────────────

test('31-02: 3-path priority — variables value wins over a colliding styles value (default priority)', () => {
  assert.deepEqual(DEFAULT_TOKEN_PRIORITY, ['variables', 'plugin', 'styles']);
  const merged = assembleTokens({
    variables: [{ name: 'c', type: 'COLOR', value: '#fff' }],
    styleTokens: [{ name: 'c', type: 'COLOR', value: '#000' }],
  });
  const c = merged.find((t) => t.name === 'c');
  assert.equal(c.value, '#fff', 'Variables must win over styles on collision');
});

// ── 11. --prefer-styles inverts priority ─────────────────────────────────────

test('31-02: --prefer-styles inverts priority — styles value wins for the colliding name', () => {
  const merged = assembleTokens({
    variables: [{ name: 'c', type: 'COLOR', value: '#fff' }],
    styleTokens: [{ name: 'c', type: 'COLOR', value: '#000' }],
    preferStyles: true,
  });
  const c = merged.find((t) => t.name === 'c');
  assert.equal(c.value, '#000', 'preferStyles must flip styles to the front');
});

// ── 12. Path C — receiver-marked variables.json → pluginVariables ────────────

test('31-02: Path C — a receiver-marked variables.json is treated as pluginVariables (not Path A) and contributes tokens', async () => {
  const pluginPayload = {
    source: PLUGIN_PAYLOAD_MARKER,
    tokens: [{ name: 'spacing/sm', type: 'FLOAT', value: 4 }],
  };
  const { raw, out, res } = await runDigest({ variables: pluginPayload });
  try {
    assert.equal(res.ok, true);
    const tokens = JSON.parse(fs.readFileSync(path.join(out, 'tokens.json'), 'utf8'));
    const t = tokens.find((x) => x.name === 'spacing/sm');
    assert.ok(t, 'plugin-payload token must contribute via Path C');
    assert.equal(t.value, 4);
  } finally {
    rmrf(raw);
  }
});

// ── 12b. Path C beats styles (priority within the chain) ─────────────────────

test('31-02: Path C — plugin sync beats styles on a colliding name (plugin > styles)', () => {
  const merged = assembleTokens({
    pluginVariables: [{ name: 'c', type: 'COLOR', value: '#abc' }],
    styleTokens: [{ name: 'c', type: 'COLOR', value: '#000' }],
  });
  assert.equal(merged.find((t) => t.name === 'c').value, '#abc');
});

// ── 13. Path B — stylesResolver injection seam ───────────────────────────────

test('31-02: stylesResolver injection (Path B stub) → its returned styleTokens appear when no higher-priority source covers the name', async () => {
  const stylesResolver = async () => [
    { name: 'text/body', type: 'TEXT', value: { family: 'Inter', size: 14 } },
  ];
  const { raw, out, res } = await runDigest({}, { stylesResolver });
  try {
    assert.equal(res.ok, true);
    const tokens = JSON.parse(fs.readFileSync(path.join(out, 'tokens.json'), 'utf8'));
    const t = tokens.find((x) => x.name === 'text/body');
    assert.ok(t, 'Path B resolver output must appear in tokens');
    assert.equal(t.type, 'TEXT');
  } finally {
    rmrf(raw);
  }
});

// ── 14. offline re-digest is idempotent (D-01) ───────────────────────────────

test('31-02: re-running digest against an existing raw/ cache is offline + byte-identical (D-01 idempotent)', async () => {
  const raw = scaffoldRawCache({ file: loadFixtureDoc() });
  try {
    const out1 = path.join(raw, 'out1');
    const out2 = path.join(raw, 'out2');
    const r1 = await digest({ rawDir: raw, outDir: out1, fetchedAtOverride: 'FIXED' });
    const r2 = await digest({ rawDir: raw, outDir: out2, fetchedAtOverride: 'FIXED' });
    assert.equal(r1.ok, true);
    assert.equal(r2.ok, true);
    const md1 = fs.readFileSync(path.join(out1, 'DESIGN.md'), 'utf8');
    const md2 = fs.readFileSync(path.join(out2, 'DESIGN.md'), 'utf8');
    assert.equal(md1, md2, 're-digest of the same cache must be byte-identical');
  } finally {
    rmrf(raw);
  }
});

// ── 15. empty document → no throw, zero counts ───────────────────────────────

test('31-02: empty document (no pages) → ok with zero components/widgets, no throw', async () => {
  const raw = scaffoldRawCache({ file: { name: 'Empty', document: { children: [] } } });
  try {
    const res = await digest({ rawDir: raw, outDir: path.join(raw, 'out'), fetchedAtOverride: 'FIXED' });
    assert.equal(res.ok, true);
    assert.equal(res.counts.components, 0);
    assert.equal(res.counts.widgets, 0);
  } finally {
    rmrf(raw);
  }
});

// ── 16. render-md groups color/typography/other and omits empty groups ───────

test('31-02: render-md omits empty token groups and renders color/typography/other when present', () => {
  const md = renderDesignMd({
    tokens: [
      { name: 'col', type: 'COLOR', modes: { Default: '#fff' } },
      { name: 'txt', type: 'TEXT', value: { family: 'Inter' } },
      { name: 'gap', type: 'FLOAT', modes: { Default: 8 } },
    ],
    components: [],
    widgets: [],
    fileMeta: { file_key: 'k', fetched_at: 'FIXED', name: 'n' },
  });
  assert.match(md, /### Color/);
  assert.match(md, /### Typography/);
  assert.match(md, /### Other/);

  const mdEmpty = renderDesignMd({
    tokens: [],
    components: [],
    widgets: [],
    fileMeta: { file_key: 'k', fetched_at: 'FIXED', name: 'n' },
  });
  assert.doesNotMatch(mdEmpty, /### Color/, 'empty color group must be omitted');
  assert.doesNotMatch(mdEmpty, /### Typography/);
  assert.doesNotMatch(mdEmpty, /### Other/);
});

// ── 17. digest performs no network — sanity that it runs with no globals touched ─

test('31-02: digest runs fully offline (no fetch invoked)', async () => {
  const originalFetch = global.fetch;
  let fetchCalled = false;
  global.fetch = () => {
    fetchCalled = true;
    throw new Error('network call attempted during digest (violates D-01)');
  };
  const raw = scaffoldRawCache({ file: loadFixtureDoc() });
  try {
    const res = await digest({ rawDir: raw, outDir: path.join(raw, 'out'), fetchedAtOverride: 'FIXED' });
    assert.equal(res.ok, true);
    assert.equal(fetchCalled, false, 'digest must not call fetch');
  } finally {
    global.fetch = originalFetch;
    rmrf(raw);
  }
});
