'use strict';
// scripts/lib/roadmap-reader/index.cjs — Plan 27.7-02
//
// Read + parse .planning/ROADMAP.md into a flat list of phase entries
// consumed by the gdd_phases_list MCP tool. Pure read; no I/O outside
// readRoadmapMd().
//
// Output shape per phase:
//   { number: '27.7', name: 'GDD MCP Server', version: 'v1.27.7',
//     checkbox_status: 'shipped' | 'planned' | 'unknown' }
//
// `checkbox_status` is sourced from the overview list at the top of
// ROADMAP.md (lines shaped `- [x] [Phase 27]...` or `- [ ] [Phase 27.7]...`).
// When no overview line matches the heading, we emit `'unknown'`.

const fs = require('node:fs');
const path = require('node:path');

/** Read .planning/ROADMAP.md from rootDir; returns full markdown string. */
async function readRoadmapMd(rootDir) {
  const p = path.join(rootDir, '.planning', 'ROADMAP.md');
  return fs.promises.readFile(p, 'utf8');
}

/**
 * Parse the body of ROADMAP.md into phase entries. Two passes:
 *   1. Scan `- [x|space] [Phase <num>](...)` overview lines → status map
 *   2. Scan `### Phase <num>: <name>` headings → main list
 *
 * The version is pulled from the FIRST line after the heading that
 * matches `**Target version**:` or `— v\S+`. We tolerate trailing
 * parenthetical commentary on the heading by trimming everything after
 * a trailing ` (…)` chunk.
 */
function parsePhases(md) {
  // Pass 1 — overview checkbox map. Pattern matches both `Phase 27` and
  // `Phase 27.7`; ignores the descriptive name + version that may follow.
  const statusMap = new Map();
  const overviewRe = /^-\s+\[([x\s])\]\s+\[Phase\s+(\S+?)\]/gm;
  let mm;
  while ((mm = overviewRe.exec(md)) !== null) {
    const checked = mm[1] === 'x';
    statusMap.set(mm[2], checked ? 'shipped' : 'planned');
  }

  // Pass 2 — Phase heading scan. We capture the number + name, then
  // look ahead in the heading's section for a version marker. The
  // heading may have an embedded version (` — v1.X.Y`) or rely on
  // a `**Target version**:` block below.
  const headingRe = /^###\s+Phase\s+(\S+?):\s+([^\n]+?)$/gm;
  const phases = [];
  let h;
  while ((h = headingRe.exec(md)) !== null) {
    const number = h[1];
    let name = h[2].trim();
    // Strip trailing parenthetical commentary (e.g. `(INSERTED)`).
    name = name.replace(/\s+\([^)]*\)\s*$/g, '').trim();
    // Strip trailing version chunk from the heading itself.
    const inlineVer = name.match(/\s+—\s+(v\d+\.\d+(?:\.\d+)?)/);
    let version = inlineVer ? inlineVer[1] : '';
    if (inlineVer) {
      name = name.slice(0, inlineVer.index).trim();
    }
    // If no inline version, look forward in the next ~30 lines for a
    // `**Target version**:` block.
    if (version === '') {
      const after = md.slice(h.index, h.index + 2000);
      const v = after.match(/\*\*Target version\*\*:\s*(v\d+\.\d+(?:\.\d+)?)/);
      if (v) version = v[1];
    }
    phases.push({
      number,
      name,
      version,
      checkbox_status: statusMap.get(number) ?? 'unknown',
    });
  }
  return phases;
}

module.exports = { readRoadmapMd, parsePhases };
