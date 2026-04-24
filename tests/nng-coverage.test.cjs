'use strict';
/**
 * TST-30 — nng-coverage
 *
 * Parses reference/heuristics.md and asserts every declared heuristic is
 * either referenced in agents/design-verifier.md or agents/design-auditor.md
 * (active verifier coverage) OR flagged `? VISUAL` in the heuristics file
 * itself (visual-only heuristic with reasoning).
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { REPO_ROOT } = require('./helpers.ts');

const HEURISTICS = path.join(REPO_ROOT, 'reference/heuristics.md');
const VERIFIER = path.join(REPO_ROOT, 'agents/design-verifier.md');
const AUDITOR = path.join(REPO_ROOT, 'agents/design-auditor.md');

/**
 * Parse heuristic entries from heuristics.md.
 *
 * Strategy: collect `### <heading>` entries that look like heuristic
 * identifiers (H-01 … H-10) or well-known principle names. We intentionally
 * avoid bold list items because they produce false positives like "Fail
 * cases" that appear inside a heuristic section rather than as a heuristic.
 */
function parseHeuristics(content) {
  const heuristics = [];
  const headingRe = /^###\s+(.+)$/gm;
  let m;
  while ((m = headingRe.exec(content))) {
    heuristics.push(m[1].trim());
  }
  return [...new Set(heuristics)];
}

/**
 * Extract the body of a `### <heading>` section — from heading through the
 * next `### ` or `## ` heading. Used to inspect per-heuristic prose for the
 * `? VISUAL` marker and reasoning length.
 */
function sectionBody(content, heading) {
  const idx = content.indexOf(`### ${heading}`);
  if (idx < 0) return '';
  const after = content.slice(idx + heading.length + 4);
  const nextIdx = after.search(/^#{2,3}\s+/m);
  return nextIdx < 0 ? after : after.slice(0, nextIdx);
}

/**
 * Extract the short name from a heuristic heading, e.g. "H-01", "H-10", or
 * the principle name ("Proximity"). Used to form grep tokens for verifier
 * cross-reference.
 */
function heuristicTokens(heading) {
  const tokens = [heading];
  const hMatch = heading.match(/^(H-\d{2})/);
  if (hMatch) tokens.push(hMatch[1]);
  const colonSplit = heading.split(':');
  if (colonSplit.length > 1) tokens.push(colonSplit[1].trim());
  return tokens;
}

test('nng-coverage: reference/heuristics.md exists and parses', () => {
  assert.ok(fs.existsSync(HEURISTICS), `expected ${HEURISTICS}`);
  const body = fs.readFileSync(HEURISTICS, 'utf8');
  const hs = parseHeuristics(body);
  assert.ok(hs.length > 0, 'parseHeuristics should find at least one heuristic');
});

test('nng-coverage: every heuristic is either verifier-covered or flagged ? VISUAL', () => {
  const heuristicsBody = fs.readFileSync(HEURISTICS, 'utf8');
  const verifierBody = fs.existsSync(VERIFIER) ? fs.readFileSync(VERIFIER, 'utf8') : '';
  const auditorBody = fs.existsSync(AUDITOR) ? fs.readFileSync(AUDITOR, 'utf8') : '';
  const agentBody = verifierBody + '\n' + auditorBody;

  const hs = parseHeuristics(heuristicsBody);
  const uncovered = [];
  for (const h of hs) {
    const tokens = heuristicTokens(h);
    const referencedInAgent = tokens.some(t => agentBody.includes(t));
    if (referencedInAgent) continue;

    const section = sectionBody(heuristicsBody, h);
    const hasVisualMarker = /\?\s*VISUAL/i.test(section);
    if (hasVisualMarker) continue;

    uncovered.push(h);
  }
  assert.deepEqual(
    uncovered,
    [],
    `uncovered heuristics (must be referenced in design-verifier/design-auditor or flagged "? VISUAL" with reasoning): ${uncovered.join('; ')}`
  );
});

test('nng-coverage: ? VISUAL heuristics include reasoning', () => {
  const body = fs.readFileSync(HEURISTICS, 'utf8');
  const hs = parseHeuristics(body);
  for (const h of hs) {
    const section = sectionBody(body, h);
    const marker = section.match(/\?\s*VISUAL/i);
    if (!marker) continue;
    const after = section.slice(marker.index + marker[0].length).trim();
    assert.ok(
      after.length >= 20,
      `? VISUAL heuristic "${h}" must be followed by at least 20 chars of reasoning (got ${after.length})`
    );
  }
});
