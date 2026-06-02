'use strict';
/**
 * scripts/lib/pin/store.cjs — Phase 46 (Skill UX Polish).
 *
 * Core for "pinning" a gdd skill: writing a small standalone shortcut alias
 * (a SKILL.md stub) into every installed harness `skills/` dir so the skill is
 * directly discoverable as its own command in each runtime, plus the inverse
 * (unpin) and an inventory (listPins).
 *
 * The pin marker is exactly:
 *   <!-- gdd-pinned-skill source=<skillId> -->
 * and is the FIRST line of every pinned stub. unpin only ever deletes files
 * carrying this marker, so a hand-written / unrelated SKILL.md is never removed.
 *
 * Metadata (name, description, argument-hint, tools) is pulled from the manifest
 * SoT via readSkills() — NEVER scraped from live frontmatter — so a pinned stub
 * always reflects the canonical record.
 *
 * Writes are atomic: contents go to `<dest>.tmp` then fs.renameSync to the final
 * path (rename is atomic within a filesystem), so a crash mid-write never leaves
 * a half-written SKILL.md.
 *
 * Dependency-free CommonJS. Cross-platform via `path`. Ships in the npm package,
 * so it stays runtime-safe (no dev-only requires).
 */

const fs = require('fs');
const path = require('path');

const { readSkills } = require('../manifest/index.cjs');
const { detectHarnessSkillDirs, harnessSkillDirCandidates } = require('./harness-detect.cjs');

const MARKER_PREFIX = '<!-- gdd-pinned-skill source=';
const MARKER_SUFFIX = ' -->';

/** Build the exact marker line for a skill id. */
function markerFor(skillId) {
  return `${MARKER_PREFIX}${skillId}${MARKER_SUFFIX}`;
}

/**
 * Extract the `source=<id>` skill id from a marker line, or null if the line is
 * not a gdd pin marker. Tolerates surrounding whitespace.
 */
function parseMarker(line) {
  if (typeof line !== 'string') return null;
  const trimmed = line.trim();
  if (!trimmed.startsWith(MARKER_PREFIX) || !trimmed.endsWith(MARKER_SUFFIX)) return null;
  const inner = trimmed.slice(MARKER_PREFIX.length, trimmed.length - MARKER_SUFFIX.length);
  const id = inner.trim();
  return id.length ? id : null;
}

/** First non-empty line of a text blob (trimmed), or '' if none. */
function firstNonEmptyLine(text) {
  const lines = String(text).replace(/\r\n/g, '\n').split('\n');
  for (const l of lines) {
    if (l.trim().length) return l;
  }
  return '';
}

/** Look up a skill record from the manifest SoT by id, or null. */
function lookupSkill(skillId) {
  const { skills } = readSkills();
  for (const r of skills || []) {
    if (r && r.name === skillId) return r;
  }
  return null;
}

