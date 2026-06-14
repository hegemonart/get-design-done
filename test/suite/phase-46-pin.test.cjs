'use strict';
// Phase 46 (Skill UX Polish) — pin / unpin / list-pins unit coverage.
//
// Exercises scripts/lib/pin/{store,harness-detect}.cjs against throwaway temp
// projects under os.tmpdir(). Every test id is prefixed `46-`.
//
// Covered:
//   - pin writes a SKILL.md stub carrying the hone-pinned-skill marker plus a
//     skills.json-sourced description into a fake .claude/skills/ dir
//   - list-pins finds the pinned stub (source + pinnedAt)
//   - unpin removes a pinned stub
//   - unpin REFUSES a file whose first non-empty line lacks the marker
//   - the atomic write leaves no leftover .tmp sibling
//   - cross-platform path join (dest path lives under the harness dir via path.join)
//   - pinning an unknown skill throws

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const store = require(path.join(REPO_ROOT, 'scripts/lib/pin/store.cjs'));
const harnessDetect = require(path.join(REPO_ROOT, 'scripts/lib/pin/harness-detect.cjs'));
const { readSkills } = require(path.join(REPO_ROOT, 'scripts/lib/manifest/index.cjs'));

const { pinSkill, unpinSkill, listPins, parseMarker, markerFor } = store;

// Pick a real skill from the manifest so the test stays count-agnostic and does
// not hardcode a skill that might be renamed. Prefer 'help' (stable), else first.
function pickKnownSkill() {
  const { skills } = readSkills();
  const byName = new Map(skills.map((s) => [s.name, s]));
  if (byName.has('help')) return byName.get('help');
  return skills[0];
}

// Build a throwaway project root with a fake .claude/skills/ dir. Returns the
// project root path; caller cleans up.
function makeTempProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hone-phase46-pin-'));
  fs.mkdirSync(path.join(root, '.claude', 'skills'), { recursive: true });
  return root;
}

