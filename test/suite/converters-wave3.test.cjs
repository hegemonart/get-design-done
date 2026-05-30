'use strict';

// tests/converters-wave3.test.cjs — Phase 28.7 (Plan 28.7-06).
//
// Golden-fixture coverage for the Wave 3 converters:
//   scripts/lib/install/converters/{codebuddy,cline}.cjs
//
// Wave 3 is mixed:
//   - codebuddy.cjs follows the uniform skills/<name>/SKILL.md pattern
//     (same as Wave 1 cursor / Wave 2 windsurf etc.). It produces a
//     Claude-shape SKILL.md with frontmatter + body + adapter header.
//   - cline.cjs is the SPECIAL CASE per D-09. It does NOT produce a
//     SKILL.md file — instead `convert()` returns a rule-block fragment
//     (markdown only, no YAML frontmatter, no adapter HTML comment),
//     and `buildClinerulesFile()` assembles many such blocks into a
//     single `.clinerules` file.
//
// Hermes is OUT of scope per D-10 — this file includes a guard test
// asserting `scripts/lib/install/converters/hermes.cjs` does NOT exist.
// If a future plan adds hermes back, that test will fail loudly and
// force a deliberate D-10 reconsideration.
//
// Coverage:
//   Codebuddy (uniform):
//     - convert is a function, output starts with `---\n`
//     - frontmatter description preserved
//     - name normalized to `gdd-sample` (no double prefix)
//     - exactly one `CodeBuddy adapter` header, idempotent
//     - Claude tool names preserved inside fenced code
//     - /gdd-* slash form preserved in prose (no $gdd-)
//
//   Cline (special-case):
//     - convert returns a rule-block starting with `## gdd-<name>`
//     - convert does NOT emit YAML frontmatter (no leading `---`)
//     - convert does NOT emit adapter HTML comment (`<!-- gdd: ... adapter -->`)
//     - description from source frontmatter included in the block
//     - /gdd-* slash form preserved in the block body (cline = Claude-shape)
//     - convert normalizes the skill name (strips gdd-/gsd- prefix to prevent double)
//     - buildClinerulesFile starts with `# get-design-done rules`
//     - buildClinerulesFile separates blocks with a blank line
//     - buildClinerulesFile assembles multiple blocks correctly
//     - buildClinerulesFile handles empty / null input (header-only file)
//     - destPath convention: installer writes the assembled file to
//       `.clinerules` (assertion held implicitly — there is no skills/
//       dir output from cline)
//
//   D-10 guard:
//     - `scripts/lib/install/converters/hermes.cjs` does NOT exist
//
//   D-02 attribution check:
//     - codebuddy.cjs and cline.cjs both cite gsd-build in per-file header

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const codebuddy = require('../../scripts/lib/install/converters/codebuddy.cjs');
const cline = require('../../scripts/lib/install/converters/cline.cjs');

// ── Source fixture (loaded once) ──────────────────────────────────────────

const FIXTURE_PATH = path.join(
  __dirname,
  'fixtures',
  'converters',
  'source-sample.md'
);
const SOURCE = fs.readFileSync(FIXTURE_PATH, 'utf8');

// ── Codebuddy — uniform converter (mirrors Wave 1/2 invariants) ───────────

test('converters-wave3: codebuddy exports convert as a function', () => {
  assert.equal(typeof codebuddy.convert, 'function');
});

test('converters-wave3: codebuddy output starts with frontmatter ---', () => {
  const out = codebuddy.convert(SOURCE, 'sample', { runtime: 'codebuddy' });
  assert.equal(out.startsWith('---\n'), true);
});

test('converters-wave3: codebuddy preserves source description in frontmatter', () => {
  const out = codebuddy.convert(SOURCE, 'sample', { runtime: 'codebuddy' });
  assert.ok(
    out.includes('Sample skill exercising all converter rewrite paths'),
    'codebuddy: description round-trips'
  );
});

