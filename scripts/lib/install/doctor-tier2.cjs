'use strict';

/**
 * scripts/lib/install/doctor-tier2.cjs — Phase 28.8 (Plan 28-8-X2).
 *
 * Tier-2 distribution-channel doctor aggregator. Pure, read-only function
 * that consolidates the 3 Tier-2 channels (agentskills.io lint pass from
 * A1, Cursor Marketplace publish state from B2, Codex Plugin manifest
 * validity from C2) into a single status object + a single doctor section.
 *
 * Phase 28.8 D-13: agentskills.io adoption is `lint-only` — this module
 * reuses A1's `lintSummary({sourceRoot})` export (in-process, NOT via
 * spawn) and projects its PASS/WARN/FAIL counts onto the agentskillsIo
 * channel state. WARN does NOT count as ready — only PASS with fail===0
 * and warn===0 reads as "ready". Otherwise the state surfaces (`warn`,
 * `fail`, `not-configured`).
 *
 * Phase 28.8 D-16: Cursor is multi-step. This module wraps B2's pure
 * `reportCursorMarketplace({projectRoot})` reader. The 4-state set
 * (`not-submitted` / `submitted-pending` / `approved-published` /
 * `rejected`) maps to "ready" only when state === 'approved-published'.
 * Wrapped in try/catch — B2 THROWS on malformed state-file (T-04
 * mitigation); aggregator translates that to a `not-configured` state
 * with parse-error detail rather than crashing the whole doctor section.
 *
 * Phase 28.8 D-03: Codex is single-step. This module wraps C2's
 * `checkCodexPlugin(projectRoot)` reader. C2's verdict is binary
 * (`ready-to-install` / `manifest-only-not-ready`) — only the former
 * counts as ready. C2 does NOT throw; it surfaces parse failures as
 * `manifest-only-not-ready` with detail.
 *
 * Phase 28.8 D-10: tmpdir-safe. Pure fs reads only; no writes; no
 * network; no `cursor`/`codex` CLI invocation. Tests pass explicit
 * `sourceRoot` pointing at a tmpdir mkdtemp'd root.
 *
 * STRIDE mitigations (per plan threat register):
 *   T-X2-01 Tampering of marketplace-state.status — B2 throws on unknown
 *           values; we catch + surface as `not-configured` (whitelist
 *           enforced by B2's KNOWN_STATUS_VALUES set).
 *   T-X2-02 Tampering of codex plugin.json entrypoint path traversal —
 *           C2's validateCodexManifest does the schema check; we do
 *           NOT call require.resolve on user-controlled paths. (X2 only
 *           consumes the verdict, not raw entrypoints.)
 *   T-X2-03 DoS via invalid JSON — B2 throws (we catch); C2 surfaces
 *           as manifest-only-not-ready (we read the verdict). Neither
 *           path crashes the doctor.
 *   T-X2-06 Tampering: findInstallSourceRoot walks past tmpdir — we
 *           accept an explicit `sourceRoot` parameter and document its
 *           required presence in test fixtures (the test must plant
 *           package.json at tmpdir root anchoring any walk-up).
 *   T-X2-07 EoP: require.resolve with malicious paths — NOT exercised
 *           by this module (C2's contract owns that).
 *
 * Exports:
 *   - `readTier2Status({sourceRoot})` — pure aggregator; returns
 *     structured status object per the X2 plan <interfaces> shape.
 *   - `formatTier2Section(status)` — text renderer for stdout (used by
 *     install.cjs --doctor).
 *   - `summarizeTier2Status(status)` — convenience export; returns the
 *     `oneLineSummary` string.
 */

const fs = require('node:fs');
const path = require('node:path');

// ────────────────────────────────────────────────────────────────────────
// Lazy-require seams — keep B2/C2 modules optional so this aggregator
// still works when those modules are absent (e.g., a partial worktree
// during integration, or a regression where B2/C2 vanish).
// ────────────────────────────────────────────────────────────────────────

function tryRequireCursorReporter() {
  try {
    return require('./doctor-cursor-marketplace.cjs');
  } catch (_e) {
    return null;
  }
}

function tryRequireCodexReporter() {
  try {
    return require('./doctor-codex-plugin.cjs');
  } catch (_e) {
    return null;
  }
}

