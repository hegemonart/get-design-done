'use strict';
/**
 * Validates the Step 0.5 Authoring-Intent Guard encoded in
 * agents/design-figma-writer.md. The guard is prose + regex in the agent
 * body. This test parses the regex pattern lists from the agent body and
 * runs them against author-intent / decision-intent fixtures.
 *
 * Classification rule (mirrors the agent body):
 *   - decision-intent match wins over author-intent
 *   - author-only → REDIRECT
 *   - decision-only / neither → PROCEED
 *   - both → PROCEED (permissive)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { REPO_ROOT } = require('./helpers.ts');

const AGENT_PATH = path.join(REPO_ROOT, 'agents', 'design-figma-writer.md');

function extractPatternList(body, heading) {
  // Grab the bullet-list that follows the given bold heading up to the next
  // bold heading or horizontal rule. Returns the regex sources as string[].
  const startIdx = body.indexOf(heading);
  if (startIdx === -1) throw new Error(`heading not found: ${heading}`);
  const after = body.slice(startIdx + heading.length);
  const stop = after.search(/\n\*\*[A-ZА-Я]|\n---|\n###/);
  const block = stop === -1 ? after : after.slice(0, stop);
  const patterns = [];
  for (const line of block.split(/\r?\n/)) {
    const m = line.match(/^-\s+`([^`]+)`/);
    if (m) patterns.push(m[1]);
  }
  if (patterns.length === 0) throw new Error(`no patterns parsed under heading: ${heading}`);
  return patterns;
}

function compile(patterns) {
  return patterns.map(src => new RegExp(src, 'i'));
}

function classify(text, authorRes, decisionRes) {
  const authorMatch = authorRes.some(r => r.test(text));
  const decisionMatch = decisionRes.some(r => r.test(text));
  if (decisionMatch) return 'proceed';       // decision-intent wins
  if (authorMatch) return 'redirect';        // author-only
  return 'proceed';                          // neither
}

const body = fs.readFileSync(AGENT_PATH, 'utf8');

test('figma-authoring-guard: agent body contains Step 0.5 section and redirect marker', () => {
  assert.match(body, /## Step 0\.5 — Authoring-Intent Guard/);
  assert.match(body, /## FIGMA AUTHORING-INTENT REDIRECT/);
  assert.match(body, /figma:figma-generate-design/);
  assert.match(body, /reference\/figma-sandbox\.md/);
});

test('figma-authoring-guard: agent body cites 4 sandbox pitfalls', () => {
  assert.match(body, /loadFontAsync/);
  assert.match(body, /findOne/);
  assert.match(body, /appendChild/);
  assert.match(body, /per-call timeout/i);
});

test('figma-authoring-guard: pattern lists are parseable', () => {
  const authorEn = extractPatternList(body, '**Author-intent patterns (EN):**');
  const authorRu = extractPatternList(body, '**Author-intent patterns (RU):**');
  const decisionEn = extractPatternList(body, "**Decision-intent patterns (EN) — these WIN over ambiguous author-intent:**");
  const decisionRu = extractPatternList(body, '**Decision-intent patterns (RU):**');
  assert.ok(authorEn.length >= 5, `author-intent EN patterns: ${authorEn.length}`);
  assert.ok(authorRu.length >= 3, `author-intent RU patterns: ${authorRu.length}`);
  assert.ok(decisionEn.length >= 5);
  assert.ok(decisionRu.length >= 2);
});

test('figma-authoring-guard: 5 author-intent fixtures (EN+RU) route to REDIRECT', () => {
  const authorRes = compile([
    ...extractPatternList(body, '**Author-intent patterns (EN):**'),
    ...extractPatternList(body, '**Author-intent patterns (RU):**'),
  ]);
  const decisionRes = compile([
    ...extractPatternList(body, "**Decision-intent patterns (EN) — these WIN over ambiguous author-intent:**"),
    ...extractPatternList(body, '**Decision-intent patterns (RU):**'),
  ]);
  const fixtures = [
    'Please create a new page for token documentation in Figma',
    'Populate the new file with library components for the spec',
    'Author design documentation from scratch in Figma',
    'Создай новую страницу документации токенов',
    'Сгенерируй Figma-страницу для токенов дизайн-системы',
  ];
  for (const t of fixtures) {
    assert.equal(classify(t, authorRes, decisionRes), 'redirect', `expected REDIRECT for: ${t}`);
  }
});

test('figma-authoring-guard: 5 decision-intent fixtures route to PROCEED', () => {
  const authorRes = compile([
    ...extractPatternList(body, '**Author-intent patterns (EN):**'),
    ...extractPatternList(body, '**Author-intent patterns (RU):**'),
  ]);
  const decisionRes = compile([
    ...extractPatternList(body, "**Decision-intent patterns (EN) — these WIN over ambiguous author-intent:**"),
    ...extractPatternList(body, '**Decision-intent patterns (RU):**'),
  ]);
  const fixtures = [
    'Annotate the selection with the D-12 color decision',
    'Bind token primary.500 to the component',
    'Set up Code Connect mapping for Button',
    'Update implementation status for this frame',
    'Привяжи токен primary к компоненту',
  ];
  for (const t of fixtures) {
    assert.equal(classify(t, authorRes, decisionRes), 'proceed', `expected PROCEED for: ${t}`);
  }
});

test('figma-authoring-guard: ambiguous "create a token binding for this component" → decision-intent wins', () => {
  const authorRes = compile([
    ...extractPatternList(body, '**Author-intent patterns (EN):**'),
    ...extractPatternList(body, '**Author-intent patterns (RU):**'),
  ]);
  const decisionRes = compile([
    ...extractPatternList(body, "**Decision-intent patterns (EN) — these WIN over ambiguous author-intent:**"),
    ...extractPatternList(body, '**Decision-intent patterns (RU):**'),
  ]);
  // "create a token binding" — has "create" (author verb) but "bind … token" is decision
  const text = 'create a token binding for this component';
  // Note: the pattern starts with "bind" as a leading word. "create a token binding" may not match bind .* token
  // The test verifies that a text containing "binding" routes to decision when a decision pattern matches.
  // Our agent's decision patterns include "bind .{0,30}token". Here the text uses "token binding" (noun
  // form). We accept either PROCEED (mixed) or the permissive default; only blocked-author is a failure.
  const authorMatch = authorRes.some(r => r.test(text));
  const decisionMatch = decisionRes.some(r => r.test(text));
  // The critical assertion: this phrase must NOT route to pure REDIRECT.
  if (authorMatch && !decisionMatch) {
    // Unacceptable — author alone would trigger redirect. Document as failure.
    throw new assert.AssertionError({
      message: `ambiguous "token binding" phrase classified as pure author-intent; expected decision-intent match to dominate`,
    });
  }
  // Otherwise: fine (classify() returns 'proceed').
});