test('converters-wave3: codebuddy normalizes name to gdd-<skill>', () => {
  const out = codebuddy.convert(SOURCE, 'sample', { runtime: 'codebuddy' });
  assert.equal(out.includes('gdd-gdd-'), false, 'codebuddy: no double prefix');
  assert.ok(
    /name:\s*"?gdd-sample"?/.test(out),
    'codebuddy: name has gdd-sample'
  );
});

test('converters-wave3: codebuddy injects exactly one CodeBuddy adapter header', () => {
  const out = codebuddy.convert(SOURCE, 'sample', { runtime: 'codebuddy' });
  const matches = out.match(/CodeBuddy adapter/g) || [];
  assert.equal(matches.length, 1, 'codebuddy: single CodeBuddy adapter');
});

test('converters-wave3: codebuddy adapter header idempotency', () => {
  const once = codebuddy.convert(SOURCE, 'sample', { runtime: 'codebuddy' });
  const twice = codebuddy.convert(once, 'sample', { runtime: 'codebuddy' });
  const after = (twice.match(/CodeBuddy adapter/g) || []).length;
  assert.equal(after, 1, 'codebuddy: still one header after double-conversion');
});

test('converters-wave3: codebuddy preserves Claude tool names inside fences', () => {
  const out = codebuddy.convert(SOURCE, 'sample', { runtime: 'codebuddy' });
  assert.ok(out.includes('Bash(command='), 'codebuddy keeps Bash(');
  assert.ok(out.includes('Read(path='), 'codebuddy keeps Read(');
  assert.ok(out.includes('Edit(file='), 'codebuddy keeps Edit(');
  // Codex-only / Augment-only rewrites must NOT appear in codebuddy output.
  assert.equal(
    out.includes('shell(command='),
    false,
    'codebuddy does not emit codex shell('
  );
  assert.equal(
    out.includes('launch-process('),
    false,
    'codebuddy does not emit augment launch-process('
  );
});

test('converters-wave3: codebuddy keeps /gdd-* slash form in prose', () => {
  const out = codebuddy.convert(SOURCE, 'sample', { runtime: 'codebuddy' });
  assert.ok(out.includes('/gdd-explore'), 'codebuddy keeps /gdd-explore');
  assert.ok(out.includes('/gdd-debug'), 'codebuddy keeps /gdd-debug');
  assert.equal(out.includes('$gdd-'), false, 'codebuddy does not emit $gdd-');
});

// ── Cline — special-case rule-block converter (D-09) ──────────────────────

test('converters-wave3: cline exports convert + buildClinerulesFile as functions', () => {
  assert.equal(typeof cline.convert, 'function');
  assert.equal(typeof cline.buildClinerulesFile, 'function');
});

test('converters-wave3: cline convert returns rule-block starting with ## gdd-<name>', () => {
  const block = cline.convert(SOURCE, 'sample', { runtime: 'cline' });
  assert.equal(typeof block, 'string');
  assert.ok(
    block.startsWith('## gdd-sample'),
    'cline block starts with `## gdd-sample`; got: ' + block.slice(0, 80)
  );
});

test('converters-wave3: cline convert does NOT emit YAML frontmatter', () => {
  const block = cline.convert(SOURCE, 'sample', { runtime: 'cline' });
  // No leading `---\n` — rules are markdown, not SKILL.md.
  assert.equal(
    block.startsWith('---\n'),
    false,
    'cline block must NOT start with YAML frontmatter'
  );
  // And no embedded `---\n` frontmatter block anywhere (the source had
  // one, but the converter strips it).
  assert.equal(
    /^---\r?\n/m.test(block),
    false,
    'cline block contains no YAML frontmatter delimiters'
  );
});

test('converters-wave3: cline convert does NOT emit adapter HTML comment', () => {
  // The uniform converters (cursor/codebuddy/etc.) inject
  // `<!-- gdd: auto-generated from Claude SKILL.md. <Display> adapter -->`.
  // Cline rules are pure markdown — no HTML comment.
  const block = cline.convert(SOURCE, 'sample', { runtime: 'cline' });
  assert.equal(
    block.includes('<!-- gdd:'),
    false,
    'cline block must NOT include gdd: HTML comment'
  );
  assert.equal(
    block.includes('Cline adapter'),
    false,
    'cline block must NOT include "Cline adapter" marker'
  );
});

