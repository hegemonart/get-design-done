'use strict';
/**
 * Plan 31-08 — offline behavioral test suite for the digest `--component` filter
 * (per-component slicing, glob-aware). Implements decision D-08.
 *
 * Every test is tagged `31-08:` and runs FULLY OFFLINE — each test scaffolds its
 * own raw/ cache under fs.mkdtempSync() with only the *.json files it needs, runs
 * digest with/without the `component` option, asserts, and cleans up. No live
 * Figma calls, no network (D-01 preserved).
 *
 * Decision coverage:
 *   D-08 — `--component <name>` produces a per-component slice instead of the full
 *          digest; supports glob (`*`, `?`); a single-component slice is small
 *          (bytes/4 <= 1000 tokens); additive — omitting `component` reproduces
 *          31-02's full digest (no regression); no-match returns a clear empty
 *          slice (not a crash, not the full digest).
 *
 * The fixture mirrors 31-02's scaffold idiom: a COMPONENT_SET 'Sample/Button'
 * with variant children + props, a singleton COMPONENT 'Sample/Icon', plus an
 * extra singleton 'Other/Badge' outside the Sample/ namespace so glob scoping is
 * distinguishable from "match everything".
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const EXTRACT_DIR = path.join(__dirname, '..', 'scripts', 'lib', 'figma-extract');
const { digest } = require(path.join(EXTRACT_DIR, 'digest.cjs'));

// ── fixtures / scaffolding ───────────────────────────────────────────────────

/**
 * A document with THREE components so exact / glob / scoped-glob are all
 * distinguishable:
 *   - COMPONENT_SET 'Sample/Button' (2 variants + a VARIANT prop)
 *   - singleton COMPONENT 'Sample/Icon'
 *   - singleton COMPONENT 'Other/Badge'  (outside the Sample/ namespace)
 *   - a top-level FRAME 'Home'
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
              name: 'Sample/Button',
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
            { id: '1:2', type: 'COMPONENT', name: 'Sample/Icon' },
            { id: '1:3', type: 'COMPONENT', name: 'Other/Badge' },
            { id: '1:4', type: 'FRAME', name: 'Home' },
          ],
        },
      ],
    },
  };
}

/** A Figma Variables-API body with a few COLOR/FLOAT tokens (token-bound check). */
function makeVariablesBody() {
  return {
    meta: {
      variableCollections: {
        col1: { id: 'col1', name: 'Core', modes: [{ modeId: 'm1', name: 'Default' }] },
      },
      variables: {
        v1: {
          id: 'v1',
          name: 'color/primary',
          resolvedType: 'COLOR',
          variableCollectionId: 'col1',
          valuesByMode: { m1: { r: 1, g: 0, b: 0 } },
        },
        v2: {
          id: 'v2',
          name: 'spacing/sm',
          resolvedType: 'FLOAT',
          variableCollectionId: 'col1',
          valuesByMode: { m1: 4 },
        },
      },
    },
  };
}

/** Write the given objects into a fresh mkdtemp raw cache; return its path. */
function scaffoldRawCache({ file, variables, meta } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'figx-cf-'));
  if (file !== undefined) fs.writeFileSync(path.join(dir, 'file.json'), JSON.stringify(file));
  if (variables !== undefined) {
    fs.writeFileSync(path.join(dir, 'variables.json'), JSON.stringify(variables));
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
  const raw = scaffoldRawCache({ file: makeDoc(), ...scaffold });
  const out = path.join(raw, 'out');
  const res = await digest({ rawDir: raw, outDir: out, fetchedAtOverride: 'FIXED', ...opts });
  return { raw, out, res };
}

// ── 1. additive invariant: no --component → full digest ──────────────────────

test('31-08: no --component → full digest (additive invariant: 3 components, sliced flag absent/false)', async () => {
  const { raw, res } = await runDigest();
  try {
    assert.equal(res.ok, true);
    // The fixture rolls up to 3 components (1 set + 2 singletons), NOT sliced.
    assert.equal(res.counts.components, 3, 'unfiltered digest must see all 3 components');
    assert.notEqual(res.sliced, true, 'full digest must NOT be flagged sliced');
  } finally {
    rmrf(raw);
  }
});

// ── 2. exact match → slice with exactly that component ───────────────────────