function cleanup(root) {
  try {
    fs.rmSync(root, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
}

test('46-01: pin writes a stub with the gdd marker + skills.json-sourced description', () => {
  const root = makeTempProject();
  try {
    const skill = pickKnownSkill();
    const res = pinSkill({ projectRoot: root, skillId: skill.name });

    // at least the .claude dir was written
    assert.ok(res.written.length >= 1, 'expected at least one written stub');
    const claude = res.written.find((w) => w.config_dir === '.claude');
    assert.ok(claude, 'expected a .claude write entry');

    const content = fs.readFileSync(claude.path, 'utf8');
    const firstLine = content.split(/\r?\n/)[0];

    // marker is exactly the hone-pinned-skill line for this source id
    assert.strictEqual(firstLine, markerFor(skill.name));
    assert.strictEqual(parseMarker(firstLine), skill.name);

    // description comes from the manifest SoT, not scraped frontmatter
    assert.ok(
      content.includes(`description: "${skill.description}"`),
      'stub description should match the skills.json record verbatim',
    );

    // name mirrors the generator convention (hone-<id> unless overridden)
    const expectedName = skill.frontmatter_name || `hone-${skill.name}`;
    assert.ok(content.includes(`name: ${expectedName}`), 'stub name should be hone-<id>');
  } finally {
    cleanup(root);
  }
});

test('46-02: atomic write leaves no leftover .tmp sibling', () => {
  const root = makeTempProject();
  try {
    const skill = pickKnownSkill();
    const res = pinSkill({ projectRoot: root, skillId: skill.name });
    for (const w of res.written) {
      assert.strictEqual(fs.existsSync(`${w.path}.tmp`), false, `unexpected leftover: ${w.path}.tmp`);
      assert.strictEqual(fs.existsSync(w.path), true, `expected stub to exist: ${w.path}`);
    }
  } finally {
    cleanup(root);
  }
});

test('46-03: list-pins finds the pinned stub with source + pinnedAt', () => {
  const root = makeTempProject();
  try {
    const skill = pickKnownSkill();
    pinSkill({ projectRoot: root, skillId: skill.name });

    const pins = listPins(root);
    const hit = pins.find((p) => p.config_dir === '.claude' && p.source === skill.name);
    assert.ok(hit, 'list-pins should surface the pinned skill under .claude');
    assert.strictEqual(hit.alias, skill.name);
    // pinnedAt is an ISO timestamp string
    assert.ok(!Number.isNaN(Date.parse(hit.pinnedAt)), 'pinnedAt should parse as a date');
  } finally {
    cleanup(root);
  }
});

test('46-04: unpin removes a pinned stub', () => {
  const root = makeTempProject();
  try {
    const skill = pickKnownSkill();
    const pinned = pinSkill({ projectRoot: root, skillId: skill.name });
    const claudePath = pinned.written.find((w) => w.config_dir === '.claude').path;
    assert.strictEqual(fs.existsSync(claudePath), true);

    const res = unpinSkill({ projectRoot: root, skillId: skill.name });
    const removedClaude = res.removed.find((r) => r.config_dir === '.claude');
    assert.ok(removedClaude, 'unpin should remove the .claude stub');
    assert.strictEqual(fs.existsSync(claudePath), false, 'stub file should be gone after unpin');

    // and it no longer shows up in the listing
    const after = listPins(root).filter((p) => p.source === skill.name);
    assert.strictEqual(after.length, 0, 'no pins should remain for the skill');
  } finally {
    cleanup(root);
  }
});

test('46-05: unpin REFUSES a file lacking the gdd marker (never deletes hand-written skills)', () => {
  const root = makeTempProject();
  try {
    // Hand-written skill, NO marker.
    const dir = path.join(root, '.claude', 'skills', 'handwritten');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'SKILL.md');
    fs.writeFileSync(file, '---\nname: handwritten\n---\nReal user content.\n', 'utf8');

    const res = unpinSkill({ projectRoot: root, skillId: 'handwritten' });
    assert.strictEqual(res.removed.length, 0, 'nothing should be removed');
    const refused = res.refused.find((r) => r.config_dir === '.claude');
    assert.ok(refused, 'unpin should refuse the unmarked file');
    assert.match(refused.reason, /marker/i);
    assert.strictEqual(fs.existsSync(file), true, 'the hand-written file must survive');
  } finally {
    cleanup(root);
  }
});

test('46-06: pinning an unknown skill throws a clear error', () => {
  const root = makeTempProject();
  try {
    assert.throws(
      () => pinSkill({ projectRoot: root, skillId: 'definitely-not-a-real-skill-xyz' }),
      /not a known skill/i,
    );
  } finally {
    cleanup(root);
  }
});

test('46-07: candidate skills dirs join config_dir + skills under the project root (cross-platform)', () => {
  const root = makeTempProject();
  try {
    const candidates = harnessDetect.harnessSkillDirCandidates(root);
    assert.ok(candidates.length >= 1, 'expected at least one harness candidate');
    const claude = candidates.find((c) => c.config_dir === '.claude');
    assert.ok(claude, 'expected a .claude candidate');
    // The expected path is built the same cross-platform way (path.join), so this
    // assertion holds on both POSIX and Windows separators.
    assert.strictEqual(claude.skillsDir, path.join(root, '.claude', 'skills'));

    // detect-only surface returns just the dirs that exist (only .claude here).
    const existing = harnessDetect.detectHarnessSkillDirs(root);
    assert.ok(existing.some((c) => c.config_dir === '.claude'), '.claude should be detected as existing');
    assert.ok(
      existing.every((c) => fs.existsSync(c.skillsDir)),
      'detectHarnessSkillDirs must only return existing dirs',
    );
  } finally {
    cleanup(root);
  }
});

test('46-08: --user creates a missing harness skills dir and writes the stub there', () => {
  const root = makeTempProject();
  try {
    const skill = pickKnownSkill();
    // With --user, candidates beyond the lone existing .claude dir get materialized.
    const res = pinSkill({ projectRoot: root, skillId: skill.name, user: true });
    assert.ok(res.written.length >= 2, 'expected --user to write into more than just .claude');
    for (const w of res.written) {
      assert.strictEqual(fs.existsSync(w.path), true, `stub should exist at ${w.path}`);
      const first = fs.readFileSync(w.path, 'utf8').split(/\r?\n/)[0];
      assert.strictEqual(parseMarker(first), skill.name);
    }
  } finally {
    cleanup(root);
  }
});