test('converters-wave3: cline convert includes source description in block body', () => {
  const block = cline.convert(SOURCE, 'sample', { runtime: 'cline' });
  // Source fixture frontmatter: description: "Sample skill exercising all converter rewrite paths…"
  assert.ok(
    block.includes('Sample skill exercising all converter rewrite paths'),
    'cline block includes source description: ' + block.slice(0, 200)
  );
});

test('converters-wave3: cline convert preserves /gdd-* slash form in body', () => {
  // Cline uses Claude-shape slashes (runtime-slash.cjs emits /gdd- for
  // every runtime except codex). The block body should keep /gdd-explore.
  const block = cline.convert(SOURCE, 'sample', { runtime: 'cline' });
  assert.ok(block.includes('/gdd-explore'), 'cline keeps /gdd-explore');
  assert.ok(block.includes('/gdd-debug'), 'cline keeps /gdd-debug');
  assert.equal(
    block.includes('$gdd-'),
    false,
    'cline does not emit codex shell-var form'
  );
});

test('converters-wave3: cline convert normalizes skill name (strips gdd-/gsd- prefix)', () => {
  // Passing `gdd-sample` as skillName should NOT yield `## gdd-gdd-sample`.
  const block1 = cline.convert(SOURCE, 'gdd-sample', { runtime: 'cline' });
  assert.ok(
    block1.startsWith('## gdd-sample'),
    'gdd- prefix stripped from input: ' + block1.slice(0, 80)
  );
  // Same for upstream gsd- prefix.
  const block2 = cline.convert(SOURCE, 'gsd-sample', { runtime: 'cline' });
  assert.ok(
    block2.startsWith('## gdd-sample'),
    'gsd- prefix stripped from input: ' + block2.slice(0, 80)
  );
});

test('converters-wave3: cline convert handles no-frontmatter input (no description line)', () => {
  const noFm = '# Header\n\nBody content with /gdd-explore reference.\n';
  const block = cline.convert(noFm, 'sample', { runtime: 'cline' });
  assert.ok(
    block.startsWith('## gdd-sample'),
    'heading emitted even without source frontmatter'
  );
  assert.ok(
    block.includes('/gdd-explore'),
    'body slash refs preserved'
  );
  // Should not include double newlines from an empty description line.
  assert.equal(
    block.includes('## gdd-sample\n\n\n\n'),
    false,
    'no extra blank line where description would have been'
  );
});

test('converters-wave3: cline buildClinerulesFile starts with `# get-design-done rules`', () => {
  const file = cline.buildClinerulesFile([
    { name: 'a', block: '## gdd-a\n\nbody a' },
  ]);
  assert.ok(
    file.startsWith('# get-design-done rules'),
    'cline file starts with rules header: ' + file.slice(0, 80)
  );
});

test('converters-wave3: cline buildClinerulesFile includes auto-generated comment', () => {
  const file = cline.buildClinerulesFile([
    { name: 'a', block: '## gdd-a\n\nbody a' },
  ]);
  assert.ok(
    file.includes('Auto-generated from gdd SKILL.md sources'),
    'cline file embeds auto-generated provenance comment'
  );
});

test('converters-wave3: cline buildClinerulesFile assembles multiple blocks', () => {
  const file = cline.buildClinerulesFile([
    { name: 'explore', block: '## gdd-explore\n\nExplore body' },
    { name: 'debug', block: '## gdd-debug\n\nDebug body' },
    { name: 'help', block: '## gdd-help\n\nHelp body' },
  ]);
  assert.ok(file.includes('## gdd-explore'), 'explore block present');
  assert.ok(file.includes('## gdd-debug'), 'debug block present');
  assert.ok(file.includes('## gdd-help'), 'help block present');
  assert.ok(file.includes('Explore body'), 'explore body present');
  assert.ok(file.includes('Debug body'), 'debug body present');
  assert.ok(file.includes('Help body'), 'help body present');
});

