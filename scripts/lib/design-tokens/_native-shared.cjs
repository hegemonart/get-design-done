/**
 * design-tokens/_native-shared.cjs — shared precision-contract helpers for the
 * native emitters (swift.cjs / compose.cjs / flutter.cjs), Phase 34.1 Plan 01.
 *
 * The single implementation of the PRECISION CONTRACT documented in
 * reference/native-platforms.md, so all three emitters convert color /
 * dimension / typography / non-mappable values identically:
 *   COLOR      hex #RGB/#RGBA/#RRGGBB/#RRGGBBAA -> 8-bit channels EXACT;
 *              #RGB/#RGBA expand by nibble duplication; alpha tracked.
 *   DIMENSION  Npx | unit-less -> integer (round-half-up) + logical-px double.
 *   TYPOGRAPHY strings -> pass-through.
 *   NON-MAPPABLE var()/calc()/gradient/rem/em -> verbatim, excluded.
 *
 * Pure: no fs, no network, no Date, no process.env, no child_process (D-10).
 */

'use strict';

// Markers embedded in every emitted line so the symmetric re-extractors can
// recover the EXACT canonical token key (native identifiers are mangled, e.g.
// `color-primary` -> `colorPrimary`, so the key must travel alongside).
const TOKEN_MARKER = '// token: ';
const NONMAPPABLE_MARKER = '// non-mappable: ';

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const PX_RE = /^-?\d+(?:\.\d+)?px$/;
const UNITLESS_RE = /^-?\d+(?:\.\d+)?$/;
const NONMAPPABLE_RE = /(^var\(|^calc\(|gradient\(|\b(rem|em)$|\d(rem|em)$)/i;

/**
 * Read `.tokens` from a Phase-23 TokenSet or a bare {tokens} map.
 * @param {*} tokenSet
 * @returns {Record<string,string>}
 */
function readTokens(tokenSet) {
  if (
    !tokenSet ||
    typeof tokenSet !== 'object' ||
    !tokenSet.tokens ||
    typeof tokenSet.tokens !== 'object'
  ) {
    throw new TypeError(
      'native emitter: expected { tokens: Record<string,string> } (or a Phase-23 TokenSet)',
    );
  }
  return tokenSet.tokens;
}

/**
 * Stable, sorted [key, value] entries so emit(x) === emit(x) byte-for-byte.
 * @param {Record<string,string>} tokens
 * @returns {[string,string][]}
 */
function sortedEntries(tokens) {
  return Object.keys(tokens)
    .sort()
    .map((k) => [k, String(tokens[k])]);
}

/**
 * Classify a token value per the precision contract. The value is the
 * authority; the key prefix is only a hint (see native-platforms.md §2).
 * @param {string} _key
 * @param {string} value
 * @returns {'non-mappable'|'color'|'dimension'|'typography'}
 */
function classify(_key, value) {
  const v = String(value).trim();
  if (NONMAPPABLE_RE.test(v)) return 'non-mappable';
  if (HEX_RE.test(v)) return 'color';
  if (PX_RE.test(v) || UNITLESS_RE.test(v)) return 'dimension';
  return 'typography';
}

/**
 * Expand #RGB/#RGBA shorthand to #RRGGBB/#RRGGBBAA and split into 8-bit
 * channels. Alpha defaults to opaque (255) when absent; `hadAlpha` records
 * whether the source carried an alpha channel so the re-extractor can emit a
 * 6- or 8-digit hex faithfully.
 * @param {string} hex
 * @returns {{r:number,g:number,b:number,a:number,hadAlpha:boolean}}
 */
function parseHexChannels(hex) {
  let h = String(hex).trim().replace(/^#/, '');
  let hadAlpha = false;
  if (h.length === 3) {
    h = h.split('').map((c) => c + c).join('');
  } else if (h.length === 4) {
    h = h.split('').map((c) => c + c).join('');
    hadAlpha = true;
  } else if (h.length === 8) {
    hadAlpha = true;
  }
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const a = hadAlpha ? parseInt(h.slice(6, 8), 16) : 255;
  return { r, g, b, a, hadAlpha };
}

/**
 * Recover the canonical hex from 8-bit channels. Emits 6-digit #RRGGBB when
 * the original had no alpha, 8-digit #RRGGBBAA when it did (contract: implied
 * opaque alpha is dropped on the way back so #3B82F6 round-trips exactly).
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @param {number} a
 * @param {boolean} hadAlpha
 * @returns {string}
 */
function channelsToHex(r, g, b, a, hadAlpha) {
  const h2 = (n) => (n & 0xff).toString(16).padStart(2, '0');
  const base = `#${h2(r)}${h2(g)}${h2(b)}`;
  return hadAlpha ? `${base}${h2(a)}` : base;
}

/**
 * Pack channels into a Compose/Flutter 0xAARRGGBB literal (uppercase digits).
 * @param {{r:number,g:number,b:number,a:number}} ch
 * @returns {string} e.g. "0xFF3B82F6"
 */
function channelsToArgbLiteral({ r, g, b, a }) {
  const h2 = (n) => (n & 0xff).toString(16).toUpperCase().padStart(2, '0');
  return `0x${h2(a)}${h2(r)}${h2(g)}${h2(b)}`;
}

/**
 * Strip a 0xAARRGGBB literal back into channels.
 * @param {string} literal e.g. "0xFF3B82F6"
 * @returns {{r:number,g:number,b:number,a:number}}
 */
function argbLiteralToChannels(literal) {
  const h = String(literal).replace(/^0x/i, '').padStart(8, '0');
  return {
    a: parseInt(h.slice(0, 2), 16),
    r: parseInt(h.slice(2, 4), 16),
    g: parseInt(h.slice(4, 6), 16),
    b: parseInt(h.slice(6, 8), 16),
  };
}

/**
 * px (or unit-less) -> nearest integer, round-half-up (for pt/dp).
 * @param {string} value
 * @returns {number}
 */
function pxToInt(value) {
  const n = parseFloat(String(value));
  return Math.floor(n + 0.5);
}

/**
 * px (or unit-less) -> logical-px double form string for Dart (`16` -> `16.0`).
 * @param {string} value
 * @returns {string}
 */
function pxToDouble(value) {
  const n = parseFloat(String(value));
  return Number.isInteger(n) ? `${n}.0` : String(n);
}

/**
 * Recover the canonical `Npx` string from an emitted numeric form.
 * @param {string|number} num
 * @returns {string}
 */
function numToPx(num) {
  const n = parseFloat(String(num));
  return Number.isInteger(n) ? `${n}px` : `${n}px`;
}

/**
 * dash-case token -> camelCase Swift/Kotlin/Dart identifier.
 * `color-primary` -> `colorPrimary`; leading digit gets a `t` prefix.
 * @param {string} key
 * @returns {string}
 */
function swiftIdent(key) {
  let id = String(key).replace(/[^A-Za-z0-9]+(.)?/g, (_, c) =>
    c ? c.toUpperCase() : '',
  );
  if (!id) id = 'token';
  if (/^[0-9]/.test(id)) id = 't' + id;
  return id;
}

module.exports = {
  TOKEN_MARKER,
  NONMAPPABLE_MARKER,
  HEX_RE,
  PX_RE,
  UNITLESS_RE,
  NONMAPPABLE_RE,
  readTokens,
  sortedEntries,
  classify,
  parseHexChannels,
  channelsToHex,
  channelsToArgbLiteral,
  argbLiteralToChannels,
  pxToInt,
  pxToDouble,
  numToPx,
  swiftIdent,
};
