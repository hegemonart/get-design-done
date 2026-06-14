#!/usr/bin/env node
'use strict';
/**
 * scripts/validate-catalog-integrity.cjs — Phase 60 (Foundation Honesty) regression guard.
 *
 * The catalog is CLEAN today: 96 skills.json entries form a bijection with
 * scripts/skill-templates/<name>/SKILL.md and skills/<name>/SKILL.md; 64 agents;
 * zero content dupes; zero orphans. This validator is NOT a cleanup tool — there is
 * nothing to clean. It LOCKS IN that clean state and FAILS the moment bloat, exact
 * content dupes, near-clone descriptions, or orphans are introduced later.
 *
 * Checks:
 *   (a) Exact content-hash dupes — sha256 of each file body (frontmatter stripped)
 *       across scripts/skill-templates/*​/SKILL.md and agents/*.md (excl. README.md).
 *       Two files with identical body hash = a copy-paste clone.
 *   (b) Near-duplicate descriptions — pairwise Jaccard token-overlap across
 *       skills.json descriptions; flag any pair at/above NEAR_DUP_THRESHOLD.
 *   (c) Bijection — every skills.json `name` has BOTH a skill-template SKILL.md and a
 *       generated skills/<name>/SKILL.md, and there are no orphans in any of the three
 *       sets (manifest names, template dirs, generated dirs must be the same set).
 *   (d) Description sanity — every entry has a non-empty `description` within the
 *       agentskills.io contract length window (DESC_MIN..DESC_MAX chars).
 *   (e) Capability honesty — every MCP server named in plugin.json/marketplace.json
 *       resolves to a real sdk/mcp/<server>/server.ts, and the read-only MCP tool count
 *       claimed in surface text agrees with the count of sdk/mcp/hone-mcp/tools/hone_*.ts
 *       (derived from disk, never hardcoded).
 *
 * NEAR-DUP THRESHOLD CALIBRATION (check b):
 *   Measured against the current clean catalog (96 skills), the maximum REAL pairwise
 *   description overlap is 0.7083 (paper-write <-> pencil-write — deliberately parallel
 *   "writer-family" descriptions). The next pairs are 0.6545 (figma-write/paper-write)
 *   and 0.5424 (figma-write/pencil-write); everything else drops below 0.32. The
 *   distinct-but-parallel writer family is intentional, so the threshold sits safely
 *   ABOVE 0.7083. A genuine future near-clone (an accidental copy-paste of an existing
 *   description with one word changed) lands near ~0.95-1.0 and is caught.
 *     NEAR_DUP_THRESHOLD = 0.85   (current max real overlap 0.7083; headroom 0.14)
 *
 * Exit codes:
 *   0  clean — no findings.
 *   1  at least one finding (exact dupe, near-dup, orphan, bad description, or
 *      capability-honesty mismatch).
 *   2  internal error (I/O failure, parse exception, bad CLI arg).
 *
 * CLI:
 *   node scripts/validate-catalog-integrity.cjs            # lint the live catalog
 *   node scripts/validate-catalog-integrity.cjs --json     # machine-readable report
 *   node scripts/validate-catalog-integrity.cjs --help     # usage
 *
 * Exports (for tests — pure, no process.exit):
 *   stripFrontmatter(text) -> string
 *   bodyHash(text) -> string (sha256 hex of frontmatter-stripped body)
 *   descTokens(desc) -> Set<string>
 *   jaccard(a, b) -> number
 *   checkExactDupes(files)        -> Finding[]   files: [{ path, text }]
 *   checkNearDupDescriptions(skills, threshold) -> Finding[]
 *   checkBijection(sets)          -> Finding[]   sets: { manifest, templates, generated } (string[])
 *   checkDescriptionSanity(skills)-> Finding[]
 *   checkCapabilityHonesty(env)   -> Finding[]
 *   runChecks(input)              -> { findings, counts }
 *   main(argv)                    -> exit code (pure)
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const SKILLS_JSON = path.join(ROOT, 'scripts', 'lib', 'manifest', 'skills.json');
const TEMPLATES_DIR = path.join(ROOT, 'scripts', 'skill-templates');
const GENERATED_DIR = path.join(ROOT, 'skills');
const AGENTS_DIR = path.join(ROOT, 'agents');
const MCP_DIR = path.join(ROOT, 'sdk', 'mcp');
const MCP_TOOLS_DIR = path.join(MCP_DIR, 'hone-mcp', 'tools');
const PLUGIN_JSON = path.join(ROOT, '.claude-plugin', 'plugin.json');
const MARKETPLACE_JSON = path.join(ROOT, '.claude-plugin', 'marketplace.json');

// agentskills.io description contract length window (see lint:agentskills hard cap = 1024).
const DESC_MIN = 20;
const DESC_MAX = 1024;

// See "NEAR-DUP THRESHOLD CALIBRATION" header block. Current max real overlap = 0.7083.
const NEAR_DUP_THRESHOLD = 0.85;

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** Strip a leading YAML frontmatter block (--- ... ---). Returns the body only. */
function stripFrontmatter(text) {
  const s = String(text);
  // Frontmatter must start at byte 0 (optionally after a BOM).
  const m = /^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(s);
  return m ? s.slice(m[0].length) : s;
}

