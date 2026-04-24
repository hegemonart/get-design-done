// tests/prompt-sanitizer.test.ts
//
// Round-trip + edge-case tests for scripts/lib/prompt-sanitizer/.
// Plan 20-03 Task 4.
//
// Runs under Node 22+ `--experimental-strip-types` via `npm test`. Keep
// TypeScript to erasable constructs only (no enums, no decorators).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { sanitize, type SanitizeResult } from '../scripts/lib/prompt-sanitizer/index.ts';
import { PATTERNS } from '../scripts/lib/prompt-sanitizer/patterns.ts';

// --------------------------------------------------------------------------
// Test harness
// --------------------------------------------------------------------------

/**
 * Resolve fixtures directory relative to THIS test file.
 *
 * The helpers module (tests/helpers.ts) uses a walk-up strategy from
 * process.cwd() to locate the repo root. That works for the existing suite,
 * but for pinpoint fixture access we prefer an anchor relative to the test
 * file itself so the tests are robust even if invoked from a nested cwd.
 *
 * We use process.cwd() as the anchor here because Node 22+ strip-types mode
 * doesn't expose `import.meta.url` for .ts files loaded via the CommonJS
 * require() graph (npm test uses the node --test resolver which may wrap
 * either ESM or CJS depending on file extension heuristics). process.cwd()
 * is set to the repo root by `npm test`.
 */
const FIXTURES_DIR: string = join(process.cwd(), 'tests', 'fixtures', 'prompt-sanitizer');

/** Load a fixture pair. Returns `{ input, expected }` as utf-8 strings. */
function loadPair(n: number): { input: string; expected: string } {
  const id: string = String(n).padStart(2, '0');
  const input: string = readFileSync(join(FIXTURES_DIR, `${id}-input.md`), 'utf8');
  const expected: string = readFileSync(join(FIXTURES_DIR, `${id}-expected.md`), 'utf8');
  return { input, expected };
}

/**
 * Expected `applied` arrays per fixture. Kept adjacent to the pair list so
 * that adding a fixture forces an update here (otherwise the test name
 * lookup below fails).
 *
 * `null` means "don't assert on applied" — used for the code-fence fixtures
 * (15, 16) where preservation is the whole point and we separately assert
 * the output equals the input.
 */
const EXPECTED_APPLIED: Readonly<Record<number, readonly string[] | null>> = {
  1: ['file-ref'],
  2: ['at-prefix'],
  3: [],
  4: ['slash-cmd'],
  5: ['slash-cmd'],
  6: ['ask-user-q'],
  7: ['ask-user-q'],
  8: ['stop-line'],
  9: ['stop-line'],
  10: ['prose-wait'],
  11: ['prose-wait'],
  12: ['prose-wait'],
  13: [],
  14: [],
  15: [],
  16: [],
  17: [],
  18: ['file-ref', 'prose-wait', 'slash-cmd', 'stop-line'],
  19: [],
  20: [],
};

/** Fixtures whose sanitize() call is expected to report HUMAN VERIFY removal. */
const EXPECTED_HUMAN_VERIFY: ReadonlySet<number> = new Set<number>([13, 14]);

// --------------------------------------------------------------------------
// Round-trip tests (1–20)
// --------------------------------------------------------------------------

for (let i = 1; i <= 20; i++) {
  const fixtureNum: number = i;
  const expectedApplied: readonly string[] | null | undefined = EXPECTED_APPLIED[fixtureNum];
  const id: string = String(fixtureNum).padStart(2, '0');

  test(`prompt-sanitizer: fixture ${id} round-trips exactly`, () => {
    const { input, expected } = loadPair(fixtureNum);
    const result: SanitizeResult = sanitize(input);
    assert.equal(
      result.sanitized,
      expected,
      `fixture ${id} output mismatch\n--- expected ---\n${JSON.stringify(expected)}\n--- actual ---\n${JSON.stringify(result.sanitized)}`,
    );

    if (expectedApplied !== null && expectedApplied !== undefined) {
      const actual: readonly string[] = result.applied;
      const want: readonly string[] = expectedApplied.slice().sort();
      assert.deepEqual(Array.from(actual), Array.from(want), `fixture ${id} applied mismatch`);
    }

    const shouldHaveVerify: boolean = EXPECTED_HUMAN_VERIFY.has(fixtureNum);
    if (shouldHaveVerify) {
      assert.deepEqual(
        Array.from(result.removedSections),
        ['HUMAN VERIFY'],
        `fixture ${id} expected HUMAN VERIFY removal`,
      );
    } else {
      assert.equal(
        result.removedSections.length,
        0,
        `fixture ${id} unexpected removedSections: ${JSON.stringify(result.removedSections)}`,
      );
    }
  });
}

// --------------------------------------------------------------------------
// Code-fence protection (fixtures 15 + 16)
// --------------------------------------------------------------------------

test('prompt-sanitizer: fixture 15 — @file: inside code fence is preserved', () => {
  const { input } = loadPair(15);
  const result: SanitizeResult = sanitize(input);
  assert.equal(result.sanitized, input, 'code-fenced @file: must not be transformed');
  assert.equal(result.applied.length, 0, 'no patterns should fire for code-fence-only content');
});

test('prompt-sanitizer: fixture 16 — AskUserQuestion inside code fence is preserved', () => {
  const { input } = loadPair(16);
  const result: SanitizeResult = sanitize(input);
  assert.equal(result.sanitized, input, 'code-fenced AskUserQuestion must not be transformed');
  assert.equal(result.applied.length, 0);
});

// --------------------------------------------------------------------------
// Frontmatter protection (fixture 17)
// --------------------------------------------------------------------------

