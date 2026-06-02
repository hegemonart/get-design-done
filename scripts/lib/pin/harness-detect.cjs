'use strict';
/**
 * scripts/lib/pin/harness-detect.cjs — Phase 46 (Skill UX Polish).
 *
 * Locates the per-harness `skills/` directories under a project root so the pin
 * store knows where to write / scan pinned skill stubs. Each harness record in
 * scripts/lib/manifest/harnesses.cjs carries a `config_dir` (e.g. ".claude",
 * ".cursor", ".codex"); the candidate skills dir for a harness is
 * `<projectRoot>/<config_dir>/skills`.
 *
 * Two surfaces:
 *   detectHarnessSkillDirs(projectRoot)   -> only the candidates that EXIST on disk
 *   harnessSkillDirCandidates(projectRoot)-> ALL candidates (existing or not), for
 *                                            the --user / create flows that may need
 *                                            to materialize a missing dir.
 *
 * Dependency-free CommonJS. Cross-platform: all path joins go through `path`,
 * never a hardcoded separator. Ships inside the npm package, so it must stay
 * runtime-safe (no dev-only requires).
 */

const fs = require('fs');
const path = require('path');

const harnesses = require('../manifest/harnesses.cjs');

/**
 * Build the full candidate list (one entry per harness record), regardless of
 * whether the directory currently exists. The candidate skills dir for a harness
 * is `<projectRoot>/<config_dir>/skills`.
 *
 * @param {string} projectRoot absolute or relative project root
 * @returns {Array<{ id: string, config_dir: string, skillsDir: string }>}
 */
function harnessSkillDirCandidates(projectRoot) {
  if (!projectRoot || typeof projectRoot !== 'string') {
    throw new TypeError('harnessSkillDirCandidates: projectRoot must be a non-empty string');
  }
  const out = [];
  const seen = new Set();
  for (const h of harnesses) {
    if (!h || !h.config_dir) continue;
    // De-dupe on config_dir so two records pointing at the same dir don't double up.
    if (seen.has(h.config_dir)) continue;
    seen.add(h.config_dir);
    out.push({
      id: h.id,
      config_dir: h.config_dir,
      skillsDir: path.join(projectRoot, h.config_dir, 'skills'),
    });
  }
  return out;
}

/**
 * Filter the candidate list to the harness skills dirs that actually exist as
 * directories under projectRoot.
 *
 * @param {string} projectRoot absolute or relative project root
 * @returns {Array<{ id: string, config_dir: string, skillsDir: string }>}
 */
function detectHarnessSkillDirs(projectRoot) {
  return harnessSkillDirCandidates(projectRoot).filter((c) => {
    try {
      return fs.statSync(c.skillsDir).isDirectory();
    } catch {
      return false;
    }
  });
}

module.exports = {
  detectHarnessSkillDirs,
  harnessSkillDirCandidates,
};
