#!/usr/bin/env node
'use strict';
/**
 * generate-skill-frontmatter.cjs — Phase 46 (Skill UX Polish).
 *
 * scripts/lib/manifest/skills.json is the single source of truth for the
 * universal skill frontmatter fields (description, argument-hint, tools,
 * user-invocable, disable-model-invocation). This script regenerates the
 * frontmatter block of every scripts/skill-templates/<name>/SKILL.md from that manifest,
 * preserving the markdown body and any non-managed frontmatter lines verbatim.
 *
 * Direction is forward (manifest -> source frontmatter); build-skills.cjs then
 * propagates scripts/skill-templates -> skills/ + dist/claude-code/. A CI drift gate
 * (--check) keeps committed frontmatter == generated.
 *
 * Modes:
 *   (no flag)   regenerate scripts/skill-templates/<name>/SKILL.md frontmatter from skills.json
 *   --check     exit 1 if any committed frontmatter differs from generated (no writes)
 *   --extract   reverse: read current source frontmatter -> rewrite skills.json
 *               (seed/refresh the SoT from ground truth; idempotent with forward)
 *
 * Managed keys (emitted in this canonical order, only when present):
 *   name, description, argument-hint, tools, user-invocable, disable-model-invocation
 * Everything else (color, model, writes:, ...) is carried verbatim in the record's
 * `extra_frontmatter` array and re-emitted after the managed block.
 *
 * Exit: 0 ok / 1 drift (--check) / 2 error.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'scripts', 'skill-templates');
const SKILLS_JSON = path.join(ROOT, 'scripts', 'lib', 'manifest', 'skills.json');

// Managed frontmatter keys <-> manifest record keys, in canonical emit order.
const MANAGED = [
  { fm: 'name', rec: 'name', kind: 'name' },
  { fm: 'description', rec: 'description', kind: 'qstr' },
  { fm: 'argument-hint', rec: 'argument_hint', kind: 'qstr' },
  { fm: 'tools', rec: 'tools', kind: 'bare' },
  { fm: 'user-invocable', rec: 'user_invocable', kind: 'bool' },
  { fm: 'disable-model-invocation', rec: 'disable_model_invocation', kind: 'bool' },
];
const MANAGED_FM = new Set(MANAGED.map((m) => m.fm));

function fail(msg) {
  process.stderr.write(`generate-skill-frontmatter: ${msg}\n`);
  process.exit(2);
}

function listSkillDirs() {
  if (!fs.existsSync(SRC)) fail(`source dir not found: ${SRC}`);
  return fs
    .readdirSync(SRC, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(SRC, e.name, 'SKILL.md')))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));
}

/** Split a SKILL.md into { fmLines, body }. fmLines excludes the --- fences. */
function splitFrontmatter(text, id) {
  const norm = text.replace(/\r\n/g, '\n');
  if (!norm.startsWith('---\n')) fail(`${id}: SKILL.md does not start with a --- frontmatter fence`);
  const end = norm.indexOf('\n---\n', 4);
  if (end === -1) fail(`${id}: unterminated frontmatter`);
  const fmBlock = norm.slice(4, end + 1); // include trailing \n of last fm line
  const body = norm.slice(end + 5); // after "\n---\n"
  const fmLines = fmBlock.replace(/\n$/, '').split('\n');
  return { fmLines, body };
}