/** Double-quote a YAML scalar, escaping backslashes and quotes. */
function quote(s) {
  return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

/**
 * Render the pinned stub contents for a skill record. Layout:
 *   <marker line>
 *   ---
 *   name: gdd-<id>
 *   description: "<desc>"
 *   argument-hint: "<hint>"   (only when the record has one)
 *   tools: <tools>            (only when the record has tools)
 *   ---
 *   <one-line body pointing at the source skill>
 *
 * `name` mirrors the generator: `gdd-<id>` unless the record overrides via
 * `frontmatter_name`.
 */
function renderStub(skillId, rec) {
  const fmName = rec.frontmatter_name || `gdd-${skillId}`;
  const lines = [];
  lines.push(markerFor(skillId));
  lines.push('---');
  lines.push(`name: ${fmName}`);
  lines.push(`description: ${quote(rec.description || '')}`);
  if (rec.argument_hint != null && String(rec.argument_hint).length) {
    lines.push(`argument-hint: ${quote(rec.argument_hint)}`);
  }
  if (rec.tools != null && String(rec.tools).length) {
    lines.push(`tools: ${rec.tools}`);
  }
  lines.push('---');
  lines.push('');
  lines.push(`Pinned alias for the gdd \`${skillId}\` skill. Run the canonical \`${fmName}\` skill; this stub only makes it directly discoverable in this harness.`);
  lines.push('');
  return lines.join('\n');
}

/** Atomic write: write to `<dest>.tmp` then rename into place. */
function atomicWrite(dest, contents) {
  const dir = path.dirname(dest);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${dest}.tmp`;
  fs.writeFileSync(tmp, contents, 'utf8');
  try {
    fs.renameSync(tmp, dest);
  } catch (e) {
    // Clean up the temp file on failure so we never leave a stray .tmp behind.
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    throw e;
  }
}

/**
 * Pin a skill across harness skills dirs.
 *
 * @param {object} args
 * @param {string} args.projectRoot
 * @param {string} args.skillId
 * @param {Array<string>} [args.harnesses] optional allow-list of config_dir or harness id; when omitted, all detected dirs
 * @param {boolean} [args.user] when true, materialize ALL candidate dirs (not just existing ones)
 * @returns {{ skillId: string, written: Array<{ id, config_dir, path }>, skipped: Array<{ id, config_dir, reason }> }}
 */
function pinSkill(args) {
  const { projectRoot, skillId } = args || {};
  if (!projectRoot) throw new TypeError('pinSkill: projectRoot is required');
  if (!skillId) throw new TypeError('pinSkill: skillId is required');

  const rec = lookupSkill(skillId);
  if (!rec) {
    throw new Error(`pinSkill: "${skillId}" is not a known skill in scripts/lib/manifest/skills.json`);
  }

  const all = args.user
    ? harnessSkillDirCandidates(projectRoot)
    : detectHarnessSkillDirs(projectRoot);

  const filter = Array.isArray(args.harnesses) && args.harnesses.length
    ? new Set(args.harnesses)
    : null;
  const targets = filter
    ? all.filter((c) => filter.has(c.config_dir) || filter.has(c.id))
    : all;

  const contents = renderStub(skillId, rec);
  const written = [];
  const skipped = [];
  for (const t of targets) {
    const dest = path.join(t.skillsDir, skillId, 'SKILL.md');
    try {
      atomicWrite(dest, contents);
      written.push({ id: t.id, config_dir: t.config_dir, path: dest });
    } catch (e) {
      skipped.push({ id: t.id, config_dir: t.config_dir, reason: e.message });
    }
  }
  return { skillId, written, skipped };
}

/**
 * Unpin a skill: delete pinned stubs across harness dirs. REFUSES (skips with a
 * warning) any SKILL.md whose first non-empty line is not the gdd pin marker, so
 * a hand-authored skill is never deleted.
 *
 * @param {object} args
 * @param {string} args.projectRoot
 * @param {string} args.skillId
 * @returns {{ skillId: string, removed: Array<{ id, config_dir, path }>, refused: Array<{ id, config_dir, path, reason }>, missing: Array<{ id, config_dir, path }> }}
 */
function unpinSkill(args) {
  const { projectRoot, skillId } = args || {};
  if (!projectRoot) throw new TypeError('unpinSkill: projectRoot is required');
  if (!skillId) throw new TypeError('unpinSkill: skillId is required');

  // Look across every candidate harness dir (existing or not) so we can clean up
  // stubs even if the surrounding harness dir was partially removed.
  const candidates = harnessSkillDirCandidates(projectRoot);
  const removed = [];
  const refused = [];
  const missing = [];

  for (const c of candidates) {
    const file = path.join(c.skillsDir, skillId, 'SKILL.md');
    let content;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      missing.push({ id: c.id, config_dir: c.config_dir, path: file });
      continue;
    }
    const marker = parseMarker(firstNonEmptyLine(content));
    if (marker == null) {
      refused.push({
        id: c.id,
        config_dir: c.config_dir,
        path: file,
        reason: 'first non-empty line lacks the gdd-pinned-skill marker - refusing to delete',
      });
      continue;
    }
    try {
      fs.unlinkSync(file);
      // Remove the now-empty alias dir if nothing else lives there.
      const aliasDir = path.dirname(file);
      try {
        if (fs.readdirSync(aliasDir).length === 0) fs.rmdirSync(aliasDir);
      } catch { /* leave non-empty dir alone */ }
      removed.push({ id: c.id, config_dir: c.config_dir, path: file });
    } catch (e) {
      refused.push({ id: c.id, config_dir: c.config_dir, path: file, reason: e.message });
    }
  }
  return { skillId, removed, refused, missing };
}

/**
 * List pinned skills across harness skills dirs.
 *
 * Scans each existing harness skills dir for `<alias>/SKILL.md` files whose first
 * non-empty line carries the gdd pin marker.
 *
 * @param {string} projectRoot
 * @returns {Array<{ id: string, config_dir: string, alias: string, source: string, pinnedAt: string }>}
 *   `id` is the harness id, `alias` is the on-disk directory name, `source` is the
 *   pinned source skill id from the marker, `pinnedAt` is the file mtime ISO string.
 */
function listPins(projectRoot) {
  if (!projectRoot) throw new TypeError('listPins: projectRoot is required');
  const out = [];
  for (const dir of detectHarnessSkillDirs(projectRoot)) {
    let entries;
    try {
      entries = fs.readdirSync(dir.skillsDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const file = path.join(dir.skillsDir, e.name, 'SKILL.md');
      let content;
      let stat;
      try {
        content = fs.readFileSync(file, 'utf8');
        stat = fs.statSync(file);
      } catch {
        continue;
      }
      const source = parseMarker(firstNonEmptyLine(content));
      if (source == null) continue;
      out.push({
        id: dir.id,
        config_dir: dir.config_dir,
        alias: e.name,
        source,
        pinnedAt: stat.mtime.toISOString(),
      });
    }
  }
  // Stable order: by config_dir then alias for deterministic output.
  out.sort((a, b) => (a.config_dir === b.config_dir
    ? a.alias.localeCompare(b.alias)
    : a.config_dir.localeCompare(b.config_dir)));
  return out;
}

module.exports = {
  pinSkill,
  unpinSkill,
  listPins,
  // exported for the CLI + tests
  markerFor,
  parseMarker,
  renderStub,
  MARKER_PREFIX,
  MARKER_SUFFIX,
};
