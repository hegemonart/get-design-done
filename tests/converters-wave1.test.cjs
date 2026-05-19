'use strict';

// tests/converters-wave1.test.cjs — Phase 28.7 (Plan 28.7-04).
//
// Golden-fixture coverage for the Wave 1 converters:
//   scripts/lib/install/converters/{cursor,codex,copilot,antigravity}.cjs
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
//   - cursor / copilot / antigravity keep `/gdd-` slash form unchanged
//   - codex rewrites `/gdd-explore` → `$gdd-explore` in PROSE
//   - codex rewrites tool names ONLY inside fenced code blocks
//   - codex preserves prose Bash/Read mentions (documentation untouched)
//   - all 4 inject their adapter header exactly once (idempotency)
//   - all 4 are runnable on minimal input + no-frontmatter input
//   - codex CODEX_TOOL_MAP applied: Read→read_file, Bash→shell,
//     Edit/Write→apply_patch, Grep/Glob→shell, WebSearch→web_search,
//     WebFetch→shell, Task untouched
//   - per-file headers cite gsd-build origin per Phase 28.7 D-02 (NOTICE-equivalent)

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const cursor = require('../scripts/lib/install/converters/cursor.cjs');
const codex = require('../scripts/lib/install/converters/codex.cjs');
const copilot = require('../scripts/lib/install/converters/copilot.cjs');
const antigravity = require('../scripts/lib/install/converters/antigravity.cjs');
const shared = require('../scripts/lib/install/converters/shared.cjs');

// ── Source fixture (loaded once) ──────────────────────────────────────────

const FIXTURE_PATH = path.join(
  __dirname,
  'fixtures',
  'converters',
  'source-sample.md'
);
const SOURCE = fs.readFileSync(FIXTURE_PATH, 'utf8');

const CONVERTERS = [
  { name: 'cursor', mod: cursor, display: 'Cursor' },
  { name: 'codex', mod: codex, display: 'Codex' },
  { name: 'copilot', mod: copilot, display: 'Copilot' },
  { name: 'antigravity', mod: antigravity, display: 'Antigravity' },
];

// ── Loop-based shared invariants ──────────────────────────────────────────

for (const c of CONVERTERS) {
  test('converters-wave1: ' + c.name + ' exports convert as a function', () => {
    assert.equal(typeof c.mod.convert, 'function');
  });

  test('converters-wave1: ' + c.name + ' output starts with frontmatter ---', () => {
    const out = c.mod.convert(SOURCE, 'sample', { runtime: c.name });
    assert.equal(out.startsWith('---\n'), true);
  });

  test('converters-wave1: ' + c.name + ' frontmatter preserves description', () => {
    const out = c.mod.convert(SOURCE, 'sample', { runtime: c.name });
    assert.ok(
      out.includes('Sample skill exercising all converter rewrite paths'),
      c.name + ': description round-trips'
    );
  });

  test('converters-wave1: ' + c.name + ' normalizes name to gdd-<skill>', () => {
    const out = c.mod.convert(SOURCE, 'sample', { runtime: c.name });
    // Source already had `name: gdd-sample` — but rerunning the
    // converter must NOT yield `gdd-gdd-sample`.
    assert.equal(out.includes('gdd-gdd-'), false, c.name + ': no double prefix');
    // name should reference gdd-sample.
    assert.ok(/name:\s*"?gdd-sample"?/.test(out), c.name + ': name has gdd-sample');
  });

  test('converters-wave1: ' + c.name + ' injects exactly one adapter header', () => {
    const out = c.mod.convert(SOURCE, 'sample', { runtime: c.name });
    const re = new RegExp(c.display + ' adapter', 'g');
    const matches = out.match(re) || [];
    assert.equal(matches.length, 1, c.name + ': single ' + c.display + ' adapter');
  });

  test('converters-wave1: ' + c.name + ' adapter header idempotency', () => {
    const once = c.mod.convert(SOURCE, 'sample', { runtime: c.name });
    const twice = c.mod.convert(once, 'sample', { runtime: c.name });
    const re = new RegExp(c.display + ' adapter', 'g');
    const after = (twice.match(re) || []).length;
    assert.equal(after, 1, c.name + ': still one header after double-conversion');
  });

  test('converters-wave1: ' + c.name + ' returns a string', () => {
    const out = c.mod.convert(SOURCE, 'sample', { runtime: c.name });
    assert.equal(typeof out, 'string');
    assert.ok(out.length > 0);
  });

  test('converters-wave1: ' + c.name + ' handles minimal input', () => {
    const minimal = '---\nname: x\n---\nbody\n';
    const out = c.mod.convert(minimal, 'x', { runtime: c.name });
    assert.equal(typeof out, 'string');
    assert.ok(out.startsWith('---\n'), c.name + ': minimal input gets frontmatter');
    assert.ok(out.includes(c.display + ' adapter'));
  });

  test('converters-wave1: ' + c.name + ' handles no-frontmatter input', () => {
    const noFm = '# Header\n\nBody content with /gdd-explore reference.\n';
    const out = c.mod.convert(noFm, 'sample', { runtime: c.name });
    assert.equal(typeof out, 'string');
    // buildFrontmatter prepends a minimal frontmatter when none exists.
    assert.ok(out.startsWith('---\n'), c.name + ': frontmatter prepended');
    assert.ok(/name:\s*"?gdd-sample"?/.test(out), c.name + ': name set');
  });
}

