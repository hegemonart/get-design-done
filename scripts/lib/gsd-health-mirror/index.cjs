'use strict';
// scripts/lib/gsd-health-mirror/index.cjs — Plan 27.7-02
//
// Pure read-only mirror of skills/health/SKILL.md's check surface.
// NO subprocess spawn — just inspects 4 well-known files/dirs and
// reports status. Used by the gdd_health MCP tool.
//
// Surface:
//   async getHealthChecks(rootDir) → { checks: HealthCheck[] }
//
// The 4 checks (in stable order) are:
//   1. claude_md            — CLAUDE.md presence
//   2. planning_dir         — .planning/ presence
//   3. design_dir           — .design/ presence
//   4. package_json         — package.json present AND parseable

const fs = require('node:fs');
const path = require('node:path');

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

  return { checks };
}

module.exports = { getHealthChecks };
