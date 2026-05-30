'use strict';

// tests/converters-wave2.test.cjs — Phase 28.7 (Plan 28.7-05).
//
// Golden-fixture coverage for the Wave 2 converters:
//   scripts/lib/install/converters/{windsurf,augment,trae,qwen}.cjs
//
// All four converters share a single source fixture
// (tests/fixtures/converters/source-sample.md) and the shared rewrite
// module (./shared.cjs). Per-runtime expected output is computed in-test
// rather than hand-rolled per-file: hand-rolled goldens would drift with
// every shared.cjs tweak. Instead, we assert invariants — what each
// runtime SHOULD or SHOULD NOT contain in its output.
//
// Coverage:
//   - frontmatter preserved on all 4 (starts with `---\n`)
//   - all 4 keep `/gdd-` slash form in prose (none of them emit $gdd-)
//   - windsurf / trae / qwen preserve Claude tool names verbatim inside fences
//   - augment rewrites Bash( → launch-process( inside fenced code
//   - augment rewrites Edit( → str-replace-editor( inside fenced code
//   - augment preserves prose mentions of Bash/Read (documentation untouched)
//   - all 4 inject their adapter header exactly once (idempotency)
//   - all 4 are runnable on minimal input + no-frontmatter input
//   - per-file headers cite gsd-build origin per Phase 28.7 D-02 (NOTICE-equivalent)

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const windsurf = require('../../scripts/lib/install/converters/windsurf.cjs');
const augment = require('../../scripts/lib/install/converters/augment.cjs');
const trae = require('../../scripts/lib/install/converters/trae.cjs');
const qwen = require('../../scripts/lib/install/converters/qwen.cjs');

// ── Source fixture (loaded once) ──────────────────────────────────────────

const FIXTURE_PATH = path.join(
  __dirname,
  'fixtures',
  'converters',
  'source-sample.md'
);
const SOURCE = fs.readFileSync(FIXTURE_PATH, 'utf8');

const CONVERTERS = [
  { name: 'windsurf', mod: windsurf, display: 'Windsurf' },
  { name: 'augment', mod: augment, display: 'Augment' },
  { name: 'trae', mod: trae, display: 'Trae' },
  { name: 'qwen', mod: qwen, display: 'Qwen' },
];

// Claude-compatible (no tool-name rewrites) subset for the loop tests
// that assert tool-name passthrough. Augment is excluded because it
// rewrites Bash and Edit per AUGMENT_TOOL_MAP.
const CLAUDE_COMPAT = CONVERTERS.filter((c) => c.name !== 'augment');

// ── Loop-based shared invariants (all 4) ──────────────────────────────────

for (const c of CONVERTERS) {
  test('converters-wave2: ' + c.name + ' exports convert as a function', () => {
    assert.equal(typeof c.mod.convert, 'function');
  });

  test('converters-wave2: ' + c.name + ' output starts with frontmatter ---', () => {
    const out = c.mod.convert(SOURCE, 'sample', { runtime: c.name });
    assert.equal(out.startsWith('---\n'), true);
  });

  test('converters-wave2: ' + c.name + ' frontmatter preserves description', () => {
    const out = c.mod.convert(SOURCE, 'sample', { runtime: c.name });
    assert.ok(
      out.includes('Sample skill exercising all converter rewrite paths'),
      c.name + ': description round-trips'
    );
  });

  test('converters-wave2: ' + c.name + ' normalizes name to gdd-<skill>', () => {
    const out = c.mod.convert(SOURCE, 'sample', { runtime: c.name });
    assert.equal(out.includes('gdd-gdd-'), false, c.name + ': no double prefix');
    assert.ok(/name:\s*"?gdd-sample"?/.test(out), c.name + ': name has gdd-sample');
  });

  test('converters-wave2: ' + c.name + ' injects exactly one adapter header', () => {
    const out = c.mod.convert(SOURCE, 'sample', { runtime: c.name });
    const re = new RegExp(c.display + ' adapter', 'g');
    const matches = out.match(re) || [];
    assert.equal(matches.length, 1, c.name + ': single ' + c.display + ' adapter');
  });

  test('converters-wave2: ' + c.name + ' adapter header idempotency', () => {
    const once = c.mod.convert(SOURCE, 'sample', { runtime: c.name });
    const twice = c.mod.convert(once, 'sample', { runtime: c.name });
    const re = new RegExp(c.display + ' adapter', 'g');
    const after = (twice.match(re) || []).length;
    assert.equal(after, 1, c.name + ': still one header after double-conversion');
  });

  test('converters-wave2: ' + c.name + ' returns a non-empty string', () => {
    const out = c.mod.convert(SOURCE, 'sample', { runtime: c.name });
    assert.equal(typeof out, 'string');
    assert.ok(out.length > 0);
  });

  test('converters-wave2: ' + c.name + ' handles minimal input', () => {
    const minimal = '---\nname: x\n---\nbody\n';
    const out = c.mod.convert(minimal, 'x', { runtime: c.name });
    assert.equal(typeof out, 'string');
    assert.ok(out.startsWith('---\n'), c.name + ': minimal input gets frontmatter');
    assert.ok(out.includes(c.display + ' adapter'));
  });

  test('converters-wave2: ' + c.name + ' handles no-frontmatter input', () => {
    const noFm = '# Header\n\nBody content with /gdd-explore reference.\n';
    const out = c.mod.convert(noFm, 'sample', { runtime: c.name });
    assert.equal(typeof out, 'string');
    assert.ok(out.startsWith('---\n'), c.name + ': frontmatter prepended');
    assert.ok(/name:\s*"?gdd-sample"?/.test(out), c.name + ': name set');
  });

  test('converters-wave2: ' + c.name + ' keeps /gdd-* slash form in prose', () => {
    const out = c.mod.convert(SOURCE, 'sample', { runtime: c.name });
    assert.ok(out.includes('/gdd-explore'), c.name + ': keeps /gdd-explore');
    assert.ok(out.includes('/gdd-debug'), c.name + ': keeps /gdd-debug');
    assert.equal(out.includes('$gdd-'), false, c.name + ': does not emit codex $gdd-');
  });
}

