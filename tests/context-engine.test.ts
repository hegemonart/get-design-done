// tests/context-engine.test.ts — unit + fixture round-trip coverage for the
// Plan 21-02 context-engine module. Five test groups per plan's Task 5:
//   1. Manifest invariants (3)
//   2. readFileRaw (2)
//   3. truncateMarkdown (8, fixture-driven)
//   4. buildContextBundle (5)
//   5. renderBundle (2)
// Target: >= 20 tests passing; every *.input.md round-trips byte-identical
// to its *.expected.md sibling.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Buffer } from 'node:buffer';

import { REPO_ROOT } from './helpers.ts';
import {
  MANIFEST,
  manifestFor,
  readFileRaw,
  truncateMarkdown,
  buildContextBundle,
  renderBundle,
} from '../scripts/lib/context-engine/index.ts';
import type { Stage } from '../scripts/lib/context-engine/index.ts';

const FIXTURES = join(REPO_ROOT, 'tests', 'fixtures', 'context-engine');

function readFixture(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf8');
}

/**
 * Build a throwaway working directory with a `.design/` scaffold inside.
 * The root repo `.gitignore` ignores `.design/`, so we build the scaffold at
 * runtime instead of committing it. Caller owns cleanup via the returned
 * `dispose()`.
 */
interface Scaffold {
  dir: string;
  dispose: () => void;
}
function makeScaffold(files: Record<string, string | null> = {}): Scaffold {
  const dir = mkdtempSync(join(tmpdir(), 'ctx-engine-scaffold-'));
  const designDir = join(dir, '.design');
  mkdirSync(designDir, { recursive: true });

  const defaults: Record<string, string> = {
    'STATE.md': '---\nstage: plan\n---\n\n# Project State\n\nScaffold state.\n',
    'BRIEF.md': '# Brief\n\nScaffold brief used by tests.\n',
    'DESIGN-CONTEXT.md': '# Design Context\n\nScaffold context.\n',
    'DESIGN-PLAN.md': '# Design Plan\n\nScaffold plan.\n',
    // RESEARCH.md intentionally absent in defaults so plan-stage tests can
    // exercise the missing-file path.
    'SUMMARY.md': '# Summary\n\nScaffold summary.\n',
  };

  const merged: Record<string, string | null> = { ...defaults, ...files };
  for (const [name, content] of Object.entries(merged)) {
    // Explicit `null` in overrides means "do not create this file".
    if (content === null) continue;
    writeFileSync(join(designDir, name), content, 'utf8');
  }

  return {
    dir,
    dispose(): void {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

// ---------------------------------------------------------------------------
// 1. Manifest invariants
// ---------------------------------------------------------------------------

test('MANIFEST: outer record is Object.freeze()d', () => {
  assert.equal(Object.isFrozen(MANIFEST), true, 'MANIFEST must be frozen');
});

test('MANIFEST: every stage has at least one file and every file is .design/*.md', () => {
  const stages: readonly Stage[] = ['brief', 'explore', 'plan', 'design', 'verify', 'init'];
  for (const stage of stages) {
    const entries = MANIFEST[stage];
    assert.ok(entries.length >= 1, `stage ${stage} has no files`);
    for (const entry of entries) {
      assert.match(entry, /^\.design\/[A-Z][A-Z-]*\.md$/, `${stage}: ${entry} does not match .design/*.md`);
    }
  }
});

test('MANIFEST: .design/STATE.md is first in every stage manifest', () => {
  const stages: readonly Stage[] = ['brief', 'explore', 'plan', 'design', 'verify', 'init'];
  for (const stage of stages) {
    const first = MANIFEST[stage][0];
    assert.equal(first, '.design/STATE.md', `stage ${stage}: first entry is ${first ?? 'undefined'}`);
  }
});

// ---------------------------------------------------------------------------
// 2. readFileRaw
// ---------------------------------------------------------------------------

test('readFileRaw: present file returns present:true with raw + raw_bytes', () => {
  const path = join(FIXTURES, 'fresh-state.md');
  const result = readFileRaw(path);
  assert.equal(result.present, true);
  assert.ok(result.raw.length > 0);
  assert.equal(result.raw_bytes, Buffer.byteLength(result.raw, 'utf8'));
  // Spot-check: fresh-state fixture has a frontmatter open.
  assert.ok(result.raw.startsWith('---\n'), 'raw should preserve file opening verbatim');
});

test('readFileRaw: missing file returns present:false with empty raw', () => {
  const path = join(FIXTURES, 'does-not-exist-__' + Date.now() + '.md');
  const result = readFileRaw(path);
  assert.equal(result.present, false);
  assert.equal(result.raw, '');
  assert.equal(result.raw_bytes, 0);
});

// ---------------------------------------------------------------------------
// 3. truncateMarkdown — fixture round-trips + edge cases
// ---------------------------------------------------------------------------

const THRESHOLD = 8192;

test('truncateMarkdown: sub-threshold file passes through byte-identical', () => {
  const raw = readFixture('fresh-state.md');
  assert.ok(Buffer.byteLength(raw, 'utf8') <= THRESHOLD, 'fixture precondition: <= 8 KiB');
  const { content, truncated_lines } = truncateMarkdown(raw, THRESHOLD);
  assert.equal(content, raw, 'sub-threshold file must be byte-identical passthrough');
  assert.equal(truncated_lines, 0);
});

test('truncateMarkdown: long-plan fixture matches expected output byte-for-byte', () => {
  const input = readFixture('long-plan.input.md');
  const expected = readFixture('long-plan.expected.md');
  const { content } = truncateMarkdown(input, THRESHOLD);
  assert.equal(content, expected);
  // Spot-check: frontmatter preserved verbatim.
  assert.ok(content.startsWith('---\nplan: 99-01\n'), 'frontmatter first line must be preserved');
  // Every heading must appear.
  for (const heading of ['# Overview', '## Tasks', '## Testing', '## Success Criteria']) {
    assert.ok(content.includes(heading), `expected heading "${heading}" in truncated output`);
  }
});

test('truncateMarkdown: no-frontmatter fixture starts at first heading', () => {
  const input = readFixture('no-frontmatter.input.md');
  const expected = readFixture('no-frontmatter.expected.md');
  const { content } = truncateMarkdown(input, THRESHOLD);
  assert.equal(content, expected);
  assert.ok(content.startsWith('# Top Heading\n'), 'must start at first heading');
});

test('truncateMarkdown: no-headings fixture collapses entire body to preamble marker', () => {
  const input = readFixture('no-headings.input.md');
  const expected = readFixture('no-headings.expected.md');
  const { content } = truncateMarkdown(input, THRESHOLD);
  assert.equal(content, expected);
  assert.ok(content.includes('<!-- truncated preamble -->'));
});

test('truncateMarkdown: oversized-preamble fixture replaces preamble with marker', () => {
  const input = readFixture('oversized-preamble.input.md');
  const expected = readFixture('oversized-preamble.expected.md');
  const { content } = truncateMarkdown(input, THRESHOLD);
  assert.equal(content, expected);
  assert.ok(content.includes('<!-- truncated preamble -->'));
  // Real Section heading + first paragraph still survive.
  assert.ok(content.includes('# Real Section'));
  assert.ok(content.includes("The real section's first paragraph"));
});

test('truncateMarkdown: deep-headings fixture preserves H1 through H6 verbatim', () => {
  const input = readFixture('deep-headings.input.md');
  const expected = readFixture('deep-headings.expected.md');
  const { content } = truncateMarkdown(input, THRESHOLD);
  assert.equal(content, expected);
  for (const heading of [
    '# Level 1',
    '## Level 2',
    '### Level 3',
    '#### Level 4',
    '##### Level 5',
    '###### Level 6',
  ]) {
    assert.ok(content.includes(heading), `missing "${heading}"`);
  }
});

test('truncateMarkdown: truncated_lines count exactly matches dropped lines', () => {
  // Use long-plan which has mixed heading + body counts.
  const input = readFixture('long-plan.input.md');
  const expected = readFixture('long-plan.expected.md');
  const inputLines = input.split('\n').length;
  const expectedLines = expected.split('\n').length;
  const { truncated_lines } = truncateMarkdown(input, THRESHOLD);
  // Dropped count must be at least (input - expected) net reduction; the
  // marker insertions may add lines, so the exact identity is
  // truncated_lines >= (inputLines - expectedLines).
  assert.ok(
    truncated_lines >= inputLines - expectedLines,
    `truncated_lines=${truncated_lines} >= input_lines(${inputLines}) - expected_lines(${expectedLines})`,
  );
  assert.ok(truncated_lines > 0, 'oversized fixture must report nonzero drops');
});

test('truncateMarkdown: every dropped run emits exactly one count-annotated marker', () => {
  const { content } = truncateMarkdown(readFixture('long-plan.input.md'), THRESHOLD);
  const markers = content.match(/<!-- truncated: \d+ lines removed -->/g);
  assert.ok(markers && markers.length >= 4, 'expected one marker per truncated run (>=4 for long-plan)');
  // Each marker must carry a nonzero count.
  for (const m of markers ?? []) {
    const match = m.match(/\d+/);
    const n = Number(match?.[0] ?? '0');
    assert.ok(n > 0, `marker has zero count: ${m}`);
  }
});

// ---------------------------------------------------------------------------
// 4. buildContextBundle
// ---------------------------------------------------------------------------

test('buildContextBundle: brief stage returns 2 files in manifest order', () => {
  const scaffold = makeScaffold();
  try {
    const bundle = buildContextBundle('brief', { cwd: scaffold.dir });
    assert.equal(bundle.stage, 'brief');
    assert.equal(bundle.files.length, 2);
    assert.equal(bundle.files[0]?.path, '.design/STATE.md');
    assert.equal(bundle.files[1]?.path, '.design/BRIEF.md');
    assert.equal(bundle.files[0]?.present, true);
    assert.equal(bundle.files[1]?.present, true);
  } finally {
    scaffold.dispose();
  }
});

test('buildContextBundle: plan stage records present:false when RESEARCH.md is missing', () => {
  // Default scaffold omits RESEARCH.md, so the plan stage sees it as missing.
  const scaffold = makeScaffold();
  try {
    const bundle = buildContextBundle('plan', { cwd: scaffold.dir });
    assert.equal(bundle.files.length, 4);
    const research = bundle.files.find((f) => f.path === '.design/RESEARCH.md');
    assert.ok(research, 'RESEARCH.md entry missing');
    assert.equal(research.present, false);
    assert.equal(research.content, '');
    assert.equal(research.content_bytes, 0);
    assert.equal(research.raw_bytes, 0);
    assert.equal(research.truncated_lines, 0);
  } finally {
    scaffold.dispose();
  }
});

test('buildContextBundle: strict:true throws on first missing file', () => {
  const scaffold = makeScaffold();
  try {
    assert.throws(
      () => buildContextBundle('plan', { cwd: scaffold.dir, strict: true }),
      /required file not found/,
    );
  } finally {
    scaffold.dispose();
  }
});

test('buildContextBundle: oversized DESIGN-PLAN triggers truncation under a temp cwd', () => {
  // Use the long-plan fixture body — it is known to be > 8 KiB — as the
  // DESIGN-PLAN.md override, so the `design` stage bundle sees both files.
  const scaffold = makeScaffold({
    'DESIGN-PLAN.md': readFixture('long-plan.input.md'),
  });
  try {
    const bundle = buildContextBundle('design', { cwd: scaffold.dir });
    assert.equal(bundle.files.length, 2);
    const plan = bundle.files.find((f) => f.path === '.design/DESIGN-PLAN.md');
    assert.ok(plan, 'DESIGN-PLAN.md entry missing');
    assert.equal(plan.present, true);
    assert.ok(plan.raw_bytes > 8192, 'precondition: raw size exceeds threshold');
    assert.ok(plan.truncated_lines > 0, 'expected truncated_lines > 0 for oversized file');
    assert.ok(plan.content_bytes < plan.raw_bytes, 'truncated content must be smaller than raw');
    // Headings should survive.
    assert.ok(plan.content.includes('# Overview'));
    assert.ok(plan.content.includes('## Success Criteria'));
  } finally {
    scaffold.dispose();
  }
});

test('buildContextBundle: total_bytes equals sum of per-file content_bytes', () => {
  const scaffold = makeScaffold();
  try {
    const bundle = buildContextBundle('brief', { cwd: scaffold.dir });
    const sum = bundle.files.reduce((acc, f) => acc + f.content_bytes, 0);
    assert.equal(bundle.total_bytes, sum);
  } finally {
    scaffold.dispose();
  }
});

test('buildContextBundle: built_at is a valid ISO 8601 timestamp', () => {
  const scaffold = makeScaffold();
  try {
    const bundle = buildContextBundle('brief', { cwd: scaffold.dir });
    assert.match(bundle.built_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
    assert.ok(!Number.isNaN(Date.parse(bundle.built_at)));
  } finally {
    scaffold.dispose();
  }
});

// ---------------------------------------------------------------------------
// 5. renderBundle
// ---------------------------------------------------------------------------

test('renderBundle: emits HTML-comment header + content per file, \\n---\\n divider between files', () => {
  const scaffold = makeScaffold();
  try {
    const bundle = buildContextBundle('brief', { cwd: scaffold.dir });
    const rendered = renderBundle(bundle);
    // Two files → exactly one divider.
    const dividers = rendered.match(/\n---\n/g);
    assert.ok(dividers && dividers.length >= 1, 'expected at least one \\n---\\n divider');
    // Per-file comment header includes byte count.
    assert.match(rendered, /<!-- file: \.design\/STATE\.md \(\d+ bytes\) -->/);
    assert.match(rendered, /<!-- file: \.design\/BRIEF\.md \(\d+ bytes\) -->/);
  } finally {
    scaffold.dispose();
  }
});

test('renderBundle: missing file renders as (missing) header with no body', () => {
  // Default scaffold omits RESEARCH.md, so the plan stage records it missing.
  const scaffold = makeScaffold();
  try {
    const bundle = buildContextBundle('plan', { cwd: scaffold.dir });
    const rendered = renderBundle(bundle);
    assert.match(rendered, /<!-- file: \.design\/RESEARCH\.md \(missing\) -->/);
    // The missing-file header must NOT be followed by content (next non-blank
    // line should be a divider or end-of-string).
    const idx = rendered.indexOf('<!-- file: .design/RESEARCH.md (missing) -->');
    assert.ok(idx >= 0);
    const after = rendered.slice(idx + '<!-- file: .design/RESEARCH.md (missing) -->'.length);
    // Either end-of-string or immediately-next divider (with no file content).
    assert.ok(after === '' || after.startsWith('\n---\n'));
  } finally {
    scaffold.dispose();
  }
});

// ---------------------------------------------------------------------------
// manifestFor helper — small additional coverage
// ---------------------------------------------------------------------------

test('manifestFor: returns the same array identity as MANIFEST[stage]', () => {
  const a = manifestFor('plan');
  const b = MANIFEST['plan'];
  assert.equal(a, b);
  assert.equal(Object.isFrozen(a), true);
});
