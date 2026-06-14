'use strict';
// test/suite/phase-54-addendum-compose.test.cjs - Phase 54 (Composable Reference
// Addendums), executor B (COMP-01). Tagged '54-02:'.
//
// Proves scripts/lib/mapper-spawn.cjs composeAddendums() + applyAddendums():
//   - a stack matching one DS + one framework + one motion lib produces a
//     "## Stack-specific guidance" block carrying all three bodies, with
//     used.length === 3 and an empty missing[];
//   - the cap is respected: cap=2 keeps only the first two (system, framework)
//     and a SECOND entry in an already-filled category (a 4th candidate) is
//     ignored at the default cap of 3;
//   - a detected stack with no registered addendum yields an empty block and
//     flags the unmatched value in missing[];
//   - backward-compat: an empty / null stack yields an empty block and leaves
//     spec.prompt byte-for-byte unchanged.
//
// Hermetic: a FIXTURE registry OBJECT + fixture addendum .md files live under
// os.tmpdir() and are removed in teardown. The module under test takes the
// registry object + refDir directly, so nothing reads the real registry.json
// or the real reference/ addendums, and detect/stack.cjs is never imported
// (the stack is a plain object).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  composeAddendums,
  applyAddendums,
  classifyEntry,
  BLOCK_HEADER,
} = require('../../scripts/lib/mapper-spawn.cjs');

// ---------------------------------------------------------------------------
// Fixture: a reference dir with systems/ frameworks/ motion/ addendum files +
// an in-memory registry object pointing at them. Bodies are unique sentinels
// so the composed block can be asserted to contain each.
// ---------------------------------------------------------------------------

function mkFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hone-p54-compose-'));
  const refDir = path.join(root, 'reference');
  for (const sub of ['systems', 'frameworks', 'motion']) {
    fs.mkdirSync(path.join(refDir, sub), { recursive: true });
  }

  const files = {
    tailwind: 'reference/systems/tailwind.md',
    shadcn: 'reference/systems/shadcn.md',
    nextjs: 'reference/frameworks/nextjs.md',
    framerMotion: 'reference/motion/framer-motion.md',
    gsap: 'reference/motion/gsap.md',
  };
  const bodies = {
    tailwind: '<!-- vendor: Tailwind -->\n# Tailwind addendum\nSENTINEL_TAILWIND conventions.',
    shadcn: '<!-- vendor: shadcn -->\n# shadcn addendum\nSENTINEL_SHADCN conventions.',
    nextjs: '<!-- vendor: Next.js -->\n# Next.js addendum\nSENTINEL_NEXTJS conventions.',
    framerMotion: '<!-- vendor: Framer Motion -->\n# Framer Motion addendum\nSENTINEL_FRAMER conventions.',
    gsap: '<!-- vendor: GSAP -->\n# GSAP addendum\nSENTINEL_GSAP conventions.',
  };
  for (const key of Object.keys(files)) {
    fs.writeFileSync(path.join(root, files[key]), bodies[key], 'utf8');
  }

  // Registry mirrors the executor-F entry shape: stack-addendum entries with a
  // composes_into list. token-mapper composes the DS; motion-mapper composes
  // motion. We give the DS + framework + both motion entries composes_into
  // token-mapper so a single mapper can pull all three categories in one test.
  const registry = {
    version: 1,
    entries: [
      // A non-addendum entry must be ignored.
      { name: 'accessibility', path: 'reference/accessibility.md', type: 'heuristic' },
      {
        name: 'addendum-system-tailwind',
        path: files.tailwind,
        type: 'stack-addendum',
        phase: 54,
        composes_into: ['token-mapper', 'component-taxonomy-mapper'],
      },
      {
        name: 'addendum-system-shadcn',
        path: files.shadcn,
        type: 'stack-addendum',
        phase: 54,
        composes_into: ['token-mapper'],
      },
      {
        name: 'addendum-framework-nextjs',
        path: files.nextjs,
        type: 'stack-addendum',
        phase: 54,
        composes_into: ['token-mapper', 'component-taxonomy-mapper'],
      },
      {
        name: 'addendum-motion-framer-motion',
        path: files.framerMotion,
        type: 'stack-addendum',
        phase: 54,
        composes_into: ['token-mapper', 'motion-mapper'],
      },
      {
        name: 'addendum-motion-gsap',
        path: files.gsap,
        type: 'stack-addendum',
        phase: 54,
        composes_into: ['token-mapper', 'motion-mapper'],
      },
    ],
  };

  return { root, refDir, registry };
}

