'use strict';
// scripts/lib/health-mirror/index.cjs — Plan 27.7-02 (renamed in Phase 30.6-08 per D-10)
//
// Pure read-only mirror of skills/health/SKILL.md's check surface.
// NO subprocess spawn — just inspects 4 well-known files/dirs and
// reports status. Used by the gdd_health MCP tool.
//
// Surface:
//   async getHealthChecks(rootDir) → { checks: HealthCheck[] }
//
// The 9 checks (in stable order) are:
//   1. claude_md            — CLAUDE.md presence
//   2. planning_dir         — .planning/ presence
//   3. design_dir           — .design/ presence
//   4. package_json         — package.json present AND parseable
//   5. issue_reporter       — kill-switch state (Plan 30-06 / D-08)
//   6. figma_extract        — extract readiness + Free-tier signal (Plan 31-09)
//   7. skill_discipline     — using-gdd bootstrap + SessionStart inject (Plan 32-07)
//   8. harness_freshness    — per-harness last_verified age (Phase 44)
//   9. stack_addendums      — Phase 54 coverage: N/M detected stacks have addendums
//
// Check 5 was added in Plan 30-06 — surfaces the report-issue kill-switch
// (env or config disable) so users can verify why the command is
// unavailable. The status line is one of three exact strings:
//   - "issue reporter: enabled"
//   - "issue reporter: disabled by env (GDD_DISABLE_ISSUE_REPORTER=1)"
//   - "issue reporter: disabled by config (.design/config.json: issue_reporter=false)"
// When both env and config trigger, env wins (matches D-08 display contract).
//
// Check 6 was added in Plan 31-09 — surfaces figma-extract readiness so a user
// running /gdd:health immediately knows whether figma-extract is usable. The
// detail line is one of three exact strings:
//   - "figma extract: ready (token set)"
//   - "figma extract: token missing"
//   - "figma extract: plugin sync needed for variables (Free tier detected)"
// D-10: only FIGMA_TOKEN *presence* is used — the token VALUE is never read,
// logged, or placed in the detail. The Free-tier state is derived from a LOCAL
// signal only (a prior pull's _meta.json recording a 403/skip on the Variables
// endpoint) — never a live network call (health-mirror is pure read-only).
//
// Check 7 was added in Plan 32-07 — surfaces whether the skill-discipline
// bootstrap (Phase 32) is live so a user can confirm the using-gdd SessionStart
// inject is wired. The detail line is one of three exact strings:
//   - "skill-discipline: ready"            (using-gdd present AND hooks.json
//                                           SessionStart wires inject-using-gdd.sh)
//   - "skill-discipline: missing using-gdd" (skills/using-gdd/SKILL.md absent)
//   - "skill-discipline: hook not wired"    (skill present but no SessionStart
//                                           inject-using-gdd entry)
// status: 'ok' when ready, 'warn' otherwise. PURE read-only (rootDir-relative
// file + JSON inspection only) — NEVER throws, NEVER networks.

const fs = require('node:fs');
const path = require('node:path');

const { getDisableReason } = require('../issue-reporter/kill-switch.cjs');
const { checkFreshness, WARN_DAYS, FAIL_DAYS } = require('../harness-freshness.cjs');

