'use strict';
// Phase 45 (SC#7) — verify every markdown link in the 7 domain-index entries resolves: the target file
// exists, and an optional #anchor matches a real heading (GitHub slug). Maintainer-only (NOT shipped).
// node scripts/check-domain-cross-links.cjs  ·  exit 0 clean / 1 broken.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const REF = path.join(ROOT, 'reference');
const ENTRIES = ['typography', 'color', 'spatial', 'motion', 'interaction', 'responsive', 'ux-writing'];

function githubSlug(h) {
  return h.toLowerCase().replace(/`/g, '').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
}
function headingSlugs(text) {
  const s = new Set();
  for (const m of text.matchAll(/^#{1,6}\s+(.+?)\s*$/gm)) s.add(githubSlug(m[1]));
  return s;
}
function resolveTarget(file) {
  // `reference/foo.md` is repo-root-relative; `./foo.md` / `foo.md` / `domains/x.md` are relative to reference/.
  if (file.startsWith('reference/')) return path.join(ROOT, file);
  return path.join(REF, file.replace(/^\.\//, ''));
}

function main() {
  const broken = [];
  let links = 0;
  for (const n of ENTRIES) {
    const abs = path.join(REF, `${n}.md`);
    if (!fs.existsSync(abs)) { broken.push(`${n}.md: entry missing`); continue; }
    const text = fs.readFileSync(abs, 'utf8');
    for (const m of text.matchAll(/\]\(([^)\s]+\.md(?:#[^)\s]+)?)\)/g)) {
      const target = m[1];
      if (/^https?:/.test(target)) continue;
      links++;
      const [file, anchor] = target.split('#');
      const fp = resolveTarget(file);
      if (!fs.existsSync(fp)) { broken.push(`reference/${n}.md -> ${target} (file not found)`); continue; }
      if (anchor) {
        const slugs = headingSlugs(fs.readFileSync(fp, 'utf8'));
        if (!slugs.has(anchor.toLowerCase())) broken.push(`reference/${n}.md -> ${target} (anchor not found)`);
      }
    }
  }
  if (broken.length) {
    process.stderr.write('check-domain-cross-links: broken links:\n' + broken.map((b) => '  ' + b).join('\n') + '\n');
    return 1;
  }
  process.stdout.write(`check-domain-cross-links: OK - ${ENTRIES.length} entries, ${links} links all resolve.\n`);
  return 0;
}

if (require.main === module) process.exit(main());
module.exports = { main, githubSlug };
