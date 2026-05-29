'use strict';
// Plan 31-03 — offline coverage for styles-resolver.cjs (Path B of D-04).
//
// Proves the spike 001 0-tokens fix: published-style source nodes are NOT in
// file.document; they resolve only via the second-pass /nodes?ids= fetch. Every
// test is fully offline — fetchNodes is a stub, never a live network call.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  resolveStyleTokens,
  buildStylesResolver,
  MAX_IDS_PER_REQUEST,
  rgbToHex,
} = require('../scripts/lib/figma-extract/styles-resolver.cjs');

const STYLES = require('../test-fixture/figma/styles-response.json');
const NODES = require('../test-fixture/figma/nodes-response.json');

// Build a /nodes stub that returns ONLY the requested ids' subset of `nodesBody.nodes`
// (so chunking tests can assert disjoint id sets per call), and RECORDS each ids[] chunk.
function makeNodesStub(nodesBody) {
  const calls = [];
  const fetchNodes = async (ids) => {
    calls.push(ids.slice());
    const subset = {};
    for (const id of ids) {
      if (nodesBody.nodes[id] !== undefined) subset[id] = nodesBody.nodes[id];
    }
    return { nodes: subset };
  };
  return { fetchNodes, calls };
}

test('31-03: spike-bug fix — styles whose node_ids are NOT in file.document resolve via /nodes (non-empty where spike returned 0)', async () => {
  // The spike indexed file.document for these node_ids and found nothing -> 0 tokens.
  // Here the document is empty of them; only the /nodes stub supplies them.
  const emptyDocument = { document: { id: '0:0', children: [] } };
  const idsInStyles = STYLES.meta.styles.map((s) => s.node_id);
  for (const id of idsInStyles) {
    assert.equal(emptyDocument.document.children.length, 0,
      'precondition: source nodes are absent from the document tree (the spike condition)');
  }
  const { fetchNodes } = makeNodesStub(NODES);
  const tokens = await resolveStyleTokens({ stylesList: STYLES, fetchNodes });
  assert.ok(tokens.length > 0, 'resolver returns non-empty tokens (the spike returned 0 here)');
  assert.equal(tokens.length, 3, 'all 3 fixture styles resolve via the second-pass /nodes fetch');
});

test('31-03: FILL style → hex string value (rgb→hex, alpha-aware)', async () => {
  const { fetchNodes } = makeNodesStub(NODES);
  const tokens = await resolveStyleTokens({ stylesList: STYLES, fetchNodes });
  const fill = tokens.find((t) => t.type === 'FILL');
  assert.ok(fill, 'a FILL token is present');
  assert.equal(typeof fill.value, 'string', 'FILL value is a string');
  assert.equal(fill.value[0], '#', 'FILL value is a hex string');
  // Deterministic from {r:0.06,g:0.64,b:0.5,opacity:1}: round(*255) per channel.
  assert.equal(fill.value, rgbToHex({ r: 0.06, g: 0.64, b: 0.5, a: 1 }),
    'FILL hex matches rgbToHex of the fixture color');
  assert.equal(fill.value, '#0fa380', 'FILL hex is the expected deterministic value');
});

test('31-03: TEXT style → {family, weight, size, lineHeight, letterSpacing}', async () => {
  const { fetchNodes } = makeNodesStub(NODES);
  const tokens = await resolveStyleTokens({ stylesList: STYLES, fetchNodes });
  const text = tokens.find((t) => t.type === 'TEXT');
  assert.ok(text, 'a TEXT token is present');
  assert.deepEqual(text.value, {
    family: 'Inter',
    weight: 400,
    size: 16,
    lineHeight: 24,
    letterSpacing: 0,
  }, 'TEXT value carries the spike-shaped typography object');
});