function unquote(v) {
  const t = v.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
    return t.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  return t;
}
function quote(s) {
  return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

/** Parse one skill's frontmatter lines into an enriched record. */
function recordFromFrontmatter(id, fmLines) {
  const rec = { name: id };
  const extra = [];
  let i = 0;
  while (i < fmLines.length) {
    const line = fmLines[i];
    const m = /^([A-Za-z][\w-]*):(.*)$/.exec(line);
    if (!m) {
      // stray non-key line at top level — preserve verbatim
      extra.push(line);
      i += 1;
      continue;
    }
    const key = m[1];
    const rawVal = m[2];
    // gather continuation lines (indented or list items or blank-within-block)
    const block = [line];
    let j = i + 1;
    while (j < fmLines.length && /^(\s+\S|\s*-\s|\s*$)/.test(fmLines[j]) && !/^[A-Za-z][\w-]*:/.test(fmLines[j])) {
      block.push(fmLines[j]);
      j += 1;
    }
    const managed = MANAGED.find((mm) => mm.fm === key);
    if (managed && block.length === 1) {
      const v = rawVal.trim();
      if (managed.kind === 'name') {
        if (v !== `gdd-${id}`) rec.frontmatter_name = v;
      } else if (managed.kind === 'bool') {
        rec[managed.rec] = v === 'true';
      } else if (managed.kind === 'qstr') {
        rec[managed.rec] = unquote(v);
      } else {
        rec[managed.rec] = v; // bare (tools)
      }
    } else {
      extra.push(...block);
    }
    i = j;
  }
  if (extra.length) rec.extra_frontmatter = extra;
  return rec;
}

/**
 * Emit the frontmatter block (without --- fences) for a record.
 *
 * Order-preserving: `name` always leads, then the managed keys are emitted in
 * the record's own insertion order (which --extract captures from the original
 * file order), then any non-managed lines verbatim. This keeps forward
 * generation a byte-for-byte fixed point on the committed tree, so existing
 * frontmatter-snapshot baselines never churn. New skills authored directly in
 * skills.json get whatever key order their record uses.
 */
function frontmatterFromRecord(rec) {
  const out = [`name: ${rec.frontmatter_name || `gdd-${rec.name}`}`];
  const byRec = new Map(MANAGED.filter((m) => m.kind !== 'name').map((m) => [m.rec, m]));
  for (const key of Object.keys(rec)) {
    const m = byRec.get(key);
    if (!m) continue; // name / frontmatter_name / extra_frontmatter / registered_in_phase / aliases / ...
    const v = rec[key];
    if (v === undefined || v === null) continue;
    if (m.kind === 'bool') out.push(`${m.fm}: ${v ? 'true' : 'false'}`);
    else if (m.kind === 'qstr') out.push(`${m.fm}: ${quote(v)}`);
    else out.push(`${m.fm}: ${v}`);
  }
  if (Array.isArray(rec.extra_frontmatter)) out.push(...rec.extra_frontmatter);
  return out.join('\n');
}

function readSkillsJson() {
  return JSON.parse(fs.readFileSync(SKILLS_JSON, 'utf8'));
}
function recordMap(json) {
  const map = new Map();
  for (const r of json.skills || []) map.set(r.name, r);
  return map;
}

/** Build the regenerated SKILL.md text for one skill from its record. */
function renderSkill(id, rec) {
  const abs = path.join(SRC, id, 'SKILL.md');
  const { body } = splitFrontmatter(fs.readFileSync(abs, 'utf8'), id);
  return `---\n${frontmatterFromRecord(rec)}\n---\n${body}`;
}

function modeForward(check) {
  const json = readSkillsJson();
  const map = recordMap(json);
  const dirs = listSkillDirs();
  const drift = [];
  let written = 0;
  for (const id of dirs) {
    const rec = map.get(id);
    if (!rec) {
      if (check) { drift.push(`${id} (missing from skills.json)`); continue; }
      fail(`${id}: present in scripts/skill-templates but missing from skills.json — add a record (run --extract)`);
    }
    const abs = path.join(SRC, id, 'SKILL.md');
    const cur = fs.readFileSync(abs, 'utf8').replace(/\r\n/g, '\n');
    const next = renderSkill(id, rec);
    if (cur === next) continue;
    if (check) drift.push(id);
    else { fs.writeFileSync(abs, next); written += 1; }
  }
  // records in skills.json with no source dir (e.g. not yet authored) are tolerated
  if (check) {
    if (drift.length) {
      process.stderr.write(
        `generate-skill-frontmatter --check: ${drift.length} skill(s) drift from skills.json:\n  ${drift.slice(0, 20).join('\n  ')}\n` +
          `Run \`npm run generate:skill-frontmatter\` then \`npm run build:skills\`.\n`,
      );
      process.exit(1);
    }
    process.stdout.write(`generate-skill-frontmatter --check: OK — ${dirs.length} skills match skills.json.\n`);
    return;
  }
  process.stdout.write(`generate-skill-frontmatter: regenerated ${written}/${dirs.length} skill frontmatter block(s).\n`);
}

function modeExtract() {
  // Read directly and treat a missing skills.json as the empty-default seed —
  // avoids the existsSync→readFileSync TOCTOU race.
  let existing;
  try {
    existing = readSkillsJson();
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    existing = { schema_version: 1, skills: [] };
  }
  const prevMap = recordMap(existing);
  const dirs = listSkillDirs();
  const skills = [];
  for (const id of dirs) {
    const { fmLines } = splitFrontmatter(fs.readFileSync(path.join(SRC, id, 'SKILL.md'), 'utf8'), id);
    const rec = recordFromFrontmatter(id, fmLines);
    // preserve curated fields that live only in the manifest (not frontmatter)
    const prev = prevMap.get(id);
    if (prev && prev.registered_in_phase != null) rec.registered_in_phase = prev.registered_in_phase;
    if (prev && prev.aliases != null) rec.aliases = prev.aliases;
    skills.push(rec);
  }
  const out = { schema_version: existing.schema_version || 1 };
  if (existing.note) out.note = existing.note;
  out.skills = skills;
  fs.writeFileSync(SKILLS_JSON, JSON.stringify(out, null, 2) + '\n');
  process.stdout.write(`generate-skill-frontmatter --extract: wrote ${skills.length} enriched records to skills.json.\n`);
}

function main(argv) {
  const args = argv.slice(2);
  if (args.includes('--extract')) return modeExtract();
  return modeForward(args.includes('--check'));
}

if (require.main === module) main(process.argv);

module.exports = {
  splitFrontmatter,
  recordFromFrontmatter,
  frontmatterFromRecord,
  renderSkill,
  unquote,
  quote,
  MANAGED,
  MANAGED_FM,
  main,
};