// ── Cursor-specific invariants ────────────────────────────────────────────

test('converters-wave1: cursor preserves /gdd-* slash form in prose', () => {
  const out = cursor.convert(SOURCE, 'sample', { runtime: 'cursor' });
  assert.ok(out.includes('/gdd-explore'), 'cursor keeps /gdd-explore');
  assert.ok(out.includes('/gdd-debug'), 'cursor keeps /gdd-debug');
  // Codex shell-var form must NOT leak into cursor output.
  assert.equal(out.includes('$gdd-'), false, 'cursor does not emit $gdd-');
});

test('converters-wave1: cursor preserves Claude tool names inside fences', () => {
  const out = cursor.convert(SOURCE, 'sample', { runtime: 'cursor' });
  assert.ok(out.includes('Bash(command='), 'cursor keeps Bash(');
  assert.ok(out.includes('Read(path='), 'cursor keeps Read(');
  assert.ok(out.includes('Edit(file='), 'cursor keeps Edit(');
  // Codex-only rewrites must NOT appear in cursor output.
  assert.equal(out.includes('shell(command='), false, 'cursor does not emit shell(');
});

// ── Codex-specific invariants ─────────────────────────────────────────────

test('converters-wave1: codex rewrites /gdd-explore → $gdd-explore in prose', () => {
  const out = codex.convert(SOURCE, 'sample', { runtime: 'codex' });
  assert.ok(out.includes('$gdd-explore'), 'codex emits $gdd-explore');
  assert.ok(out.includes('$gdd-debug'), 'codex emits $gdd-debug');
  assert.equal(out.includes('/gdd-explore'), false, 'codex strips /gdd-explore');
  assert.equal(out.includes('/gdd-debug'), false, 'codex strips /gdd-debug');
});

