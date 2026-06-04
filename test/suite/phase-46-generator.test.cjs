'use strict';
/**
 * test/suite/phase-46-generator.test.cjs — Phase 46 (Skill UX Polish).
 *
 * Regression baseline + fixed-point guard for the skill-metadata single-source-
 * of-truth (scripts/lib/manifest/skills.json) and its frontmatter generator
 * (scripts/generate-skill-frontmatter.cjs). The committed tree is already the
 * forward-generation fixed point (CI runs `--check`); these tests pin that
 * invariant in-process plus the SoT↔source parity, description budget, the
 * extract∘forward round-trip on managed data, and the quoting / ordering /
 * managed-key contract of the emitter.
 *
 * Coverage:
 *   1. SoT↔source parity (count-agnostic): dir<->record bijection on `name`.
 *   2. Description budget: every record description length in [20, 1024].
 *   3. Idempotence / byte-stability: renderSkill(id, rec) === on-disk (LF-norm).
 *   4. Round-trip: recordFromFrontmatter(splitFrontmatter(renderSkill).fmLines)
 *      reproduces the managed fields of the SoT record.
 *   5. Quoting + ordering invariants on frontmatterFromRecord (synthetic rec).
 *   6. Managed-key contract: MANAGED.map(m=>m.fm) is the canonical ordered set.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

const gen = require('../../scripts/generate-skill-frontmatter.cjs');
const { readSkills } = require('../../scripts/lib/manifest/index.cjs');
const {
  splitFrontmatter,
  recordFromFrontmatter,
  frontmatterFromRecord,
  renderSkill,
  MANAGED,
} = gen;

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(ROOT, 'skill-templates');

// --- Dynamic, count-agnostic discovery (mirrors the generator's listSkillDirs). ---
function listSkillDirs() {
  return fs
    .readdirSync(SRC, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(SRC, e.name, 'SKILL.md')))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));
}

function readSkillsJson() {
  // Read the SoT through the canonical typed reader so the test exercises the
  // same loader every cross-phase consumer uses.
  const json = readSkills();
  return json.skills || [];
}

const DIRS = listSkillDirs();
const RECORDS = readSkillsJson();
const RECORD_BY_NAME = new Map(RECORDS.map((r) => [r.name, r]));

// Sanity: discovery is non-vacuous (guards against a silently empty source tree
// that would make every per-skill test trivially pass).
test('46-generator: discovery is non-vacuous (source dirs and SoT records both present)', () => {
  assert.ok(DIRS.length > 0, 'expected at least one skill-templates/<id>/SKILL.md');
  assert.ok(RECORDS.length > 0, 'expected at least one record in skills.json');
});

// ---------------------------------------------------------------------------
// 1. SoT <-> source parity (count-agnostic bijection on `name`)
// ---------------------------------------------------------------------------

test('46-generator: every skill-templates/<id> dir has exactly one skills.json record with name===id', () => {
  // No duplicate names in the SoT (Map size === array length proves uniqueness).
  assert.equal(
    RECORD_BY_NAME.size,
    RECORDS.length,
    `skills.json has duplicate "name" keys (${RECORDS.length} records, ${RECORD_BY_NAME.size} unique names)`,
  );
  for (const id of DIRS) {
    const rec = RECORD_BY_NAME.get(id);
    assert.ok(rec, `skill-templates/${id} has no record in skills.json`);
    assert.equal(rec.name, id, `skills.json record for "${id}" has name="${rec.name}"`);
  }
});

test('46-generator: every skills.json record maps to an existing skill-templates/<name> dir', () => {
  const dirSet = new Set(DIRS);
  for (const rec of RECORDS) {
    assert.ok(
      dirSet.has(rec.name),
      `skills.json record "${rec.name}" has no skill-templates/${rec.name}/SKILL.md`,
    );
  }
  // Bijection: equal cardinality + both inclusions above => exact 1:1 mapping.
  assert.equal(
    RECORDS.length,
    DIRS.length,
    `record count (${RECORDS.length}) != source dir count (${DIRS.length})`,
  );
});

// ---------------------------------------------------------------------------
// 2. Description budget regression (Phase 28.5 contract at the SoT layer)
// ---------------------------------------------------------------------------

test('46-generator: every record description (when present) is within [20, 1024] chars', () => {
  for (const rec of RECORDS) {
    if (rec.description == null) continue;
    const len = rec.description.length;
    assert.ok(
      len >= 20 && len <= 1024,
      `skills.json "${rec.name}" description length ${len} outside [20, 1024]`,
    );
  }
});

// ---------------------------------------------------------------------------
// 3. Idempotence / byte-stability — forward generation is a fixed point.
//    (In-process equivalent of `--check`: zero drift across the whole tree.)
// ---------------------------------------------------------------------------

test('46-generator: renderSkill(id, rec) byte-equals on-disk SKILL.md (LF-normalized) for every skill', () => {
  const drift = [];
  for (const id of DIRS) {
    const rec = RECORD_BY_NAME.get(id);
    assert.ok(rec, `no SoT record for ${id} (parity test should have caught this)`);
    const onDisk = fs.readFileSync(path.join(SRC, id, 'SKILL.md'), 'utf8').replace(/\r\n/g, '\n');
    const rendered = renderSkill(id, rec);
    if (onDisk !== rendered) drift.push(id);
  }
  assert.deepEqual(
    drift,
    [],
    `forward generation is not a fixed point for: ${drift.join(', ')} ` +
      '(run `npm run generate:skill-frontmatter` then `npm run build:skills`)',
  );
});

// ---------------------------------------------------------------------------
// 4. Round-trip — extract∘forward is identity on managed data.
//    recordFromFrontmatter(splitFrontmatter(renderSkill(id, rec)).fmLines)
//    reproduces the managed fields of the SoT record.
// ---------------------------------------------------------------------------

const MANAGED_ROUNDTRIP_KEYS = [
  'description',
  'argument_hint',
  'tools',
  'user_invocable',
  'disable_model_invocation',
];

test('46-generator: extract∘forward reproduces managed fields for every skill (round-trip identity)', () => {
  for (const id of DIRS) {
    const rec = RECORD_BY_NAME.get(id);
    const fmText = renderSkill(id, rec);
    const { fmLines } = splitFrontmatter(fmText, id);
    const rt = recordFromFrontmatter(id, fmLines);

    // name is always re-keyed to the dir id.
    assert.equal(rt.name, id, `${id}: round-trip name mismatch (${rt.name})`);

    // frontmatter_name override survives extraction iff the SoT carried one.
    assert.equal(
      rt.frontmatter_name,
      rec.frontmatter_name,
      `${id}: frontmatter_name round-trip mismatch (got ${rt.frontmatter_name}, want ${rec.frontmatter_name})`,
    );

    for (const key of MANAGED_ROUNDTRIP_KEYS) {
      assert.deepEqual(
        rt[key],
        rec[key],
        `${id}: managed field "${key}" not preserved by extract∘forward ` +
          `(got ${JSON.stringify(rt[key])}, want ${JSON.stringify(rec[key])})`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// 5. Quoting + ordering invariants on frontmatterFromRecord (synthetic record).
// ---------------------------------------------------------------------------

test('46-generator: frontmatterFromRecord quotes description, orders managed keys, appends extra verbatim', () => {
  // Synthetic record exercising every managed kind + an extra_frontmatter line.
  const rec = {
    name: 'synthetic',
    description: 'A "quoted" description with a backslash \\ and budget-length padding here.',
    argument_hint: '[--flag <v>]',
    tools: 'Read, Write, Bash',
    user_invocable: true,
    disable_model_invocation: false,
    extra_frontmatter: ['color: amber', 'model: inherit'],
  };
  const fm = frontmatterFromRecord(rec);
  const lines = fm.split('\n');

  // description is always double-quoted.
  const descLine = lines.find((l) => l.startsWith('description:'));
  assert.ok(descLine, 'no description line emitted');
  assert.ok(descLine.startsWith('description: "'), `description not double-quoted: ${descLine}`);
  // Quoting escapes embedded quotes and backslashes (round-trips via unquote).
  assert.equal(gen.unquote(descLine.slice('description: '.length)), rec.description);

  // name uses the gdd-<id> default when no frontmatter_name override is present.
  assert.equal(lines[0], 'name: gdd-synthetic');

  // Managed keys appear in MANAGED order, before any extra line.
  const managedKeysEmitted = lines
    .map((l) => l.split(':')[0])
    .filter((k) => MANAGED.some((m) => m.fm === k));
  assert.deepEqual(
    managedKeysEmitted,
    ['name', 'description', 'argument-hint', 'tools', 'user-invocable', 'disable-model-invocation'],
    'managed keys not emitted in canonical MANAGED order',
  );

  // booleans render as literal true/false.
  assert.ok(lines.includes('user-invocable: true'), 'user-invocable should be true');
  assert.ok(lines.includes('disable-model-invocation: false'), 'disable-model-invocation should be false');

  // extra_frontmatter is re-appended verbatim AFTER the managed block.
  const colorIdx = lines.indexOf('color: amber');
  const modelIdx = lines.indexOf('model: inherit');
  const lastManagedIdx = lines.indexOf('disable-model-invocation: false');
  assert.ok(colorIdx > lastManagedIdx, 'extra_frontmatter must follow managed block');
  assert.equal(colorIdx + 1, modelIdx, 'extra_frontmatter lines must stay in original order, contiguous');
  assert.deepEqual(lines.slice(colorIdx), ['color: amber', 'model: inherit'], 'extra lines not verbatim/trailing');
});

test('46-generator: frontmatter_name override replaces the gdd- prefix in the name line', () => {
  const rec = {
    name: 'design',
    frontmatter_name: 'design',
    description: 'A budget-length synthetic description used for the override test here.',
  };
  const lines = frontmatterFromRecord(rec).split('\n');
  assert.equal(lines[0], 'name: design', 'frontmatter_name should override the gdd- prefix');
});

test('46-generator: absent managed scalars are omitted, not emitted as empty/null', () => {
  // Only description present; argument-hint/tools/user-invocable/disable-* absent.
  const rec = { name: 'sparse', description: 'A budget-length synthetic description for the sparse-record case.' };
  const lines = frontmatterFromRecord(rec).split('\n');
  assert.deepEqual(
    lines,
    ['name: gdd-sparse', `description: ${gen.quote(rec.description)}`],
    'absent managed keys must be omitted entirely',
  );
});

// ---------------------------------------------------------------------------
// 6. Managed-key contract — locks the canonical ordered set.
// ---------------------------------------------------------------------------

test('46-generator: MANAGED.map(m=>m.fm) is the canonical ordered managed-key set', () => {
  assert.deepEqual(MANAGED.map((m) => m.fm), [
    'name',
    'description',
    'argument-hint',
    'tools',
    'user-invocable',
    'disable-model-invocation',
  ]);
});

test('46-generator: MANAGED rec-keys and kinds match the documented contract', () => {
  // Locks the fm<->rec mapping + kind so a future edit to MANAGED is deliberate.
  assert.deepEqual(
    MANAGED.map((m) => [m.fm, m.rec, m.kind]),
    [
      ['name', 'name', 'name'],
      ['description', 'description', 'qstr'],
      ['argument-hint', 'argument_hint', 'qstr'],
      ['tools', 'tools', 'bare'],
      ['user-invocable', 'user_invocable', 'bool'],
      ['disable-model-invocation', 'disable_model_invocation', 'bool'],
    ],
  );
});
