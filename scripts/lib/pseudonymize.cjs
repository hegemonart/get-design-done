/**
 * pseudonymize.cjs — Phase 30 pseudonymization-not-anonymization primitive.
 *
 * Scrubs identity-correlatable fields (git identity, paths, hostname, repo
 * origin, env-var values, email, IPs) from Phase 30 issue payloads.
 *
 * Pipeline placement: layered downstream of `scripts/lib/redact.cjs` (Phase
 * 22 secrets-stripping). The two are ORTHOGONAL — redaction handles "this
 * must never escape" (tokens, keys); pseudonymization handles "this is fine
 * to publish but should not personally identify the reporter" (names, paths,
 * hosts). This module does NOT import `redact.cjs`; composition lives at
 * the caller (Plan 30-02).
 *
 * Honest framing (CONTEXT D-01): PSEUDONYMIZATION, NOT ANONYMIZATION.
 * Identity correlation is reduced, not eliminated — side-channel data
 * (writing style, code patterns, repo fingerprints) may still re-identify.
 * The disclaimer rendered at 30-04 consent time says this. See
 * `reference/pseudonymization-rules.md` for the full R1..R8 rule catalog.
 *
 * Purity contract: no `fs`, no `child_process`, no env mutation, no network.
 * Caller provides identity + hostname + repo origin + visibility via `opts`.
 * Per CONTEXT D-13 the test suite uses synthetic fixtures with no live `gh`
 * — `opts.repoVisibility` is the caller's resolved value.
 */

'use strict';

const crypto = require('node:crypto');

/**
 * Manifest of the 8 rules. Order matches reference/pseudonymization-rules.md
 * §§ R1..R8. Used by 30-07 privacy-diff to enumerate active rules. DO NOT
 * reorder without updating the reference doc.
 */
const RULES = Object.freeze([
  Object.freeze({ id: 'R1', name: 'git-identity',     replaces: 'user.name, user.email from git config',                            placeholder: '<user>, <user>@<domain>' }),
  Object.freeze({ id: 'R2', name: 'absolute-paths',   replaces: '/Users/X/, /home/X/, C:\\Users\\X\\',                                placeholder: '<home>/ or <home>\\' }),
  Object.freeze({ id: 'R3', name: 'hostname',         replaces: 'os.hostname()',                                                     placeholder: '<host>' }),
  Object.freeze({ id: 'R4', name: 'repo-origin',      replaces: 'git remote get-url origin',                                         placeholder: '<category>-hash:<sha8>' }),
  Object.freeze({ id: 'R5', name: 'env-vars',         replaces: 'values of USER, LOGNAME, HOSTNAME, *_TOKEN, *_KEY, *_SECRET',       placeholder: '<env:<KEY>>' }),
  Object.freeze({ id: 'R6', name: 'email-in-logs',    replaces: 'email addresses appearing in log/stack content',                    placeholder: '<email>' }),
  Object.freeze({ id: 'R7', name: 'ip-addresses',     replaces: 'IPv4/IPv6 addresses (network-class only retained)',                 placeholder: '<ipv4:a.b.c.0> / <ipv6:prefix>' }),
  Object.freeze({ id: 'R8', name: 'stable-pseudonym', replaces: 'derived per-user identifier for maintainer-side dedup',             placeholder: 'sha256(user_id + repo_origin)[:8]' }),
]);

// ---------------------------------------------------------------------------
// Internal helpers (NOT exported).
// ---------------------------------------------------------------------------

/**
 * Escape a string for safe inclusion in a RegExp literal.
 *
 * @param {string} s
 * @returns {string}
 */
function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Normalize a git remote origin URL: strip leading protocol/host prefix,
 * strip trailing `.git`, lowercase. Used by R4 + R8 so the same logical
 * origin (across `git@`, `https://`, `ssh://` shapes) maps to one hash.
 *
 * @param {string} origin
 * @returns {string}
 */
