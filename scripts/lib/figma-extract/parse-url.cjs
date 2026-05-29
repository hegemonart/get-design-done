'use strict';
// scripts/lib/figma-extract/parse-url.cjs — Plan 31-01 (Wave A.1)
//
// Figma file URL/key parser. Accepts either a bare file key or a full Figma
// file URL and returns the canonical file key. Both legacy `/file/<key>/...`
// and newer `/design/<key>/...` URL forms are supported.
//
// CommonJS, zero external dependencies. Pure function — no I/O, no logging.
//
// Examples:
//   parseFigmaFileKey('IAHNrYoqIh56SCxgv3PjCS')
//     → 'IAHNrYoqIh56SCxgv3PjCS'                     (bare-key passthrough)
//   parseFigmaFileKey('https://www.figma.com/file/IAHNrYoqIh56SCxgv3PjCS/My-DS?node-id=0-1')
//     → 'IAHNrYoqIh56SCxgv3PjCS'
//   parseFigmaFileKey('https://www.figma.com/design/IAHNrYoqIh56SCxgv3PjCS/My-DS')
//     → 'IAHNrYoqIh56SCxgv3PjCS'
//   parseFigmaFileKey('')                            → throws TypeError
//   parseFigmaFileKey('https://example.com/no-key')  → throws Error

// Matches the key segment after `/file/` or `/design/` in a Figma URL.
// Figma file keys are URL-safe base62-ish tokens ([A-Za-z0-9]).
const URL_KEY_RE = /(?:file|design)\/([A-Za-z0-9]+)/;

/**
 * Resolve a Figma file key from a bare key or a full Figma file URL.
 *
 * @param {string} input - bare key | https://www.figma.com/file/<key>/... | .../design/<key>/...
 * @returns {string} the extracted file key
 * @throws {TypeError} when input is missing / empty / not a string
 * @throws {Error} when input looks like a URL but no file key can be extracted
 */
function parseFigmaFileKey(input) {
  if (typeof input !== 'string') {
    throw new TypeError('parseFigmaFileKey: non-empty input (file key or URL) required');
  }
  const trimmed = input.trim();
  if (trimmed === '') {
    throw new TypeError('parseFigmaFileKey: non-empty input (file key or URL) required');
  }

  // URL form carrying an http(s) scheme: validate the HOST is figma.com via the
  // URL parser — NOT a substring check. A substring test (`includes('figma.com')`)
  // is unsafe: `https://figma.com.evil.test/...` and `https://evil.test/figma.com`
  // both contain the literal but are not Figma (CodeQL js/incomplete-url-substring-
  // sanitization). new URL().hostname gives the real authority to compare exactly.
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
  if (hasScheme) {
    let host;
    try {
      host = new URL(trimmed).hostname.toLowerCase();
    } catch {
      throw new Error('parseFigmaFileKey: malformed URL: ' + trimmed);
    }
    const isFigmaHost =
      host === 'figma.com' || host === 'www.figma.com' || host.endsWith('.figma.com');
    if (!isFigmaHost) {
      throw new Error('parseFigmaFileKey: not a figma.com URL: ' + trimmed);
    }
    const match = trimmed.match(URL_KEY_RE);
    if (!match) {
      throw new Error(
        'parseFigmaFileKey: could not extract a Figma file key from URL: ' + trimmed
      );
    }
    return match[1];
  }

  // Scheme-less path form (e.g. `www.figma.com/file/<key>` or `/design/<key>/...`):
  // there is no parseable authority, so extract the key from the path segment.
  if (trimmed.includes('/')) {
    const match = trimmed.match(URL_KEY_RE);
    if (!match) {
      throw new Error(
        'parseFigmaFileKey: could not extract a Figma file key from URL: ' + trimmed
      );
    }
    return match[1];
  }

  // Bare key — a single URL-safe base62-ish token (no scheme, no path).
  if (!/^[A-Za-z0-9]+$/.test(trimmed)) {
    throw new Error('parseFigmaFileKey: invalid Figma file key: ' + trimmed);
  }
  return trimmed;
}

module.exports = { parseFigmaFileKey };
