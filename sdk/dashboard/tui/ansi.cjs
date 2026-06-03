'use strict';
/**
 * sdk/dashboard/tui/ansi.cjs — Phase 55 (GDD Dashboard, DEP-FREE), TUI-01 substrate.
 *
 * The hand-rolled terminal-render toolkit that REPLACES Ink/Yoga with ZERO new dependency
 * (Node builtins only — in fact this file requires nothing). It is the layout + paint core
 * the TUI main loop (sdk/dashboard/tui/index.cjs, executor D) draws its 5 panes with.
 *
 * Design rule: every helper here is PURE — it RETURNS a string / string[] / op[] and performs
 * NO I/O. The main loop owns the single `process.stdout.write(...)`. That separation is what
 * makes the whole render layer deterministically unit-testable (test/suite/phase-55-ansi.test.cjs)
 * and is the heart of the dep-free / no-Yoga decision (CONTEXT D1, the ANSI render core contract).
 *
 * WIDTH MODEL (the subtle part). Terminals lay text out in CELLS, not bytes or UTF-16 units:
 *   - SGR color escapes occupy zero cells -> we strip them before measuring (`visibleWidth`).
 *   - A code point can be 0, 1, or 2 cells wide. We iterate by CODE POINT (for..of / spread),
 *     never by `.length` (UTF-16 units), so an astral char (emoji, U+1F600) is one indivisible
 *     unit -> we can NEVER slice a surrogate pair in half.
 *   - `wcwidthLite(cp)` is a compact East-Asian-Width table: the major CJK / fullwidth / wide-
 *     emoji ranges count as 2 columns; combining marks count as 0; everything else as 1. This
 *     is the floor the spec asks for (code-point counting) plus a wide-char bonus for CJK.
 */

// --- ANSI control constants ------------------------------------------------
const ESC = '\x1b';
const CSI = ESC + '[';
const RESET = CSI + '0m';

