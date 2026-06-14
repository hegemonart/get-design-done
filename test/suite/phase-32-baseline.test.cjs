'use strict';

// Phase 32 — Skill Auto-Trigger Discipline + Defensive Guardrails regression baseline.
//
// Locks the union of the Wave A–C deliverable as a single release artifact so
// future drift cannot silently regress the v1.32.0 contract. Asserts:
//   1. 4-manifest version lockstep (package + claude plugin + cursor + codex),
//      VERSION-AGNOSTIC (reads package.json#version, asserts the other 3 equal it).
//   2. marketplace Tier-2 lockstep (metadata.version + plugins[0].version == package).
//   3. CHANGELOG has a [<live-version>] block.
//   4. phase-32/manifests-version.txt baseline = the live package version.
//   5. golden using-gdd snapshot matches skills/using-gdd/SKILL.md.
//   6. the 3 emitter fixtures exist + non-empty + parse as JSON with the right
//      per-harness key.
//   7. guardrail presence across the 7 stage skills: <HARD-GATE> in the 5
//      transition skills, a `| Thought | Reality |` rationalization heading in
//      all 7, <SUBAGENT-STOP> in using-gdd, and the hooks.json SessionStart
//      inject matcher == startup|clear|compact.
//
// Version-agnostic where possible (Phase 28 D-08 lesson) — mirrors
// test/suite/phase-31-5-baseline.test.cjs. All tests carry the `32-07:` tag.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const BASELINE_DIR = path.join(REPO_ROOT, 'test/fixtures/baselines/phase-32');

function read(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}
function readJsonRel(rel) {
  return JSON.parse(read(rel));
}
function readBaseline(name) {
  return fs.readFileSync(path.join(BASELINE_DIR, name), 'utf8');
}

// ── 1. manifest lockstep (version-agnostic) ────────────────────────────────────

test('32-07: 4-manifest version lockstep (package + claude plugin + cursor plugin + codex plugin equal)', () => {
  const pkgVersion = readJsonRel('package.json').version;
  assert.match(pkgVersion, /^\d+\.\d+\.\d+$/, 'package.json version looks like semver');
  for (const f of ['.claude-plugin/plugin.json', '.cursor-plugin/plugin.json', '.codex-plugin/plugin.json']) {
    assert.equal(readJsonRel(f).version, pkgVersion, `${f} version != package.json version`);
  }
});

// ── 2. marketplace Tier-2 lockstep ─────────────────────────────────────────────

test('32-07: marketplace.json Tier-2 lockstep (metadata.version + plugins[0].version equal package version)', () => {
  const pkgVersion = readJsonRel('package.json').version;
  const mp = readJsonRel('.claude-plugin/marketplace.json');
  assert.equal(mp.metadata.version, pkgVersion, 'marketplace metadata.version != package version');
  assert.ok(mp.plugins && mp.plugins[0], 'marketplace plugins[0] exists');
  assert.equal(mp.plugins[0].version, pkgVersion, 'marketplace plugins[0].version != package version');
});

// ── 3. CHANGELOG ────────────────────────────────────────────────────────────────

