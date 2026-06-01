'use strict';
// Phase 35.5 — /gdd:export build-html unit test. Verifies the pure, dep-free HTML
// assembler (scripts/lib/export/build-html.cjs) emits a SELF-CONTAINED document:
// inline <style>, base64-embedded images, ZERO external resource refs; renders the
// markdown subset GDD's .design artifacts use; the print variant adds Paged.js @page
// CSS; output is deterministic (byte-identical across calls). Hermetic (D-07): no I/O,
// no live render. Every test tagged `35.5-02:`.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { buildHtml, mdToHtml, inline, esc } = require(
  path.resolve(__dirname, '../../scripts/lib/export/build-html.cjs')
);

// A 1x1 transparent PNG — a real base64 data URI (proves screenshots embed inline).
const PNG_1PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const FIXTURE = {
  title: 'Checkout Redesign',
  subtitle: 'Cycle demo-1 · design export',
  sections: [
    {
      heading: 'Experience',
      markdown:
        '# Goal\n\nMake **checkout** faster with `inline code` and a [spec link](https://example.com/spec).\n\n- one\n- two\n',
    },
    { heading: 'Evidence', markdown: '![before state](shot1)\n\nA closing paragraph.' },
  ],
  images: [{ name: 'shot1', dataUri: PNG_1PX }],
};

test('35.5-02: buildHtml returns a complete HTML document string', () => {
  const html = buildHtml(FIXTURE);
  assert.equal(typeof html, 'string');
  assert.match(html, /^<!DOCTYPE html>/);
  assert.match(html, /<html lang="en">[\s\S]*<\/html>\s*$/);
  assert.match(html, /<meta charset="utf-8">/);
});

test('35.5-02: CSS is inlined in a <style> block (no external stylesheet)', () => {
  const html = buildHtml(FIXTURE);
  assert.match(html, /<style>[^<]*box-sizing[^<]*<\/style>/, 'inline <style> with real CSS');
});

test('35.5-02: title + subtitle + section headings render', () => {
  const html = buildHtml(FIXTURE);
  assert.match(html, /<h1>Checkout Redesign<\/h1>/, 'doc title → h1');
  assert.match(html, /class="gdd-meta">Cycle demo-1/, 'subtitle → meta line');
  assert.match(html, /<h2>Experience<\/h2>/, 'section heading → h2');
  assert.match(html, /<h2>Evidence<\/h2>/, 'second section heading → h2');
});

test('35.5-02: markdown subset renders (bold, code, list, paragraph)', () => {
  const html = buildHtml(FIXTURE);
  assert.match(html, /<strong>checkout<\/strong>/, 'bold');
  assert.match(html, /<code>inline code<\/code>/, 'inline code');
  assert.match(html, /<ul><li>one<\/li><li>two<\/li><\/ul>/, 'unordered list');
  assert.match(html, /<p>A closing paragraph\.<\/p>/, 'paragraph');
});

test('35.5-02: images embed as base64 data URIs (not external src)', () => {
  const html = buildHtml(FIXTURE);
  assert.match(html, /<img alt="before state" src="data:image\/png;base64,/, 'base64-embedded image');
  assert.ok(html.includes(PNG_1PX), 'the exact data URI is present in the document');
});

test('35.5-02: image alt cannot break out of the attribute (js/incomplete-html-attribute-sanitization)', () => {
  const html = buildHtml({
    title: 't',
    sections: [{ heading: 'h', markdown: '![evil"><script>alert(1)</script>](shot)' }],
    images: [{ name: 'shot', dataUri: PNG_1PX }],
  });
  assert.match(html, /alt="evil&quot;&gt;&lt;script&gt;/, 'alt quotes + brackets are escaped');
  assert.doesNotMatch(html, /alt="evil"><script>/, 'no raw attribute breakout');
});

test('35.5-02: document is self-contained — ZERO external resource references', () => {
  const html = buildHtml(FIXTURE);
  // No remote resource loads: no external stylesheet/script, no img/src pointing at http(s),
  // no CSS @import or url(http...). Anchor hrefs are content, not resource fetches — allowed.
  assert.doesNotMatch(html, /<link\b/i, 'no <link> stylesheet');
  assert.doesNotMatch(html, /<script\b/i, 'no <script> tag');
  assert.doesNotMatch(html, /\bsrc\s*=\s*["']?https?:/i, 'no src pointing at a remote URL');
  assert.doesNotMatch(html, /@import\b/i, 'no CSS @import');
  assert.doesNotMatch(html, /url\(\s*["']?https?:/i, 'no CSS url(http...)');
});

test('35.5-02: anchor links survive (content, not a resource fetch)', () => {
  const html = buildHtml(FIXTURE);
  assert.match(html, /<a href="https:\/\/example\.com\/spec">spec link<\/a>/, 'inline link → anchor');
});

test('35.5-02: print variant adds Paged.js @page CSS; screen variant does not', () => {
  const printHtml = buildHtml({ ...FIXTURE, print: true });
  const screenHtml = buildHtml(FIXTURE);
  assert.match(printHtml, /@page\b/, 'print:true → @page rule');
  assert.match(printHtml, /@media print/, 'print:true → @media print block');
  assert.doesNotMatch(screenHtml, /@page\b/, 'default (screen) → no @page');
});

test('35.5-02: output is deterministic (byte-identical across calls)', () => {
  assert.equal(buildHtml(FIXTURE), buildHtml(FIXTURE), 'same input → same bytes');
  assert.equal(
    buildHtml({ ...FIXTURE, print: true }),
    buildHtml({ ...FIXTURE, print: true }),
    'print variant also deterministic'
  );
});

test('35.5-02: HTML is escaped — no injection via title/heading/markdown', () => {
  const evil = buildHtml({
    title: '<img src=x onerror=alert(1)>',
    sections: [{ heading: '</style><script>bad()</script>', markdown: 'plain & safe < text' }],
  });
  assert.doesNotMatch(evil, /<img src=x onerror/i, 'title not interpolated raw');
  assert.doesNotMatch(evil, /<script>bad\(\)<\/script>/i, 'heading not interpolated raw');
  assert.match(evil, /&lt;img src=x onerror/i, 'title is HTML-escaped');
  assert.match(evil, /plain &amp; safe &lt; text/, 'markdown text is HTML-escaped');
});

test('35.5-02: helpers are pure + dep-free (esc / inline / mdToHtml exported)', () => {
  assert.equal(esc('a<b>&c'), 'a&lt;b&gt;&amp;c');
  // attribute-safety: quotes are escaped so esc() output is safe inside alt="..." / href="..."
  assert.equal(esc('"q" & \'a\' <b>'), '&quot;q&quot; &amp; &#39;a&#39; &lt;b&gt;');
  assert.match(inline('**x** and `y`'), /<strong>x<\/strong> and <code>y<\/code>/);
  assert.match(mdToHtml('## H\n\ntext', []), /<h2>H<\/h2>\n<p>text<\/p>/);
  // dep-free: the module requires nothing (pure JS, no markdown/pdf runtime — D-02).
  const src = require('node:fs').readFileSync(
    path.resolve(__dirname, '../../scripts/lib/export/build-html.cjs'), 'utf8');
  assert.doesNotMatch(src, /require\(/, 'build-html.cjs must not require any dependency');
});
