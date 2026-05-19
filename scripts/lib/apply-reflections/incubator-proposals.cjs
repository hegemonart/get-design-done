// scripts/lib/apply-reflections/incubator-proposals.cjs — Plan 29-05
//
// Incubator-draft proposal class for /gdd:apply-reflections. Consumes drafts
// authored by scripts/lib/incubator-author.cjs (Plan 29-04) at
// `.design/reflections/incubator/<slug>/` and exposes the 7 actions surfaced
// in skills/apply-reflections/SKILL.md.
//
// Exports: discoverIncubatorDrafts, renderProposal, applyAccept, applyReject,
//          applyEdit, checkStage1Gate, recordOptIn.
//
// Decisions honoured:
//   * D-01 — checkStage1Gate is read-only; recordOptIn is the sole writer and
//            only fires on explicit user confirmation. No auto-flip ever.
//   * D-04 — applyAccept performs the full draft → final-artifact write +
//            registry append in one call. No intermediate state.
//   * D-05 — applyAccept calls validateScope from
//            scripts/validate-incubator-scope.cjs BEFORE any filesystem
//            mutation. Failure throws; registry and incubator subdir
//            untouched. Non-bypassable.
//   * D-12 — DRAFT.md is copied verbatim, so the drafter's `delegate_to: null`
//            frontmatter survives the promotion.
//
// Style: CommonJS, zero external deps (node:fs / node:path / node:child_process /
//        node:os only).

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const child_process = require('node:child_process');
const os = require('node:os');

const { validateScope } = require('../../validate-incubator-scope.cjs');

// ---  Constants  ---

const DEFAULT_INCUBATOR_DIR = '.design/reflections/incubator';
const DEFAULT_REGISTRY_PATH = 'reference/registry.json';
const DEFAULT_GATE_SPEC_PATH = 'reference/capability-gap-stage-gate.md';
const DEFAULT_STATE_PATH = '.planning/STATE.md';
const OPT_IN_HEADING = '## Capability-gap Stage-1 opt-in';
const OPT_IN_TOKEN_RE = /Stage-1 opt-in|capability.gap.*opt.in|confirmed_by/i;

// ---  Helpers  ---

function safeReadFileSync(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch (_) {
    return null;
  }
}

function warn(msg) {
  // Single-line stderr warning. Keeps SKILL.md UX clean.
  process.stderr.write(`[incubator-proposals] WARN: ${msg}\n`);
}

function quoteArg(s) {
  // Cross-platform quote: wrap in double quotes and escape embedded ones.
  // Sufficient for tmpdir paths (no real shell metachars expected).
  return `"${String(s).replace(/"/g, '\\"')}"`;
}

// ---  discoverIncubatorDrafts  ---

/**
 * Walk the incubator directory and return one Draft per valid slug. Malformed
 * subdirs (missing/unparseable manifest, missing DRAFT.md) are skipped with a
 * stderr warning; never throws.
 */
function discoverIncubatorDrafts(options) {
  const o = options || {};
  const incubatorDir = o.incubatorDir || DEFAULT_INCUBATOR_DIR;
  if (!fs.existsSync(incubatorDir)) {
    return [];
  }

  let entries;
  try {
    entries = fs.readdirSync(incubatorDir, { withFileTypes: true });
  } catch (err) {
    warn(`cannot read incubator dir ${incubatorDir}: ${err.message}`);
    return [];
  }

  const drafts = [];
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    if (ent.name === 'archive') continue; // D-06: archived drafts not surfaced

    const slugDir = path.join(incubatorDir, ent.name);
    const manifestPath = path.join(slugDir, 'manifest.json');
    const draftPath = path.join(slugDir, 'DRAFT.md');
    const originPath = path.join(slugDir, 'ORIGIN.md');

    if (!fs.existsSync(manifestPath)) {
      warn(`skip ${slugDir}: missing manifest.json`);
      continue;
    }
    if (!fs.existsSync(draftPath)) {
      warn(`skip ${slugDir}: missing DRAFT.md`);
      continue;
    }
    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (err) {
      warn(`skip ${slugDir}: manifest.json parse error: ${err.message}`);
      continue;
    }
    if (!manifest || typeof manifest !== 'object' || !manifest.slug || !manifest.kind || !manifest.target_path) {
      warn(`skip ${slugDir}: manifest missing required fields (slug/kind/target_path)`);
      continue;
    }

    drafts.push({
      slug: manifest.slug,
      kind: manifest.kind,
      target_path: manifest.target_path,
      draft_path: draftPath,
      origin_path: fs.existsSync(originPath) ? originPath : null,
      manifest,
    });
  }

  // Deterministic ordering by slug ascending — matches incubator-author.cjs style.
  drafts.sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  return drafts;
}

