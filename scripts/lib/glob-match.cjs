'use strict';
/**
 * scripts/lib/glob-match.cjs — tiny dependency-free glob matcher.
 * Supports: **, *, ?, and literal segments. Not a full minimatch implementation,
 * but covers the patterns used in reference/protected-paths.default.json.
 */

function globToRegex(glob) {
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
  return new RegExp(re);
}

function matches(filepath, globList) {
  const norm = String(filepath).replace(/\\/g, '/').replace(/^\.\//, '');
  for (const g of globList) {
    const re = globToRegex(g);
    if (re.test(norm)) return { matched: true, pattern: g };
  }
  return { matched: false };
}

module.exports = { matches, globToRegex };
