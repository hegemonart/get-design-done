'use strict';
/**
 * scripts/lib/new-addendum.cjs — Phase 54 (Composable Reference Addendums), REG-01.
 *
 * Pure, dependency-free generator behind the `/gdd:new-addendum <kind> <name>`
 * scaffolder skill (skill-templates/new-addendum/SKILL.md). The SKILL.md drives
 * the prompts; this module is the deterministic core it (and the test suite)
 * call. Mirrors scripts/lib/manifest/scaffolder.cjs (the Phase 50 skill
 * scaffolder): same ReDoS-safe NAME_RE, same throw-on-invalid contract, same
 * "render a skeleton string, never touch the manifest" boundary.
 *
 * A stack addendum is a REGISTRY ENTRY, not a skill (CONTEXT R4). This
 * scaffolder writes ONE reference/{systems|frameworks|motion}/<name>.md file
 * with the locked frontmatter + the 4 mandatory sections. It does NOT touch
 * reference/registry.json (the maintainer/orchestrator adds the entry + runs
 * the registry round-trip), exactly as new-skill does not touch skills.json.
 *
 * Exports:
 *   buildAddendumRecord({ kind, name, composesInto }) -> a normalized record
 *     { name, kind, composes_into, phase, dir, path }. Validates kind against
 *     KINDS and name against NAME_RE; defaults composes_into by kind. Throws on
 *     invalid input.
 *   renderAddendumMd(record) -> the addendum skeleton string (frontmatter +
 *     the 4 mandatory sections: Conventions / File patterns / Gotchas /
 *     Example output). Em-dash-free (lint:prose-clean).
 *   targetPathFor(kind, name) -> the repo-root-relative path the file is
 *     written to (e.g. "reference/systems/<name>.md").
 *
 * Dependency-free of any third party (node:path only; no fs writes here — the
 * SKILL.md writes the rendered string with the Write tool, same as new-skill).
 */

// Slug rule mirrors scripts/lib/manifest/scaffolder.cjs NAME_RE and the
// registry.schema.json entry-name pattern: kebab-case, starts alnum,
// ^[a-z0-9][a-z0-9-._]*$. The `\w`-free char class is linear-time (no ReDoS).
const NAME_RE = /^[a-z0-9][a-z0-9-._]*$/;

// The three addendum categories (CONTEXT R4 / shared contracts). Maps each
// kind to its reference subdir and the default composes_into mapper list.
// The defaults mirror the round-1 addendum frontmatter that executors C/D/E
// shipped (systems + frameworks vs motion), so a scaffolded addendum is wired
// the same way the hand-authored ones are.
const KIND_SPEC = {
  system: {
    dir: 'reference/systems',
    composesInto: ['token-mapper', 'component-taxonomy-mapper'],
    label: 'design-system',
  },
  framework: {
    dir: 'reference/frameworks',
    composesInto: ['component-taxonomy-mapper', 'visual-hierarchy-mapper'],
    label: 'framework',
  },
  motion: {
    dir: 'reference/motion',
    composesInto: ['motion-mapper'],
    label: 'motion library',
  },
};

const KINDS = Object.keys(KIND_SPEC);
const PHASE = 54;

function fail(msg) {
  throw new Error(`new-addendum: ${msg}`);
}

/** Normalize a composes_into input (string or array) to a clean mapper list. */
function normalizeComposesInto(composesInto) {
  if (composesInto == null) return undefined;
  let parts;
  if (Array.isArray(composesInto)) parts = composesInto;
  else if (typeof composesInto === 'string') parts = composesInto.split(',');
  else fail('composesInto must be an array or comma-separated string of mapper names');
  const cleaned = parts.map((s) => String(s).trim()).filter(Boolean);
  if (cleaned.length === 0) return undefined;
  // Mapper names follow the same slug rule as everything else here.
  for (const m of cleaned) {
    if (!NAME_RE.test(m)) fail(`composesInto entry "${m}" is not a valid mapper slug`);
  }
  // De-dupe, preserve first-seen order.
  return [...new Set(cleaned)];
}