// SGR matcher used to strip color codes before measuring visible width. Matches a CSI
// sequence terminated by 'm' (the SGR final byte). Kept narrow (only 'm') on purpose — we
// never emit cursor-move sequences inside content lines.
// eslint-disable-next-line no-control-regex
const SGR_RE = /\x1b\[[0-9;]*m/g;

// --- cursor / screen control (return the escape strings; no writes) --------

/** CUP — move the cursor to (row, col), 1-based, as the terminal expects. */
function cursorTo(row, col) {
  return `${CSI}${Math.max(1, row | 0)};${Math.max(1, col | 0)}H`;
}

/** Erase the whole screen and home the cursor. */
function clearScreen() {
  return `${CSI}2J${CSI}H`;
}

/** Erase the entire current line (cursor row), leaving the cursor where it is. */
function clearLine() {
  return `${CSI}2K`;
}

/** DECTCEM — hide the cursor. */
function hideCursor() {
  return `${CSI}?25l`;
}

/** DECTCEM — show the cursor. */
function showCursor() {
  return `${CSI}?25h`;
}

/** Enter the alternate screen buffer (so quitting restores the user's scrollback). */
function altScreenEnter() {
  return `${CSI}?1049h`;
}

/** Leave the alternate screen buffer. */
function altScreenExit() {
  return `${CSI}?1049l`;
}

// --- color (SGR) -----------------------------------------------------------

// Named foreground SGR codes (the 8 base colors + their bright variants + a gray alias).
const FG = {
  black: 30, red: 31, green: 32, yellow: 33, blue: 34, magenta: 35, cyan: 36, white: 37,
  gray: 90, grey: 90, brightBlack: 90,
  brightRed: 91, brightGreen: 92, brightYellow: 93, brightBlue: 94,
  brightMagenta: 95, brightCyan: 96, brightWhite: 97,
};
// Background codes are the foreground codes + 10.
const BG = Object.fromEntries(Object.entries(FG).map(([k, v]) => [k, v + 10]));

/**
 * Resolve a color spec to its SGR opener string(s).
 *   - integer 0-255  -> a STANDALONE 256-color sequence `\x1b[38;5;<n>m` (fg) / `\x1b[48;5;<n>m`
 *     (bg). Emitted on its own (not folded into a longer `;`-list): the `38;5;n` extended-color
 *     selector is an atomic 3-param unit and some terminals mishandle it when mixed with other
 *     params — keeping it standalone is the defensively-portable choice (and what the pinned
 *     contract asserts).
 *   - named string   -> the table code (a bare numeric param, foldable into the attr opener).
 * Returns { attrs:number[] (foldable params), seqs:string[] (standalone sequences) }.
 */
function colorParts(spec, isBg) {
  if (spec == null) return { attrs: [], seqs: [] };
  if (typeof spec === 'number' && Number.isInteger(spec) && spec >= 0 && spec <= 255) {
    return { attrs: [], seqs: [`${CSI}${isBg ? 48 : 38};5;${spec}m`] };
  }
  const code = (isBg ? BG : FG)[spec];
  return code == null ? { attrs: [], seqs: [] } : { attrs: [code], seqs: [] };
}

/**
 * Wrap `text` in an SGR opener (+ any standalone 256-color sequences) and a SINGLE trailing
 * reset.
 *   opts: { fg?, bg?, bold?, dim?, underline?, noColor? }
 * No-op (returns `text` unchanged) when opts.noColor is truthy, when process.env.NO_COLOR is
 * set (the NO_COLOR convention), or when no style was requested.
 */
function color(text, opts = {}) {
  const s = String(text);
  if (opts.noColor || process.env.NO_COLOR) return s;

  const attrs = []; // foldable into one opener: 1/2/4 + named color codes
  if (opts.bold) attrs.push(1);
  if (opts.dim) attrs.push(2);
  if (opts.underline) attrs.push(4);

  const fg = colorParts(opts.fg, false);
  const bg = colorParts(opts.bg, true);
  attrs.push(...fg.attrs, ...bg.attrs);

  const opener = attrs.length ? `${CSI}${attrs.join(';')}m` : '';
  const standalone = [...fg.seqs, ...bg.seqs].join('');

  if (!opener && !standalone) return s; // nothing to wrap
  return `${opener}${standalone}${s}${RESET}`;
}

// --- width model -----------------------------------------------------------

/**
 * wcwidth-lite: cells occupied by a single code point.
 *   0 -> zero-width combining marks (so they don't inflate the measured width)
 *   2 -> wide (East-Asian Wide/Fullwidth) + the common wide-emoji planes
 *   1 -> everything else (the floor)
 */
function wcwidthLite(cp) {
  // C0/C1 controls measured as 0 (they don't advance the cursor as a glyph would).
  if (cp === 0) return 0;
  if (cp < 32 || (cp >= 0x7f && cp < 0xa0)) return 0;

  // Combining marks / zero-width: count as 0 columns.
  if (
    (cp >= 0x0300 && cp <= 0x036f) || // combining diacritical marks
    (cp >= 0x200b && cp <= 0x200f) || // zero-width space / joiners / marks
    cp === 0xfeff ||                  // BOM / zero-width no-break space
    (cp >= 0xfe00 && cp <= 0xfe0f)    // variation selectors
  ) return 0;

  // Wide (count as 2 columns). A compact but representative East-Asian-Width table.
  if (
    (cp >= 0x1100 && cp <= 0x115f) || // Hangul Jamo
    (cp >= 0x2e80 && cp <= 0x303e) || // CJK radicals / Kangxi
    (cp >= 0x3041 && cp <= 0x33ff) || // Hiragana, Katakana, CJK symbols
    (cp >= 0x3400 && cp <= 0x4dbf) || // CJK Ext A
    (cp >= 0x4e00 && cp <= 0x9fff) || // CJK Unified Ideographs
    (cp >= 0xa000 && cp <= 0xa4cf) || // Yi
    (cp >= 0xac00 && cp <= 0xd7a3) || // Hangul Syllables
    (cp >= 0xf900 && cp <= 0xfaff) || // CJK Compatibility Ideographs
    (cp >= 0xfe30 && cp <= 0xfe4f) || // CJK Compatibility Forms
    (cp >= 0xff00 && cp <= 0xff60) || // Fullwidth Forms
    (cp >= 0xffe0 && cp <= 0xffe6) || // Fullwidth signs
    (cp >= 0x1f300 && cp <= 0x1faff) || // emoji & pictographs (most live here)
    (cp >= 0x20000 && cp <= 0x3fffd)    // CJK Ext B..G (supplementary ideographic planes)
  ) return 2;

  return 1;
}

/** Visible column width of `s`: SGR stripped, counted per code point with wcwidthLite. */
function visibleWidth(s) {
  const plain = String(s).replace(SGR_RE, '');
  let w = 0;
  for (const ch of plain) w += wcwidthLite(ch.codePointAt(0));
  return w;
}

// --- truncate / pad (width-aware, surrogate-safe) --------------------------

const ELLIPSIS = '…'; // a single 1-column glyph

/**
 * Width-aware truncation. If `s` already fits in `width` visible columns it is returned as-is.
 * Otherwise it is cut to `width` columns with a trailing 1-column ellipsis. Iterates by code
 * point, so a surrogate pair (astral char / emoji) is an indivisible unit and is NEVER split:
 * a wide char that cannot fit alongside the ellipsis is dropped whole.
 *
 * NOTE: operates on the plain text (no embedded SGR). Callers that need color should color
 * the already-truncated result, or color whole cells (see columns/box, which truncate plain
 * content). This keeps the width math exact.
 */
function truncate(s, width) {
  const w = Math.max(0, width | 0);
  if (w === 0) return '';
  if (visibleWidth(s) <= w) return String(s);

  const budget = w - 1; // reserve one column for the ellipsis
  let out = '';
  let used = 0;
  for (const ch of String(s)) {
    const cw = wcwidthLite(ch.codePointAt(0));
    if (used + cw > budget) break; // a wide char that won't fit is dropped whole (surrogate-safe)
    out += ch;
    used += cw;
  }
  return out + ELLIPSIS;
}

/** Pad (or truncate) `s` to exactly `width` visible columns, spaces on the RIGHT. */
function padRight(s, width) {
  const w = Math.max(0, width | 0);
  const str = String(s);
  const vis = visibleWidth(str);
  if (vis > w) return truncate(str, w);
  return str + ' '.repeat(w - vis);
}

/** Pad (or truncate) `s` to exactly `width` visible columns, spaces on the LEFT. */
function padLeft(s, width) {
  const w = Math.max(0, width | 0);
  const str = String(s);
  const vis = visibleWidth(str);
  if (vis > w) return truncate(str, w);
  return ' '.repeat(w - vis) + str;
}

// --- columns (the row layout helper) ---------------------------------------

/**
 * Lay `cells` out in fixed-width columns. Each cell is padded/truncated to its width via
 * padRight, then joined with `sep` (default a single space). The returned row therefore has a
 * deterministic, exact visible width: sum(widths) + sep*(n-1).
 */
function columns(cells, widths, sep = ' ') {
  const list = Array.isArray(cells) ? cells : [];
  const w = Array.isArray(widths) ? widths : [];
  return list.map((c, i) => padRight(c == null ? '' : c, w[i] == null ? 0 : w[i])).join(sep);
}

// --- box (the bordered-panel helper — the Yoga replacement) ----------------

const BORDERS = {
  round: { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│' },
  space: { tl: ' ', tr: ' ', bl: ' ', br: ' ', h: ' ', v: ' ' },
};

/**
 * Render a bordered box as string[] — EVERY returned line is exactly `width` visible columns.
 *
 *   opts: { title?, lines: string[], width, height?, border? }
 *     title   — embedded in the top edge (truncated to fit), optional.
 *     lines   — content rows; each is padded/truncated to the inner width (width-2).
 *     width   — total outer width (borders included). The hard invariant.
 *     height  — optional total row count; content is padded with blank rows or truncated.
 *     border  — 'round' (default, rounded line-drawing) | 'space' (borderless padding).
 *
 * Layout: [top edge] + [content rows] + [bottom edge]. Inner content width = width - 2 (the two
 * vertical borders). Deterministic and pure.
 */
function box(opts = {}) {
  const width = Math.max(2, opts.width | 0);
  const b = BORDERS[opts.border] || BORDERS.round;
  const inner = width - 2;
  const lines = Array.isArray(opts.lines) ? opts.lines : [];

  // Top edge with an embedded, truncated title. The title sits one cell in from the left
  // corner; the remaining edge is filled with the horizontal glyph.
  let top;
  const rawTitle = opts.title == null ? '' : String(opts.title);
  if (rawTitle && inner > 0) {
    // Reserve 1 leading + at least 1 trailing horizontal cell around the title.
    const titleMax = Math.max(0, inner - 2);
    const title = truncate(rawTitle, titleMax); // fit to the edge; no padding
    const titleW = visibleWidth(title);
    const fill = inner - 1 - titleW; // 1 leading h before the title
    top = b.tl + b.h + title + b.h.repeat(Math.max(0, fill)) + b.tr;
  } else {
    top = b.tl + b.h.repeat(inner) + b.tr;
  }

  // Content rows: pad/truncate each to the inner width and wrap in vertical borders.
  let content = lines.map((ln) => b.v + padRight(ln == null ? '' : ln, inner) + b.v);

  // Honor an explicit height (top + N content rows + bottom). Pad with blank rows or truncate.
  if (opts.height != null) {
    const targetContent = Math.max(0, (opts.height | 0) - 2);
    if (content.length < targetContent) {
      const blank = b.v + ' '.repeat(inner) + b.v;
      while (content.length < targetContent) content.push(blank);
    } else if (content.length > targetContent) {
      content = content.slice(0, targetContent);
    }
  }

  const bottom = b.bl + b.h.repeat(inner) + b.br;
  return [top, ...content, bottom];
}

// --- diff repaint ----------------------------------------------------------

/**
 * Compute the minimal set of row repaints between two frames. Returns [{row, text}] for ONLY
 * the rows whose text changed (row is 1-based, matching cursorTo). Rows present in `next` but
 * not `prev` are emitted (appended); rows in `prev` but gone from `next` are emitted with an
 * empty `text` so the main loop can clear them. Identical frames -> []. Pure.
 *
 * The TUI loop applies each op as `cursorTo(row,1) + clearLine() + text`, so a steady frame
 * costs zero writes and a single-cell change repaints exactly one line (no flicker).
 */
function diffRender(prevLines, nextLines) {
  const prev = Array.isArray(prevLines) ? prevLines : [];
  const next = Array.isArray(nextLines) ? nextLines : [];
  const ops = [];
  const n = Math.max(prev.length, next.length);
  for (let i = 0; i < n; i++) {
    const before = i < prev.length ? prev[i] : undefined;
    const after = i < next.length ? next[i] : undefined;
    if (after === undefined) {
      // Row removed in the new frame -> clear it.
      ops.push({ row: i + 1, text: '' });
    } else if (before !== after) {
      ops.push({ row: i + 1, text: after });
    }
  }
  return ops;
}

module.exports = {
  // cursor / screen
  cursorTo,
  clearScreen,
  clearLine,
  hideCursor,
  showCursor,
  altScreenEnter,
  altScreenExit,
  // color
  color,
  // width
  visibleWidth,
  wcwidthLite,
  // layout
  truncate,
  padRight,
  padLeft,
  columns,
  box,
  // diff repaint
  diffRender,
  // constants exported for executor D (so panes can compose raw escapes if needed)
  ESC,
  CSI,
  RESET,
};