test('32-07: CHANGELOG has a [<live-version>] block at the top', () => {
  const live = readJsonRel('package.json').version;
  const cl = read('CHANGELOG.md');
  const esc = live.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.match(cl, new RegExp(`## \\[${esc}\\]`), `CHANGELOG must carry a ## [${live}] entry (D-01)`);
  // It must be the top-most release heading.
  const firstHeading = cl.match(/^## \[(\d+\.\d+\.\d+)\]/m);
  assert.ok(firstHeading, 'CHANGELOG has at least one release heading');
  assert.equal(firstHeading[1], live, `the top-most release heading must be [${live}]`);
});

// ── 4. phase-32 manifests-version baseline ──────────────────────────────────────

test('32-07: phase-32/manifests-version.txt baseline matches the live version', () => {
  const baseline = readBaseline('manifests-version.txt').replace(/\s+$/, '');
  const live = readJsonRel('package.json').version;
  assert.equal(baseline, live, `phase-32 manifests-version.txt (${baseline}) != package.json version (${live})`);
});

// ── 5. golden using-gdd snapshot ────────────────────────────────────────────────

test('32-07: golden using-gdd snapshot matches skills/using-gdd/SKILL.md', () => {
  const golden = readBaseline('using-hone-snapshot.md');
  const live = read('skills/using-gdd/SKILL.md');
  assert.equal(
    live,
    golden,
    'test/fixtures/baselines/phase-32/using-hone-snapshot.md must match skills/using-gdd/SKILL.md byte-for-byte (regen the golden if the bootstrap skill intentionally changed).'
  );
});

test('32-07: using-gdd frontmatter is a bootstrap contract (disable-model-invocation + pure-trigger description)', () => {
  const body = read('skills/using-gdd/SKILL.md');
  assert.match(body, /^disable-model-invocation:\s*true\s*$/m, 'using-gdd must carry disable-model-invocation: true (D-10)');
  const desc = body.match(/^description:\s*"(.+)"\s*$/m);
  assert.ok(desc, 'using-gdd must have a quoted description');
  // D-03: pure-trigger description — must NOT carry workflow-summary verbs that
  // would let the agent follow the summary instead of reading the body.
  assert.doesNotMatch(desc[1], /\b(wraps|spawns|reads|writes)\b|Stage \d of \d/i,
    'using-gdd description must be pure-trigger (no workflow-summary verbs / "Stage N of M") per D-03');
});

// ── 6. emitter fixtures (3 harness shapes) ──────────────────────────────────────

test('32-07: 3 emitter fixtures exist, are non-empty, and parse as JSON with the right per-harness key', () => {
  const cursor = JSON.parse(readBaseline('emitter-cursor.json'));
  const claude = JSON.parse(readBaseline('emitter-claude.json'));
  const sdk = JSON.parse(readBaseline('emitter-sdk.json'));

  // Cursor: top-level additional_context.
  assert.equal(typeof cursor.additional_context, 'string', 'cursor fixture must have additional_context string');
  assert.ok(cursor.additional_context.length > 0, 'cursor additional_context non-empty');

  // Claude Code: hookSpecificOutput envelope.
  assert.ok(claude.hookSpecificOutput, 'claude fixture must have hookSpecificOutput');
  assert.equal(claude.hookSpecificOutput.hookEventName, 'SessionStart', 'claude hookEventName == SessionStart');
  assert.equal(typeof claude.hookSpecificOutput.additionalContext, 'string', 'claude additionalContext string');
  assert.ok(claude.hookSpecificOutput.additionalContext.length > 0, 'claude additionalContext non-empty');

  // SDK-standard: top-level additionalContext.
  assert.equal(typeof sdk.additionalContext, 'string', 'sdk fixture must have additionalContext string');
  assert.ok(sdk.additionalContext.length > 0, 'sdk additionalContext non-empty');

  // All three carry the same bootstrap content (the using-gdd contract).
  for (const c of [cursor.additional_context, claude.hookSpecificOutput.additionalContext, sdk.additionalContext]) {
    assert.match(c, /Using GDD/, 'each emitter payload carries the using-gdd contract body');
    assert.match(c, /1% rule/, 'each emitter payload carries the 1%-rule');
  }
});

// ── 7. guardrail presence across the 7 stage skills + using-gdd + hooks matcher ──

const TRANSITION_SKILLS = ['brief', 'explore', 'plan', 'design', 'verify'];
const ALL_STAGE_SKILLS = [...TRANSITION_SKILLS, 'discuss', 'audit'];

test('32-07: <HARD-GATE> present in the 5 stage-transition skills', () => {
  for (const s of TRANSITION_SKILLS) {
    const body = read(`skills/${s}/SKILL.md`);
    assert.match(body, /<HARD-GATE>/, `skills/${s}/SKILL.md must carry a <HARD-GATE> block`);
  }
});

test('32-07: a | Thought | Reality | rationalization heading is present in all 7 stage skills', () => {
  for (const s of ALL_STAGE_SKILLS) {
    const body = read(`skills/${s}/SKILL.md`);
    assert.match(body, /\|\s*Thought\s*\|\s*Reality\s*\|/, `skills/${s}/SKILL.md must carry a | Thought | Reality | rationalization table`);
  }
});

test('32-07: <SUBAGENT-STOP> present in using-gdd', () => {
  const body = read('skills/using-gdd/SKILL.md');
  assert.match(body, /<SUBAGENT-STOP>/, 'skills/using-gdd/SKILL.md must carry a <SUBAGENT-STOP> tag (no-cascade, D-06)');
});

test('32-07: hooks.json SessionStart inject matcher == startup|clear|compact', () => {
  const hooks = readJsonRel('hooks/hooks.json');
  const sessionStart = hooks.hooks.SessionStart;
  assert.ok(Array.isArray(sessionStart), 'hooks.json SessionStart must be an array');
  // Find the inject entry and assert its matcher.
  const injectEntry = sessionStart.find(
    (e) => Array.isArray(e.hooks) && e.hooks.some((h) => typeof h.command === 'string' && /inject-using-gdd/.test(h.command))
  );
  assert.ok(injectEntry, 'hooks.json SessionStart must wire inject-using-gdd');
  assert.equal(injectEntry.matcher, 'startup|clear|compact', 'inject SessionStart matcher must be startup|clear|compact');

  // Cross-check against the golden matcher snapshot.
  const matcherGolden = readBaseline('hooks-sessionstart-matcher.txt').trim();
  assert.equal(injectEntry.matcher, matcherGolden, 'live inject matcher must equal the golden snapshot');
});