/** Repo-root-relative target path for a (kind, name). Throws on invalid kind/name. */
function targetPathFor(kind, name) {
  const spec = KIND_SPEC[kind];
  if (!spec) fail(`kind "${kind}" must be one of: ${KINDS.join(', ')}`);
  const n = typeof name === 'string' ? name.trim() : name;
  if (!n || typeof n !== 'string' || !NAME_RE.test(n)) {
    fail(`name "${name}" must match ${NAME_RE} (lower-case, starts alnum, kebab/dot/underscore)`);
  }
  return `${spec.dir}/${n}.md`;
}

/**
 * Build a normalized addendum record from scaffolder inputs.
 * @param {{ kind: string, name: string, composesInto?: string|string[] }} input
 * @returns {{ name, kind, composes_into: string[], phase: number, dir: string, path: string }}
 * @throws on an invalid kind, an invalid name, or a malformed composesInto.
 */
function buildAddendumRecord(input) {
  const opts = input || {};
  const kind = typeof opts.kind === 'string' ? opts.kind.trim().toLowerCase() : opts.kind;
  if (!kind || typeof kind !== 'string' || !KIND_SPEC[kind]) {
    fail(`kind is required and must be one of: ${KINDS.join(', ')}`);
  }
  const name = typeof opts.name === 'string' ? opts.name.trim() : opts.name;
  if (!name || typeof name !== 'string') fail('name is required (a kebab-case slug)');
  if (!NAME_RE.test(name)) {
    fail(`name "${name}" must match ${NAME_RE} (lower-case, starts alnum, kebab/dot/underscore)`);
  }

  const spec = KIND_SPEC[kind];
  const composesInto = normalizeComposesInto(opts.composesInto) || spec.composesInto.slice();

  return {
    name,
    kind,
    composes_into: composesInto,
    phase: PHASE,
    dir: spec.dir,
    path: `${spec.dir}/${name}.md`,
  };
}

/**
 * Render the addendum skeleton string for a record.
 * Frontmatter keys are emitted in the canonical order the round-1 addendums
 * use (name, kind, composes_into, phase). The body carries the 4 mandatory
 * sections (Conventions / File patterns / Gotchas / Example output) with TODO
 * placeholders + a vendor-attribution comment slot (house style). Em-dash-free.
 * @param {object} record  a buildAddendumRecord result (or raw {kind,name,...})
 */
function renderAddendumMd(record) {
  if (!record || typeof record !== 'object') fail('renderAddendumMd requires a record object');
  // Validate / normalize defensively so renderAddendumMd(buildAddendumRecord(x))
  // and renderAddendumMd(rawObject) both produce a contract-valid file.
  const rec = buildAddendumRecord({
    kind: record.kind,
    name: record.name,
    composesInto: record.composes_into,
  });

  const title = rec.name
    .split(/[-._]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  const composes = `[${rec.composes_into.join(', ')}]`;

  const lines = [
    '---',
    `name: ${rec.name}`,
    `kind: ${rec.kind}`,
    `composes_into: ${composes}`,
    `phase: ${rec.phase}`,
    '---',
    `<!-- Vendor docs: TODO add the canonical ${rec.kind} documentation URL. -->`,
    '',
    `# ${title}`,
    '',
    '## Conventions',
    '',
    `- TODO: how this ${rec.kind} names and structures its tokens and components.`,
    '- TODO: the one rule a mapper most often gets wrong here.',
    '',
    '## File patterns',
    '',
    '- TODO: the config files and source-file shapes that identify this stack.',
    `- Identify via: TODO the detectStack signal (dep name or config file) for ${rec.name}.`,
    '',
    '## Gotchas',
    '',
    '- TODO: the usage that looks like a token but is not (flag as an anti-pattern node).',
    '- TODO: a unit or naming trap a mapper must not mis-classify.',
    '',
    '## Example output',
    '',
    '```json',
    '{',
    '  "schema_version": "52.0",',
    '  "nodes": [',
    '    { "id": "tok.color.primary", "type": "token", "subtype": "color", "name": "TODO", "summary": "TODO brand primary token.", "complexity": "simple", "tags": ["color", "brand"] }',
    '  ],',
    '  "edges": []',
    '}',
    '```',
    '',
  ];

  return lines.join('\n');
}

module.exports = {
  buildAddendumRecord,
  renderAddendumMd,
  targetPathFor,
  NAME_RE,
  KINDS,
  KIND_SPEC,
  PHASE,
};
