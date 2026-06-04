'use strict';

// tests/converters-wave4.test.cjs — Phase 28.7 (Plan 28.7-07).
//
// Golden-fixture coverage for the Wave 4 converters:
//   scripts/lib/install/converters/{opencode,kilo,gemini}.cjs
//
// All three converters share a single source fixture
// (tests/fixtures/converters/source-sample.md) and the shared rewrite
// module (./shared.cjs). Per-runtime expected output is computed in-test
// rather than hand-rolled per-file: hand-rolled goldens would drift with
// every shared.cjs tweak. Instead, we assert invariants — what each
// runtime SHOULD or SHOULD NOT contain in its output.
//
// Wave 4 covers the "command-format" runtimes — those whose installer
// destSubpath is `command/<name>.md` (opencode + kilo) or
// `commands/gdd/<name>.md` (gemini), NOT a `skills/<name>/SKILL.md`
// directory. From the converter's perspective, the output is still a
// single markdown + YAML-frontmatter string; the destSubpath difference
// is handled by `runtime-artifact-layout.cjs#commandsKind`.
//
// Coverage:
//   - frontmatter preserved on all 3 (starts with `---\n`)
//   - opencode keeps `/gdd-` slash form in prose (no $gdd-, no /gdd:)
//   - opencode preserves Claude tool names inside fences (no tool map)
//   - opencode injects 'OpenCode adapter' header exactly once
//   - kilo keeps `/gdd-` slash form in prose (no $gdd-, no /gdd:)
//   - kilo preserves Claude tool names inside fences (no tool map)
//   - kilo injects 'Kilo adapter' header exactly once
//   - gemini keeps `/gdd-` slash form in prose (no $gdd-, no /gdd:)
//   - gemini rewrites Bash( → run_shell_command( inside fenced code
//   - gemini rewrites Read( → read_file( inside fenced code
//   - gemini rewrites Edit( → replace( inside fenced code
//   - gemini preserves prose mentions of Bash/Read (documentation untouched)
//   - gemini injects 'Gemini adapter' header exactly once
//   - all 3 inject their adapter header idempotently (no duplicate on re-convert)
//   - all 3 export `convert` as a function and return strings
//   - all 3 normalize name to gdd-<skill> (no gdd-gdd- double prefix)
//   - all 3 cite gsd-build per D-02; gemini also cites reference/gemini-tools.md
//   - GEMINI_TOOL_MAP is exported, frozen, and contains the Phase 21 mapping

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const opencode = require('../../scripts/lib/install/converters/opencode.cjs');
const kilo = require('../../scripts/lib/install/converters/kilo.cjs');
const gemini = require('../../scripts/lib/install/converters/gemini.cjs');

// ── Source fixture (loaded once) ──────────────────────────────────────────

const FIXTURE_PATH = path.join(
  __dirname,
  'fixtures',
  'converters',
  'source-sample.md'
);
const SOURCE = fs.readFileSync(FIXTURE_PATH, 'utf8');

const CONVERTERS = [
  { name: 'opencode', mod: opencode, display: 'OpenCode' },
  { name: 'kilo', mod: kilo, display: 'Kilo' },
  { name: 'gemini', mod: gemini, display: 'Gemini' },
];

// ── Loop-based shared invariants ──────────────────────────────────────────

