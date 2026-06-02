'use strict';
// Phase 45 (SC#2) — flag large verbatim copy-paste between a domain-index entry and the fragments it
// links. Index entries must LINK, never COPY. A run of >=RUN consecutive substantial lines shared between
// an entry and a fragment it indexes is treated as copy-paste. Maintainer-only (NOT shipped). Exit 0/1.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const REF = path.join(ROOT, 'reference');
const ENTRIES = ['typography', 'color', 'spatial', 'motion', 'interaction', 'responsive', 'ux-writing'];
const RUN = 5; // consecutive shared substantial lines = copy-paste

// Substantial lines only: long enough to be prose/values, not headings/bullets/table rules.
function substantialLines(text) {
  return text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length >= 24 && !/^[#>|]/.test(l) && !/^[-*]\s/.test(l));
}

function main() {
  const findings = [];
  for (const n of ENTRIES) {
    const ep = path.join(REF, `${n}.md`);
    if (!fs.existsSync(ep)) continue;
    const entryText = fs.readFileSync(ep, 'utf8');
    const entrySet = new Set(substantialLines(entryText));
    const frags = new Set();
    for (const m of entryText.matchAll(/\]\(([^)\s]+\.md)(?:#[^)\s]*)?\)/g)) {
      frags.add(m[1].replace(/^reference\//, '').replace(/^\.\//, ''));
    }
    for (const f of frags) {
      const fp = path.join(REF, f);
      if (!fs.existsSync(fp)) continue;
      let run = 0;
      let maxRun = 0;
      for (const l of substantialLines(fs.readFileSync(fp, 'utf8'))) {
        if (entrySet.has(l)) { run++; maxRun = Math.max(maxRun, run); } else run = 0;
      }
      if (maxRun >= RUN) findings.push(`reference/${n}.md duplicates >=${maxRun} consecutive lines from reference/${f}`);
    }
  }
  if (findings.length) {
    process.stderr.write('check-no-duplication: copy-paste between index + detail:\n' + findings.map((x) => '  ' + x).join('\n') + '\n');
    return 1;
  }
  process.stdout.write(`check-no-duplication: OK - ${ENTRIES.length} index entries link without large copy-paste.\n`);
  return 0;
}

if (require.main === module) process.exit(main());
module.exports = { main };