test("31-08: --component 'Sample/Button' (exact) → slice with exactly that component, sliced:true, matched=['Sample/Button']", async () => {
  const { raw, res } = await runDigest({}, { component: 'Sample/Button' });
  try {
    assert.equal(res.ok, true);
    assert.equal(res.sliced, true, 'exact match must flag sliced:true');
    assert.deepEqual(res.matched, ['Sample/Button']);
    assert.equal(res.counts.components, 1, 'exactly one component in the slice');
  } finally {
    rmrf(raw);
  }
});

// ── 3. glob 'Sample/*' → matches both Sample/ components ──────────────────────

test("31-08: --component 'Sample/*' (glob) → matches both Sample/ components, not Other/Badge", async () => {
  const { raw, res } = await runDigest({}, { component: 'Sample/*' });
  try {
    assert.equal(res.ok, true);
    assert.equal(res.sliced, true);
    assert.equal(res.counts.components, 2, 'Sample/Button + Sample/Icon');
    assert.deepEqual(res.matched.slice().sort(), ['Sample/Button', 'Sample/Icon']);
    assert.ok(!res.matched.includes('Other/Badge'), 'glob must be scoped to Sample/');
  } finally {
    rmrf(raw);
  }
});

// ── 4. partial glob 'Sample/Butt*' → matches Sample/Button only ───────────────

test("31-08: --component 'Sample/Butt*' (partial glob) → matches Sample/Button only", async () => {
  const { raw, res } = await runDigest({}, { component: 'Sample/Butt*' });
  try {
    assert.equal(res.ok, true);
    assert.deepEqual(res.matched, ['Sample/Button']);
    assert.equal(res.counts.components, 1);
  } finally {
    rmrf(raw);
  }
});

// ── 5. no match → empty slice with a note, no throw ──────────────────────────

test("31-08: --component 'DoesNotExist*' → matched=[], counts.components=0, note present, no throw", async () => {
  const { raw, res } = await runDigest({}, { component: 'DoesNotExist*' });
  try {
    assert.equal(res.ok, true, 'no-match is not an error');
    assert.equal(res.sliced, true, 'still a slice request, just empty');
    assert.deepEqual(res.matched, []);
    assert.equal(res.counts.components, 0);
    assert.ok(typeof res.note === 'string' && /DoesNotExist/.test(res.note), 'a clear note must name the pattern');
  } finally {
    rmrf(raw);
  }
});

// ── 6. single-component slice is small — bytes/4 <= 1000 (D-08 token bound) ───

test('31-08: single-component slice is small — bytes/4 <= 1000 (token bound, D-08)', async () => {
  // Include a real token set so the bound is meaningful (the slice must NOT
  // dump the whole token catalog and blow past ~500 tokens).
  const { raw, out, res } = await runDigest(
    { variables: makeVariablesBody() },
    { component: 'Sample/Button' }
  );
  try {
    assert.equal(res.ok, true);
    assert.equal(res.sliced, true);
    const sliceBytes = res.bytes.designMd;
    assert.ok(Number.isFinite(sliceBytes) && sliceBytes > 0, 'slice bytes reported');
    const approxTokens = sliceBytes / 4;
    assert.ok(approxTokens <= 1000, `slice ~${Math.round(approxTokens)} tokens must be <= 1000 (got ${sliceBytes} bytes)`);
    // And the written file must be the small slice too.
    const md = fs.readFileSync(path.join(out, 'DESIGN.md'), 'utf8');
    assert.ok(Buffer.byteLength(md, 'utf8') / 4 <= 1000, 'written DESIGN.md slice must also be <= 1000 tokens');
  } finally {
    rmrf(raw);
  }
});

// ── 7. slice is materially smaller than the full digest ──────────────────────

test('31-08: per-component slice is materially smaller than the full digest (~500 vs ~16K economics)', async () => {
  const full = await runDigest({ variables: makeVariablesBody() });
  const slice = await runDigest({ variables: makeVariablesBody() }, { component: 'Sample/Button' });
  try {
    assert.equal(full.res.ok, true);
    assert.equal(slice.res.ok, true);
    assert.ok(
      slice.res.bytes.designMd < full.res.bytes.designMd,
      `slice (${slice.res.bytes.designMd}b) must be smaller than full (${full.res.bytes.designMd}b)`
    );
  } finally {
    rmrf(full.raw);
    rmrf(slice.raw);
  }
});

// ── 8. glob translator treats '.' / '/' as literal (no over-match) ───────────