for (const c of CONVERTERS) {
  test('converters-wave4: ' + c.name + ' exports convert as a function', () => {
    assert.equal(typeof c.mod.convert, 'function');
  });

  test('converters-wave4: ' + c.name + ' output starts with frontmatter ---', () => {
    const out = c.mod.convert(SOURCE, 'sample', { runtime: c.name });
    assert.equal(out.startsWith('---\n'), true);
  });

  test('converters-wave4: ' + c.name + ' frontmatter preserves description', () => {
    const out = c.mod.convert(SOURCE, 'sample', { runtime: c.name });
    assert.ok(
      out.includes('Sample skill exercising all converter rewrite paths'),
      c.name + ': description round-trips'
    );
  });

  test('converters-wave4: ' + c.name + ' normalizes name to gdd-<skill>', () => {
    const out = c.mod.convert(SOURCE, 'sample', { runtime: c.name });
    // Source already had `name: gdd-sample` — but rerunning the
    // converter must NOT yield `gdd-gdd-sample`.
    assert.equal(out.includes('gdd-gdd-'), false, c.name + ': no double prefix');
    assert.ok(/name:\s*"?gdd-sample"?/.test(out), c.name + ': name has gdd-sample');
  });

  test('converters-wave4: ' + c.name + ' injects exactly one adapter header', () => {
    const out = c.mod.convert(SOURCE, 'sample', { runtime: c.name });
    const re = new RegExp(c.display + ' adapter', 'g');
    const matches = out.match(re) || [];
    assert.equal(matches.length, 1, c.name + ': single ' + c.display + ' adapter');
  });

  test('converters-wave4: ' + c.name + ' adapter header idempotency', () => {
    const once = c.mod.convert(SOURCE, 'sample', { runtime: c.name });
    const twice = c.mod.convert(once, 'sample', { runtime: c.name });
    const re = new RegExp(c.display + ' adapter', 'g');
    const after = (twice.match(re) || []).length;
    assert.equal(after, 1, c.name + ': still one header after double-conversion');
  });

  test('converters-wave4: ' + c.name + ' returns a string', () => {
    const out = c.mod.convert(SOURCE, 'sample', { runtime: c.name });
    assert.equal(typeof out, 'string');
    assert.ok(out.length > 0);
  });

  test('converters-wave4: ' + c.name + ' handles minimal input', () => {
    const minimal = '---\nname: x\n---\nbody\n';
    const out = c.mod.convert(minimal, 'x', { runtime: c.name });
    assert.equal(typeof out, 'string');
    assert.ok(out.startsWith('---\n'), c.name + ': minimal input gets frontmatter');
    assert.ok(out.includes(c.display + ' adapter'));
  });

  test('converters-wave4: ' + c.name + ' handles no-frontmatter input', () => {
    const noFm = '# Header\n\nBody content with /gdd-explore reference.\n';
    const out = c.mod.convert(noFm, 'sample', { runtime: c.name });
    assert.equal(typeof out, 'string');
    assert.ok(out.startsWith('---\n'), c.name + ': frontmatter prepended');
    assert.ok(/name:\s*"?gdd-sample"?/.test(out), c.name + ': name set');
  });

  test('converters-wave4: ' + c.name + ' keeps /gdd-* slash form in prose', () => {
    const out = c.mod.convert(SOURCE, 'sample', { runtime: c.name });
    assert.ok(out.includes('/gdd-explore'), c.name + ': keeps /gdd-explore');
    assert.ok(out.includes('/gdd-debug'), c.name + ': keeps /gdd-debug');
    // Codex shell-var form must NOT leak into wave 4 output.
    assert.equal(
      out.includes('$gdd-'),
      false,
      c.name + ': does not emit $gdd-'
    );
  });
}

// ── OpenCode-specific invariants ──────────────────────────────────────────

test('converters-wave4: opencode preserves Claude tool names inside fences', () => {
  const out = opencode.convert(SOURCE, 'sample', { runtime: 'opencode' });
  assert.ok(out.includes('Bash(command='), 'opencode keeps Bash(');
  assert.ok(out.includes('Read(path='), 'opencode keeps Read(');
  assert.ok(out.includes('Edit(file='), 'opencode keeps Edit(');
  // Codex / gemini rewrites must NOT appear in opencode output.
  assert.equal(out.includes('shell(command='), false, 'opencode does not emit shell(');
  assert.equal(out.includes('run_shell_command('), false, 'opencode does not emit run_shell_command(');
  assert.equal(out.includes('read_file('), false, 'opencode does not emit read_file(');
});

test('converters-wave4: opencode injects OpenCode adapter header', () => {
  const out = opencode.convert(SOURCE, 'sample', { runtime: 'opencode' });
  assert.ok(out.includes('OpenCode adapter'));
});

// ── Kilo-specific invariants ──────────────────────────────────────────────