// ── Claude-compat subset (windsurf, trae, qwen): tool-name passthrough ────

for (const c of CLAUDE_COMPAT) {
  test('converters-wave2: ' + c.name + ' preserves Claude tool names inside fences', () => {
    const out = c.mod.convert(SOURCE, 'sample', { runtime: c.name });
    assert.ok(out.includes('Bash(command='), c.name + ' keeps Bash(');
    assert.ok(out.includes('Read(path='), c.name + ' keeps Read(');
    assert.ok(out.includes('Edit(file='), c.name + ' keeps Edit(');
    // Augment-specific rewrites must NOT appear in claude-compat output.
    assert.equal(
      out.includes('launch-process('),
      false,
      c.name + ' does not emit launch-process('
    );
    assert.equal(
      out.includes('str-replace-editor('),
      false,
      c.name + ' does not emit str-replace-editor('
    );
    // Codex-only rewrites must NOT appear either.
    assert.equal(
      out.includes('shell(command='),
      false,
      c.name + ' does not emit codex shell('
    );
  });
}

// ── Augment-specific invariants ───────────────────────────────────────────

test('converters-wave2: augment rewrites Bash( → launch-process( inside fenced code', () => {
  const out = augment.convert(SOURCE, 'sample', { runtime: 'augment' });
  assert.ok(
    out.includes('launch-process(command='),
    'augment rewrites Bash(command=...)'
  );
  assert.equal(/\bBash\(/.test(out), false, 'augment strips Bash(');
});

test('converters-wave2: augment rewrites Edit( → str-replace-editor( inside fenced code', () => {
  const out = augment.convert(SOURCE, 'sample', { runtime: 'augment' });
  assert.ok(
    out.includes('str-replace-editor(file='),
    'augment rewrites Edit(file=...)'
  );
  assert.equal(/\bEdit\(/.test(out), false, 'augment strips Edit(');
});

test('converters-wave2: augment preserves Read/Write/Grep/Glob inside fences', () => {
  // AUGMENT_TOOL_MAP only covers Bash and Edit; the rest pass through.
  const out = augment.convert(SOURCE, 'sample', { runtime: 'augment' });
  assert.ok(out.includes('Read(path='), 'augment keeps Read(');
  assert.ok(out.includes('Grep(pattern='), 'augment keeps Grep(');
  assert.ok(out.includes('Glob(pattern='), 'augment keeps Glob(');
});

test('converters-wave2: augment preserves prose mentions of Bash/Edit', () => {
  // The fixture contains "The Bash tool is the primary execution surface"
  // and "Bash tool and Read tool are mentioned here in prose only".
  // rewriteCodeFenceTools only rewrites inside fenced code blocks; prose
  // documentation about tool names must remain readable.
  const out = augment.convert(SOURCE, 'sample', { runtime: 'augment' });
  assert.ok(
    out.includes('The Bash tool'),
    'augment preserves "The Bash tool" prose'
  );
  assert.ok(
    out.includes('Bash tool and Read tool are mentioned'),
    'augment preserves "Bash tool and Read tool" prose'
  );
});

test('converters-wave2: augment injects Augment adapter header exactly once', () => {
  const out = augment.convert(SOURCE, 'sample', { runtime: 'augment' });
  const matches = out.match(/Augment adapter/g) || [];
  assert.equal(matches.length, 1, 'augment header appears exactly once');
});

test('converters-wave2: augment exports frozen AUGMENT_TOOL_MAP with documented entries', () => {
  assert.equal(typeof augment.AUGMENT_TOOL_MAP, 'object');
  assert.equal(augment.AUGMENT_TOOL_MAP.Bash, 'launch-process');
  assert.equal(augment.AUGMENT_TOOL_MAP.Edit, 'str-replace-editor');
  // Read/Write/Grep/Glob explicitly NOT in the map — Augment recognizes
  // them natively per the per-file header docs.
  assert.equal(augment.AUGMENT_TOOL_MAP.Read, undefined);
  assert.equal(augment.AUGMENT_TOOL_MAP.Write, undefined);
  assert.equal(Object.isFrozen(augment.AUGMENT_TOOL_MAP), true);
});

// ── Windsurf-specific assertion ───────────────────────────────────────────

test('converters-wave2: windsurf injects Windsurf adapter header', () => {
  const out = windsurf.convert(SOURCE, 'sample', { runtime: 'windsurf' });
  assert.ok(out.includes('Windsurf adapter'));
});

// ── Trae-specific assertion ───────────────────────────────────────────────

test('converters-wave2: trae injects Trae adapter header', () => {
  const out = trae.convert(SOURCE, 'sample', { runtime: 'trae' });
  assert.ok(out.includes('Trae adapter'));
});

// ── Qwen-specific assertion ───────────────────────────────────────────────

test('converters-wave2: qwen injects Qwen adapter header', () => {
  const out = qwen.convert(SOURCE, 'sample', { runtime: 'qwen' });
  assert.ok(out.includes('Qwen adapter'));
});

// ── Per-file header attribution check (Phase 28.7 D-02) ───────────────────

test('converters-wave2: all 4 Wave 2 converter files cite gsd-build (D-02 NOTICE-equivalent)', () => {
  const dir = path.join(__dirname, '../..', 'scripts', 'lib', 'install', 'converters');
  const files = ['windsurf.cjs', 'augment.cjs', 'trae.cjs', 'qwen.cjs'];
  for (const file of files) {
    const body = fs.readFileSync(path.join(dir, file), 'utf8');
    assert.ok(
      /gsd-build/i.test(body),
      file + ' must cite gsd-build per Phase 28.7 D-02'
    );
    assert.ok(
      body.startsWith("'use strict';"),
      file + ' must start with strict-mode pragma'
    );
  }
});

// ── Per-runtime output stability (length + frontmatter shape) ─────────────
//
// Per plan 28.7-05 deliverables: "Per-runtime output assertion: each
// converter's output is byte-identical to its expected golden fixture
// (or at minimum: same frontmatter + same skill body length within
// tolerance)". We use the at-minimum form because hand-rolled byte
// goldens would drift with every shared.cjs tweak (see top-of-file
// docstring). Tolerance: each runtime's output length within ±5% of
// every other Claude-compat runtime's output (they should be near-
// identical; only the adapter-display name differs).

test('converters-wave2: Claude-compat outputs have near-identical length', () => {
  const lens = CLAUDE_COMPAT.map((c) => ({
    name: c.name,
    len: c.mod.convert(SOURCE, 'sample', { runtime: c.name }).length,
  }));
  const minLen = Math.min(...lens.map((x) => x.len));
  const maxLen = Math.max(...lens.map((x) => x.len));
  const spread = (maxLen - minLen) / minLen;
  assert.ok(
    spread < 0.05,
    'claude-compat outputs spread ' + (spread * 100).toFixed(2) + '% > 5% — ' +
      JSON.stringify(lens)
  );
});

test('converters-wave2: augment output is slightly longer than claude-compat (tool-name rewrite)', () => {
  // launch-process / str-replace-editor are longer than Bash / Edit, so
  // augment's output should be longer than e.g. trae's. This locks the
  // expected size relationship between converters.
  const aug = augment.convert(SOURCE, 'sample', { runtime: 'augment' }).length;
  const tra = trae.convert(SOURCE, 'sample', { runtime: 'trae' }).length;
  // Augment-display ("Augment") is 1 char shorter than "Windsurf" or
  // "Antigravity", but the tool-map rewrite adds 24+ chars per occurrence
  // (Bash→launch-process gains 9 chars; Edit→str-replace-editor gains 14).
  // Net effect: augment output > trae output.
  assert.ok(
    aug > tra,
    'augment output ' + aug + ' should exceed trae output ' + tra
  );
});
