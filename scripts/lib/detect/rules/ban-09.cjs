'use strict';
// Phase 41 — BAN-09: scale(0) Animation Entry. Ported from reference/anti-patterns.md (its own **Grep**).
// Pure, dep-free. No `require`. The matcher scans ctx.content; line/column are 1-based.

const PATTERN = "transform:\\s*scale\\(\\s*0\\s*\\)|scale\\(\\s*0\\s*\\)";

/** @param {{content: string, ext: string, path: string}} ctx @returns {{line:number,column:number,match:string}[]} */
function matcher(ctx) {
  const out = [];
  const re = new RegExp(PATTERN, 'gi');
  const text = String((ctx && ctx.content) || '');
  let m;
  while ((m = re.exec(text)) !== null) {
    const upto = text.slice(0, m.index);
    const line = upto.split('\n').length;
    const lastNl = upto.lastIndexOf('\n');
    const column = lastNl < 0 ? m.index + 1 : m.index - lastNl;
    out.push({ line, column, match: m[0] });
    if (m.index === re.lastIndex) re.lastIndex++; // zero-width guard
  }
  return out;
}

module.exports = {
  id: "BAN-09",
  category: "motion",
  name: "scale(0) Animation Entry",
  description: "Entering from scale(0) — nothing materializes from nothing; start at scale(0.95)+opacity.",
  references: ["reference/anti-patterns.md#BAN-09"],
  severity: "warn",
  pattern: PATTERN,
  matcher,
};
