#!/usr/bin/env node
'use strict';
/**
 * hooks/gdd-protected-paths.js — PreToolUse:Edit|Write|Bash guard
 *
 * Blocks Edit/Write on file paths matching the merged protected-paths glob list,
 * and blocks destructive Bash targeting the same paths (rm/mv/cp/tee/sed -i/git rm).
 *
 * Defaults live in reference/protected-paths.default.json.
 * User additions at .design/config.json.protected_paths are MERGED into the default
 * list; users cannot reduce the default set by shipping an empty override.
 */

const fs = require('fs');
const path = require('path');

/**
 * Walk up from startDir to find the package root by looking for a
 * package.json with name '@hegemonart/get-design-done'. Returns null
 * when the root cannot be found (e.g. in unusual installed layouts).
 * Mirrors the pattern used by gdd-fact-force.js / gdd-risk-gate.js
 * (Phase 56+) to be robust against esbuild/installed layouts that
 * may relocate or rewrite __dirname.
 */
function findPackageRoot(startDir) {
  let dir = startDir;
  for (let i = 0; i < 12; i++) {
    try {
      const pkg = require(path.join(dir, 'package.json'));
      if (pkg && pkg.name === '@hegemonart/get-design-done') return dir;
    } catch { /* not this level */ }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const REPO_ROOT = findPackageRoot(__dirname) || path.resolve(__dirname, '..');

const { matches } = require(path.join(REPO_ROOT, 'scripts', 'lib', 'glob-match.cjs'));

function loadProtectedPaths(cwd) {
  const defaultFile = path.join(REPO_ROOT, 'reference', 'protected-paths.default.json');
  let defaults = [];
  try {
    const parsed = JSON.parse(fs.readFileSync(defaultFile, 'utf8'));
    defaults = Array.isArray(parsed.protected_paths) ? parsed.protected_paths : [];
  } catch { /* fall back to an empty list; caller decides */ }

  const userFile = path.join(cwd || process.cwd(), '.design', 'config.json');
  let userList = [];
  try {
    const cfg = JSON.parse(fs.readFileSync(userFile, 'utf8'));
    if (Array.isArray(cfg.protected_paths)) userList = cfg.protected_paths;
  } catch { /* missing or invalid user config → defaults only */ }

  return Array.from(new Set([...defaults, ...userList]));
}

/**
 * Tokenise a string of shell-style args into individual arguments, honoring
 * single/double quotes and basic backslash escapes. Used by the bash target
 * extractor to get reliable arg arrays for destructive coreutils.
 */
function parseShellArgs(s) {
  const args = [];
  let current = '';
  let inQuote = null;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuote) {
      if (ch === inQuote) {
        inQuote = null;
        args.push(current);
        current = '';
      } else if (ch === '\\' && i + 1 < s.length && (s[i + 1] === inQuote || s[i + 1] === '\\')) {
        current += s[++i];
      } else {
        current += ch;
      }
    } else if (ch === '"' || ch === "'") {
      if (current) { args.push(current); current = ''; }
      inQuote = ch;
    } else if (/\s/.test(ch)) {
      if (current) { args.push(current); current = ''; }
    } else if (ch === '\\' && i + 1 < s.length) {
      current += s[++i];
    } else {
      current += ch;
    }
  }
  if (current) args.push(current);
  return args;
}

/**
 * Extract destructive-op file targets from one shell pipeline segment
 * (already split on `&&`/`||`/`;`/`|`). Catches:
 *  - rm / cp / mv / mkdir / touch / rmdir / chmod / chown / ln / tee
 *    with ALL their non-flag args (not just the first).
 *  - git rm / mv / restore / checkout — same treatment.
 *  - sed -i <args> file1 [file2 ...]
 *  - > file and >> file redirects appearing anywhere in the segment.
 *
 * `sudo ` prefix is stripped before dispatch.
 */
function extractTargetsFromSegment(seg) {
  const targets = [];
  const cleaned = seg.replace(/^sudo\s+/, '');

  // git destructive subcommands
  const gitMatch = cleaned.match(/^git\s+(rm|mv|restore|checkout)\b(.*)$/);
  if (gitMatch) {
    const args = parseShellArgs(gitMatch[2]);
    for (const arg of args) {
      if (!arg.startsWith('-')) targets.push(arg);
    }
  }

  // sed -i: only treat as destructive when -i is present
  if (/^sed\b/.test(cleaned) && /(?:^|\s)-i(?:\b|=)/.test(cleaned)) {
    const tokens = parseShellArgs(cleaned).slice(1); // drop 'sed'
    let i = 0;
    while (i < tokens.length) {
      const tok = tokens[i];
      // BSD `sed -i ''` consumes an extra empty-string arg
      if (tok === '-i' && i + 1 < tokens.length && tokens[i + 1] === '') {
        i += 2;
        continue;
      }
      if (tok.startsWith('-')) { i++; continue; }
      // First non-flag arg may be either an in-line sed script or a file;
      // path matcher will simply not match a non-path. Be permissive: queue all.
      targets.push(tok);
      i++;
    }
  }

  // Coreutils destructive verbs
  const coreutilsMatch = cleaned.match(/^(rm|cp|mv|mkdir|touch|rmdir|chmod|chown|ln|tee)\b(.*)$/);
  if (coreutilsMatch) {
    const args = parseShellArgs(coreutilsMatch[2]);
    for (const arg of args) {
      if (!arg.startsWith('-')) targets.push(arg);
    }
  }

  // Redirect targets: > file or >> file (appear anywhere in the segment)
  const redirects = seg.matchAll(/(?:^|[^&>])>>?\s*([^\s|;&]+)/g);
  for (const m of redirects) targets.push(m[1]);

  return targets;
}

