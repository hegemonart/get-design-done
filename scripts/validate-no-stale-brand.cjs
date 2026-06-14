#!/usr/bin/env node
'use strict';
// scripts/validate-no-stale-brand.cjs — Phase 61 (REBRAND-09) repo-wide
// brand-residual gate. The single source of truth proving "zero stale
// get-design-done / gdd brand residue anywhere outside the explicit
// allowlist". Dep-free CommonJS (node:fs / node:path / node:child_process
// only). Mirrors the exit-code style of scan-ws-bind.cjs /
// check-no-duplication.cjs: collect findings, print a one-line summary,
// process.exit(0) clean / process.exit(1) on any finding.
//
// SCAN: git ls-files (honors .gitignore, never walks node_modules/.git).
// For each tracked text file, scan line-by-line for residual brand tokens:
//   /gdd:   /gdd-   \bgdd-   get-design-done   \bgdd_  (lowercase, case-sensitive)
// FAIL on any hit OUTSIDE the allowlist below.
//
// ALLOWLIST (intentional residuals — a hit here is NOT a finding):
//   1+2. Lines (or the comment line immediately above) annotated with any of:
//        BACK_COMPAT / renamed from / formerly / legacy / deprecated / alias.
//        Covers the deprecated `gdd`→`hone` alias defs + migration notes.
//   3. UPPERCASE `GDD_` env vars are allowed (the `\bgdd_` token is matched
//      case-sensitively so it NEVER fires on GDD_). `gdd_cycle_mode` (deferred
//      config field) is also explicitly allowed.
//   4. CHANGELOG.md — full-file (historical chronicle).
//   5. **/baselines/** and test/fixtures/** — regenerated snapshots that
//      faithfully encode deferred filenames.
//   6. .planning/ — local-only, never shipped.
//   7. DEFERRED filenames: a `\bgdd-` hit that is part of a
//      hooks/gdd-*.{js,ts,cjs} path OR the connections/gdd-state.md path.
//      But `/gdd:` command STRINGS inside those files' bodies are STILL
//      findings (hook OUTPUT must be rebranded).

const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..');

// Binary / non-text extensions to skip outright.
const BINARY_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.webp',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.pdf', '.zip', '.tgz', '.gz', '.tar', '.bz2',
  '.mp3', '.mp4', '.wav', '.mov', '.webm',
]);

// Brand-residual token matchers. Order is irrelevant — each line is tested
// against all of them; we report the first matching token per line per rule.
const TOKEN_PATTERNS = [
  { token: '/gdd:', re: /\/gdd:/ },
  { token: '/gdd-', re: /\/gdd-/ },
  { token: 'gdd-', re: /\bgdd-/ },
  { token: 'get-design-done', re: /get-design-done/ },
  { token: 'gdd_', re: /\bgdd_/ }, // lowercase only — \b + literal `gdd_`; GDD_ never matches
];

// Allowlist annotation keywords — a hit on a line bearing one of these (or
// whose immediately-preceding line bears one) is intentional. Includes the
// localized "renamed from / deprecated" terms used by the i18n README
// migration-note banners (ja/ko/zh) so a faithful localized deprecation note
// is recognized the same as the English one.
const ANNOTATION_RE = /BACK_COMPAT|renamed from|formerly|legacy|deprecated|\balias\b|改名|非推奨|重命名|弃用|이름이 변경|더 이상 사용/i;

// Deferred-filename basenames/paths that may appear as a `gdd-` token.
const DEFERRED_HOOK_RE = /hooks\/gdd-[A-Za-z0-9._-]+\.(?:js|ts|cjs)/;
const DEFERRED_HOOK_BARE_RE = /\bgdd-[A-Za-z0-9._-]+\.(?:js|ts|cjs)\b/;
const DEFERRED_STATE_PATH = 'connections/gdd-state.md';

