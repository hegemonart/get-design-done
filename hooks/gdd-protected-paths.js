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
const { matches } = require(path.join(__dirname, '..', 'scripts', 'lib', 'glob-match.cjs'));

const REPO_ROOT = path.resolve(__dirname, '..');

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
 * Extract a target path from a Bash command, best-effort.
 * Returns an array of candidate paths; empty if none parsed.
 */
function extractBashTargets(command) {
  if (!command) return [];
  const targets = [];
  // rm / cp / mv / mkdir trailing arg(s)
  const rmMatch = command.match(/\b(rm|cp|mv|mkdir|touch|rmdir|chmod|chown)\s+(?:-[A-Za-z]+\s+)*([^\s|;&>]+)/);
  if (rmMatch) targets.push(rmMatch[2]);
  // redirect / tee
  const redirectMatch = command.match(/[>|]\s*(?:tee\s+)?([^\s|;&]+)$/);
  if (redirectMatch) targets.push(redirectMatch[1]);
  // sed -i <path> (BSD and GNU variants)
  const sedMatch = command.match(/\bsed\s+-i(?:\s*['"][^'"]*['"])?\s+(?:-[A-Za-z]+\s+)*(?:['"][^'"]*['"]\s+)?([^\s|;&]+)/);
  if (sedMatch) targets.push(sedMatch[1]);
  // git rm / git mv
  const gitMatch = command.match(/\bgit\s+(rm|mv|restore|checkout)\s+(?:-[A-Za-z]+\s+)*([^\s|;&]+)/);
  if (gitMatch) targets.push(gitMatch[2]);

  return targets
    .filter(Boolean)
    .map(p => p.replace(/^['"]|['"]$/g, ''));
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
      process.stdout.write(JSON.stringify({
        continue: false,
        stopReason: `gdd-protected-paths: '${rel}' is a protected path (matched '${r.pattern}'). To override, lift the path from the default glob list or explicitly edit via an approved workflow (e.g., /gdd:update, plan execution).`,
      }));
      return;
    }
  }

  process.stdout.write(JSON.stringify({ continue: true }));
}

main().catch(() => {
  process.stdout.write(JSON.stringify({ continue: true }));
});
