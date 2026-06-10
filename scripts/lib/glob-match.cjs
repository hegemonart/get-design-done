'use strict';
/**
 * scripts/lib/glob-match.cjs — tiny dependency-free glob matcher.
 * Supports: **, *, ?, and literal segments. Not a full minimatch implementation,
 * but covers the patterns used in reference/protected-paths.default.json.
 *
 * Case-sensitivity tracks the host filesystem by default: case-INsensitive on
 * win32/darwin (so `HOOKS/x` matches `hooks/**`), case-sensitive elsewhere.
 * Callers can override via `opts.nocase` (used by the protected-paths suite to
 * exercise BOTH branches explicitly on a case-sensitive Linux CI runner).
 */

/**
 * The platform-derived default for case-insensitive matching. Exposed so the
 * protected-paths hook and the tests reference the SAME decision rather than
 * duplicating the win32||darwin check.
 */
function defaultNocase() {
  return process.platform === 'win32' || process.platform === 'darwin';
}

function globToRegex(glob, opts = {}) {
  const nocase = opts.nocase !== undefined ? opts.nocase : defaultNocase();
  // Normalize separators
  const g = glob.replace(/\\/g, '/');
  let re = '^';
  let i = 0;
  while (i < g.length) {
    const c = g[i];
    if (c === '*' && g[i + 1] === '*') {
      // `**` — match zero or more of ANY characters (including path separators).
      // Consume a trailing `/` so `reference/**/foo` becomes `reference/.*foo`
      // and also matches `reference/foo` (the empty-match case).
      let j = i + 2;
      if (g[j] === '/') j++;
      re += '.*';
      i = j;
      continue;
    }
    if (c === '*') {
      // single-segment wildcard
      re += '[^/]*';
      i++;
      continue;
    }
    if (c === '?') {
      re += '[^/]';
      i++;
      continue;
    }
    if ('.+^$(){}[]|\\'.includes(c)) {
      re += '\\' + c;
      i++;
      continue;
    }
    re += c;
    i++;
  }
  re += '$';
  // Use the `i` flag for case-insensitivity rather than lowercasing inputs,
  // which would corrupt the returned `pattern` string callers rely on.
  return new RegExp(re, nocase ? 'i' : '');
}

function matches(filepath, globList, opts = {}) {
  const norm = String(filepath).replace(/\\/g, '/').replace(/^\.\//, '');
  for (const g of globList) {
    const re = globToRegex(g, opts);
    if (re.test(norm)) return { matched: true, pattern: g };
  }
  return { matched: false };
}

module.exports = { matches, globToRegex, defaultNocase };