test('converters-wave3: cline buildClinerulesFile separates blocks with blank line', () => {
  const file = cline.buildClinerulesFile([
    { name: 'a', block: '## gdd-a\n\nbody a' },
    { name: 'b', block: '## gdd-b\n\nbody b' },
  ]);
  // Between two blocks: closing line of block A, then `\n\n` separator,
  // then opening line of block B. Concretely: `body a\n\n## gdd-b`.
  assert.ok(
    file.includes('body a\n\n## gdd-b'),
    'blocks separated by blank line: ' + JSON.stringify(file)
  );
});

test('converters-wave3: cline buildClinerulesFile handles empty array', () => {
  const file = cline.buildClinerulesFile([]);
  // Empty input → header-only file, still ends in newline.
  assert.ok(
    file.startsWith('# get-design-done rules'),
    'empty input still yields header'
  );
  assert.ok(file.endsWith('\n'), 'empty file ends with newline');
  // No skill headings.
  assert.equal(file.includes('## gdd-'), false, 'no skill headings');
});

test('converters-wave3: cline buildClinerulesFile handles null / non-array', () => {
  // Defensive: installer might pass null on dry-run no-op.
  const fileNull = cline.buildClinerulesFile(null);
  assert.ok(fileNull.startsWith('# get-design-done rules'));
  const fileUndef = cline.buildClinerulesFile(undefined);
  assert.ok(fileUndef.startsWith('# get-design-done rules'));
});

test('converters-wave3: cline integration — convert + buildClinerulesFile round-trip', () => {
  // End-to-end: convert two skills, assemble, assert final file shape.
  const block1 = cline.convert(SOURCE, 'sample', { runtime: 'cline' });
  const block2 = cline.convert(SOURCE, 'other', { runtime: 'cline' });
  const file = cline.buildClinerulesFile([
    { name: 'sample', block: block1 },
    { name: 'other', block: block2 },
  ]);
  assert.ok(file.startsWith('# get-design-done rules'));
  assert.ok(file.includes('## gdd-sample'));
  assert.ok(file.includes('## gdd-other'));
  // Both blocks share the same source description.
  const descCount = (
    file.match(/Sample skill exercising all converter rewrite paths/g) || []
  ).length;
  assert.equal(descCount, 2, 'both skill blocks carry the description');
  // No YAML frontmatter delimiter survived from source.
  assert.equal(
    /^---\r?\n/m.test(file),
    false,
    'no YAML frontmatter in assembled file'
  );
});

// ── D-10 guard: NO hermes converter file exists ───────────────────────────

test('converters-wave3: no hermes converter file exists (D-10 invariant)', () => {
  // Phase 28.7 D-10 explicitly excludes hermes from the runtime set.
  // If a future plan accidentally creates one, this test fails loudly so
  // the omission can be reconsidered deliberately rather than by drift.
  const hermesPath = path.join(
    __dirname,
    '../..',
    'scripts',
    'lib',
    'install',
    'converters',
    'hermes.cjs'
  );
  assert.equal(
    fs.existsSync(hermesPath),
    false,
    'D-10: scripts/lib/install/converters/hermes.cjs must NOT exist; ' +
      'remove it or amend Phase 28.7 D-10 if hermes is being re-added'
  );
});

// ── D-02 attribution check (Phase 28.7 NOTICE-equivalent) ─────────────────

test('converters-wave3: codebuddy.cjs + cline.cjs cite gsd-build per D-02', () => {
  const dir = path.join(
    __dirname,
    '../..',
    'scripts',
    'lib',
    'install',
    'converters'
  );
  for (const file of ['codebuddy.cjs', 'cline.cjs']) {
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

test('converters-wave3: cline.cjs documents D-09 special-case rationale', () => {
  const body = fs.readFileSync(
    path.join(
      __dirname,
      '../..',
      'scripts',
      'lib',
      'install',
      'converters',
      'cline.cjs'
    ),
    'utf8'
  );
  assert.ok(
    /D-09/.test(body),
    'cline.cjs must cite D-09 (rule-block embedding rationale)'
  );
  assert.ok(
    /\.clinerules/.test(body),
    'cline.cjs must mention the .clinerules destination'
  );
});
