'use strict';
/**
 * scripts/lib/export/build-html.cjs — Phase 35.5 self-contained HTML assembler.
 *
 * Pure + dep-free (D-02): no markdown library, no `paged`/`puppeteer`/`pdfkit`. Produces a
 * SINGLE self-contained HTML string — inline <style>, base64-embedded images, ZERO external
 * references — for the /hone:export html + pdf formats (pdf = the same HTML + Paged.js-compatible
 * @page print CSS the user renders, never a bundled PDF runtime). Deterministic: same input →
 * byte-identical output (hermetic tests, D-07).
 */

// Escapes the 5 HTML-significant characters so the result is safe in BOTH element
// content AND double/single-quoted attribute values (e.g. <img alt="...">). Escaping
// the quotes is what makes attribute interpolation injection-safe (js/incomplete-html-
// attribute-sanitization). Order matters: & first so the entity ampersands aren't re-escaped.
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Minimal, deterministic inline-markdown → HTML (escapes first, then re-introduces tags for
// the constructs GDD's .design markdown uses): `code`, **bold**, *italic*, [text](url).
function inline(text) {
  let s = esc(text);
  s = s.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, (_, b) => `<strong>${b}</strong>`);
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, (_, p, i) => `${p}<em>${i}</em>`);
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|#[^)\s]*)\)/g, (_, t, u) => `<a href="${u}">${t}</a>`);
  return s;
}

// Block-level markdown → HTML. Handles headings, fenced code, ul/ol, blockquote, hr, images
// (resolved to base64 data URIs from the images map), and paragraphs.
function mdToHtml(md, images) {
  const lines = String(md).replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;
  const imgByName = new Map((images || []).map((im) => [im.name, im.dataUri]));
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) { // fenced code
      const buf = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])) { buf.push(esc(lines[i])); i++; }
      i++; out.push(`<pre><code>${buf.join('\n')}</code></pre>`); continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) { const n = h[1].length; out.push(`<h${n}>${inline(h[2])}</h${n}>`); i++; continue; }
    if (/^\s*([-*])\s+/.test(line)) { // unordered list
      const items = [];
      while (i < lines.length && /^\s*([-*])\s+/.test(lines[i])) { items.push(`<li>${inline(lines[i].replace(/^\s*[-*]\s+/, ''))}</li>`); i++; }
      out.push(`<ul>${items.join('')}</ul>`); continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) { // ordered list
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { items.push(`<li>${inline(lines[i].replace(/^\s*\d+\.\s+/, ''))}</li>`); i++; }
      out.push(`<ol>${items.join('')}</ol>`); continue;
    }
    if (/^>\s?/.test(line)) { out.push(`<blockquote>${inline(line.replace(/^>\s?/, ''))}</blockquote>`); i++; continue; }
    if (/^(---+|\*\*\*+)\s*$/.test(line)) { out.push('<hr>'); i++; continue; }
    const img = line.match(/^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/); // image — resolve to base64
    if (img) {
      const src = imgByName.get(img[2]) || (img[2].startsWith('data:') ? img[2] : '');
      if (src) out.push(`<figure><img alt="${esc(img[1])}" src="${src}"><figcaption>${esc(img[1])}</figcaption></figure>`);
      i++; continue;
    }
    if (line.trim() === '') { i++; continue; }
    // paragraph — gather consecutive non-blank, non-block lines
    const para = [line]; i++;
    while (i < lines.length && lines[i].trim() !== '' && !/^(#{1,4}\s|```|>\s?|\s*[-*]\s|\s*\d+\.\s|!\[)/.test(lines[i])) { para.push(lines[i]); i++; }
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }
  return out.join('\n');
}

const SCREEN_CSS = `:root{--ink:#1a1a1a;--muted:#6b7280;--rule:#e5e7eb;--accent:#2563eb}*{box-sizing:border-box}body{margin:0;font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:var(--ink);background:#fff}main{max-width:820px;margin:0 auto;padding:48px 24px}h1{font-size:2rem;line-height:1.2;margin:0 0 .5rem}h2{font-size:1.4rem;margin:2rem 0 .5rem;padding-top:1rem;border-top:1px solid var(--rule)}h3{font-size:1.1rem;margin:1.5rem 0 .4rem}p{margin:.6rem 0}code{background:#f3f4f6;padding:.1em .35em;border-radius:4px;font-size:.9em}pre{background:#f8f9fb;border:1px solid var(--rule);border-radius:8px;padding:14px;overflow:auto}pre code{background:none;padding:0}a{color:var(--accent)}blockquote{margin:.8rem 0;padding:.4rem 1rem;border-left:3px solid var(--accent);color:var(--muted)}figure{margin:1rem 0}img{max-width:100%;height:auto;border:1px solid var(--rule);border-radius:8px}figcaption{font-size:.85rem;color:var(--muted);margin-top:.3rem}hr{border:none;border-top:1px solid var(--rule);margin:2rem 0}.hone-meta{color:var(--muted);font-size:.9rem;margin-bottom:2rem}`;
const PRINT_CSS = `@page{size:A4;margin:18mm 16mm}@media print{h2{break-before:auto}figure,pre,blockquote{break-inside:avoid}main{max-width:none;padding:0}a{color:var(--ink);text-decoration:underline}}`;

/**
 * buildHtml({ title, subtitle?, sections:[{heading, markdown}], images?:[{name, dataUri}], print? })
 *   → a single self-contained HTML document string (inline CSS, base64 images, no external refs).
 */
function buildHtml(opts = {}) {
  const title = esc(opts.title || 'GDD Design Export');
  const css = SCREEN_CSS + (opts.print ? PRINT_CSS : '');
  const body = (opts.sections || [])
    .map((sec) => `<section>\n<h2>${esc(sec.heading)}</h2>\n${mdToHtml(sec.markdown || '', opts.images)}\n</section>`)
    .join('\n');
  const subtitle = opts.subtitle ? `<p class="hone-meta">${esc(opts.subtitle)}</p>` : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>${css}</style>
</head>
<body>
<main>
<h1>${title}</h1>
${subtitle}
${body}
</main>
</body>
</html>
`;
}

module.exports = { buildHtml, mdToHtml, inline, esc };
