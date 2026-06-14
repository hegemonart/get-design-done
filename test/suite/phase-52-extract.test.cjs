'use strict';
// test/suite/phase-52-extract.test.cjs — Phase 52 (DesignContext graph), executor B.
//
// Proves the five deterministic extractors under scripts/lib/design-context/:
//   - extract-tokens / extract-components / extract-motion / extract-a11y /
//     extract-visual-hierarchy each emit a well-formed Fragment (schema_version
//     '52.0', a `mapper` field, nodes[], edges[]) when run over a tiny temp
//     fixture tree, with the node `type`s each is contracted to produce;
//   - every node carries the stub shape the deterministic pass leaves for the
//     LLM phase (summary === '' and complexity === 'moderate');
//   - none of them crash (and all return empty nodes/edges) on an empty dir or
//     a non-existent path.
//
// The extractors are ESM (.mjs); this CJS suite loads them via dynamic import()
// inside an async test (node:test supports async test bodies). Hermetic: fixture
// trees live under os.tmpdir() and are removed in teardown. Pure extract() is
// exercised directly — no spawning, no stdout parsing, no network.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const DC_DIR = path.resolve(__dirname, '..', '..', 'scripts', 'lib', 'design-context');

function importMjs(name) {
  return import(pathToFileURL(path.join(DC_DIR, name)).href);
}

function mkFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hone-p52-extract-'));
  const src = path.join(dir, 'src');
  fs.mkdirSync(src, { recursive: true });

  // A component file with a hex color + a Button component + ARIA + heading +
  // a framer-motion import + a Tailwind type-scale class — enough surface for
  // every extractor to find at least one node.
  fs.writeFileSync(
    path.join(src, 'Button.tsx'),
    [
      "import { motion, AnimatePresence } from 'framer-motion';",
      "import { cva } from 'class-variance-authority';",
      "const v = cva('b', { variants: { intent: { primary: '' } } });",
      'export function Button({ intent }: { intent: string }) {',
      '  return (',
      '    <AnimatePresence>',
      '      <motion.button',
      '        className="bg-blue-500 text-2xl rounded-md shadow-sm p-4"',
      '        aria-label="go"',
      '        role="button"',
      '        tabIndex={0}',
      '        onKeyDown={() => {}}',
      "        style={{ color: '#ff8800' }}",
      '      >',
      '        <h1 className="text-5xl hero">Go</h1>',
      '      </motion.button>',
      '    </AnimatePresence>',
      '  );',
      '}',
    ].join('\n'),
    'utf8',
  );

  // A stylesheet with tokens + a keyframe + a focus state.
  fs.writeFileSync(
    path.join(src, 'theme.css'),
    [
      ':root { --brand: #1a2b3c; --space-2: 8px; }',
      '.card { padding: 16px; border-radius: 12px; box-shadow: 0 1px 2px rgba(0,0,0,0.1); font-weight: 700; }',
      '.btn:focus-visible { outline: 2px solid #1a2b3c; }',
      '@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }',
      '@media (prefers-reduced-motion: reduce) { .card { transition: none } }',
    ].join('\n'),
    'utf8',
  );

  return { dir, src };
}