function rmFixture(root) {
  try {
    fs.rmSync(root, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
}

// ---------------------------------------------------------------------------

test('54-02: classifyEntry derives category from path dir + key from basename', () => {
  assert.deepEqual(
    classifyEntry({ name: 'addendum-system-tailwind', path: 'reference/systems/tailwind.md', type: 'stack-addendum' }),
    { category: 'system', key: 'tailwind' },
  );
  assert.deepEqual(
    classifyEntry({ name: 'x', path: 'reference/frameworks/nextjs.md', type: 'stack-addendum' }),
    { category: 'framework', key: 'nextjs' },
  );
  assert.deepEqual(
    classifyEntry({ name: 'x', path: 'reference/motion/framer-motion.md', type: 'stack-addendum' }),
    { category: 'motion', key: 'framer-motion' },
  );
  // Explicit kind + stack fields override the path inference.
  assert.deepEqual(
    classifyEntry({ name: 'x', path: 'whatever.md', kind: 'framework', stack: 'Remix' }),
    { category: 'framework', key: 'remix' },
  );
});

test('54-02: matching ds + framework + motion -> block carries all three, used=3, missing empty', () => {
  const { root, refDir, registry } = mkFixture();
  try {
    const stack = { ds: 'tailwind', framework: 'nextjs', motion_libs: ['framer-motion'] };
    const { block, used, missing } = composeAddendums('token-mapper', stack, { registry, refDir });

    assert.ok(block.startsWith(BLOCK_HEADER), 'block leads with the guidance header');
    assert.match(block, /SENTINEL_TAILWIND/, 'DS body present');
    assert.match(block, /SENTINEL_NEXTJS/, 'framework body present');
    assert.match(block, /SENTINEL_FRAMER/, 'motion body present');
    assert.match(block, /\n---\n/, 'bodies are separated by a horizontal rule');

    assert.equal(used.length, 3, 'three addendums used');
    assert.deepEqual(used, [
      'addendum-system-tailwind',
      'addendum-framework-nextjs',
      'addendum-motion-framer-motion',
    ], 'used names are in system -> framework -> motion order');
    assert.deepEqual(missing, [], 'nothing missing when all three match');
  } finally {
    rmFixture(root);
  }
});

test('54-02: composes_into scoping - motion-mapper only pulls its motion addendum', () => {
  const { root, refDir, registry } = mkFixture();
  try {
    // motion-mapper composes only the motion addendums; ds/framework entries
    // here do not list motion-mapper, so a ds-only stack yields nothing.
    const dsOnly = composeAddendums('motion-mapper', { ds: 'tailwind' }, { registry, refDir });
    assert.equal(dsOnly.block, '', 'no DS addendum composes into motion-mapper');
    assert.deepEqual(dsOnly.used, []);
    // A DS was detected but no addendum composes into THIS mapper for it, so it
    // is flagged missing: `missing` is the per-mapper coverage gap that drives
    // the fallback flag (executor F reads this).
    assert.deepEqual(dsOnly.missing, ['tailwind']);

    const withMotion = composeAddendums(
      'motion-mapper',
      { ds: 'tailwind', motion_libs: ['gsap'] },
      { registry, refDir },
    );
    assert.match(withMotion.block, /SENTINEL_GSAP/, 'motion body present for motion-mapper');
    assert.equal(withMotion.used.length, 1, 'only the motion addendum is pulled');
    assert.deepEqual(withMotion.used, ['addendum-motion-gsap']);
    // The detected DS still has no motion-mapper addendum -> stays flagged.
    assert.deepEqual(withMotion.missing, ['tailwind']);
  } finally {
    rmFixture(root);
  }
});

test('54-02: cap respected - cap=2 keeps system+framework, drops motion (a 4th candidate ignored)', () => {
  const { root, refDir, registry } = mkFixture();
  try {
    const stack = {
      ds: 'tailwind',
      framework: 'nextjs',
      // Two motion libs registered + detected; the cap means at most ONE motion
      // addendum could ever be added, and at cap=2 the motion category is
      // dropped entirely. This is the "extra/4th candidate ignored" path.
      motion_libs: ['framer-motion', 'gsap'],
    };
    const { block, used, missing } = composeAddendums('token-mapper', stack, { registry, refDir, cap: 2 });

    assert.equal(used.length, 2, 'cap=2 includes exactly two addendums');
    assert.deepEqual(used, ['addendum-system-tailwind', 'addendum-framework-nextjs']);
    assert.match(block, /SENTINEL_TAILWIND/);
    assert.match(block, /SENTINEL_NEXTJS/);
    assert.doesNotMatch(block, /SENTINEL_FRAMER/, 'motion dropped at cap=2');
    assert.doesNotMatch(block, /SENTINEL_GSAP/, 'second motion lib never reached');
    // The cap stops the fill before motion is considered, so motion is not
    // flagged missing (it was never evaluated).
    assert.deepEqual(missing, []);

    // Default cap (3): all three categories fill, but only the FIRST motion
    // lib's addendum is taken; the second (gsap) is the ignored extra.
    const full = composeAddendums('token-mapper', stack, { registry, refDir });
    assert.equal(full.used.length, 3, 'default cap fills 1 DS + 1 framework + 1 motion');
    assert.match(full.block, /SENTINEL_FRAMER/, 'leading motion lib wins');
    assert.doesNotMatch(full.block, /SENTINEL_GSAP/, 'second motion lib ignored under cap');
  } finally {
    rmFixture(root);
  }
});

test('54-02: no-match stack -> empty block + missing flagged', () => {
  const { root, refDir, registry } = mkFixture();
  try {
    const stack = { ds: 'bootstrap', framework: 'angular', motion_libs: ['anime'] };
    const { block, used, missing } = composeAddendums('token-mapper', stack, { registry, refDir });

    assert.equal(block, '', 'no registered addendum -> empty block');
    assert.deepEqual(used, [], 'nothing used');
    // Each detected-but-unmatched value is flagged, in category order.
    assert.deepEqual(missing, ['bootstrap', 'angular', 'anime']);
  } finally {
    rmFixture(root);
  }
});

test('54-02: registered entry but missing file -> treated as no coverage (missing flagged)', () => {
  const { root, refDir, registry } = mkFixture();
  try {
    // Delete the on-disk file for the DS addendum but keep the registry entry.
    fs.rmSync(path.join(root, 'reference', 'systems', 'tailwind.md'));
    const { block, used, missing } = composeAddendums(
      'token-mapper',
      { ds: 'tailwind' },
      { registry, refDir },
    );
    assert.equal(block, '', 'missing file -> no block');
    assert.deepEqual(used, []);
    assert.deepEqual(missing, ['tailwind'], 'unreadable addendum file counts as missing coverage');
  } finally {
    rmFixture(root);
  }
});

test('54-02: backward-compat - empty/null stack -> empty block, spec.prompt unchanged', () => {
  const { root, refDir, registry } = mkFixture();
  try {
    for (const stack of [null, undefined, {}, { ds: null, framework: null, motion_libs: [] }]) {
      const { block, used, missing } = composeAddendums('token-mapper', stack, { registry, refDir });
      assert.equal(block, '', `empty block for stack=${JSON.stringify(stack)}`);
      assert.deepEqual(used, []);
      assert.deepEqual(missing, []);
    }

    // applyAddendums must leave spec.prompt byte-for-byte unchanged when there
    // is nothing to inject.
    const BASE_PROMPT = 'You are token-mapper. Map the tokens.';
    const spec = { name: 'token-mapper', prompt: BASE_PROMPT };
    const res = applyAddendums(spec, null, { registry, refDir });
    assert.equal(spec.prompt, BASE_PROMPT, 'prompt unchanged on empty stack');
    assert.equal(res.block, '');
    assert.deepEqual(res.used, []);
  } finally {
    rmFixture(root);
  }
});

test('54-02: applyAddendums appends the block to spec.prompt when a match exists', () => {
  const { root, refDir, registry } = mkFixture();
  try {
    const BASE_PROMPT = 'You are token-mapper. Map the tokens.';
    const spec = { name: 'token-mapper', prompt: BASE_PROMPT };
    const stack = { ds: 'shadcn', framework: 'nextjs', motion_libs: ['framer-motion'] };

    const res = applyAddendums(spec, stack, { registry, refDir });

    assert.ok(spec.prompt.startsWith(BASE_PROMPT), 'base prompt preserved as a prefix');
    assert.ok(spec.prompt.length > BASE_PROMPT.length, 'prompt grew');
    assert.match(spec.prompt, new RegExp(BLOCK_HEADER), 'guidance header appended');
    assert.match(spec.prompt, /SENTINEL_SHADCN/);
    assert.match(spec.prompt, /SENTINEL_NEXTJS/);
    assert.match(spec.prompt, /SENTINEL_FRAMER/);
    assert.equal(res.used.length, 3);
    assert.deepEqual(res.missing, []);
  } finally {
    rmFixture(root);
  }
});

test('54-02: never throws on absent registry / refDir', () => {
  // No registry, no refDir, garbage cap: must degrade to an empty block.
  const a = composeAddendums('token-mapper', { ds: 'tailwind' }, {});
  assert.deepEqual(a, { block: '', used: [], missing: ['tailwind'] });

  const b = composeAddendums('token-mapper', { ds: 'tailwind' }, { registry: {}, cap: -1 });
  assert.equal(b.block, '');

  // applyAddendums on a malformed spec returns it unchanged with empty meta.
  const r = applyAddendums(null, { ds: 'tailwind' }, {});
  assert.equal(r.spec, null);
  assert.equal(r.block, '');
});