function normalizeRepoOrigin(origin) {
  if (typeof origin !== 'string' || origin.length === 0) return '';
  let s = origin.trim();
  // Strip protocol / SSH prefix variants. Order matters: more-specific first.
  s = s.replace(/^git@[^:]+:/i, '');
  s = s.replace(/^https?:\/\/[^/]+\//i, '');
  s = s.replace(/^ssh:\/\/(?:[^@]+@)?[^/]+\//i, '');
  s = s.replace(/^git:\/\/[^/]+\//i, '');
  // Strip trailing `.git`.
  s = s.replace(/\.git$/i, '');
  return s.toLowerCase();
}

/**
 * Truncate strings used in the replacements log so a stray un-redacted secret
 * (upstream Phase 22 miss) does not get echoed into the log at full length.
 *
 * @param {unknown} v
 * @returns {string}
 */
function truncForLog(v) {
  const s = typeof v === 'string' ? v : String(v);
  return s.length > 80 ? s.slice(0, 77) + '...' : s;
}

// ---------------------------------------------------------------------------
// Rule helpers — exported for fine-grained testing.
// ---------------------------------------------------------------------------

/**
 * R1 — replace git user.name (word-boundary) and user.email (case-insensitive)
 * with `<user>` and `<user>@<domain>` placeholders.
 *
 * @param {string} str
 * @param {{ name?: string, email?: string, userId?: string }} [identity]
 * @returns {string}
 */
function replaceGitIdentity(str, identity) {
  if (typeof str !== 'string') return str;
  if (!identity) return str;
  let out = str;
  if (identity.email && typeof identity.email === 'string' && identity.email.length >= 3) {
    const reEmail = new RegExp(escapeRe(identity.email), 'gi');
    out = out.replace(reEmail, '<user>@<domain>');
  }
  if (identity.name && typeof identity.name === 'string' && identity.name.length >= 2) {
    const reName = new RegExp('\\b' + escapeRe(identity.name) + '\\b', 'g');
    out = out.replace(reName, '<user>');
  }
  return out;
}

/**
 * R2 — replace home-directory absolute paths across all three OS shapes
 * (Linux `/home/X/`, macOS `/Users/X/`, Windows `C:\Users\X\`) regardless of
 * the current OS (payloads may be cross-OS). Identity-specific sweeps run
 * BEFORE generic sweeps so identity-aware substitution takes precedence.
 *
 * @param {string} str
 * @param {{ name?: string }} [identity]
 * @returns {string}
 */
function replacePaths(str, identity) {
  if (typeof str !== 'string') return str;
  let out = str;
  const name = identity && typeof identity.name === 'string' && identity.name.length >= 1
    ? identity.name
    : null;

  if (name) {
    const escaped = escapeRe(name);
    // macOS: /Users/<name>/
    out = out.replace(new RegExp('/Users/' + escaped + '/', 'g'), '<home>/');
    // Linux: /home/<name>/
    out = out.replace(new RegExp('/home/' + escaped + '/', 'g'), '<home>/');
    // Windows: <drive>:\Users\<name>\  (case-insensitive drive letter)
    out = out.replace(
      new RegExp('[A-Za-z]:\\\\Users\\\\' + escaped + '\\\\', 'g'),
      '<home>\\',
    );
  }

  // Generic sweeps (no identity name available, or identity name didn't match).
  out = out.replace(/\/Users\/[^/\s]+\//g, '<home>/');
  out = out.replace(/\/home\/[^/\s]+\//g, '<home>/');
  out = out.replace(/[A-Za-z]:\\Users\\[^\\\s]+\\/g, '<home>\\');

  return out;
}

/**
 * R3 — replace `os.hostname()` value with `<host>`. Word-boundary substitution
 * plus a special-case sweep for `@hostname` shapes inside ssh-like strings
 * where the standard `\b` lookaround does not fire as expected.
 *
 * @param {string} str
 * @param {string} hostname
 * @returns {string}
 */
function replaceHostname(str, hostname) {
  if (typeof str !== 'string') return str;
  if (typeof hostname !== 'string' || hostname.length < 2) return str;
  const escaped = escapeRe(hostname);
  let out = str;
  // ssh-like `user@hostname` shape.
  out = out.replace(new RegExp('@' + escaped + '\\b', 'g'), '@<host>');
  // Standard word-boundary occurrences.
  out = out.replace(new RegExp('\\b' + escaped + '\\b', 'g'), '<host>');
  return out;
}

/**
 * R4 — replace repository origin URL with `<category>-hash:<sha8>`.
 * Caller resolves visibility via `gh repo view --json visibility`; this module
 * maps visibility → category prefix:
 *   'public-personal' → `public-personal-hash:<sha8>`
 *   everything else   → `private-org-hash:<sha8>`  (conservative default)
 * Owner-is-user vs owner-is-org distinction is the CALLER's responsibility.
 *
 * @param {string} str
 * @param {string} repoOrigin
 * @param {string} [visibility]
 * @returns {string}
 */
function replaceRepoOrigin(str, repoOrigin, visibility) {
  if (typeof str !== 'string') return str;
  if (typeof repoOrigin !== 'string' || repoOrigin.length === 0) return str;

  const normalized = normalizeRepoOrigin(repoOrigin);
  if (!normalized) return str;
  const hash = crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 8);
  const category = visibility === 'public-personal' ? 'public-personal-hash' : 'private-org-hash';
  const placeholder = `${category}:${hash}`;

  let out = str;
  // Replace the raw origin substring (possibly multiple shapes appearing in a
  // stack trace — substitute the input form first, then the normalized form).
  if (repoOrigin && repoOrigin.length >= 3) {
    out = out.replace(new RegExp(escapeRe(repoOrigin), 'g'), placeholder);
  }
  if (normalized && normalized !== repoOrigin && normalized.length >= 3) {
    out = out.replace(new RegExp(escapeRe(normalized), 'g'), placeholder);
  }
  return out;
}

/**
 * R5 — drop env-var VALUES (not key names) from anywhere in `value`. Targets
 * USER, LOGNAME, HOSTNAME, *_TOKEN, *_KEY, *_SECRET. Values < 3 chars are
 * skipped (corruption guard); longer values substituted first (no half-replace).
 * Walks structures recursively, cycles detected via WeakSet.
 *
 * @param {unknown} value
 * @param {Record<string, unknown>} [envSnapshot]
 * @param {WeakSet<object>} [seen]
 * @returns {unknown}
 */
function dropEnvVars(value, envSnapshot, seen) {
  const env = envSnapshot && typeof envSnapshot === 'object' ? envSnapshot : {};

  // Build value→placeholder map (only entries with target keys + len ≥ 3).
  /** @type {Array<{ val: string, placeholder: string }>} */
  const drops = [];
  for (const key of Object.keys(env)) {
    const val = /** @type {Record<string, unknown>} */ (env)[key];
    if (typeof val !== 'string' || val.length < 3) continue;
    const isTarget =
      key === 'USER' || key === 'LOGNAME' || key === 'HOSTNAME' ||
      key.endsWith('_TOKEN') || key.endsWith('_KEY') || key.endsWith('_SECRET');
    if (!isTarget) continue;
    drops.push({ val, placeholder: `<env:${key}>` });
  }
  // Sort by descending length so longer values are processed first.
  drops.sort((a, b) => b.val.length - a.val.length);

  function walkString(s) {
    let out = s;
    for (const { val, placeholder } of drops) {
      if (out.includes(val)) {
        out = out.split(val).join(placeholder);
      }
    }
    return out;
  }

  function walk(v, visited) {
    if (v === null || v === undefined) return v;
    if (typeof v === 'string') return walkString(v);
    if (typeof v !== 'object') return v;

    if (visited.has(v)) return v;
    visited.add(v);

    if (Array.isArray(v)) {
      return v.map((x) => walk(x, visited));
    }
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const k of Object.keys(v)) {
      out[k] = walk(/** @type {Record<string, unknown>} */ (v)[k], visited);
    }
    return out;
  }

  return walk(value, seen ?? new WeakSet());
}

/**
 * R6 — replace generic email addresses (not covered by R1's identity-aware
 * substitution) with `<email>`. Apply AFTER R1 so R1 takes precedence.
 *
 * @param {string} str
 * @returns {string}
 */
function replaceEmails(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<email>');
}

/**
 * R7 — replace IPv4/IPv6 addresses (retain only network class).
 *   IPv4 a.b.c.d → <ipv4:a.b.c.0>    (zero last octet)
 *   IPv6         → <ipv6:<prefix>::>  (drop last segment)
 * Guards block false-positives on semver (`v1.2.3.4`), email-adjacent
 * (`@1.2.3.4`), and longer dotted strings (`1.2.3.4.5`).
 *
 * @param {string} str
 * @returns {string}
 */
function replaceIPs(str) {
  if (typeof str !== 'string') return str;
  // IPv4: (?<![v@\d.]) blocks semver/email/dotted-context preceding; (?!\.) blocks following.
  const ipv4Re = /(?<![v@\d.])\b((?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\.(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\.(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9]))\.(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\b(?!\.)/g;
  let out = str.replace(ipv4Re, '<ipv4:$1.0>');
  // IPv6: ≥5 segments avoids false-positive on time strings (12:34:56).
  const ipv6Re = /\b([0-9a-f]{1,4}(?::[0-9a-f]{1,4}){4,7})\b/gi;
  out = out.replace(ipv6Re, (m) => `<ipv6:${m.split(':').slice(0, -1).join(':')}::>`);
  return out;
}

/**
 * R8 — derive a deterministic 8-char hex pseudonym = `sha256(userId + ':' +
 * normalized_repo_origin)[:8]`. NOT applied to payload contents — a SEPARATE
 * export used by 30-02 for caller-side metadata (maintainer-side dedup key).
 * Defensive: falsy inputs → sentinel `'00000000'`.
 *
 * @param {string} userId
 * @param {string} repoOrigin
 * @returns {string}
 */
function stablePseudonym(userId, repoOrigin) {
  if (!userId || !repoOrigin) return '00000000';
  const normalized = normalizeRepoOrigin(String(repoOrigin));
  return crypto
    .createHash('sha256')
    .update(String(userId) + ':' + normalized)
    .digest('hex')
    .slice(0, 8);
}

// ---------------------------------------------------------------------------
// Public entry point: apply all 8 rules (well, R1..R7 — R8 is opt-in) to a
// payload value, returning the scrubbed value + a replacements log.
// ---------------------------------------------------------------------------

/**
 * Apply pseudonymization rules to `payload`. R5 runs first as a tree-level
 * pass; R1..R4, R6, R7 run per-string during the recursive walk. R8 is NOT
 * applied here — it is a separate export for caller-side metadata.
 * Returns `{ payload, replacements }` (the log feeds 30-04's "X replacements
 * made (R1: 3, R2: 5, ...)" UI before submit).
 *
 * @param {unknown} payload
 * @param {{
 *   identity?: { name?: string, email?: string, userId?: string },
 *   hostname?: string,
 *   repoOrigin?: string,
 *   repoVisibility?: ('public-personal'|'private-org'|'private'|'public'),
 *   envSnapshot?: Record<string, unknown>,
 * }} [opts]
 * @returns {{ payload: unknown, replacements: Array<{ ruleId: string, before: string, after: string }> }}
 */
function pseudonymize(payload, opts) {
  const options = opts || {};
  const identity = options.identity || {};
  const hostname = typeof options.hostname === 'string' ? options.hostname : '';
  const repoOrigin = typeof options.repoOrigin === 'string' ? options.repoOrigin : '';
  const visibility = options.repoVisibility;
  const envSnapshot = options.envSnapshot && typeof options.envSnapshot === 'object'
    ? options.envSnapshot
    : {};

  /** @type {Array<{ ruleId: string, before: string, after: string }>} */
  const replacements = [];

  // R5 first — tree-level value substitution.
  const afterEnv = dropEnvVars(payload, envSnapshot);
  if (JSON.stringify(afterEnv) !== JSON.stringify(payload)) {
    replacements.push({
      ruleId: 'R5',
      before: truncForLog(JSON.stringify(payload)),
      after: truncForLog(JSON.stringify(afterEnv)),
    });
  }

  // Per-string rules table — applied in order during the recursive walk.
  // R5 already ran as a tree-level pass above.
  const stringRules = [
    { id: 'R1', fn: (s) => replaceGitIdentity(s, identity) },
    { id: 'R2', fn: (s) => replacePaths(s, identity) },
    { id: 'R3', fn: (s) => replaceHostname(s, hostname) },
    { id: 'R4', fn: (s) => replaceRepoOrigin(s, repoOrigin, visibility) },
    { id: 'R6', fn: (s) => replaceEmails(s) },
    { id: 'R7', fn: (s) => replaceIPs(s) },
  ];

  function rewriteString(s) {
    let cur = s;
    for (const { id, fn } of stringRules) {
      const next = fn(cur);
      if (next !== cur) {
        replacements.push({ ruleId: id, before: truncForLog(cur), after: truncForLog(next) });
        cur = next;
      }
    }
    return cur;
  }

  function walk(v, seen) {
    if (v === null || v === undefined) return v;
    if (typeof v === 'string') return rewriteString(v);
    if (typeof v !== 'object') return v;
    if (seen.has(v)) return v;
    seen.add(v);
    if (Array.isArray(v)) {
      return v.map((x) => walk(x, seen));
    }
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const k of Object.keys(v)) {
      out[k] = walk(/** @type {Record<string, unknown>} */ (v)[k], seen);
    }
    return out;
  }

  const transformed = walk(afterEnv, new WeakSet());
  return { payload: transformed, replacements };
}

module.exports = {
  pseudonymize,
  replaceGitIdentity,
  replacePaths,
  replaceHostname,
  replaceRepoOrigin,
  dropEnvVars,
  replaceEmails,
  replaceIPs,
  stablePseudonym,
  RULES,
};