function rmrf(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

// Shared Fragment-shape assertions.
function assertFragmentShape(frag, expectedMapper) {
  assert.equal(typeof frag, 'object');
  assert.equal(frag.schema_version, '52.0', 'schema_version must be 52.0');
  assert.equal(frag.mapper, expectedMapper, 'mapper field must identify the producer');
  assert.ok('generated_at' in frag, 'generated_at present (may be empty in pure extract)');
  assert.ok(Array.isArray(frag.nodes), 'nodes[] is an array');
  assert.ok(Array.isArray(frag.edges), 'edges[] is an array');
}

function assertStubNodes(frag) {
  for (const n of frag.nodes) {
    assert.equal(typeof n.id, 'string');
    assert.ok(n.id.length > 0, 'node id non-empty');
    assert.equal(typeof n.type, 'string');
    assert.ok(Array.isArray(n.tags), 'node.tags is an array');
    assert.equal(n.summary, '', 'deterministic pass leaves summary as a stub');
    assert.equal(n.complexity, 'moderate', 'deterministic pass leaves complexity stub');
  }
}

function nodeTypes(frag) {
  return new Set(frag.nodes.map((n) => n.type));
}

// ---------------------------------------------------------------------------
// Per-extractor tests.
// ---------------------------------------------------------------------------

test('extract-tokens: emits token nodes + uses-token edges with stub shape', async () => {
  const { dir, src } = mkFixture();
  try {
    const mod = await importMjs('extract-tokens.mjs');
    const frag = mod.extract(src);
    assertFragmentShape(frag, 'token-mapper');
    assertStubNodes(frag);

    const types = nodeTypes(frag);
    assert.ok(types.has('token'), 'produces token nodes');
    // subtypes span the families the fixture exercises.
    const subtypes = new Set(frag.nodes.filter((n) => n.type === 'token').map((n) => n.subtype));
    for (const s of ['color', 'spacing', 'typography', 'radius', 'shadow']) {
      assert.ok(subtypes.has(s), `token subtype present: ${s}`);
    }
    // uses-token edges originate from a component file (.tsx).
    const useEdges = frag.edges.filter((e) => e.type === 'uses-token');
    assert.ok(useEdges.length > 0, 'emits uses-token edges from the .tsx component');
    for (const e of useEdges) {
      assert.ok(e.source.startsWith('component:'), 'uses-token source is a component');
      assert.ok(e.target.startsWith('token:'), 'uses-token target is a token');
      assert.equal(e.direction, 'forward');
      assert.equal(typeof e.weight, 'number');
    }
  } finally {
    rmrf(dir);
  }
});

test('extract-components: emits component/variant/layer nodes + composes/extends edges', async () => {
  const { dir, src } = mkFixture();
  try {
    const mod = await importMjs('extract-components.mjs');
    const frag = mod.extract(src);
    assertFragmentShape(frag, 'component-taxonomy-mapper');
    assertStubNodes(frag);

    const types = nodeTypes(frag);
    assert.ok(types.has('component'), 'produces component nodes');
    assert.ok(types.has('layer'), 'produces layer nodes');
    assert.ok(types.has('variant'), 'produces a variant node (cva detected)');

    const button = frag.nodes.find((n) => n.id === 'component:button');
    assert.ok(button, 'component id is lowercased (case-insensitive identity)');
    assert.ok(['Atomic', 'Molecular', 'Organism'].includes(button.layer), 'layer classified');

    const extendsEdges = frag.edges.filter((e) => e.type === 'extends');
    assert.ok(extendsEdges.length > 0, 'variant extends its component');
    assert.ok(extendsEdges.every((e) => e.target === 'component:button'));
  } finally {
    rmrf(dir);
  }
});

test('extract-motion: emits motion-fragment/state nodes + transitions-to edges', async () => {
  const { dir, src } = mkFixture();
  try {
    const mod = await importMjs('extract-motion.mjs');
    const frag = mod.extract(src);
    assertFragmentShape(frag, 'motion-mapper');
    assertStubNodes(frag);

    const types = nodeTypes(frag);
    assert.ok(types.has('motion-fragment'), 'produces motion-fragment nodes');
    assert.ok(types.has('state'), 'produces state nodes (keyframe + AnimatePresence)');

    const tEdges = frag.edges.filter((e) => e.type === 'transitions-to');
    assert.ok(tEdges.length > 0, 'emits transitions-to edges');
    for (const e of tEdges) {
      assert.ok(e.source.startsWith('state:'));
      assert.ok(e.target.startsWith('state:'));
    }
    // framer-motion was detected as a library on at least one fragment.
    const libs = new Set(frag.nodes.filter((n) => n.type === 'motion-fragment').map((n) => n.library));
    assert.ok(libs.has('framer-motion'), 'framer-motion library detected');
    assert.ok(libs.has('css-keyframes'), 'css keyframes detected');
  } finally {
    rmrf(dir);
  }
});

test('extract-a11y: emits a11y-pattern nodes + referenced-by/documented-by edges', async () => {
  const { dir, src } = mkFixture();
  try {
    const mod = await importMjs('extract-a11y.mjs');
    const frag = mod.extract(src);
    assertFragmentShape(frag, 'a11y-mapper');
    assertStubNodes(frag);

    const types = nodeTypes(frag);
    assert.ok(types.has('a11y-pattern'), 'produces a11y-pattern nodes');
    assert.ok(types.has('pattern'), 'produces WCAG pattern nodes');

    const refEdges = frag.edges.filter((e) => e.type === 'referenced-by');
    const docEdges = frag.edges.filter((e) => e.type === 'documented-by');
    assert.ok(refEdges.length > 0, 'component referenced-by pattern edges');
    assert.ok(docEdges.length > 0, 'pattern documented-by WCAG edges');
    // referenced-by sources are component:* (resolve cross-fragment at merge).
    assert.ok(refEdges.every((e) => e.source.startsWith('component:')));
    assert.ok(refEdges.every((e) => e.source === e.source.toLowerCase()), 'component id lowercased');
  } finally {
    rmrf(dir);
  }
});

test('extract-visual-hierarchy: emits layer/pattern nodes + composes/referenced-by edges', async () => {
  const { dir, src } = mkFixture();
  try {
    const mod = await importMjs('extract-visual-hierarchy.mjs');
    const frag = mod.extract(src);
    assertFragmentShape(frag, 'visual-hierarchy-mapper');
    assertStubNodes(frag);

    const types = nodeTypes(frag);
    assert.ok(types.has('layer'), 'produces heading layer nodes');
    assert.ok(types.has('pattern'), 'produces type-scale/focal/layout pattern nodes');

    // hero + centered layout emit referenced-by from the component file.
    const refEdges = frag.edges.filter((e) => e.type === 'referenced-by');
    assert.ok(refEdges.length > 0, 'pattern referenced-by component edges');
  } finally {
    rmrf(dir);
  }
});

// ---------------------------------------------------------------------------
// Robustness: empty dir + non-existent path never crash.
// ---------------------------------------------------------------------------

const ALL_EXTRACTORS = [
  ['extract-tokens.mjs', 'token-mapper'],
  ['extract-components.mjs', 'component-taxonomy-mapper'],
  ['extract-motion.mjs', 'motion-mapper'],
  ['extract-a11y.mjs', 'a11y-mapper'],
  ['extract-visual-hierarchy.mjs', 'visual-hierarchy-mapper'],
];

test('every extractor returns an empty (valid) Fragment on an empty dir', async () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'hone-p52-empty-'));
  try {
    for (const [file, mapper] of ALL_EXTRACTORS) {
      const mod = await importMjs(file);
      const frag = mod.extract(empty);
      assertFragmentShape(frag, mapper);
      assert.equal(frag.nodes.length, 0, `${file}: no nodes on empty dir`);
      assert.equal(frag.edges.length, 0, `${file}: no edges on empty dir`);
    }
  } finally {
    rmrf(empty);
  }
});

test('every extractor tolerates a non-existent path without throwing', async () => {
  const ghost = path.join(os.tmpdir(), 'hone-p52-does-not-exist-' + Date.now());
  for (const [file, mapper] of ALL_EXTRACTORS) {
    const mod = await importMjs(file);
    const frag = mod.extract(ghost);
    assertFragmentShape(frag, mapper);
    assert.equal(frag.nodes.length, 0);
    assert.equal(frag.edges.length, 0);
  }
});

test('extractors accept an array of roots (multi-root scan)', async () => {
  const { dir, src } = mkFixture();
  try {
    const mod = await importMjs('extract-tokens.mjs');
    const frag = mod.extract([src, src]); // duplicate root must not double nodes
    const ids = frag.nodes.map((n) => n.id);
    assert.equal(ids.length, new Set(ids).size, 'node ids deduped across roots');
  } finally {
    rmrf(dir);
  }
});