function listTrackedFiles() {
  const out = cp.execSync('git ls-files', { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return out.split(/\r?\n/).filter(Boolean);
}

// Derive the DEFERRED hook basename stems straight from the tracked tree
// (rule 7): the `hooks/gdd-*.{js,ts,cjs}` FILENAMES are intentionally kept as
// `gdd-*`. Their stems (e.g. `gdd-bash-guard`, `gdd-read-injection-scanner`)
// appear bare — without the extension — in hook configs, event payloads,
// tmpdir prefixes, and test assertions. A `gdd-`/`/gdd-` token that is part of
// one of THESE exact stems is the deferred FILENAME and is allowlisted; any
// other `gdd-` (a command/brand string) is still a finding. Derived (not
// hard-coded) so it self-updates if a hook is renamed in a later phase.
const DEFERRED_HOOK_STEMS = (() => {
  const stems = listTrackedFiles()
    .filter((f) => /^hooks\/gdd-[A-Za-z0-9._-]+\.(?:js|ts|cjs)$/.test(f.replace(/\\/g, '/')))
    .map((f) => path.basename(f).replace(/\.(?:js|ts|cjs)$/, ''));
  return Array.from(new Set(stems)).sort((a, b) => b.length - a.length);
})();
// A line bears a deferred-hook stem when one of the exact stems appears as a
// token (bounded by a non-identifier char or a known extension). This matches
// `gdd-bash-guard`, `gdd-bash-guard.js`, `'gdd-bash-guard'`, and the
// `gdd-turn-closeout-` tmpdir prefix, but NOT a command like `/gdd-fast`.
function lineBearsDeferredHookStem(line) {
  for (const stem of DEFERRED_HOOK_STEMS) {
    const idx = line.indexOf(stem);
    if (idx === -1) continue;
    const before = idx === 0 ? '' : line[idx - 1];
    // The char right before the stem must not extend it leftward into a
    // different identifier (it is always preceded by /, quote, space, etc.).
    if (before && /[A-Za-z0-9_]/.test(before)) continue;
    return true;
  }
  return false;
}

// Full-path allowlist test (rules 4/5/6).
function isFullPathAllowlisted(relPath) {
  const p = relPath.replace(/\\/g, '/');
  if (p === 'CHANGELOG.md') return true;                 // rule 4
  if (/(^|\/)baselines\//.test(p)) return true;          // rule 5
  if (p.startsWith('test/fixtures/')) return true;       // rule 5
  if (p.startsWith('.planning/')) return true;           // rule 6
  return false;
}

// Decide whether a single matched line+token is allowlisted (rules 1/2/3/7).
function isLineAllowlisted(relPath, line, prevLine, token) {
  // rule 3: gdd_cycle_mode deferred config field.
  if (/gdd_cycle_mode/.test(line)) return true;

  // rules 1+2: annotated alias-def / migration / legacy / deprecated lines.
  if (ANNOTATION_RE.test(line)) return true;
  if (prevLine != null && ANNOTATION_RE.test(prevLine)) return true;

  // rule 6 (extension): a `.planning/phases/<NN>-gdd-<...>` historical PATH
  // citation. The `.planning/` directory names are local-only and never
  // renamed (rule 6 allowlists the .planning/ tree itself) — a shipped doc/
  // schema that cites such a historical phase-dir path keeps the real name.
  if ((token === 'gdd-' || token === '/gdd-') &&
      /\.planning\/phases\/[0-9]+(?:\.[0-9]+)?-gdd-/.test(line)) {
    return true;
  }

  // rule 7: deferred FILENAMES (hook gdd-*.{js,ts,cjs} + connections/gdd-state.md).
  // A `gdd-` OR `/gdd-` token that is part of such a deferred filename PATH is
  // intentional (the FILENAMES are deferred). But a `/gdd:` command string, or
  // a `/gdd-` codex-command string (e.g. `/gdd-fast`) that is NOT a deferred
  // filename, is still a finding. The `/gdd:` token never reaches this branch.
  if (token === 'gdd-' || token === '/gdd-') {
    const p = relPath.replace(/\\/g, '/');
    // connections/gdd-state.md path (self or referenced).
    if (p === DEFERRED_STATE_PATH) return true;
    if (/(?:^|[\/"'`\s(])gdd-state\.md\b/.test(line)) return true;
    // hooks/gdd-<name>.(js|ts|cjs) path or bare deferred-hook basename literal.
    if (DEFERRED_HOOK_RE.test(line) || DEFERRED_HOOK_BARE_RE.test(line)) return true;
    // Bare deferred-hook stem (no extension) — hook id in configs/events/tests.
    if (lineBearsDeferredHookStem(line)) return true;
    // Self-referential mention of this file's own deferred hook basename.
    if (/^hooks\/gdd-[A-Za-z0-9._-]+\.(?:js|ts|cjs)$/.test(p) &&
        /gdd-[A-Za-z0-9._-]+\.(?:js|ts|cjs)/.test(line)) return true;
  }

  return false;
}

function scanFile(relPath, findings) {
  const ext = path.extname(relPath).toLowerCase();
  if (BINARY_EXT.has(ext)) return false; // not scanned
  if (isFullPathAllowlisted(relPath)) return false; // not scanned (and not counted)

  const abs = path.join(REPO_ROOT, relPath);
  let buf;
  try {
    buf = fs.readFileSync(abs);
  } catch {
    return false;
  }
  // Skip files that contain a NUL byte (binary / non-UTF8).
  if (buf.includes(0)) return true;
  const text = buf.toString('utf8');
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const prev = i > 0 ? lines[i - 1] : null;
    for (const { token, re } of TOKEN_PATTERNS) {
      if (!re.test(line)) continue;
      if (isLineAllowlisted(relPath, line, prev, token)) continue;
      findings.push(`${relPath.replace(/\\/g, '/')}:${i + 1}: ${token}`);
    }
  }
  return true;
}

function main() {
  const files = listTrackedFiles();
  const findings = [];
  let scanned = 0;
  for (const f of files) {
    if (scanFile(f, findings)) scanned++;
  }

  for (const finding of findings) {
    console.log(finding);
  }
  console.log(`validate-no-stale-brand: ${findings.length} finding(s) across ${scanned} files scanned`);
  process.exit(findings.length === 0 ? 0 : 1);
}

main();
