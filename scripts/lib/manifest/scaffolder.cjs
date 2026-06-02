'use strict';
/**
 * scripts/lib/manifest/scaffolder.cjs — Phase 50 (Authoring Contract v3).
 *
 * Pure, dependency-free generator behind the `/gdd:new-skill` scaffolder skill.
 * The SKILL.md (source/skills/new-skill/SKILL.md) drives the interactive
 * prompts; this module is the deterministic core it (and the test suite) call.
 *
 * Exports:
 *   buildSkillRecord({ name, description, argumentHint, tools, userInvocable,
 *     composesWith }) -> a skills.json record object. Validates the name slug,
 *     the v3 description budget (20..1024 chars), and the comma-separated tools
 *     list. Throws on invalid input.
 *   renderSkillMd(record) -> the SKILL.md template string (frontmatter in the
 *     same canonical key order as generate-skill-frontmatter.cjs + a minimal
 *     body skeleton with the standard sections).
 *   suggestComposesWith(name, allSkills) -> heuristic composition suggestions
 *     (skills sharing a lifecycle-stage keyword with the new skill name).
 *
 * Dependency-free of any third party. It DOES reuse the in-repo
 * generate-skill-frontmatter.cjs `frontmatterFromRecord` emitter so the
 * rendered frontmatter is a byte-for-byte fixed point with the forward
 * generator (description quoted, canonical key order, name leads).
 */

const path = require('node:path');

// Reuse the canonical frontmatter emitter so renderSkillMd stays compatible
// with `npm run generate:skill-frontmatter` (same quoting + key order).
const { frontmatterFromRecord } = require(
  path.join(__dirname, '..', '..', 'generate-skill-frontmatter.cjs'),
);

// Slug rule mirrors reference/skill-authoring-contract.md `## Frontmatter`:
// kebab-case identifier matching ^[a-z0-9][a-z0-9-._]*$.
const NAME_RE = /^[a-z0-9][a-z0-9-._]*$/;

// Description budget mirrors the Phase 28.5 contract (D-02) + skills.schema.json:
// 20..1024 chars. The v3 "Activates for requests involving X, Y, Z." sentence
// is recommended (LAX by default) but not regex-enforced here.
const DESC_MIN = 20;
const DESC_MAX = 1024;

// Lifecycle-stage keyword groups used by suggestComposesWith. Skills whose
// name shares a group with the new skill name are plausible composition
// neighbours. Kept deliberately small and dependency-free; the SKILL.md treats
// the result as a suggestion the user confirms, never an autowire.
const STAGE_GROUPS = [
  ['brief', 'intake', 'start', 'new-project', 'new-cycle'],
  ['explore', 'discover', 'discuss', 'sketch', 'spike', 'map'],
  ['plan', 'planning', 'design', 'do', 'build'],
  ['verify', 'audit', 'review', 'quality-gate', 'check'],
  ['ship', 'pr', 'complete', 'closeout', 'rollout'],
  ['figma', 'extract', 'export', 'import', 'sync'],
  ['token', 'tokens', 'darkmode', 'style', 'theme'],
  ['health', 'progress', 'stats', 'report', 'timeline'],
];

function fail(msg) {
  throw new Error(`scaffolder: ${msg}`);
}

/** Normalize a tools input (string or array) to a clean comma-list string. */
function normalizeTools(tools) {
  if (tools == null) return undefined;
  let parts;
  if (Array.isArray(tools)) {
    parts = tools;
  } else if (typeof tools === 'string') {
    parts = tools.split(',');
  } else {
    fail('tools must be a comma-separated string or an array of tool names');
  }
  const cleaned = parts.map((t) => String(t).trim()).filter(Boolean);
  if (cleaned.length === 0) fail('tools, when provided, must name at least one tool');
  // Each token: a Tool name or an mcp__* identifier. No commas, no empty.
  // `\w` already includes `_`, so a single `[\w-]*` class matches plain names
  // (Read) AND mcp__* identifiers (mcp__gdd_state__get) in linear time. The old
  // `(__[\w-]+)*` suffix overlapped `[\w-]*` and caused exponential backtracking
  // (CodeQL js/redos) on inputs like `A__-__-__...`; it was redundant. Removed.
  for (const t of cleaned) {
    if (!/^[A-Za-z][\w-]*$/.test(t)) {
      fail(`tools entry "${t}" is not a valid tool identifier`);
    }
  }
  return cleaned.join(', ');
}

/** Normalize a composes_with input (string or array) to a slug array. */
function normalizeComposesWith(composesWith) {
  if (composesWith == null) return undefined;
  let parts;
  if (Array.isArray(composesWith)) parts = composesWith;
  else if (typeof composesWith === 'string') parts = composesWith.split(',');
  else fail('composesWith must be an array or comma-separated string of skill names');
  const cleaned = parts.map((s) => String(s).trim()).filter(Boolean);
  if (cleaned.length === 0) return undefined;
  for (const s of cleaned) {
    if (!NAME_RE.test(s)) fail(`composesWith entry "${s}" is not a valid skill slug`);
  }
  // De-dupe, preserve first-seen order.
  return [...new Set(cleaned)];
}

/**
 * Build a skills.json record object from scaffolder inputs.
 * Keys are inserted in the canonical emit order so frontmatterFromRecord
 * produces the same byte layout generate-skill-frontmatter.cjs would.
 * @throws on an invalid name, out-of-budget description, or malformed tools.
 */