test('converters-wave4: kilo preserves Claude tool names inside fences', () => {
  const out = kilo.convert(SOURCE, 'sample', { runtime: 'kilo' });
  assert.ok(out.includes('Bash(command='), 'kilo keeps Bash(');
  assert.ok(out.includes('Read(path='), 'kilo keeps Read(');
  assert.ok(out.includes('Edit(file='), 'kilo keeps Edit(');
  // Codex / gemini rewrites must NOT appear in kilo output.
  assert.equal(out.includes('shell(command='), false, 'kilo does not emit shell(');
  assert.equal(out.includes('run_shell_command('), false, 'kilo does not emit run_shell_command(');
  assert.equal(out.includes('read_file('), false, 'kilo does not emit read_file(');
});

test('converters-wave4: kilo injects Kilo adapter header', () => {
  const out = kilo.convert(SOURCE, 'sample', { runtime: 'kilo' });
  assert.ok(out.includes('Kilo adapter'));
});

// ── Gemini-specific invariants ────────────────────────────────────────────

test('converters-wave4: gemini rewrites Bash(...) → run_shell_command(...) inside fences', () => {
  const out = gemini.convert(SOURCE, 'sample', { runtime: 'gemini' });
  assert.ok(
    out.includes('run_shell_command(command='),
    'gemini rewrites Bash(command=...)'
  );
  // No Bash( anywhere — including inside fences.
  assert.equal(/\bBash\(/.test(out), false, 'gemini strips Bash(');
});

test('converters-wave4: gemini rewrites Read(...) → read_file(...) inside fences', () => {
  const out = gemini.convert(SOURCE, 'sample', { runtime: 'gemini' });
  assert.ok(out.includes('read_file(path='), 'gemini rewrites Read(path=...)');
  assert.equal(/\bRead\(/.test(out), false, 'gemini strips Read(');
});

test('converters-wave4: gemini rewrites Edit(...) → replace(...) inside fences', () => {
  const out = gemini.convert(SOURCE, 'sample', { runtime: 'gemini' });
  assert.ok(out.includes('replace(file='), 'gemini rewrites Edit(file=...)');
  assert.equal(/\bEdit\(/.test(out), false, 'gemini strips Edit(');
});

test('converters-wave4: gemini rewrites Grep/Glob inside fences', () => {
  const out = gemini.convert(SOURCE, 'sample', { runtime: 'gemini' });
  assert.equal(/\bGrep\(/.test(out), false, 'gemini strips Grep(');
  assert.equal(/\bGlob\(/.test(out), false, 'gemini strips Glob(');
  assert.ok(out.includes('search_file_content(pattern='), 'gemini emits search_file_content(');
  assert.ok(out.includes('glob(pattern='), 'gemini emits glob(');
});

test('converters-wave4: gemini rewrites WebSearch → google_web_search inside fences', () => {
  const out = gemini.convert(SOURCE, 'sample', { runtime: 'gemini' });
  assert.ok(
    out.includes('google_web_search(query='),
    'gemini emits google_web_search(query=...)'
  );
  assert.equal(/\bWebSearch\(/.test(out), false, 'gemini strips WebSearch(');
});

test('converters-wave4: gemini rewrites WebFetch → web_fetch inside fences', () => {
  const out = gemini.convert(SOURCE, 'sample', { runtime: 'gemini' });
  assert.ok(
    out.includes('web_fetch(url='),
    'gemini emits web_fetch(url=...)'
  );
  assert.equal(/\bWebFetch\(/.test(out), false, 'gemini strips WebFetch(');
});

test('converters-wave4: gemini preserves prose mentions of Claude tool names', () => {
  // Source: "The Bash tool is the primary execution surface" (prose, no parens)
  // Source: "Bash tool and Read tool are mentioned here in prose only"
  // The gemini converter must NOT rewrite these — only the parenthesized
  // invocation form inside fences gets rewritten (D-06 invocation-only policy).
  const out = gemini.convert(SOURCE, 'sample', { runtime: 'gemini' });
  assert.ok(
    out.includes('The Bash tool'),
    'gemini preserves "The Bash tool" prose'
  );
  assert.ok(
    out.includes('Bash tool and Read tool are mentioned'),
    'gemini preserves "Bash tool and Read tool" prose'
  );
});

test('converters-wave4: gemini injects Gemini adapter header', () => {
  const out = gemini.convert(SOURCE, 'sample', { runtime: 'gemini' });
  assert.ok(out.includes('Gemini adapter'));
});

// ── GEMINI_TOOL_MAP structural invariants ────────────────────────────────

test('converters-wave4: gemini exports GEMINI_TOOL_MAP as frozen object', () => {
  assert.equal(typeof gemini.GEMINI_TOOL_MAP, 'object');
  assert.ok(gemini.GEMINI_TOOL_MAP !== null, 'GEMINI_TOOL_MAP non-null');
  assert.equal(Object.isFrozen(gemini.GEMINI_TOOL_MAP), true, 'GEMINI_TOOL_MAP frozen');
});

test('converters-wave4: gemini GEMINI_TOOL_MAP matches Phase 21 reference', () => {
  // Lock the Phase 21 reference/gemini-tools.md table — if Gemini ships
  // a vocabulary change, update the reference file FIRST, then this test.
  const expected = {
    Read: 'read_file',
    Write: 'write_file',
    Edit: 'replace',
    Bash: 'run_shell_command',
    Grep: 'search_file_content',
    Glob: 'glob',
    WebSearch: 'google_web_search',
    WebFetch: 'web_fetch',
  };
  for (const [k, v] of Object.entries(expected)) {
    assert.equal(
      gemini.GEMINI_TOOL_MAP[k],
      v,
      'GEMINI_TOOL_MAP.' + k + ' should be ' + v
    );
  }
  // Task intentionally absent (Phase 21 "Known gaps").
  assert.equal(gemini.GEMINI_TOOL_MAP.Task, undefined, 'Task intentionally absent');
});

// ── Per-file header citations (D-02 + D-06) ───────────────────────────────

test('converters-wave4: opencode + kilo + gemini cite gsd-build per D-02', () => {
  for (const c of CONVERTERS) {
    const src = fs.readFileSync(
      path.join(
        __dirname,
        '../..',
        'scripts',
        'lib',
        'install',
        'converters',
        c.name + '.cjs'
      ),
      'utf8'
    );
    assert.ok(
      src.includes('gsd-build') || src.includes('gsd-build/get-shit-done'),
      c.name + '.cjs: missing gsd-build citation (D-02)'
    );
  }
});

test('converters-wave4: gemini.cjs cites reference/gemini-tools.md per D-06', () => {
  const src = fs.readFileSync(
    path.join(
      __dirname,
      '../..',
      'scripts',
      'lib',
      'install',
      'converters',
      'gemini.cjs'
    ),
    'utf8'
  );
  assert.ok(
    src.includes('reference/gemini-tools.md'),
    'gemini.cjs must cite Phase 21 reference (D-06)'
  );
});

// ── Wave B completeness invariant — all 13 runtime converters + 2 Tier-2 ─

test('converters-wave4: Wave B complete — 13 runtime + 2 Tier-2 converter files exist', () => {
  const converterDir = path.join(
    __dirname,
    '../..',
    'scripts',
    'lib',
    'install',
    'converters'
  );
  const files = fs
    .readdirSync(converterDir)
    .filter((f) => f.endsWith('.cjs'));
  // 13 runtimes + shared.cjs + codex-plugin.cjs + cursor-marketplace.cjs = 16 .cjs files
  assert.equal(files.length, 16, 'expected 16 .cjs files (13 runtimes + shared.cjs + 2 Tier-2)');
  // Each of the 13 runtimes must have a converter file.
  const expectedRuntimes = [
    'cursor',
    'codex',
    'copilot',
    'antigravity',
    'windsurf',
    'augment',
    'trae',
    'qwen',
    'codebuddy',
    'cline',
    'opencode',
    'kilo',
    'gemini',
  ];
  for (const rt of expectedRuntimes) {
    assert.ok(
      files.includes(rt + '.cjs'),
      'missing converter file: ' + rt + '.cjs'
    );
  }
  // Tier-2 distribution-channel converters must be present.
  assert.ok(files.includes('codex-plugin.cjs'), 'codex-plugin.cjs (Tier-2) must exist');
  assert.ok(files.includes('cursor-marketplace.cjs'), 'cursor-marketplace.cjs (Tier-2) must exist');
  // Hermes intentionally absent.
  assert.equal(files.includes('hermes.cjs'), false, 'hermes.cjs must NOT exist');
  // Claude intentionally absent (passthrough handled by layout, no converter).
  assert.equal(files.includes('claude.cjs'), false, 'claude.cjs must NOT exist (passthrough)');
});