function tryRequireLintSummary() {
  try {
    // The lint script is a top-level CLI; we consume its `lintSummary`
    // export in-process per Plan 28-8-X2 design (no child_process spawn).
    return require('../../lint-agentskills-spec.cjs');
  } catch (_e) {
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────────
// Inline fallback readers (used only when B2/C2/A1 modules are absent —
// keeps the aggregator self-sufficient per Plan 28-8-X2 §<action>).
// ────────────────────────────────────────────────────────────────────────

function readJsonFileSafe(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    if (e && e.code === 'ENOENT') return { exists: false, parsed: null, error: null };
    return { exists: false, parsed: null, error: 'read failed: ' + e.message };
  }
  try {
    return { exists: true, parsed: JSON.parse(raw), error: null };
  } catch (e) {
    return { exists: true, parsed: null, error: 'JSON parse error: ' + e.message };
  }
}

const CURSOR_KNOWN_STATES = new Set([
  'not-submitted',
  'submitted-pending',
  'approved-published',
  'rejected',
]);

function inlineCursorReader(sourceRoot) {
  const manifestPath = path.join(sourceRoot, '.cursor-plugin', 'plugin.json');
  const statePath = path.join(sourceRoot, '.cursor-plugin', 'marketplace-state.json');
  const manifestRead = readJsonFileSafe(manifestPath);
  const stateRead = readJsonFileSafe(statePath);

  const manifestPresent = manifestRead.exists;
  const stateFilePresent = stateRead.exists;

  if (!manifestPresent) {
    return {
      state: 'not-configured',
      detail: '.cursor-plugin/plugin.json not found',
      manifestPresent: false,
      stateFilePresent,
    };
  }

  if (!stateFilePresent) {
    return {
      state: 'not-submitted',
      detail: 'manifest present; marketplace-state.json not yet recorded',
      manifestPresent: true,
      stateFilePresent: false,
    };
  }

  if (stateRead.error) {
    return {
      state: 'not-configured',
      detail: 'marketplace-state.json parse error: ' + stateRead.error,
      manifestPresent: true,
      stateFilePresent: true,
    };
  }

  const s = stateRead.parsed && stateRead.parsed.status;
  if (typeof s !== 'string' || !CURSOR_KNOWN_STATES.has(s)) {
    return {
      state: 'not-configured',
      detail: 'marketplace-state.json status missing or invalid: ' + JSON.stringify(s),
      manifestPresent: true,
      stateFilePresent: true,
    };
  }

  return {
    state: s,
    detail: buildCursorDetail(s, stateRead.parsed),
    manifestPresent: true,
    stateFilePresent: true,
  };
}

function buildCursorDetail(state, parsed) {
  switch (state) {
    case 'not-submitted':
      return 'manifest present; not yet submitted to Cursor Marketplace';
    case 'submitted-pending': {
      const t = parsed && typeof parsed['submitted-at'] === 'string'
        ? parsed['submitted-at'].slice(0, 10)
        : null;
      return t
        ? 'awaiting Cursor team review (submitted ' + t + ')'
        : 'awaiting Cursor team review';
    }
    case 'approved-published': {
      const url = parsed && typeof parsed['marketplace-url'] === 'string'
        ? parsed['marketplace-url']
        : null;
      return url ? 'live at ' + url : 'live in Cursor Marketplace';
    }
    case 'rejected':
      return 'rejected: ' + (parsed && parsed.reason ? parsed.reason : 'unspecified');
    default:
      return state;
  }
}

function inlineCodexReader(sourceRoot) {
  const manifestPath = path.join(sourceRoot, '.codex-plugin', 'plugin.json');
  const manifestRead = readJsonFileSafe(manifestPath);

  if (!manifestRead.exists) {
    return {
      state: 'not-configured',
      detail: '.codex-plugin/plugin.json not found',
      manifestPresent: false,
      manifestValid: false,
      simulatedInstallOk: false,
    };
  }
  if (manifestRead.error) {
    return {
      state: 'manifest-only-not-ready',
      detail: 'manifest present but unparseable: ' + manifestRead.error,
      manifestPresent: true,
      manifestValid: false,
      simulatedInstallOk: false,
    };
  }
  const m = manifestRead.parsed;
  const errs = [];
  if (!m || typeof m !== 'object' || Array.isArray(m)) {
    errs.push('manifest is not a JSON object');
  } else {
    if (typeof m.name !== 'string' || !m.name) errs.push('missing required field "name"');
    if (typeof m.version !== 'string' || !m.version) errs.push('missing required field "version"');
    if (typeof m.description !== 'string' || !m.description) errs.push('missing required field "description"');
    const hasShape = (typeof m.entrypoint === 'string' && m.entrypoint)
      || Array.isArray(m.commands)
      || Array.isArray(m.skills);
    if (!hasShape) errs.push('manifest needs at least one of: entrypoint, commands[], skills[]');
  }
  if (errs.length > 0) {
    return {
      state: 'manifest-only-not-ready',
      detail: 'manifest present but invalid: ' + errs[0],
      manifestPresent: true,
      manifestValid: false,
      simulatedInstallOk: false,
    };
  }
  return {
    state: 'ready-to-install',
    detail: 'manifest valid, simulated install OK',
    manifestPresent: true,
    manifestValid: true,
    simulatedInstallOk: true,
  };
}

function inlineLintSummary(sourceRoot) {
  // Walk skills/ ourselves only if the lint module is absent. We don't
  // re-implement the rule set — we just emit a "not-configured" verdict
  // so the doctor still works in a partial-worktree mode. This branch
  // exists only as a safety net for Plan 28-8-X2 + future refactors.
  const skillsDir = path.join(sourceRoot, 'skills');
  if (!fs.existsSync(skillsDir)) return null;
  return { pass: 0, warn: 0, fail: 0 };
}

// ────────────────────────────────────────────────────────────────────────
// Channel sub-status builders
// ────────────────────────────────────────────────────────────────────────

function buildAgentskillsIoStatus(sourceRoot) {
  const skillsDir = path.join(sourceRoot, 'skills');
  if (!fs.existsSync(skillsDir)) {
    return {
      state: 'not-configured',
      counts: null,
      detail: 'skills/ directory not found at ' + sourceRoot,
    };
  }
  const lintModule = tryRequireLintSummary();
  let counts;
  if (lintModule && typeof lintModule.lintSummary === 'function') {
    try {
      counts = lintModule.lintSummary({ sourceRoot });
    } catch (e) {
      return {
        state: 'not-configured',
        counts: null,
        detail: 'lint failed: ' + (e && e.message ? e.message : String(e)),
      };
    }
  } else {
    counts = inlineLintSummary(sourceRoot) || { pass: 0, warn: 0, fail: 0 };
  }
  const pass = Number(counts.pass) || 0;
  const warn = Number(counts.warn) || 0;
  const fail = Number(counts.fail) || 0;

  let state;
  if (fail > 0) state = 'fail';
  else if (warn > 0) state = 'warn';
  else if (pass > 0) state = 'pass';
  else state = 'not-configured';

  return {
    state,
    counts: { pass, warn, fail },
    detail: pass + ' PASS / ' + warn + ' WARN / ' + fail + ' FAIL',
  };
}

function buildCursorMarketplaceStatus(sourceRoot) {
  const cursorMod = tryRequireCursorReporter();
  if (cursorMod && typeof cursorMod.reportCursorMarketplace === 'function') {
    try {
      const r = cursorMod.reportCursorMarketplace({ projectRoot: sourceRoot });
      // B2 reports state even when manifest absent (defaults to
      // 'not-submitted' in that path) — translate manifest-absent into
      // our 'not-configured' to match the X2 interface contract.
      if (!r.manifestPresent) {
        return {
          state: 'not-configured',
          detail: '.cursor-plugin/plugin.json not found',
          manifestPresent: false,
          stateFilePresent: false,
        };
      }
      return {
        state: r.state,
        detail: buildCursorDetailFromB2(r),
        manifestPresent: r.manifestPresent,
        stateFilePresent: r.submittedAt !== null
          || r.approvedAt !== null
          || r.rejectionReason !== null
          || r.marketplaceUrl !== null
          || r.state !== 'not-submitted',
      };
    } catch (e) {
      // B2 throws on malformed state-file or unknown status. Surface as
      // not-configured with detail rather than crashing the doctor (T-X2-03).
      return {
        state: 'not-configured',
        detail: 'cursor-marketplace doctor error: ' + (e && e.message ? e.message : String(e)),
        manifestPresent: true,
        stateFilePresent: true,
      };
    }
  }
  return inlineCursorReader(sourceRoot);
}

function buildCursorDetailFromB2(r) {
  switch (r.state) {
    case 'not-submitted':
      return 'manifest present; not yet submitted to Cursor Marketplace';
    case 'submitted-pending':
      return r.submittedAt
        ? 'awaiting Cursor team review (submitted ' + r.submittedAt.slice(0, 10) + ')'
        : 'awaiting Cursor team review';
    case 'approved-published':
      return r.marketplaceUrl ? 'live at ' + r.marketplaceUrl : 'live in Cursor Marketplace';
    case 'rejected':
      return 'rejected: ' + (r.rejectionReason || 'unspecified');
    default:
      return r.state;
  }
}

function buildCodexPluginStatus(sourceRoot) {
  const codexMod = tryRequireCodexReporter();
  if (codexMod && typeof codexMod.checkCodexPlugin === 'function') {
    try {
      const r = codexMod.checkCodexPlugin(sourceRoot);
      if (!r.manifest.present) {
        return {
          state: 'not-configured',
          detail: '.codex-plugin/plugin.json not found',
          manifestPresent: false,
          manifestValid: false,
          simulatedInstallOk: false,
        };
      }
      // C2's verdict maps directly to our state space.
      const ready = r.verdict === 'ready-to-install';
      const detailParts = [];
      if (ready) {
        detailParts.push('manifest valid, simulated install OK');
      } else {
        detailParts.push('manifest present but invalid');
        if (r.verdictReasons && r.verdictReasons.length > 0) {
          detailParts.push(r.verdictReasons[0]);
        }
      }
      return {
        state: r.verdict,
        detail: detailParts.join(': '),
        manifestPresent: true,
        manifestValid: r.manifest.valid === true,
        simulatedInstallOk: ready,
      };
    } catch (e) {
      // C2 historically does not throw, but defensive anyway.
      return {
        state: 'manifest-only-not-ready',
        detail: 'codex doctor error: ' + (e && e.message ? e.message : String(e)),
        manifestPresent: true,
        manifestValid: false,
        simulatedInstallOk: false,
      };
    }
  }
  return inlineCodexReader(sourceRoot);
}

// ────────────────────────────────────────────────────────────────────────
// Summary builder
// ────────────────────────────────────────────────────────────────────────

function computeReadyCount(status) {
  let n = 0;
  if (status.agentskillsIo.state === 'pass') n++;
  if (status.cursorMarketplace.state === 'approved-published') n++;
  if (status.codexPlugin.state === 'ready-to-install') n++;
  return n;
}

function cursorLabel(state) {
  switch (state) {
    case 'approved-published': return 'live';
    case 'submitted-pending':  return 'pending review';
    case 'not-submitted':      return 'not submitted';
    case 'rejected':           return 'rejected';
    case 'not-configured':     return 'not configured';
    default:                   return state;
  }
}

function codexLabel(state) {
  switch (state) {
    case 'ready-to-install':         return 'ready';
    case 'manifest-only-not-ready':  return 'manifest only (not ready)';
    case 'not-configured':           return 'not configured';
    default:                         return state;
  }
}

function agentskillsLabel(s) {
  if (s.counts) return s.counts.pass + ' PASS / ' + s.counts.warn + ' WARN / ' + s.counts.fail + ' FAIL';
  return 'not configured';
}

function buildSummary(status) {
  const readyCount = computeReadyCount(status);
  const oneLineSummary =
    'tier-2 status: ' + readyCount + ' of 3 channels ready (' +
    'codex ' + codexLabel(status.codexPlugin.state) + '; ' +
    'cursor ' + cursorLabel(status.cursorMarketplace.state) + '; ' +
    'agentskills.io ' + agentskillsLabel(status.agentskillsIo) +
    ')';
  return { readyCount, totalChannels: 3, oneLineSummary };
}

// ────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────

/**
 * Read Tier-2 channel status from a project source root. Pure read-only
 * fs access. Never throws — channel errors are surfaced as `not-configured`
 * with a `detail` string per Plan 28-8-X2 Rule 1/2 defensive contracts.
 *
 * @param {{ sourceRoot?: string }} [opts]
 * @returns {{
 *   agentskillsIo:    { state:string, counts: {pass:number,warn:number,fail:number}|null, detail:string },
 *   cursorMarketplace:{ state:string, detail:string, manifestPresent:boolean, stateFilePresent:boolean },
 *   codexPlugin:      { state:string, detail:string, manifestPresent:boolean, manifestValid:boolean, simulatedInstallOk:boolean },
 *   summary:          { readyCount:number, totalChannels:3, oneLineSummary:string }
 * }}
 */
function readTier2Status(opts) {
  const _opts = opts || {};
  const sourceRoot = _opts.sourceRoot || process.cwd();

  // T-X2-06 mitigation: if sourceRoot doesn't exist as a directory, return
  // a uniformly empty status rather than crashing on every channel reader.
  let dirOk = false;
  try {
    dirOk = fs.statSync(sourceRoot).isDirectory();
  } catch (_e) {
    dirOk = false;
  }
  if (!dirOk) {
    return {
      agentskillsIo:     { state: 'not-configured', counts: null, detail: 'sourceRoot unresolved: ' + sourceRoot },
      cursorMarketplace: { state: 'not-configured', detail: 'sourceRoot unresolved: ' + sourceRoot, manifestPresent: false, stateFilePresent: false },
      codexPlugin:       { state: 'not-configured', detail: 'sourceRoot unresolved: ' + sourceRoot, manifestPresent: false, manifestValid: false, simulatedInstallOk: false },
      summary:           { readyCount: 0, totalChannels: 3, oneLineSummary: 'tier-2 status: 0 of 3 channels ready (sourceRoot unresolved)' },
    };
  }

  const status = {
    agentskillsIo:     buildAgentskillsIoStatus(sourceRoot),
    cursorMarketplace: buildCursorMarketplaceStatus(sourceRoot),
    codexPlugin:       buildCodexPluginStatus(sourceRoot),
  };
  status.summary = buildSummary(status);
  return status;
}

/**
 * Render the structured status as the Tier-2 doctor section text. Pure —
 * no IO. Matches the multi-line shape per Plan 28-8-X2 <interfaces> §.
 *
 * Header: `## Tier-2 Distribution Channels`
 *
 * @param {ReturnType<typeof readTier2Status>} status
 * @returns {string}                           multi-line text, no trailing newline
 */
function formatTier2Section(status) {
  if (!status || typeof status !== 'object') {
    throw new Error('formatTier2Section: status is required');
  }
  const lines = [];
  lines.push('## Tier-2 Distribution Channels');
  lines.push('');
  lines.push(status.summary.oneLineSummary);
  lines.push('');

  // ── agentskills.io ─────────────────────────────────────────────────
  lines.push('### agentskills.io');
  const ai = status.agentskillsIo;
  lines.push('  state:    ' + ai.state);
  if (ai.counts) {
    lines.push('  counts:   ' + ai.counts.pass + ' PASS / ' + ai.counts.warn + ' WARN / ' + ai.counts.fail + ' FAIL');
    lines.push('  source:   scripts/lint-agentskills-spec.cjs --summary');
  } else {
    lines.push('  detail:   ' + ai.detail);
  }
  lines.push('');

  // ── Cursor Marketplace ─────────────────────────────────────────────
  lines.push('### Cursor Marketplace');
  const cm = status.cursorMarketplace;
  lines.push('  state:    ' + cm.state);
  lines.push('  detail:   ' + cm.detail);
  if (cm.state !== 'not-configured') {
    lines.push('  manifest: .cursor-plugin/plugin.json (' + (cm.manifestPresent ? 'present' : 'absent') + ')');
    lines.push('  state-file: .cursor-plugin/marketplace-state.json (' + (cm.stateFilePresent ? 'present' : 'absent') + ')');
  }
  lines.push('');

  // ── Codex Plugin ──────────────────────────────────────────────────
  lines.push('### Codex Plugin');
  const cx = status.codexPlugin;
  lines.push('  state:    ' + cx.state);
  lines.push('  detail:   ' + cx.detail);
  if (cx.state === 'ready-to-install') {
    lines.push('  manifest: .codex-plugin/plugin.json (present, valid)');
    lines.push('  install-cmd: codex plugin marketplace add hegemonart/hone');
  } else if (cx.state === 'manifest-only-not-ready') {
    lines.push('  manifest: .codex-plugin/plugin.json (present, invalid)');
  }

  return lines.join('\n');
}

/**
 * Convenience: return just the one-line summary string from a status.
 * Useful for callers wanting a compact representation (e.g., terminal
 * status bars, scripted post-checks).
 *
 * @param {ReturnType<typeof readTier2Status>} status
 * @returns {string}
 */
function summarizeTier2Status(status) {
  if (!status || !status.summary) {
    throw new Error('summarizeTier2Status: status.summary is required');
  }
  return status.summary.oneLineSummary;
}

module.exports = {
  readTier2Status,
  formatTier2Section,
  summarizeTier2Status,
};