// ---  renderProposal  ---

/**
 * Render a draft as markdown: header (slug + kind), diff vs nearest existing
 * artifact (or "net-new"), Origin section, full draft body.
 */
function renderProposal(draft, options) {
  const o = options || {};
  const resolver = typeof o.existingArtifactResolver === 'function' ? o.existingArtifactResolver : () => null;

  const body = safeReadFileSync(draft.draft_path) || '';
  const origin = draft.origin_path ? safeReadFileSync(draft.origin_path) : null;

  const existing = resolver(draft.target_path);
  let diffSection;
  if (existing == null) {
    diffSection = `### Diff vs existing\n\nNo existing artifact — net-new proposal.\n`;
  } else {
    diffSection = `### Diff vs existing\n\n\`\`\`diff\n--- ${draft.target_path} (existing)\n+++ ${draft.target_path} (proposed)\n${renderUnifiedDiff(existing, body)}\n\`\`\`\n`;
  }

  const originSection = origin
    ? `## Origin\n\n${origin.trim()}\n`
    : `## Origin\n\n(no ORIGIN.md found in incubator subdir)\n`;

  return [
    `## Proposal — ${draft.slug} (${draft.kind})`,
    `Target: \`${draft.target_path}\``,
    '',
    diffSection,
    originSection,
    '### Draft body',
    '',
    body.trim(),
    '',
  ].join('\n');
}

/**
 * Minimal unified-diff renderer (line-level, no LCS) for human review only.
 * Not for round-trip patch application — that would need an actual diff
 * library, which we deliberately avoid to keep deps at zero.
 */
function renderUnifiedDiff(oldText, newText) {
  const oldLines = (oldText || '').split('\n');
  const newLines = (newText || '').split('\n');
  // Cheap diff: emit `-` for old lines absent in new, `+` for new lines
  // absent in old, ` ` for shared lines. Order: all `-`, then all `+`.
  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);
  const out = [];
  for (const ln of oldLines) {
    if (!newSet.has(ln)) out.push(`-${ln}`);
  }
  for (const ln of newLines) {
    if (!oldSet.has(ln)) out.push(`+${ln}`);
  }
  if (out.length === 0) {
    return '(no line-level differences)';
  }
  return out.join('\n');
}

// ---  applyAccept (D-04 + D-05)  ---

/**
 * Promote draft → final artifact + registry entry in one call (D-04).
 *
 * Order: validateScope (D-05; throws → no writes) → read DRAFT.md →
 * [dryRun: return intent] → mkdirp parent → atomic-write target →
 * append-and-atomic-write registry → fs.rm incubator subdir last
 * (so partial failure leaves draft retryable — T-29.05-04).
 */
function applyAccept(draft, options) {
  const o = options || {};
  const repoRoot = o.repoRoot || process.cwd();
  const registryPath = path.isAbsolute(o.registryPath || '')
    ? o.registryPath
    : path.join(repoRoot, o.registryPath || DEFAULT_REGISTRY_PATH);
  const dryRun = !!o.dryRun;

  // Step 1 — D-05 scope guard. THROWS on failure; registry untouched.
  validateScope(draft.target_path, { repoRoot });

  const draftBody = fs.readFileSync(draft.draft_path, 'utf8');
  const targetAbs = path.resolve(repoRoot, draft.target_path);

  const registryEntry = {
    slug: draft.slug,
    path: draft.target_path.replace(/\\/g, '/'),
    added: new Date().toISOString(),
    origin: 'incubator',
  };

  if (dryRun) {
    return {
      wouldWrite: draft.target_path.replace(/\\/g, '/'),
      wouldRegister: registryEntry,
      kind: draft.kind,
    };
  }

  // Step 4 — mkdirp parent
  fs.mkdirSync(path.dirname(targetAbs), { recursive: true });

  // Step 5 — atomic write of target file
  atomicWriteFileSync(targetAbs, draftBody);

  // Step 6 — append registry entry
  appendRegistryEntry(registryPath, draft.kind, registryEntry);

  // Step 7 — remove incubator subdir last (partial-failure rollback safety)
  const slugDir = path.dirname(path.resolve(draft.draft_path));
  fs.rmSync(slugDir, { recursive: true, force: true });

  return { accepted: true, path: draft.target_path.replace(/\\/g, '/') };
}

