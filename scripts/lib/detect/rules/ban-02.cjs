'use strict';
// Phase 41 — BAN-02: Gradient Text. Ported from reference/anti-patterns.md (its own **Grep**).
// Pure, dep-free. No `require`. The matcher scans ctx.content; line/column are 1-based.

const PATTERN = "background-clip:\\s*text|text-fill-color:\\s*transparent";

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
  id: "BAN-02",
  category: "decoration",
  name: "Gradient Text",
  description: "Gradient-filled text via background-clip:text — low legibility, an AI-era cliche.",
  references: ["reference/anti-patterns.md#BAN-02"],
  severity: "warn",
  pattern: PATTERN,
  matcher,
};
