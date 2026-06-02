'use strict';
// Phase 41 — BAN-03: Bounce/Elastic Easing. Ported from reference/anti-patterns.md (its own **Grep**).
// Pure, dep-free. No `require`. The matcher scans ctx.content; line/column are 1-based.

const PATTERN = "cubic-bezier\\(.*-[0-9]|bounce|elastic|spring\\(";

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
  id: "BAN-03",
  category: "motion",
  name: "Bounce/Elastic Easing",
  description: "Bounce/elastic/spring easing — playful overshoot that reads as unserious for product UI.",
  references: ["reference/anti-patterns.md#BAN-03"],
  severity: "warn",
  pattern: PATTERN,
  matcher,
};
