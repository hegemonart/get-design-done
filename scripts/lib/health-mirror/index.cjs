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
// The 5 checks (in stable order) are:
//   1. claude_md            — CLAUDE.md presence
//   2. planning_dir         — .planning/ presence
//   3. design_dir           — .design/ presence
//   4. package_json         — package.json present AND parseable
//   5. issue_reporter       — kill-switch state (Plan 30-06 / D-08)
//
// Check 5 was added in Plan 30-06 — surfaces the report-issue kill-switch
// (env or config disable) so users can verify why the command is
// unavailable. The status line is one of three exact strings:
//   - "issue reporter: enabled"
//   - "issue reporter: disabled by env (GDD_DISABLE_ISSUE_REPORTER=1)"
//   - "issue reporter: disabled by config (.design/config.json: issue_reporter=false)"
// When both env and config trigger, env wins (matches D-08 display contract).

const fs = require('node:fs');
const path = require('node:path');

const { getDisableReason } = require('../issue-reporter/kill-switch.cjs');

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

  return { checks };
}

module.exports = { getHealthChecks };