test('31-03: EFFECT style → the first effect object', async () => {
  const { fetchNodes } = makeNodesStub(NODES);
  const tokens = await resolveStyleTokens({ stylesList: STYLES, fetchNodes });
  const effect = tokens.find((t) => t.type === 'EFFECT');
  assert.ok(effect, 'an EFFECT token is present');
  assert.equal(effect.value.type, 'DROP_SHADOW', 'EFFECT value is the first effect object');
  assert.equal(effect.value.radius, 8, 'effect object carries its real fields');
});

test('31-03: empty meta.styles → [] and fetchNodes NOT called', async () => {
  const { fetchNodes, calls } = makeNodesStub(NODES);
  const tokens = await resolveStyleTokens({ stylesList: { meta: { styles: [] } }, fetchNodes });
  assert.deepEqual(tokens, [], 'empty styles list returns []');
  assert.equal(calls.length, 0, 'fetchNodes is not called when there are no styles');
});

test('31-03: style whose node_id missing from /nodes response → skipped, others still resolve', async () => {
  const stylesWithMiss = {
    meta: {
      styles: [
        ...STYLES.meta.styles,
        { node_id: '999:999', style_type: 'FILL', name: 'Sample/Color/Missing', description: '' },
      ],
    },
  };
  const { fetchNodes } = makeNodesStub(NODES); // NODES has no 999:999
  const tokens = await resolveStyleTokens({ stylesList: stylesWithMiss, fetchNodes });
  assert.equal(tokens.length, 3, 'the missing-node style is skipped; the other 3 still resolve');
  assert.ok(!tokens.find((t) => t.name === 'Sample/Color/Missing'), 'missing style produced no token');
});

test('31-03: id batching — 250 styles → ceil(250/MAX_IDS_PER_REQUEST) fetchNodes calls with disjoint id chunks, all merged', async () => {
  const N = 250;
  const styles = [];
  const nodes = {};
  for (let i = 0; i < N; i++) {
    const id = '1:' + i;
    styles.push({ node_id: id, style_type: 'FILL', name: 'Sample/Color/C' + i, description: '' });
    nodes[id] = { document: { id, fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 }, opacity: 1 }] } };
  }
  const { fetchNodes, calls } = makeNodesStub({ nodes });
  const tokens = await resolveStyleTokens({ stylesList: { meta: { styles } }, fetchNodes });

  const expectedCalls = Math.ceil(N / MAX_IDS_PER_REQUEST);
  assert.equal(calls.length, expectedCalls, `expected ${expectedCalls} chunked fetchNodes calls`);
  // No chunk exceeds the cap.
  for (const c of calls) assert.ok(c.length <= MAX_IDS_PER_REQUEST, 'no chunk exceeds MAX_IDS_PER_REQUEST');
  // No id repeats across chunks (disjoint partition).
  const seen = new Set();
  for (const c of calls) for (const id of c) {
    assert.ok(!seen.has(id), `id ${id} must appear in exactly one chunk`);
    seen.add(id);
  }
  assert.equal(seen.size, N, 'every id was requested exactly once');
  assert.equal(tokens.length, N, 'all 250 tokens merged across chunks (no dropped tokens)');
});

test('31-03: /nodes entries under .document wrapper are unwrapped correctly', async () => {
  // NODES uses the Figma {document: <node>} wrapper; assert the FILL still reads its color.
  const wrapped = { nodes: { '100:1': { document: NODES.nodes['100:1'].document } } };
  const single = { meta: { styles: [STYLES.meta.styles[0]] } }; // the FILL style
  const { fetchNodes } = makeNodesStub(wrapped);
  const tokens = await resolveStyleTokens({ stylesList: single, fetchNodes });
  assert.equal(tokens.length, 1, 'wrapped node resolved');
  assert.equal(tokens[0].value[0], '#', 'unwrapped node yielded a hex FILL value');

  // Also tolerate a bare (un-wrapped) node shape.
  const bare = { nodes: { '100:1': NODES.nodes['100:1'].document } };
  const { fetchNodes: fetchBare } = makeNodesStub(bare);
  const bareTokens = await resolveStyleTokens({ stylesList: single, fetchNodes: fetchBare });
  assert.equal(bareTokens.length, 1, 'bare (un-wrapped) node shape also resolves');
});

