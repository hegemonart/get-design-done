'use strict';
/**
 * test/suite/phase-55-ansi.test.cjs — Phase 55 (GDD Dashboard, DEP-FREE), TUI-01 substrate (executor B).
 *
 * Tag: '55-02:'.
 *
 * Proves sdk/dashboard/tui/ansi.cjs — the hand-rolled terminal-render toolkit that REPLACES
 * Ink/Yoga with zero new dependency (Node builtins only). Every helper here is PURE: it RETURNS
 * a string (or string[] / op[]); none of them perform I/O (the TUI main loop owns process.stdout
 * writes). That purity is exactly what makes them deterministically testable.
 *
 * Contract pinned for executor D (sdk/dashboard/tui/index.cjs consumes these to draw 5 panes):
 *
 *   cursor/screen (ANSI escape strings):
 *     cursorTo(row, col)   -> "\x1b[<row>;<col>H"   (1-based, CUP)
 *     clearScreen()        -> "\x1b[2J\x1b[H"
 *     clearLine()          -> "\x1b[2K"
 *     hideCursor()         -> "\x1b[?25l"
 *     showCursor()         -> "\x1b[?25h"
 *     altScreenEnter()     -> "\x1b[?1049h"
 *     altScreenExit()      -> "\x1b[?1049l"
 *
 *   color:
 *     color(text, {fg?, bg?, bold?, dim?, underline?, noColor?}) -> SGR-wrapped + reset.
 *       Named fg/bg ('red'..'white' + 'bright*' + 'gray'), or a 0-255 int (256-color).
 *       No-op (returns text unchanged) when {noColor:true} OR process.env.NO_COLOR is set.
 *
 *   layout (the core value — the Yoga replacement):
 *     box({title?, lines, width, height?, border?}) -> string[] of a bordered box; every line
 *       has EXACTLY `width` visible columns; title embedded in the top edge; content padded /
 *       truncated to the inner width; border 'round' (default) | 'space'.
 *     columns(cells, widths, sep?) -> a single row string; each cell padded/truncated to its
 *       width; joined by sep (default ' ').
 *     truncate(s, width) -> width-aware truncation with a '…' ellipsis; counts code points (not
 *       UTF-16 units) so it NEVER splits a surrogate pair; CJK/wide chars count as 2 columns.
 *     padRight(s, width) / padLeft(s, width) -> space-padded to `width` visible columns.
 *
 *   diff repaint:
 *     diffRender(prevLines, nextLines) -> [{row, text}] for ONLY changed rows (1-based row);
 *       identical input -> []. Pure (the main loop repaints just those rows -> no flicker).
 *
 * Helper: visibleWidth(s) -> the column width the renderer accounts for (strips SGR, counts
 * wide chars as 2). Used by the width invariants below and exported for executor D.
 *
 * DEP-FREE: Node builtins only. No spawning, no FS, no network — every assertion is over a
 * returned string. The suite leaves no residue (nothing is written).
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const ansi = require('../../sdk/dashboard/tui/ansi.cjs');
const {
  cursorTo, clearScreen, clearLine, hideCursor, showCursor, altScreenEnter, altScreenExit,
  color, box, columns, truncate, padRight, padLeft, diffRender, visibleWidth,
} = ansi;

// ESC literal (kept out of the asserted strings so the file stays grep-clean).
const ESC = '\x1b';
const SGR_RESET = ESC + '[0m';

// ---------------------------------------------------------------------------
// 55-02: cursor / screen control escapes (the documented byte sequences).
// ---------------------------------------------------------------------------

test('55-02: cursorTo emits a 1-based CUP escape', () => {
  assert.equal(cursorTo(1, 1), ESC + '[1;1H');
  assert.equal(cursorTo(12, 40), ESC + '[12;40H');
});

test('55-02: clearScreen / clearLine emit the documented escapes', () => {
  assert.equal(clearScreen(), ESC + '[2J' + ESC + '[H');
  assert.equal(clearLine(), ESC + '[2K');
});

test('55-02: hideCursor / showCursor emit the DECTCEM escapes', () => {
  assert.equal(hideCursor(), ESC + '[?25l');
  assert.equal(showCursor(), ESC + '[?25h');
});

test('55-02: altScreenEnter / altScreenExit return the documented escapes', () => {
  assert.equal(altScreenEnter(), ESC + '[?1049h');
  assert.equal(altScreenExit(), ESC + '[?1049l');
  // They are exact inverses (open vs close of the same private mode).
  assert.equal(altScreenEnter().replace(/h$/, 'l'), altScreenExit());
});

// ---------------------------------------------------------------------------
// 55-02: color() — SGR wrap + reset, named + 256-color, no-op under noColor / NO_COLOR.
// ---------------------------------------------------------------------------

test('55-02: color wraps with an SGR open and ends with a reset', () => {
  const out = color('hi', { fg: 'red' });
  assert.ok(out.startsWith(ESC + '['), 'opens with an SGR introducer');
  assert.ok(out.endsWith(SGR_RESET), 'ends with the SGR reset (0m)');
  assert.ok(out.includes('hi'), 'wraps the original text');
  // The visible content (SGR stripped) is exactly the input.
  assert.equal(visibleWidth(out), 2);
});

test('55-02: color composes fg + bg + bold + underline into one SGR sequence', () => {
  const out = color('x', { fg: 'green', bg: 'black', bold: true, underline: true });
  // Named fg green=32, bg black=40, bold=1, underline=4 — all present, single reset at the end.
  assert.match(out, /\x1b\[[0-9;]*32[0-9;]*m/);
  assert.match(out, /\x1b\[[0-9;]*40[0-9;]*m/);
  assert.match(out, /\x1b\[[0-9;]*1[0-9;]*m/);
  assert.match(out, /\x1b\[[0-9;]*4[0-9;]*m/);
  assert.equal(out.endsWith(SGR_RESET), true);
  assert.equal((out.match(/\x1b\[0m/g) || []).length, 1, 'exactly one reset');
});

test('55-02: color supports 256-color integer codes (38;5;n fg / 48;5;n bg)', () => {
  const out = color('z', { fg: 201, bg: 17 });
  assert.match(out, /\x1b\[38;5;201m/);
  assert.match(out, /\x1b\[48;5;17m/);
  assert.ok(out.endsWith(SGR_RESET));
});

test('55-02: color is a no-op under {noColor:true} — returns the bare text', () => {
  assert.equal(color('plain', { fg: 'red', bold: true, noColor: true }), 'plain');
});

test('55-02: color is a no-op under process.env.NO_COLOR (restored after)', () => {
  const prev = process.env.NO_COLOR;
  process.env.NO_COLOR = '1';
  try {
    assert.equal(color('plain', { fg: 'red' }), 'plain');
  } finally {
    if (prev === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = prev;
  }
});

test('55-02: color with no style options returns the text unchanged (nothing to wrap)', () => {
  assert.equal(color('asis', {}), 'asis');
  assert.equal(color('asis'), 'asis');
});

// ---------------------------------------------------------------------------
// 55-02: visibleWidth — SGR-stripping + wide-char accounting.
// ---------------------------------------------------------------------------

test('55-02: visibleWidth ignores SGR codes and counts plain columns', () => {
  assert.equal(visibleWidth('abc'), 3);
  assert.equal(visibleWidth(color('abc', { fg: 'red', bold: true })), 3);
});

test('55-02: visibleWidth counts CJK / wide code points as 2 columns', () => {
  assert.equal(visibleWidth('中'), 2);       // CJK ideograph
  assert.equal(visibleWidth('中文'), 4);
  assert.equal(visibleWidth('a中b'), 4);     // 1 + 2 + 1
});

// ---------------------------------------------------------------------------
// 55-02: truncate — width-aware, ellipsis, never splits a surrogate pair.
// ---------------------------------------------------------------------------

test('55-02: truncate leaves a string that already fits untouched', () => {
  assert.equal(truncate('hello', 10), 'hello');
  assert.equal(truncate('hello', 5), 'hello');
});

test('55-02: truncate cuts to width and appends a single-column ellipsis', () => {
  const out = truncate('abcdefgh', 5);
  assert.equal(visibleWidth(out), 5, 'the truncated result is exactly `width` columns');
  assert.ok(out.endsWith('…'), 'ends with the ellipsis glyph');
  assert.equal(out, 'abcd…');
});

test('55-02: truncate never splits a surrogate pair (emoji boundary)', () => {
  // '😀' is a single code point stored as a 2-unit surrogate pair (U+1F600).
  // Truncating "ab😀cd" to width 3 must NOT slice the emoji in half.
  const s = 'ab\u{1F600}cd';
  const out = truncate(s, 3);
  assert.equal(visibleWidth(out), 3);
  // The emoji is wide (2 cols); with a 1-col ellipsis there is no room for it after "ab",
  // so the result is "ab" + ellipsis — and crucially contains NO lone surrogate.
  for (const ch of out) {
    const cp = ch.codePointAt(0);
    assert.ok(!(cp >= 0xd800 && cp <= 0xdfff), 'no lone surrogate in the output');
  }
  assert.equal(out, 'ab…');
});

test('55-02: truncate keeps a whole wide char when it fits exactly within width', () => {
  // "中x" is 3 columns (2 + 1). Truncate to width 3 -> fits, unchanged.
  assert.equal(truncate('中x', 3), '中x');
  // Truncate "中文x" (5 cols) to width 3 -> "中" (2) + ellipsis (1) = 3, the second wide
  // char cannot fit alongside the ellipsis.
  const out = truncate('中文x', 3);
  assert.equal(visibleWidth(out), 3);
  assert.equal(out, '中…');
});

test('55-02: truncate to width 0 yields the empty string', () => {
  assert.equal(truncate('anything', 0), '');
});

// ---------------------------------------------------------------------------
// 55-02: padRight / padLeft — visible-width aware.
// ---------------------------------------------------------------------------

test('55-02: padRight pads on the right to the exact visible width', () => {
  assert.equal(padRight('ab', 5), 'ab   ');
  assert.equal(visibleWidth(padRight('ab', 5)), 5);
  // Already at/over width -> truncated to width (never overflows the column).
  assert.equal(visibleWidth(padRight('abcdef', 4)), 4);
});

test('55-02: padLeft pads on the left to the exact visible width', () => {
  assert.equal(padLeft('ab', 5), '   ab');
  assert.equal(visibleWidth(padLeft('ab', 5)), 5);
});

test('55-02: padRight accounts for wide chars when computing the pad', () => {
  // "中" is 2 cols; padding to 4 adds 2 spaces, not 3.
  assert.equal(padRight('中', 4), '中  ');
  assert.equal(visibleWidth(padRight('中', 4)), 4);
});

// ---------------------------------------------------------------------------
// 55-02: columns — align cells to fixed widths, truncate overflow.
// ---------------------------------------------------------------------------

test('55-02: columns pads each cell to its width and joins with the default separator', () => {
  const row = columns(['a', 'bb', 'c'], [3, 4, 2]);
  // 3 + 1(sep) + 4 + 1(sep) + 2 = 11 visible columns.
  assert.equal(visibleWidth(row), 3 + 1 + 4 + 1 + 2);
  assert.equal(row, 'a   bb   c ');
});

test('55-02: columns truncates a cell that overflows its assigned width', () => {
  const row = columns(['toolong', 'x'], [4, 3], ' ');
  // First cell truncated to 4 cols (with ellipsis), second padded to 3.
  assert.equal(visibleWidth(row), 4 + 1 + 3);
  assert.ok(row.startsWith('tol…') || row.startsWith('too…'), 'first cell truncated to 4 cols with ellipsis');
});

test('55-02: columns accepts a custom separator', () => {
  const row = columns(['a', 'b'], [2, 2], ' | ');
  assert.equal(row, 'a  | b ');
  assert.equal(visibleWidth(row), 2 + 3 + 2);
});

// ---------------------------------------------------------------------------
// 55-02: box — bordered, fixed-width, titled (the Yoga replacement).
// ---------------------------------------------------------------------------

test('55-02: box renders every line to EXACTLY the requested width (visible columns)', () => {
  const lines = box({ title: 'Hi', lines: ['one', 'two'], width: 12 });
  for (const ln of lines) {
    assert.equal(visibleWidth(ln), 12, `each box line is exactly width cols: ${JSON.stringify(ln)}`);
  }
  // top + 2 content rows + bottom = 4 rows.
  assert.equal(lines.length, 4);
});

test('55-02: box embeds the title in the top border edge', () => {
  const lines = box({ title: 'Sessions', lines: ['x'], width: 20 });
  assert.ok(lines[0].includes('Sessions'), 'title text appears in the top edge');
  // Default rounded corners on the top edge.
  assert.ok(lines[0].startsWith('╭'), 'rounded top-left corner');
  assert.ok(lines[0].endsWith('╮'), 'rounded top-right corner');
});

test('55-02: box content lines are wrapped by vertical borders and padded to the inner width', () => {
  const lines = box({ title: '', lines: ['hello'], width: 10 });
  const content = lines[1];
  assert.ok(content.startsWith('│'), 'left vertical border');
  assert.ok(content.endsWith('│'), 'right vertical border');
  assert.equal(visibleWidth(content), 10);
  // inner width = 10 - 2 borders = 8; "hello" (5) padded with 3 trailing spaces.
  assert.ok(content.includes('hello'));
});

test('55-02: box truncates content that exceeds the inner width', () => {
  const lines = box({ title: '', lines: ['this is way too long for the box'], width: 12 });
  const content = lines[1];
  assert.equal(visibleWidth(content), 12);
  assert.ok(content.includes('…'), 'overflowing content is truncated with an ellipsis');
});

test('55-02: box honors an explicit height (pads with blank content rows)', () => {
  const lines = box({ title: 't', lines: ['only one'], width: 10, height: 5 });
  assert.equal(lines.length, 5, 'top + 3 content rows + bottom = height');
  for (const ln of lines) assert.equal(visibleWidth(ln), 10);
});

test('55-02: box with border:"space" uses spaces instead of line-drawing glyphs', () => {
  const lines = box({ title: '', lines: ['hi'], width: 8, border: 'space' });
  for (const ln of lines) {
    assert.equal(visibleWidth(ln), 8);
    assert.ok(!/[╭╮╰╯│─]/.test(ln), 'no line-drawing glyphs in a space-bordered box');
  }
});

test('55-02: box truncates an over-long title to fit the top edge', () => {
  const lines = box({ title: 'A title far longer than the box width', lines: [''], width: 10 });
  assert.equal(visibleWidth(lines[0]), 10, 'top edge stays exactly width even with a long title');
});

// ---------------------------------------------------------------------------
// 55-02: diffRender — only the changed rows are emitted (no flicker).
// ---------------------------------------------------------------------------

test('55-02: diffRender returns [] for identical input', () => {
  const prev = ['a', 'b', 'c'];
  const next = ['a', 'b', 'c'];
  assert.deepEqual(diffRender(prev, next), []);
});

test('55-02: diffRender emits an op only for the rows that changed (1-based row)', () => {
  const prev = ['a', 'b', 'c'];
  const next = ['a', 'X', 'c'];
  assert.deepEqual(diffRender(prev, next), [{ row: 2, text: 'X' }]);
});

test('55-02: diffRender emits ops for appended rows (next longer than prev)', () => {
  const prev = ['a'];
  const next = ['a', 'b', 'c'];
  assert.deepEqual(diffRender(prev, next), [
    { row: 2, text: 'b' },
    { row: 3, text: 'c' },
  ]);
});

test('55-02: diffRender emits a clear (empty text) for rows removed (prev longer than next)', () => {
  const prev = ['a', 'b', 'c'];
  const next = ['a'];
  assert.deepEqual(diffRender(prev, next), [
    { row: 2, text: '' },
    { row: 3, text: '' },
  ]);
});

test('55-02: diffRender treats an empty previous frame as a full paint', () => {
  const next = ['x', 'y'];
  assert.deepEqual(diffRender([], next), [
    { row: 1, text: 'x' },
    { row: 2, text: 'y' },
  ]);
});

// ---------------------------------------------------------------------------
// 55-02: purity / determinism — repeated calls yield identical output, no I/O.
// ---------------------------------------------------------------------------

test('55-02: the layout helpers are deterministic (identical input -> identical output)', () => {
  const a = box({ title: 'T', lines: ['one', 'two'], width: 16, height: 4 });
  const b = box({ title: 'T', lines: ['one', 'two'], width: 16, height: 4 });
  assert.deepEqual(a, b);
  assert.deepEqual(columns(['p', 'q'], [3, 3]), columns(['p', 'q'], [3, 3]));
});
