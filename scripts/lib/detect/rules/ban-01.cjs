'use strict';
// Phase 41 — BAN-01: Side-Stripe Borders. Ported from reference/anti-patterns.md (its own **Grep**).
// Pure, dep-free. No `require`. The matcher scans ctx.content; line/column are 1-based.

const PATTERN = "border-left:\\s*[2-9][0-9]*px|border-right:\\s*[2-9][0-9]*px";

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
  id: "BAN-01",
  category: "decoration",
  name: "Side-Stripe Borders",
  description: "A thick (>=2px) left/right accent border — a dated, decorative side-stripe.",
  references: ["reference/anti-patterns.md#BAN-01"],
  severity: "warn",
  pattern: PATTERN,
  matcher,
};
