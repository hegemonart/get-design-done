#!/usr/bin/env node
'use strict';
// CI-mode wrapper over hooks/gdd-read-injection-scanner.js.
// Scans all shipped reference/*.md, skills/**/SKILL.md, and agents/*.md for
// prompt-injection patterns. Exits 0 on a clean tree, 1 on any finding.
//
// The patterns are imported indirectly by re-declaring them — the hook itself
// is stdin-driven and cannot be required as a module. Keep these in sync with
// hooks/gdd-read-injection-scanner.js.

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');

const { INJECTION_PATTERNS } = require('./injection-patterns.cjs');

function walkMd(dir, out) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkMd(full, out);
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(full);
  }
}

function collectTargets() {
  const targets = [];
  // reference/ — all .md recursively
  walkMd(path.join(REPO_ROOT, 'reference'), targets);
  // skills/**/SKILL.md — only SKILL.md files
  const skillsRoot = path.join(REPO_ROOT, 'skills');
  const skillAccum = [];
  walkMd(skillsRoot, skillAccum);
  for (const f of skillAccum) {
    if (path.basename(f) === 'SKILL.md') targets.push(f);
  }
  // agents/*.md (non-recursive)
  const agentsRoot = path.join(REPO_ROOT, 'agents');
  if (fs.existsSync(agentsRoot)) {
    for (const entry of fs.readdirSync(agentsRoot, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        targets.push(path.join(agentsRoot, entry.name));
      }
    }
  }
  return targets;
}

function main() {
  const targets = collectTargets();
  let findings = 0;

  for (const file of targets) {
    const body = fs.readFileSync(file, 'utf8');
    const lines = body.split('\n');
    let inFence = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Track code fences — prompt-injection attacks live in prose, not in
      // literal code/template blocks. Skip lines inside ``` ... ``` fences.
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;
      for (const pat of INJECTION_PATTERNS) {
        if (pat.re.test(line)) {
          const rel = path.relative(REPO_ROOT, file);
          const excerpt = line.trim().slice(0, 120);
          console.log(`${rel}:${i + 1}: ${pat.name}: ${excerpt}`);
          findings++;
          break; // one finding per line is enough
        }
      }
    }
  }

  console.log(`summary: ${targets.length} files scanned, ${findings} findings`);
  process.exit(findings === 0 ? 0 : 1);
}

main();