test('prompt-sanitizer: fixture 17 — frontmatter with @file-finder is preserved', () => {
  const { input } = loadPair(17);
  const result: SanitizeResult = sanitize(input);
  // Input === output because neither the frontmatter tokens nor the body
  // content triggers any pattern.
  assert.equal(result.sanitized, input);
  assert.equal(result.applied.length, 0);
  // Frontmatter itself is byte-identical (detectable via leading --- block).
  const fm: RegExpExecArray | null = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(input);
  assert.ok(fm !== null, 'fixture 17 should have a frontmatter block');
  assert.ok(
    result.sanitized.startsWith(fm !== null ? fm[0] : ''),
    'frontmatter block is preserved byte-identical at the start',
  );
});

// --------------------------------------------------------------------------
// Idempotence — sanitize(sanitize(x)) === sanitize(x) for all inputs
// --------------------------------------------------------------------------

for (let i = 1; i <= 20; i++) {
  const fixtureNum: number = i;
  const id: string = String(fixtureNum).padStart(2, '0');
  test(`prompt-sanitizer: fixture ${id} is idempotent`, () => {
    const { input } = loadPair(fixtureNum);
    const first: SanitizeResult = sanitize(input);
    const second: SanitizeResult = sanitize(first.sanitized);
    assert.equal(
      second.sanitized,
      first.sanitized,
      `fixture ${id} second pass changed output\nfirst:  ${JSON.stringify(first.sanitized)}\nsecond: ${JSON.stringify(second.sanitized)}`,
    );
  });
}

// --------------------------------------------------------------------------
// Edge cases
// --------------------------------------------------------------------------

test('prompt-sanitizer: empty string input returns empty result', () => {
  const result: SanitizeResult = sanitize('');
  assert.equal(result.sanitized, '');
  assert.equal(result.applied.length, 0);
  assert.equal(result.removedSections.length, 0);
});

test('prompt-sanitizer: determinism — repeated calls return identical results', () => {
  const raw: string = [
    'First, @file:./a.md for setup.',
    'Then run /gdd:plan --phase=99 now.',
    'Ask the user for approval.',
    '',
    'STOP when done.',
  ].join('\n');
  const a: SanitizeResult = sanitize(raw);
  const b: SanitizeResult = sanitize(raw);
  assert.equal(a.sanitized, b.sanitized);
  assert.deepEqual(Array.from(a.applied), Array.from(b.applied));
});

test('prompt-sanitizer: unclosed code fence preserves entire tail as code', () => {
  const raw: string = [
    'Before fence.',
    '',
    '```ts',
    'AskUserQuestion({ title: "hi" });',
    '// (no closing fence)',
  ].join('\n');
  const result: SanitizeResult = sanitize(raw);
  assert.equal(result.sanitized, raw, 'unclosed fence → tail preserved verbatim');
  assert.equal(
    result.applied.length,
    0,
    `unclosed-fence tail should not trigger any pattern; got ${JSON.stringify(result.applied)}`,
  );
});

test('prompt-sanitizer: opts.preserveCodeFences=false runs patterns inside fences', () => {
  const raw: string = ['```', 'Use @file:./leaky.md here.', '```'].join('\n');
  const result: SanitizeResult = sanitize(raw, { preserveCodeFences: false });
  assert.ok(
    result.sanitized.includes('(file reference removed)'),
    `expected fenced @file: to be rewritten when preserveCodeFences=false; got ${JSON.stringify(result.sanitized)}`,
  );
  assert.deepEqual(Array.from(result.applied), ['file-ref']);
});

test('prompt-sanitizer: opts.preserveFrontmatter=false runs patterns inside frontmatter', () => {
  const raw: string = ['---', 'alias: /gdd:progress', '---', '', '# body'].join('\n');
  const result: SanitizeResult = sanitize(raw, { preserveFrontmatter: false });
  assert.ok(
    result.sanitized.includes('(slash command removed)'),
    `expected frontmatter /gdd: to be rewritten when preserveFrontmatter=false; got ${JSON.stringify(result.sanitized)}`,
  );
});

test('prompt-sanitizer: AskUserQuestion paren-balancer handles nested parens', () => {
  const raw: string = 'Start AskUserQuestion(fn(1, 2), "ok") end.';
  const result: SanitizeResult = sanitize(raw);
  assert.equal(result.sanitized, 'Start (user question removed — proceed with default) end.');
  assert.deepEqual(Array.from(result.applied), ['ask-user-q']);
});

test('prompt-sanitizer: AskUserQuestion paren-balancer honors string-literal parens', () => {
  // Close paren is inside a string literal — must not be treated as matching.
  const raw: string = 'AskUserQuestion(") fake close", { ok: true }) done.';
  const result: SanitizeResult = sanitize(raw);
  assert.equal(result.sanitized, '(user question removed — proceed with default) done.');
  assert.deepEqual(Array.from(result.applied), ['ask-user-q']);
});

test('prompt-sanitizer: PATTERNS export is readonly + frozen', () => {
  assert.equal(Array.isArray(PATTERNS), true);
  assert.ok(Object.isFrozen(PATTERNS), 'PATTERNS should be frozen');
  // Every entry has the documented shape.
  for (const p of PATTERNS) {
    assert.equal(typeof p.name, 'string');
    assert.ok(p.match instanceof RegExp);
    assert.ok(typeof p.replace === 'string' || typeof p.replace === 'function');
    assert.equal(typeof p.description, 'string');
  }
  // No duplicate names.
  const names: string[] = PATTERNS.map((p) => p.name);
  assert.equal(new Set(names).size, names.length, `duplicate pattern names in ${JSON.stringify(names)}`);
});