/**
 * Extract all candidate file paths a Bash command may mutate. Walks the
 * command string in three passes:
 *
 *   1. Recursively process every `$(...)` and `\`...\`` subshell. The
 *      subshell is evaluated by the shell and its OUTPUT substitutes into
 *      the parent command — but the inner commands themselves ALSO run,
 *      so anything destructive inside is a target.
 *   2. Strip subshells from the outer command to simplify splitting.
 *   3. Split outer command on `&&`, `||`, `;`, `|` and feed each segment
 *      to extractTargetsFromSegment.
 *
 * Previous implementation called String.prototype.match() (returns only
 * the first match) and a single regex with a `[^\\s|;&>]+` capture group.
 * That missed:
 *   - chained commands (`rm safe.txt && rm secret`)
 *   - multi-arg destructive verbs (`rm a b c` — only `a` was extracted)
 *   - subshell content (`rm $(echo secret)`)
 *   - backtick command substitution (`rm \`echo secret\``)
 *
 * xargs bypass — `find protected -print0 | xargs -0 rm` — is NOT closed
 * here, because the targets come from stdin which we can't model without
 * a full pipeline shape analysis. The `find` segment will be checked but
 * the subsequent xargs+rm segment carries no explicit path. Project policy
 * should rely on `find <protected-dir>` being blocked at the upstream
 * segment via the .git/** / reference/** globs, plus general operator
 * caution. Future enhancement: scan pipeline for xargs-with-destructive
 * verbs and require the upstream stage to not reference protected globs.
 */
function extractBashTargets(command) {
  if (!command) return [];

  const targets = [];

  // 1. Recursive subshell scan.
  const SUBSHELL_RE = /\$\(([^()]*)\)|`([^`]*)`/g;
  let m;
  while ((m = SUBSHELL_RE.exec(command)) !== null) {
    targets.push(...extractBashTargets(m[1] !== undefined ? m[1] : m[2]));
  }

  // 2. Strip subshells from outer command.
  const stripped = command.replace(SUBSHELL_RE, '');

  // 3. Split on shell separators and process each segment.
  const segments = stripped.split(/\s*(?:&&|\|\||;|\|)\s*/);
  for (const segment of segments) {
    const seg = segment.trim();
    if (!seg) continue;
    targets.push(...extractTargetsFromSegment(seg));
  }

  // Dedup + strip surrounding quotes.
  return [
    ...new Set(
      targets
        .filter(Boolean)
        .map((p) => p.replace(/^['"]|['"]$/g, '')),
    ),
  ];
}

async function main() {
  let buf = '';
  for await (const chunk of process.stdin) buf += chunk;

  let payload;
  try { payload = JSON.parse(buf || '{}'); } catch {
    process.stdout.write(JSON.stringify({ continue: true }));
    return;
  }

  const tool = payload?.tool_name || '';
  if (!['Edit', 'Write', 'MultiEdit', 'Bash'].includes(tool)) {
    process.stdout.write(JSON.stringify({ continue: true }));
    return;
  }

  const cwd = payload?.cwd || process.cwd();
  const protectedPaths = loadProtectedPaths(cwd);
  if (protectedPaths.length === 0) {
    process.stdout.write(JSON.stringify({ continue: true }));
    return;
  }

  const candidates = [];
  if (tool === 'Edit' || tool === 'Write' || tool === 'MultiEdit') {
    const fp = payload?.tool_input?.file_path;
    if (fp) candidates.push(fp);
  } else if (tool === 'Bash') {
    candidates.push(...extractBashTargets(payload?.tool_input?.command || ''));
  }

  for (const cand of candidates) {
    if (!cand) continue;
    const rel = cand.startsWith('/') || /^[A-Z]:\\/i.test(cand)
      ? path.relative(cwd, cand).replace(/\\/g, '/')
      : cand.replace(/\\/g, '/');
    const r = matches(rel, protectedPaths);
    if (r.matched) {
      try {
        require('./_hook-emit.js').emitHookFired('gdd-protected-paths', 'block', {
          path: rel, pattern: r.pattern,
        });
      } catch { /* swallow */ }
      process.stdout.write(JSON.stringify({
        continue: false,
        stopReason: `gdd-protected-paths: '${rel}' is a protected path (matched '${r.pattern}'). To override, lift the path from the default glob list or explicitly edit via an approved workflow (e.g., /gdd:update, plan execution).`,
      }));
      return;
    }
  }

  try {
    require('./_hook-emit.js').emitHookFired('gdd-protected-paths', 'allow');
  } catch { /* swallow */ }
  process.stdout.write(JSON.stringify({ continue: true }));
}

main().catch(() => {
  process.stdout.write(JSON.stringify({ continue: true }));
});
