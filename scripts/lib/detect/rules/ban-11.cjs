'use strict';
// Phase 41 — BAN-11: Tinted Image Outline. Ported from reference/anti-patterns.md (its own **Grep**).
// Pure, dep-free. No `require`. The matcher scans ctx.content; line/column are 1-based.

const PATTERN = "outline-(slate|zinc|neutral|gray|stone|blue|red|green|yellow|purple)-\\d+|img\\s*\\{[^}]*outline:\\s*[^}]*#[0-9a-fA-F]{3,8}";

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
  id: "BAN-11",
  category: "decoration",
  name: "Tinted Image Outline",
  description: "A colored outline on an image — color contamination; use low-opacity black/white.",
  references: ["reference/anti-patterns.md#BAN-11"],
  severity: "warn",
  pattern: PATTERN,
  matcher,
};