/** sha256 hex of the frontmatter-stripped body, with trailing whitespace normalized. */
function bodyHash(text) {
  const body = stripFrontmatter(text).replace(/\s+$/, '');
  return crypto.createHash('sha256').update(body, 'utf8').digest('hex');
}

/** Lowercased word-token set of a description. */
function descTokens(desc) {
  return new Set(String(desc || '').toLowerCase().match(/[a-z0-9]+/g) || []);
}

/** Jaccard similarity of two token sets (0..1; 0 when both empty). */
function jaccard(a, b) {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

// ---------------------------------------------------------------------------
// Checks (each pure; each returns Finding[])  Finding = { kind, message }
// ---------------------------------------------------------------------------

/** (a) Exact content-hash dupes. files: [{ path, text }]. */
function checkExactDupes(files) {
  const byHash = new Map();
  for (const f of files) {
    const h = bodyHash(f.text);
    if (!byHash.has(h)) byHash.set(h, []);
    byHash.get(h).push(f.path);
  }
  const findings = [];
  for (const [h, paths] of byHash) {
    if (paths.length > 1) {
      findings.push({
        kind: 'exact-dupe',
        message: `identical body (sha256 ${h.slice(0, 12)}) shared by: ${paths.slice().sort().join(', ')}`,
      });
    }
  }
  return findings.sort((a, b) => a.message.localeCompare(b.message));
}

/** (b) Near-duplicate descriptions. skills: [{ name, description }]. */
function checkNearDupDescriptions(skills, threshold = NEAR_DUP_THRESHOLD) {
  const ts = (skills || []).map((s) => ({ name: s.name, tok: descTokens(s.description) }));
  const findings = [];
  for (let i = 0; i < ts.length; i++) {
    for (let j = i + 1; j < ts.length; j++) {
      const sim = jaccard(ts[i].tok, ts[j].tok);
      if (sim >= threshold) {
        findings.push({
          kind: 'near-dup-description',
          message: `descriptions ${(sim).toFixed(4)} similar (>= ${threshold}): "${ts[i].name}" vs "${ts[j].name}"`,
        });
      }
    }
  }
  return findings.sort((a, b) => a.message.localeCompare(b.message));
}

/**
 * (c) Bijection — manifest names, template dirs, and generated dirs must be the same set.
 * sets: { manifest: string[], templates: string[], generated: string[] }
 */
function checkBijection(sets) {
  const manifest = new Set(sets.manifest || []);
  const templates = new Set(sets.templates || []);
  const generated = new Set(sets.generated || []);
  const findings = [];
  const diff = (a, b, aLabel, bLabel) => {
    for (const name of [...a].sort()) {
      if (!b.has(name)) {
        findings.push({
          kind: 'orphan',
          message: `"${name}" present in ${aLabel} but missing from ${bLabel}`,
        });
      }
    }
  };
  diff(manifest, templates, 'skills.json', 'scripts/skill-templates/');
  diff(templates, manifest, 'scripts/skill-templates/', 'skills.json');
  diff(manifest, generated, 'skills.json', 'skills/');
  diff(generated, manifest, 'skills/', 'skills.json');
  return findings;
}

/** (d) Description sanity. skills: [{ name, description }]. */
function checkDescriptionSanity(skills) {
  const findings = [];
  for (const s of skills || []) {
    const d = s.description;
    if (!d || !String(d).trim()) {
      findings.push({ kind: 'bad-description', message: `"${s.name}" has an empty description` });
      continue;
    }
    const len = String(d).length;
    if (len < DESC_MIN || len > DESC_MAX) {
      findings.push({
        kind: 'bad-description',
        message: `"${s.name}" description length ${len} outside contract ${DESC_MIN}-${DESC_MAX}`,
      });
    }
  }
  return findings;
}

/**
 * (e) Capability honesty.
 * env: {
 *   declaredServers: string[],          // MCP server names from plugin/marketplace json
 *   serverExists: (name) => boolean,    // sdk/mcp/<name>/server.ts present?
 *   actualToolCount: number,            // count of sdk/mcp/hone-mcp/tools/hone_*.ts
 *   claimedToolCounts: number[],        // "<N> read-only MCP tools" found in surfaces
 * }
 */
function checkCapabilityHonesty(env) {
  const findings = [];
  for (const name of (env.declaredServers || []).slice().sort()) {
    if (!env.serverExists(name)) {
      findings.push({
        kind: 'capability-honesty',
        message: `MCP server "${name}" is declared but has no sdk/mcp/${name}/server.ts`,
      });
    }
  }
  for (const claimed of env.claimedToolCounts || []) {
    if (claimed !== env.actualToolCount) {
      findings.push({
        kind: 'capability-honesty',
        message: `claimed ${claimed} read-only MCP tools but sdk/mcp/hone-mcp/tools/ has ${env.actualToolCount} hone_*.ts`,
      });
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Disk loaders (impure — used by runChecks against the live repo)
// ---------------------------------------------------------------------------

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function listDirs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

function loadTemplateFiles() {
  const out = [];
  for (const name of listDirs(TEMPLATES_DIR)) {
    const p = path.join(TEMPLATES_DIR, name, 'SKILL.md');
    if (fs.existsSync(p)) out.push({ path: `scripts/skill-templates/${name}/SKILL.md`, text: fs.readFileSync(p, 'utf8') });
  }
  return out;
}

function loadAgentFiles() {
  if (!fs.existsSync(AGENTS_DIR)) return [];
  return fs
    .readdirSync(AGENTS_DIR)
    .filter((f) => f.endsWith('.md') && f !== 'README.md')
    .map((f) => ({ path: `agents/${f}`, text: fs.readFileSync(path.join(AGENTS_DIR, f), 'utf8') }));
}

function declaredMcpServers() {
  const names = new Set();
  for (const p of [PLUGIN_JSON, MARKETPLACE_JSON]) {
    if (!fs.existsSync(p)) continue;
    let json;
    try { json = readJson(p); } catch { continue; }
    const collect = (obj) => {
      if (obj && typeof obj === 'object') for (const k of Object.keys(obj)) names.add(k);
    };
    collect(json.mcpServers || json.mcp);
    for (const plugin of json.plugins || []) collect(plugin.mcpServers || plugin.mcp);
  }
  return [...names];
}

function countMcpTools() {
  if (!fs.existsSync(MCP_TOOLS_DIR)) return 0;
  return fs.readdirSync(MCP_TOOLS_DIR).filter((f) => /^hone_[a-z0-9_]+\.ts$/.test(f)).length;
}

function claimedToolCountsFromSurfaces() {
  const re = /(\d+)\s*\+?\s+read-only\s+MCP\s+tools?\b/gi;
  const out = [];
  const texts = [];
  for (const p of [PLUGIN_JSON, MARKETPLACE_JSON]) {
    if (fs.existsSync(p)) texts.push(fs.readFileSync(p, 'utf8'));
  }
  const readme = path.join(ROOT, 'README.md');
  if (fs.existsSync(readme)) texts.push(fs.readFileSync(readme, 'utf8'));
  for (const t of texts) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(t)) !== null) out.push(parseInt(m[1], 10));
  }
  return out;
}

/**
 * Run every check against the live repo (or against an injected `input` for tests).
 * input (all optional — defaults load from disk):
 *   { skills, hashFiles, bijectionSets, capabilityEnv }
 * Returns { findings: Finding[], counts: {...} }.
 */
function runChecks(input = {}) {
  const skills = input.skills || readJson(SKILLS_JSON).skills;

  const hashFiles = input.hashFiles || [...loadTemplateFiles(), ...loadAgentFiles()];
  const templateNames = listDirs(TEMPLATES_DIR);
  const generatedNames = listDirs(GENERATED_DIR);

  const bijectionSets =
    input.bijectionSets || {
      manifest: skills.map((s) => s.name),
      templates: templateNames,
      generated: generatedNames,
    };

  const capabilityEnv =
    input.capabilityEnv || {
      declaredServers: declaredMcpServers(),
      serverExists: (name) => fs.existsSync(path.join(MCP_DIR, name, 'server.ts')),
      actualToolCount: countMcpTools(),
      claimedToolCounts: claimedToolCountsFromSurfaces(),
    };

  const findings = [
    ...checkExactDupes(hashFiles),
    ...checkNearDupDescriptions(skills, NEAR_DUP_THRESHOLD),
    ...checkBijection(bijectionSets),
    ...checkDescriptionSanity(skills),
    ...checkCapabilityHonesty(capabilityEnv),
  ];

  const agentCount = hashFiles.filter((f) => f.path.startsWith('agents/')).length;
  const skillFileCount = hashFiles.filter((f) => f.path.startsWith('scripts/skill-templates/')).length;

  return {
    findings,
    counts: {
      skills: skills.length,
      skillTemplates: skillFileCount,
      agents: agentCount,
      mcpServers: capabilityEnv.declaredServers.length,
      mcpTools: capabilityEnv.actualToolCount,
    },
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function printHelp(out) {
  out.write(
    [
      'validate-catalog-integrity.cjs — Phase 60 catalog regression guard',
      '',
      'Fails on exact content dupes, near-clone descriptions, manifest/template/skills',
      'bijection breaks, out-of-contract descriptions, or capability-honesty mismatches',
      '(declared MCP server without server.ts, or a mis-stated read-only MCP tool count).',
      '',
      'Usage: node scripts/validate-catalog-integrity.cjs [--json] [--help]',
      '',
      'Exit codes: 0=clean, 1=finding(s), 2=internal error.',
      '',
    ].join('\n'),
  );
}

function main(argv) {
  const args = argv.slice(2);
  const out = process.stdout;
  const err = process.stderr;
  let json = false;
  for (const a of args) {
    if (a === '--json') json = true;
    else if (a === '--help' || a === '-h') { printHelp(out); return 0; }
    else { err.write(`validate-catalog-integrity: unknown flag: ${a}\n`); return 2; }
  }

  let result;
  try {
    result = runChecks();
  } catch (e) {
    err.write(`validate-catalog-integrity: internal error (${e && e.message ? e.message : e})\n`);
    return 2;
  }

  const { findings, counts } = result;

  if (json) {
    out.write(JSON.stringify({ findings, counts, nearDupThreshold: NEAR_DUP_THRESHOLD }, null, 2) + '\n');
    return findings.length > 0 ? 1 : 0;
  }

  if (findings.length > 0) {
    err.write('validate-catalog-integrity: catalog integrity findings:\n');
    for (const f of findings) err.write(`  [${f.kind}] ${f.message}\n`);
    err.write(
      `validate-catalog-integrity: ${findings.length} finding(s) ` +
        `(skills=${counts.skills} skill-templates=${counts.skillTemplates} agents=${counts.agents} ` +
        `mcp-servers=${counts.mcpServers} mcp-tools=${counts.mcpTools})\n`,
    );
    return 1;
  }

  out.write(
    `validate-catalog-integrity: OK - ${counts.skillTemplates} skill templates + ${counts.agents} agents checked, ` +
      `${counts.skills} manifest entries bijective, mcp-servers=${counts.mcpServers} mcp-tools=${counts.mcpTools}, ` +
      `0 findings (near-dup threshold ${NEAR_DUP_THRESHOLD}).\n`,
  );
  return 0;
}

if (require.main === module) process.exit(main(process.argv));

module.exports = {
  stripFrontmatter,
  bodyHash,
  descTokens,
  jaccard,
  checkExactDupes,
  checkNearDupDescriptions,
  checkBijection,
  checkDescriptionSanity,
  checkCapabilityHonesty,
  runChecks,
  main,
  NEAR_DUP_THRESHOLD,
  DESC_MIN,
  DESC_MAX,
};