function fileExists(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function dirExists(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

async function getHealthChecks(rootDir) {
  const checks = [];

  // 1. CLAUDE.md
  {
    const p = path.join(rootDir, 'CLAUDE.md');
    const present = fileExists(p);
    checks.push({
      name: 'claude_md',
      status: present ? 'ok' : 'warn',
      detail: present ? p : 'CLAUDE.md not found at project root',
    });
  }

  // 2. .planning/
  {
    const p = path.join(rootDir, '.planning');
    const present = dirExists(p);
    checks.push({
      name: 'planning_dir',
      status: present ? 'ok' : 'warn',
      detail: present ? p : '.planning/ not found at project root',
    });
  }

  // 3. .design/
  {
    const p = path.join(rootDir, '.design');
    const present = dirExists(p);
    checks.push({
      name: 'design_dir',
      status: present ? 'ok' : 'warn',
      detail: present ? p : '.design/ not found at project root',
    });
  }

  // 4. package.json — present + parseable
  {
    const p = path.join(rootDir, 'package.json');
    if (!fileExists(p)) {
      checks.push({
        name: 'package_json',
        status: 'warn',
        detail: 'package.json not found at project root',
      });
    } else {
      try {
        const body = await fs.promises.readFile(p, 'utf8');
        const parsed = JSON.parse(body);
        const name = typeof parsed.name === 'string' ? parsed.name : '(unknown)';
        const version = typeof parsed.version === 'string' ? parsed.version : '0.0.0';
        checks.push({
          name: 'package_json',
          status: 'ok',
          detail: name + '@' + version,
        });
      } catch (err) {
        checks.push({
          name: 'package_json',
          status: 'fail',
          detail: 'parse error: ' + (err && err.message ? err.message : String(err)),
        });
      }
    }
  }

  // 5. issue_reporter — kill-switch state (Plan 30-06, D-08)
  {
    let reason = null;
    try {
      reason = getDisableReason({ cwd: rootDir, env: process.env });
    } catch {
      // Defensive: kill-switch must never throw, but if it ever does we
      // treat the reporter as enabled rather than crash the health probe.
      reason = null;
    }
    let detail;
    if (reason === 'env') {
      detail = 'issue reporter: disabled by env (GDD_DISABLE_ISSUE_REPORTER=1)';
    } else if (reason === 'config') {
      detail = 'issue reporter: disabled by config (.design/config.json: issue_reporter=false)';
    } else {
      detail = 'issue reporter: enabled';
    }
    checks.push({
      name: 'issue_reporter',
      status: 'ok',
      detail,
    });
  }

  // 6. figma_extract — extract readiness + Free-tier plugin-sync signal (Plan 31-09)
  // Reports exactly one of three states. PURE read-only: presence-only token
  // check (D-10 — value never read/logged/printed) + a LOCAL Free-tier marker
  // (a prior pull's _meta.json recording a 403/skip on the Variables endpoint —
  // see scripts/lib/figma-extract/pull.cjs). NEVER throws, NEVER networks.
  {
    // D-10: presence only. The token VALUE is never bound to a variable that
    // could be interpolated into detail/logs — only the boolean is kept.
    const tokenSet = !!(process.env.FIGMA_TOKEN || process.env.FIGMA_PERSONAL_ACCESS_TOKEN);

    let detail;
    let status;
    if (!tokenSet) {
      detail = 'figma extract: token missing';
      status = 'warn';
    } else if (figmaVariablesBlockedLocally(rootDir)) {
      // Token present but a prior pull recorded a 403/skip on the Variables REST
      // path → Free/non-Enterprise tier. Actionable (plugin sync), not a hard fail.
      detail = 'figma extract: plugin sync needed for variables (Free tier detected)';
      status = 'warn';
    } else {
      detail = 'figma extract: ready (token set)';
      status = 'ok';
    }
    checks.push({ name: 'figma_extract', status, detail });
  }

  // 7. skill_discipline — using-gdd bootstrap + SessionStart inject (Plan 32-07).
  // Reports exactly one of three states. PURE read-only: file existence +
  // hooks.json JSON inspection only. NEVER throws, NEVER networks (every read
  // is wrapped defensively like the figma_extract check above).
  {
    const skillPresent = fileExists(
      path.join(rootDir, 'skills', 'using-gdd', 'SKILL.md')
    );
    const hookWired = skillPresent && sessionStartWiresInject(rootDir);

    let detail;
    let status;
    if (!skillPresent) {
      detail = 'skill-discipline: missing using-gdd';
      status = 'warn';
    } else if (!hookWired) {
      detail = 'skill-discipline: hook not wired';
      status = 'warn';
    } else {
      detail = 'skill-discipline: ready';
      status = 'ok';
    }
    checks.push({ name: 'skill_discipline', status, detail });
  }

  // 8. harness_freshness — per-harness last_verified age (Phase 44). PURE: reads the manifest SoT via the
  // shippable harness-freshness module; status-aware (only `tested` harnesses can warn/fail). NEVER throws.
  {
    let status = 'ok';
    let detail;
    try {
      const results = checkFreshness();
      const failing = results.filter((r) => r.freshness === 'fail');
      const warning = results.filter((r) => r.freshness === 'warn');
      const tested = results.filter((r) => r.status === 'tested');
      if (failing.length) {
        status = 'fail';
        detail = `harness freshness: ${failing.length} stale (>${FAIL_DAYS}d): ${failing.map((r) => r.id).join(', ')}`;
      } else if (warning.length) {
        status = 'warn';
        detail = `harness freshness: ${warning.length} aging (>${WARN_DAYS}d): ${warning.map((r) => r.id).join(', ')}`;
      } else {
        detail = `harness freshness: ${tested.length} tested harness(es) current`;
      }
    } catch {
      status = 'warn';
      detail = 'harness freshness: unavailable';
    }
    checks.push({ name: 'harness_freshness', status, detail });
  }

  // 9. stack_addendums — Phase 54 coverage row. Fingerprints the project
  // (detect/stack.cjs) and reports how many DETECTED stacks (design-system +
  // framework + motion libs) have a registered type:"stack-addendum" entry in
  // reference/registry.json. PURE read-only (detection reads files but never
  // networks; registry is a local JSON read). GRACEFUL-ABSENT: no detected
  // stack -> "no stacks detected"; an unreadable registry -> "registry
  // unavailable". status is 'ok' on full coverage or nothing-to-cover,
  // otherwise 'warn'. NEVER throws.
  {
    let status = 'ok';
    let detail;
    try {
      const { detectStack } = require('../detect/stack.cjs');
      const stack = detectStack(rootDir) || { ds: null, framework: null, motion_libs: [] };

      // The detected stack values to cover, paired with the category an
      // addendum must classify into to count as coverage.
      const wanted = [];
      if (typeof stack.ds === 'string' && stack.ds) wanted.push({ category: 'system', key: stack.ds });
      if (typeof stack.framework === 'string' && stack.framework) {
        wanted.push({ category: 'framework', key: stack.framework });
      }
      if (Array.isArray(stack.motion_libs)) {
        for (const m of stack.motion_libs) {
          if (typeof m === 'string' && m) wanted.push({ category: 'motion', key: m });
        }
      }

      if (wanted.length === 0) {
        detail = 'stack addendums: no stacks detected';
        status = 'ok';
      } else {
        // Load the registry + classify its stack-addendum entries. A missing or
        // malformed registry counts as zero coverage (warn), never a throw.
        let entries = [];
        try {
          const reg = JSON.parse(
            fs.readFileSync(path.join(rootDir, 'reference', 'registry.json'), 'utf8')
          );
          entries = Array.isArray(reg.entries) ? reg.entries : [];
        } catch {
          entries = null; // distinguish "registry unavailable" from "zero coverage"
        }

        if (entries === null) {
          detail = 'stack addendums: registry unavailable';
          status = 'warn';
        } else {
          const { classifyEntry } = require('../mapper-spawn.cjs');
          // Build the set of {category|key} an addendum exists for.
          const covered = new Set();
          for (const e of entries) {
            if (!e || e.type !== 'stack-addendum') continue;
            const { category, key } = classifyEntry(e);
            if (category && key) covered.add(category + '|' + key);
          }
          const have = wanted.filter((w) => covered.has(w.category + '|' + String(w.key).toLowerCase())).length;
          const total = wanted.length;
          status = have >= total ? 'ok' : 'warn';
          detail = `stack addendums: ${have}/${total} detected stacks have addendums`;
        }
      }
    } catch {
      // Absolute safety net — the health probe must never crash on this check.
      status = 'warn';
      detail = 'stack addendums: unavailable';
    }
    checks.push({ name: 'stack_addendums', status, detail });
  }

  return { checks };
}

/**
 * Does hooks/hooks.json wire the inject-using-gdd SessionStart entry?
 * PURE read-only JSON inspection. Defensive: a missing/garbage hooks.json or an
 * unexpected shape returns false (→ "hook not wired") rather than throwing — the
 * health probe must never crash on this check. NEVER networks.
 *
 * @param {string} rootDir project root passed to getHealthChecks
 * @returns {boolean} true iff a SessionStart hook command references inject-using-gdd
 */
function sessionStartWiresInject(rootDir) {
  try {
    const p = path.join(rootDir, 'hooks', 'hooks.json');
    let hooks;
    try {
      hooks = JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {
      return false; // missing/garbage hooks.json → not wired
    }
    const sessionStart =
      hooks && hooks.hooks && Array.isArray(hooks.hooks.SessionStart)
        ? hooks.hooks.SessionStart
        : [];
    for (const entry of sessionStart) {
      const inner = entry && Array.isArray(entry.hooks) ? entry.hooks : [];
      for (const h of inner) {
        if (
          h &&
          typeof h.command === 'string' &&
          /inject-using-gdd/.test(h.command)
        ) {
          return true;
        }
      }
    }
    return false;
  } catch {
    // Absolute safety net — never crash the health probe on this check.
    return false;
  }
}

/**
 * Free-tier signal (LOCAL only — never a network call). The raw-pull stage
 * (scripts/lib/figma-extract/pull.cjs) writes a _meta.json per file key under
 * the gitignored cache dir; on a Variables 403 it records a totals[] entry
 * `{ name: 'variables', skipped: true, reason: 'HTTP 403' }`. We scan the
 * default cache root for any such marker. Defensive: malformed/absent markers
 * default to NOT-free (→ 'ready') so the health probe never false-alarms and
 * NEVER throws. NEVER reads the token; NEVER makes a request.
 *
 * @param {string} rootDir project root passed to getHealthChecks
 * @returns {boolean} true iff a prior pull recorded a Variables 403/skip
 */
function figmaVariablesBlockedLocally(rootDir) {
  try {
    const rawRoot = path.join(rootDir, '.figma-extract-cache', 'raw');
    let entries;
    try {
      entries = fs.readdirSync(rawRoot, { withFileTypes: true });
    } catch {
      return false; // no cache yet → default to ready
    }
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const metaPath = path.join(rawRoot, ent.name, '_meta.json');
      let meta;
      try {
        meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      } catch {
        continue; // missing/garbage marker → ignore this dir, keep scanning
      }
      const totals = meta && Array.isArray(meta.totals) ? meta.totals : [];
      const blocked = totals.some(
        (t) =>
          t &&
          t.name === 'variables' &&
          t.skipped === true &&
          typeof t.reason === 'string' &&
          /403/.test(t.reason)
      );
      if (blocked) return true;
    }
    return false;
  } catch {
    // Absolute safety net — the health probe must never crash on this check.
    return false;
  }
}

module.exports = { getHealthChecks };