test("31-08: glob translator treats '.' as literal (a literal-dot pattern does not over-match)", async () => {
  // 'Sample/Icon' contains no '.', so a pattern 'Sample.Icon' (where '.' is a
  // regex any-char if NOT escaped) must NOT match 'Sample/Icon'. If the dot were
  // treated as regex-any, 'Sample.Icon' would match 'Sample/Icon' (/ is any char).
  const { raw, res } = await runDigest({}, { component: 'Sample.Icon' });
  try {
    assert.equal(res.ok, true);
    assert.deepEqual(res.matched, [], "literal '.' must not match '/' — regex metachars must be escaped");
    assert.equal(res.counts.components, 0);
  } finally {
    rmrf(raw);
  }
});

// ── 9. '?' glob matches exactly one character ────────────────────────────────

test("31-08: '?' glob matches a single char (Sample/Ico? matches Sample/Icon)", async () => {
  const { raw, res } = await runDigest({}, { component: 'Sample/Ico?' });
  try {
    assert.equal(res.ok, true);
    assert.deepEqual(res.matched, ['Sample/Icon']);
    // And '?' must match ONE char only: 'Sample/Ico?' should not match a 2-char tail.
  } finally {
    rmrf(raw);
  }
});

// ── 9b. '?' is single-char, not multi-char ───────────────────────────────────

test("31-08: '?' is exactly one char (Sample/Butt? does NOT match Sample/Button)", async () => {
  const { raw, res } = await runDigest({}, { component: 'Sample/Butt?' });
  try {
    assert.equal(res.ok, true);
    assert.deepEqual(res.matched, [], "'?' matches a single char, not the 'on' tail of Button");
  } finally {
    rmrf(raw);
  }
});

// ── 10. matched slice still renders props/variants for the matched component ──

test('31-08: matched component slice still renders props/variants for the matched component', async () => {
  const { raw, out, res } = await runDigest({}, { component: 'Sample/Button' });
  try {
    assert.equal(res.ok, true);
    const md = fs.readFileSync(path.join(out, 'DESIGN.md'), 'utf8');
    assert.match(md, /Sample\/Button/, 'the matched component name must appear');
    assert.match(md, /Variants/, 'the variant rollup must be rendered in the slice');
    assert.match(md, /Size/, 'the VARIANT prop must be rendered in the slice');
    // And it must NOT contain the un-matched component.
    assert.doesNotMatch(md, /Other\/Badge/, 'the slice must exclude un-matched components');
  } finally {
    rmrf(raw);
  }
});

// ── 11. additive: full-digest path unchanged byte-for-byte vs base behavior ───

test('31-08: additive — full digest (no component) is byte-identical across runs (no regression to 31-02 determinism)', async () => {
  const a = await runDigest({ variables: makeVariablesBody() });
  const b = await runDigest({ variables: makeVariablesBody() });
  try {
    const mdA = fs.readFileSync(path.join(a.out, 'DESIGN.md'), 'utf8');
    const mdB = fs.readFileSync(path.join(b.out, 'DESIGN.md'), 'utf8');
    assert.equal(mdA, mdB, 'unfiltered digest must stay deterministic');
    assert.notEqual(a.res.sliced, true);
  } finally {
    rmrf(a.raw);
    rmrf(b.raw);
  }
});

// ── 12. component filter performs no network (D-01 preserved) ─────────────────

test('31-08: component-filtered digest runs fully offline (no fetch invoked, D-01)', async () => {
  const originalFetch = global.fetch;
  let fetchCalled = false;
  global.fetch = () => {
    fetchCalled = true;
    throw new Error('network call attempted during sliced digest (violates D-01)');
  };
  const { raw, res } = await runDigest({}, { component: 'Sample/*' });
  try {
    assert.equal(res.ok, true);
    assert.equal(fetchCalled, false, 'sliced digest must not call fetch');
  } finally {
    global.fetch = originalFetch;
    rmrf(raw);
  }
});

// ── 13. missing cache guard still holds for a slice request ──────────────────

test('31-08: --component on a missing raw/file.json → {ok:false} guard preserved (no crash)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'figx-cf-empty-'));
  try {
    const res = await digest({ rawDir: dir, outDir: path.join(dir, 'out'), component: 'Sample/Button' });
    assert.equal(res.ok, false);
    assert.match(res.error, /run pull\.cjs first/);
  } finally {
    rmrf(dir);
  }
});