function atomicWriteFileSync(targetAbs, body) {
  const tmp = `${targetAbs}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, body);
  fs.renameSync(tmp, targetAbs);
}

function appendRegistryEntry(registryPath, kind, entry) {
  let registry;
  if (fs.existsSync(registryPath)) {
    try {
      registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    } catch (err) {
      throw new Error(`[incubator-proposals] registry parse error at ${registryPath}: ${err.message}`);
    }
  } else {
    registry = { agents: [], skills: [] };
  }
  if (!registry || typeof registry !== 'object') {
    throw new Error(`[incubator-proposals] registry root must be an object: ${registryPath}`);
  }

  // Phase 14.5 self-authoring shape: { agents: [...], skills: [...] }.
  // Initialize missing arrays additively so we never clobber another schema's data.
  if (kind === 'agent') {
    if (!Array.isArray(registry.agents)) registry.agents = [];
    registry.agents.push(entry);
  } else if (kind === 'skill') {
    if (!Array.isArray(registry.skills)) registry.skills = [];
    registry.skills.push(entry);
  } else {
    throw new Error(`[incubator-proposals] unknown kind: ${kind} (expected 'agent' or 'skill')`);
  }

  atomicWriteFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n');
}

// ---  applyReject  ---

/**
 * Remove the incubator subdir for this draft. Registry untouched.
 *
 * @param {object} draft
 * @returns {{rejected:true, slug:string}}
 */
function applyReject(draft) {
  const slugDir = path.dirname(path.resolve(draft.draft_path));
  fs.rmSync(slugDir, { recursive: true, force: true });
  return { rejected: true, slug: draft.slug };
}

// ---  applyEdit  ---

/**
 * Open the user's editor ($EDITOR / editorEnv / 'vi' fallback) on a temp copy
 * of DRAFT.md. On exit-0, copy edits back and return the reloaded draft. On
 * non-zero exit, return {edited:false, reason}. editorEnv may include args
 * (split on whitespace, e.g. "node /path/to/mock-editor.cjs").
 */
function applyEdit(draft, options) {
  const o = options || {};
  const editorEnv = o.editorEnv || process.env.EDITOR || 'vi';

  // Write a temp copy
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'incu-edit-'));
  const tmpFile = path.join(tmpDir, path.basename(draft.draft_path));
  fs.copyFileSync(draft.draft_path, tmpFile);

  try {
    // Two invocation modes:
    //   options.editorCmd: [exec, ...args]  -- no shell, fully tokenized
    //   options.editorEnv: shell command line (default: $EDITOR or 'vi')
    // The array form avoids shell quoting headaches for Windows paths that
    // contain spaces (e.g. "C:\\Program Files\\nodejs\\node.exe") in tests.
    let r;
    if (Array.isArray(o.editorCmd) && o.editorCmd.length) {
      const [cmd, ...args] = o.editorCmd;
      r = child_process.spawnSync(cmd, args.concat([tmpFile]), { stdio: 'inherit' });
    } else {
      const cmdline = `${editorEnv} ${quoteArg(tmpFile)}`;
      r = child_process.spawnSync(cmdline, { stdio: 'inherit', shell: true });
    }

    if (r.status !== 0) {
      return { edited: false, reason: 'editor_aborted', exit_code: r.status };
    }

    // Copy edited tmp back over the draft
    fs.copyFileSync(tmpFile, draft.draft_path);

    // Reload the draft so target_path / manifest re-sync if anything in
    // the editor changed (manifest itself is not edited here, but the body
    // may have changed). discoverIncubatorDrafts re-reads manifest.json.
    const incubatorDir = path.dirname(path.dirname(path.resolve(draft.draft_path)));
    const all = discoverIncubatorDrafts({ incubatorDir });
    const reloaded = all.find((d) => d.slug === draft.slug);
    return reloaded || { edited: false, reason: 'draft_vanished_post_edit' };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ---  checkStage1Gate (D-01: read-only)  ---

/**
 * Read-only Stage-1 gate inspection (D-01).
 *   thresholdMet  = count(registry entries with origin === 'incubator') ≥ K
 *   optInRecorded = state file contains an opt-in token
 *   summary       = human-readable one-liner
 * Reads only — never writes. Surfacing the threshold is a prompt, not a flip.
 */
function checkStage1Gate(options) {
  const o = options || {};
  const gateSpecPath = o.gateSpecPath || DEFAULT_GATE_SPEC_PATH;
  const statePath = o.statePath || DEFAULT_STATE_PATH;
  const registryPath = o.registryPath || DEFAULT_REGISTRY_PATH;

  const K = readK(gateSpecPath);

  let acceptedCount = 0;
  const regSrc = safeReadFileSync(registryPath);
  if (regSrc) {
    try {
      const reg = JSON.parse(regSrc);
      const skills = Array.isArray(reg.skills) ? reg.skills : [];
      const agents = Array.isArray(reg.agents) ? reg.agents : [];
      for (const e of skills.concat(agents)) {
        if (e && e.origin === 'incubator') acceptedCount += 1;
      }
    } catch (_) {
      // Malformed registry — treat as zero accepted; do not throw.
    }
  }

  const thresholdMet = acceptedCount >= K;

  const stateSrc = safeReadFileSync(statePath) || '';
  const optInRecorded = OPT_IN_TOKEN_RE.test(stateSrc);

  return {
    thresholdMet,
    summary: `${acceptedCount} of ${K} incubator-origin entries accepted` +
      (thresholdMet ? ' (Stage-1 gate met)' : ' (Stage-1 gate not yet met)'),
    optInRecorded,
  };
}

/**
 * Pull `K` out of capability-gap-stage-gate.md. The doc encodes K as a row
 * in a markdown table:  `| K | 3 | Minimum number of stable clusters... |`.
 * If absent or unparseable, fall back to 3 (Phase 29 D-03 default).
 */
function readK(gateSpecPath) {
  const src = safeReadFileSync(gateSpecPath);
  if (!src) return 3;
  const m = src.match(/\|\s*`?K`?\s*\|\s*`?(\d+)`?\s*\|/);
  if (!m) return 3;
  const v = parseInt(m[1], 10);
  return Number.isFinite(v) && v > 0 ? v : 3;
}

// ---  recordOptIn (D-01: explicit-only)  ---

/**
 * Persist the user's explicit Stage-1 opt-in to STATE.md. Idempotent.
 * IMPORTANT: this is the SOLE state writer in this module. Only invoke after
 * explicit user confirmation in the apply-reflections UX (D-01).
 */
function recordOptIn(options) {
  const o = options || {};
  const statePath = o.statePath || DEFAULT_STATE_PATH;
  const confirmedBy = o.confirmedBy || 'user';

  const existing = safeReadFileSync(statePath) || '';
  if (OPT_IN_TOKEN_RE.test(existing)) {
    return { alreadyRecorded: true };
  }

  const at = new Date().toISOString();
  const block =
    `\n${OPT_IN_HEADING}\n\n` +
    `- recorded_at: ${at}\n` +
    `- confirmed_by: ${confirmedBy}\n`;
  const next = existing + (existing.endsWith('\n') ? '' : '\n') + block;
  atomicWriteFileSync(statePath, next);
  return { optInRecorded: true, at, confirmedBy };
}

// ---  Exports  ---

module.exports = {
  discoverIncubatorDrafts,
  renderProposal,
  applyAccept,
  applyReject,
  applyEdit,
  checkStage1Gate,
  recordOptIn,
};