function buildSkillRecord(input) {
  const opts = input || {};
  const name = typeof opts.name === 'string' ? opts.name.trim() : opts.name;
  if (!name || typeof name !== 'string') fail('name is required (a kebab-case slug)');
  if (!NAME_RE.test(name)) {
    fail(`name "${name}" must match ${NAME_RE} (lower-case, starts alnum, kebab/dot/underscore)`);
  }

  const description = typeof opts.description === 'string' ? opts.description.trim() : opts.description;
  if (!description || typeof description !== 'string') fail('description is required');
  if (description.length < DESC_MIN) {
    fail(`description is ${description.length} chars; require >=${DESC_MIN}`);
  }
  if (description.length > DESC_MAX) {
    fail(`description is ${description.length} chars; require <=${DESC_MAX}`);
  }

  // Insertion order == canonical managed-key emit order (name leads in the
  // emitter; the rest follow record insertion order).
  const rec = { name, description };

  const argumentHint = opts.argumentHint != null ? String(opts.argumentHint) : undefined;
  if (argumentHint !== undefined) rec.argument_hint = argumentHint;

  const tools = normalizeTools(opts.tools);
  if (tools !== undefined) rec.tools = tools;

  if (opts.userInvocable !== undefined) rec.user_invocable = Boolean(opts.userInvocable);

  const composesWith = normalizeComposesWith(opts.composesWith);
  if (composesWith !== undefined) rec.composes_with = composesWith;

  return rec;
}

/**
 * Render the SKILL.md template string for a record.
 * Frontmatter is emitted via the shared generate-skill-frontmatter emitter so
 * it is a fixed point with the forward generator. composes_with (a Phase 50
 * field not yet in the emitter's MANAGED set) is appended as an explicit
 * frontmatter line; `--extract` carries it verbatim in extra_frontmatter.
 */
function renderSkillMd(record) {
  if (!record || typeof record !== 'object') fail('renderSkillMd requires a record object');
  // Validate/normalize defensively so renderSkillMd(buildSkillRecord(x)) and
  // renderSkillMd(rawObject) both produce a contract-valid file.
  const rec = buildSkillRecord({
    name: record.name,
    description: record.description,
    argumentHint: record.argument_hint,
    tools: record.tools,
    userInvocable: record.user_invocable,
    composesWith: record.composes_with,
  });

  // Separate composes_with: the shared emitter only knows the MANAGED keys, so
  // composes_with rides as an extra_frontmatter line (the round-trip home the
  // forward generator already uses for non-managed keys).
  const composesWith = rec.composes_with;
  const emitRec = { ...rec };
  delete emitRec.composes_with;
  if (composesWith && composesWith.length) {
    emitRec.extra_frontmatter = [`composes_with: [${composesWith.join(', ')}]`];
  }

  const frontmatter = frontmatterFromRecord(emitRec);
  const prefix = '{{command_prefix}}';
  const upper = rec.name.toUpperCase();

  const body = [
    '',
    `# ${prefix}${rec.name}`,
    '',
    `**Role:** ${rec.description.split('. ')[0]}.`,
    '',
    '## Steps',
    '',
    '1. State the preconditions this skill needs (read `.design/STATE.md` if relevant).',
    '2. Do the work. Keep each step a single concrete action.',
    '3. Report the result and recommend the next action.',
    '',
    '## Output',
    '',
    '```',
    `${prefix}${rec.name} result summary goes here.`,
    '```',
    '',
    '## Do Not',
    '',
    '- Do not exceed the authoring-contract length cap (warn at 100 lines).',
    '- Do not invent state; read it from `.design/`.',
    '',
    `## ${upper} COMPLETE`,
    '',
  ].join('\n');

  return `---\n${frontmatter}\n---\n${body}`;
}

/**
 * Heuristic composition suggestions for a new skill.
 * Returns skill names from `allSkills` that share a lifecycle-stage keyword
 * with `name` (or whose name substring-matches a shared stage token). The
 * new skill itself is never suggested. Order: stable by allSkills order.
 * @param {string} name new skill slug
 * @param {Array<string|{name:string}>} allSkills existing skills (names or records)
 * @returns {string[]} suggested composition neighbours (possibly empty)
 */
function suggestComposesWith(name, allSkills) {
  if (!name || typeof name !== 'string') return [];
  const self = name.trim().toLowerCase();
  const names = (Array.isArray(allSkills) ? allSkills : [])
    .map((s) => (typeof s === 'string' ? s : s && s.name))
    .filter((n) => typeof n === 'string' && n.trim() && n.trim().toLowerCase() !== self)
    .map((n) => n.trim());

  // Which stage groups does the new skill touch?
  const tokensOf = (slug) => slug.toLowerCase().split(/[-._]/).filter(Boolean);
  const selfTokens = new Set(tokensOf(self));
  const selfGroups = new Set();
  STAGE_GROUPS.forEach((group, idx) => {
    if (group.some((kw) => selfTokens.has(kw) || self.includes(kw))) selfGroups.add(idx);
  });

  if (selfGroups.size === 0) return [];

  const seen = new Set();
  const out = [];
  for (const candidate of names) {
    if (seen.has(candidate)) continue;
    const cTokens = new Set(tokensOf(candidate));
    const inGroup = [...selfGroups].some((idx) =>
      STAGE_GROUPS[idx].some((kw) => cTokens.has(kw) || candidate.toLowerCase().includes(kw)),
    );
    if (inGroup) {
      out.push(candidate);
      seen.add(candidate);
    }
  }
  return out;
}

module.exports = {
  buildSkillRecord,
  renderSkillMd,
  suggestComposesWith,
  NAME_RE,
  DESC_MIN,
  DESC_MAX,
  STAGE_GROUPS,
};
