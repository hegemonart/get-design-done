'use strict';
// Phase 41 — BAN-05: Pure Black Dark Mode. Ported from reference/anti-patterns.md (its own **Grep**).
// Pure, dep-free. No `require`. The matcher scans ctx.content; line/column are 1-based.

const PATTERN = "background.*#000000|background.*rgb\\(0,\\s*0,\\s*0\\)";

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
  id: "BAN-05",
  category: "color",
  name: "Pure Black Dark Mode",
  description: "Pure #000 dark-mode background — harsh contrast + halation; use a near-black surface.",
  references: ["reference/anti-patterns.md#BAN-05"],
  severity: "warn",
  pattern: PATTERN,
  matcher,
};