test('converters-wave1: codex rewrites Bash( → shell( inside fenced code', () => {
  const out = codex.convert(SOURCE, 'sample', { runtime: 'codex' });
  assert.ok(out.includes('shell(command='), 'codex rewrites Bash(command=...)');
  // No Bash( anywhere — including inside fences.
  assert.equal(/\bBash\(/.test(out), false, 'codex strips Bash(');
});

test('converters-wave1: codex rewrites Read( → read_file( inside fenced code', () => {
  const out = codex.convert(SOURCE, 'sample', { runtime: 'codex' });
  assert.ok(out.includes('read_file(path='), 'codex rewrites Read(path=...)');
  assert.equal(/\bRead\(/.test(out), false, 'codex strips Read(');
});

test('converters-wave1: codex rewrites Edit/Write → apply_patch inside fenced code', () => {
  const out = codex.convert(SOURCE, 'sample', { runtime: 'codex' });
  assert.ok(out.includes('apply_patch(file='), 'codex rewrites Edit(file=...)');
  assert.equal(/\bEdit\(/.test(out), false, 'codex strips Edit(');
  assert.equal(/\bWrite\(/.test(out), false, 'codex strips Write(');
});

test('converters-wave1: codex rewrites Grep/Glob → shell inside fenced code', () => {
  const out = codex.convert(SOURCE, 'sample', { runtime: 'codex' });
  assert.equal(/\bGrep\(/.test(out), false, 'codex strips Grep(');
  assert.equal(/\bGlob\(/.test(out), false, 'codex strips Glob(');
});

test('converters-wave1: codex rewrites WebSearch → web_search inside fenced code', () => {
  const out = codex.convert(SOURCE, 'sample', { runtime: 'codex' });
  assert.ok(out.includes('web_search(query='), 'codex emits web_search(query=...)');
  assert.equal(/\bWebSearch\(/.test(out), false, 'codex strips WebSearch(');
});

test('converters-wave1: codex rewrites WebFetch → shell inside fenced code', () => {
  const out = codex.convert(SOURCE, 'sample', { runtime: 'codex' });
  assert.equal(/\bWebFetch\(/.test(out), false, 'codex strips WebFetch(');
});

test('converters-wave1: codex preserves prose mentions of Claude tool names', () => {
  // Source: "The Bash tool is the primary execution surface" (prose, no parens)
  // Source: "Bash tool and Read tool are mentioned here in prose only"
  // The codex converter must NOT rewrite these — only the parenthesized
  // invocation form inside fences gets rewritten.
  const out = codex.convert(SOURCE, 'sample', { runtime: 'codex' });
  assert.ok(
    out.includes('The Bash tool'),
    'codex preserves "The Bash tool" prose'
  );
  assert.ok(
    out.includes('Bash tool and Read tool are mentioned'),
    'codex preserves "Bash tool and Read tool" prose'
  );
});

test('converters-wave1: codex injects Codex adapter header', () => {
  const out = codex.convert(SOURCE, 'sample', { runtime: 'codex' });
  assert.ok(out.includes('Codex adapter'));
});

// ── Copilot-specific invariants ───────────────────────────────────────────

test('converters-wave1: copilot preserves Claude tool names (no rewrites)', () => {
  const out = copilot.convert(SOURCE, 'sample', { runtime: 'copilot' });
  assert.ok(out.includes('Bash(command='));
  assert.ok(out.includes('Read(path='));
  assert.equal(out.includes('shell(command='), false);
});

test('converters-wave1: copilot keeps /gdd-* slash form in prose', () => {
  const out = copilot.convert(SOURCE, 'sample', { runtime: 'copilot' });
  assert.ok(out.includes('/gdd-explore'));
  assert.equal(out.includes('$gdd-'), false);
});

test('converters-wave1: copilot injects Copilot adapter header', () => {
  const out = copilot.convert(SOURCE, 'sample', { runtime: 'copilot' });
  assert.ok(out.includes('Copilot adapter'));
});

// ── Antigravity-specific invariants ───────────────────────────────────────

test('converters-wave1: antigravity preserves Claude tool names', () => {
  const out = antigravity.convert(SOURCE, 'sample', { runtime: 'antigravity' });
  assert.ok(out.includes('Bash(command='));
  assert.ok(out.includes('Read(path='));
  assert.equal(out.includes('shell(command='), false);
});

test('converters-wave1: antigravity keeps /gdd-* slash form in prose', () => {
  const out = antigravity.convert(SOURCE, 'sample', { runtime: 'antigravity' });
  assert.ok(out.includes('/gdd-explore'));
  assert.equal(out.includes('$gdd-'), false);
});

test('converters-wave1: antigravity injects Antigravity adapter header', () => {
  const out = antigravity.convert(SOURCE, 'sample', { runtime: 'antigravity' });
  assert.ok(out.includes('Antigravity adapter'));
});

// ── Shared module sanity ──────────────────────────────────────────────────

test('converters-wave1: shared exports CODEX_TOOL_MAP with Phase-21 entries', () => {
  assert.equal(shared.CODEX_TOOL_MAP.Read, 'read_file');
  assert.equal(shared.CODEX_TOOL_MAP.Write, 'apply_patch');
  assert.equal(shared.CODEX_TOOL_MAP.Edit, 'apply_patch');
  assert.equal(shared.CODEX_TOOL_MAP.Bash, 'shell');
  assert.equal(shared.CODEX_TOOL_MAP.Grep, 'shell');
  assert.equal(shared.CODEX_TOOL_MAP.Glob, 'shell');
  assert.equal(shared.CODEX_TOOL_MAP.WebSearch, 'web_search');
  assert.equal(shared.CODEX_TOOL_MAP.WebFetch, 'shell');
  // Task is absent — Phase 21 "Known gaps"
  assert.equal(shared.CODEX_TOOL_MAP.Task, undefined);
});

test('converters-wave1: shared.CODEX_TOOL_MAP is frozen', () => {
  assert.equal(Object.isFrozen(shared.CODEX_TOOL_MAP), true);
});

// ── Per-file header attribution check (Phase 28.7 D-02) ───────────────────

test('converters-wave1: all 5 converter files cite gsd-build (D-02 NOTICE-equivalent)', () => {
  const dir = path.join(__dirname, '..', 'scripts', 'lib', 'install', 'converters');
  const files = ['shared.cjs', 'cursor.cjs', 'codex.cjs', 'copilot.cjs', 'antigravity.cjs'];
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
