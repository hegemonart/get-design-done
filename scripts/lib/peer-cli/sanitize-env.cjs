// scripts/lib/peer-cli/sanitize-env.cjs
//
// Plan 33.5-04 — peer-CLI environment sandbox (SC#4; CONTEXT D-03).
//
// ============================================================================
// WHY THIS EXISTS
// ============================================================================
//
// The two peer-CLI clients (acp-client.cjs / asp-client.cjs) spawn external
// peer binaries (Gemini / Cursor / Copilot / Qwen / Codex) over stdio. Before
// this module, both clients defaulted the child's environment to the FULL
// `process.env` whenever the caller did not supply `opts.env` (acp line ~102,
// asp line ~122). That leaks GDD's own secrets — ANTHROPIC_API_KEY, GH_TOKEN,
// any GDD_* var — into every spawned peer, even though peers authenticate with
// their OWN logged-in credentials and have no need for GDD's keys.
//
// D-03 (locked) makes the sandbox ALLOWLIST-FORWARD / DEFAULT-DENY: the child
// env is built from (a) an OS-essential baseline (just enough for a binary to
// launch on Windows + macOS + Linux) PLUS (b) an explicit caller allowlist read
// from `.design/config.json#peer_cli.env_allowlist`. Everything else is dropped.
// GDD secrets and any secret-shaped var are NEVER forwarded unless the operator
// explicitly allowlists them — a one-line escape hatch for the rare peer that
// genuinely needs an inherited provider key.
//
// No new runtime dependency (D-12): plain JS + a defensive config read that
// mirrors registry.cjs's `readEnabledPeers` idiom.

'use strict';

const fs = require('node:fs');
const path = require('node:path');

// ── OS-essential baseline ────────────────────────────────────────────────────
//
// Exact variable names a child process generally needs to *launch* and behave
// correctly across Windows + POSIX. Kept deliberately pragmatic: anything not
// here (and not explicitly allowlisted) is dropped. The test only pins that
// PATH + HOME survive, so this set can evolve without breaking the contract.

const BASELINE = Object.freeze([
  // PATH resolution (Windows uses `Path`; PATHEXT picks executable suffixes).
  'PATH',
  'Path',
  'PATHEXT',
  // Home / profile (POSIX HOME; Windows USERPROFILE + HOMEDRIVE/HOMEPATH).
  'HOME',
  'USERPROFILE',
  'HOMEDRIVE',
  'HOMEPATH',
  // System roots (Windows).
  'SystemRoot',
  'windir',
  'SystemDrive',
  // Temp dirs (cross-platform variants).
  'TEMP',
  'TMP',
  'TMPDIR',
  // Locale / shell.
  'LANG',
  'SHELL',
  // Windows command interpreter + platform descriptors.
  'COMSPEC',
  'OS',
  'NUMBER_OF_PROCESSORS',
  'PROCESSOR_ARCHITECTURE',
]);

// Documented baseline PREFIXES — any var whose name starts with one of these is
// treated as baseline (locale family + Node runtime knobs like NODE_OPTIONS).
const BASELINE_PREFIXES = Object.freeze(['LC_', 'NODE_']);

// ── Secret matchers (extra guard on the baseline) ─────────────────────────────
//
// SECRET_NAME — exact GDD-held secret variable names that must never leak.
// SECRET_PREFIX — any GDD_* var is GDD-internal and never forwarded.
// SECRET_SHAPE — generic secret-shaped suffixes; catches third-party keys a
//   future baseline addition might otherwise let through.
//
// All three are overridden ONLY by an explicit entry in opts.allowlist
// (explicit allowlist WINS — see sanitizeEnv below).

const SECRET_NAME = Object.freeze([
  'ANTHROPIC_API_KEY',
  'GH_TOKEN',
  'GITHUB_TOKEN',
]);

const SECRET_PREFIX = Object.freeze(['GDD_']);

const SECRET_SHAPE = /(_KEY|_TOKEN|_SECRET|_PASSWORD|_AUTH)$/i;

// ── Helpers ───────────────────────────────────────────────────────────────────

function isBaseline(key) {
  if (BASELINE.includes(key)) return true;
  for (const pfx of BASELINE_PREFIXES) {
    if (key.startsWith(pfx)) return true;
  }
  return false;
}

function isSecret(key) {
  if (SECRET_NAME.includes(key)) return true;
  for (const pfx of SECRET_PREFIX) {
    if (key.startsWith(pfx)) return true;
  }
  return SECRET_SHAPE.test(key);
}

/**
 * Defensively read `<cwd>/.design/config.json` and extract
 * `peer_cli.env_allowlist` (a string[]). Returns [] on ANY failure path
 * (file missing, unparsable, wrong shape) — never throws. Mirrors
 * registry.cjs's `readEnabledPeers` idiom so both share a defensive reader.
 *
 * @param {string} [cwd] defaults to process.cwd()
 * @returns {string[]} allowlisted env var names (deduped); empty by default
 */
function readPeerCliAllowlist(cwd) {
  const root = typeof cwd === 'string' && cwd.length > 0 ? cwd : process.cwd();
  const cfgPath = path.join(root, '.design', 'config.json');
  let raw;
  try {
    raw = fs.readFileSync(cfgPath, 'utf8');
  } catch {
    return [];
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  const peerCli = parsed && typeof parsed === 'object' ? parsed.peer_cli : null;
  const list = peerCli && Array.isArray(peerCli.env_allowlist) ? peerCli.env_allowlist : [];
  const out = [];
  const seen = new Set();
  for (const item of list) {
    if (typeof item !== 'string' || item.length === 0) continue;
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

// ── sanitizeEnv ─────────────────────────────────────────────────────────────--

/**
 * Build a sanitized child environment (allowlist-forward / default-deny).
 *
 * For each KEY in sourceEnv, forward it iff:
 *   - KEY is explicitly in opts.allowlist (explicit allowlist WINS — even over
 *     the secret filters), OR
 *   - KEY is in the OS-essential BASELINE (exact name or a documented prefix)
 *     AND KEY is NOT a GDD secret / secret-shaped var.
 *
 * Everything else is dropped. Pure: never mutates the input.
 *
 * @param {Record<string,string>} [sourceEnv=process.env]
 * @param {{ allowlist?: string[] }} [opts]
 * @returns {Record<string,string>}
 */
function sanitizeEnv(sourceEnv, opts) {
  const src = sourceEnv && typeof sourceEnv === 'object' ? sourceEnv : process.env;
  const o = opts && typeof opts === 'object' ? opts : {};
  const allowlist = Array.isArray(o.allowlist) ? new Set(o.allowlist) : new Set();

  const result = {};
  for (const key of Object.keys(src)) {
    const value = src[key];
    // A value that is not a string (e.g. inherited prototype noise) is skipped;
    // child env entries must be strings.
    if (typeof value !== 'string') continue;

    // Explicit allowlist wins over everything, including the secret filters.
    if (allowlist.has(key)) {
      result[key] = value;
      continue;
    }
    // Otherwise the key must be baseline AND not secret-shaped.
    if (isBaseline(key) && !isSecret(key)) {
      result[key] = value;
    }
    // Default-deny: anything else is dropped.
  }
  return result;
}

module.exports = {
  sanitizeEnv,
  readPeerCliAllowlist,
  BASELINE,
  BASELINE_PREFIXES,
  SECRET_NAME,
  SECRET_PREFIX,
  SECRET_SHAPE,
};