test('31-03: token names preserve Sample/* and description passthrough', async () => {
  const { fetchNodes } = makeNodesStub(NODES);
  const tokens = await resolveStyleTokens({ stylesList: STYLES, fetchNodes });
  for (const t of tokens) {
    assert.ok(t.name.startsWith('Sample/'), `name ${t.name} preserves the Sample/* prefix`);
  }
  const fill = tokens.find((t) => t.type === 'FILL');
  assert.equal(fill.description, 'Primary brand fill', 'description passes through');
  const effect = tokens.find((t) => t.type === 'EFFECT');
  assert.equal(effect.description, '', 'empty description normalizes to ""');
});

test('31-03: buildStylesResolver returns an async fn(file, styles) — digest seam compatibility (shape check, fetchImpl stub)', async () => {
  const fetchImpl = async (url) => {
    // Stub the live HTTP layer: return the nodes fixture for any /nodes request.
    assert.ok(url.includes('/nodes?ids='), 'bound fetcher hits the /nodes endpoint');
    return { ok: true, json: async () => NODES };
  };
  const resolver = buildStylesResolver({ fileKey: 'KEY', token: 'tkn', fetchImpl });
  assert.equal(typeof resolver, 'function', 'buildStylesResolver returns a function');
  assert.equal(resolver.length, 2, 'the bound resolver takes (file, styles) — digest.cjs seam arity');
  // digest.cjs calls stylesResolver(file, styles); file is ignored (source nodes not in tree).
  const tokens = await resolver({ document: { id: '0:0' } }, STYLES);
  assert.equal(tokens.length, 3, 'bound resolver resolves the styles via the injected fetchImpl');
});

test('31-03: buildStylesResolver-bound fetcher never logs the token', async () => {
  const SENTINEL = 'figd_SECRET_SENTINEL_TOKEN';
  const logged = [];
  const spies = ['log', 'info', 'warn', 'error', 'debug'].map((m) => {
    const orig = console[m];
    console[m] = (...args) => { logged.push(args.map(String).join(' ')); };
    return [m, orig];
  });
  try {
    const fetchImpl = async () => ({ ok: true, json: async () => NODES });
    const resolver = buildStylesResolver({ fileKey: 'KEY', token: SENTINEL, fetchImpl });
    await resolver({}, STYLES);
  } finally {
    for (const [m, orig] of spies) console[m] = orig;
  }
  for (const line of logged) {
    assert.ok(!line.includes(SENTINEL), 'the FIGMA token must never be written to any console sink (D-10)');
  }
});

test('31-03: bound fetcher throws on a non-ok /nodes response (no silent swallow)', async () => {
  const fetchImpl = async () => ({ ok: false, status: 403, json: async () => ({}) });
  const resolver = buildStylesResolver({ fileKey: 'KEY', token: 'tkn', fetchImpl });
  await assert.rejects(
    () => resolver({}, STYLES),
    /\/nodes 403/,
    'a non-ok /nodes response surfaces as an error',
  );
});

test('31-03: fixtures live at the expected test-fixture/figma path (offline, no network)', () => {
  // Guards the key_link: the node-fetcher stub is driven by nodes-response.json.
  const stylesPath = path.join(__dirname, '..', 'test-fixture', 'figma', 'styles-response.json');
  const nodesPath = path.join(__dirname, '..', 'test-fixture', 'figma', 'nodes-response.json');
  assert.ok(require('node:fs').existsSync(stylesPath), 'styles-response.json fixture exists');
  assert.ok(require('node:fs').existsSync(nodesPath), 'nodes-response.json fixture exists');
});
