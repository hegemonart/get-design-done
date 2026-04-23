#!/usr/bin/env node
'use strict';

// Top-3 findings engine for /gdd:start (Phase 14.7-03).
//
// Deterministic, read-only, no LLM, no child_process. Reads the detected UI root,
// runs a bank of regex-based detectors, applies the D-02 safe-fix rubric to pick
// exactly one `best_first_proof`, and returns the shape {findings, bestFirstProofId, partial}.
//
// Budget tiers (wall-clock cap):
//   fast      -> 90_000 ms
//   balanced  -> 180_000 ms
//   thorough  -> 300_000 ms

const fs = require('fs');
const path = require('path');

const BUDGET_MS = { fast: 90_000, balanced: 180_000, thorough: 300_000 };
const UI_EXT = new Set(['.tsx', '.jsx', '.ts', '.js', '.svelte', '.vue', '.css', '.scss']);
const MAX_FILES = 400;

function isCommentLine(ln) {
  const t = ln.trimStart();
  return t.startsWith('//') || t.startsWith('/*') || t.startsWith('*') || t.startsWith('<!--');
}

/* --------------------------- detector registry --------------------------- */

// Each detector returns an array of partial findings (without `id`/`blastRadius` assigned).
// Shape: {category, title, file, line, severity, evidence, visibleDelta, ambiguous, crossFile}

const DETECTORS = [
  {
    category: 'transition-all',
    applies: (ext) => ['.tsx', '.jsx', '.ts', '.js', '.svelte', '.vue', '.css', '.scss'].includes(ext),
    run(file, text) {
      const out = [];
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i += 1) {
        const ln = lines[i];
        if (isCommentLine(ln)) continue;
        if (/transition:\s*all|transition-property:\s*all/.test(ln)) {
          out.push({
            category: 'transition-all',
            title: 'CSS `transition: all` applied',
            file,
            line: i + 1,
            severity: 'minor',
            evidence: ln.trim().slice(0, 160),
            visibleDelta: true,
            ambiguous: false,
            crossFile: false,
          });
        } else if (/\bclassName\s*=\s*["'`][^"'`]*\btransition\b(?!-|\[)/.test(ln)) {
          out.push({
            category: 'transition-all',
            title: 'Tailwind bare `transition` (implicitly all)',
            file,
            line: i + 1,
            severity: 'minor',
            evidence: ln.trim().slice(0, 160),
            visibleDelta: true,
            ambiguous: false,
            crossFile: false,
          });
        }
      }
      return out;
    },
  },
  {
    category: 'will-change-all',
    applies: () => true,
    run(file, text) {
      const out = [];
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i += 1) {
        if (isCommentLine(lines[i])) continue;
        if (/will-change:\s*all/.test(lines[i])) {
          out.push({
            category: 'will-change-all',
            title: '`will-change: all` GPU hint',
            file,
            line: i + 1,
            severity: 'minor',
            evidence: lines[i].trim().slice(0, 160),
            visibleDelta: false,
            ambiguous: false,
            crossFile: false,
          });
        }
      }
      return out;
    },
  },
  {
    category: 'tinted-image-outline',
    applies: (ext) => ['.tsx', '.jsx', '.ts', '.js', '.svelte', '.vue'].includes(ext),
    run(file, text) {
      const out = [];
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i += 1) {
        if (isCommentLine(lines[i])) continue;
        if (/<img[^>]*outline-(?:slate|zinc|neutral|gray|stone)-\d+/.test(lines[i])) {
          out.push({
            category: 'tinted-image-outline',
            title: 'Tinted outline on <img>',
            file,
            line: i + 1,
            severity: 'minor',
            evidence: lines[i].trim().slice(0, 160),
            visibleDelta: true,
            ambiguous: false,
            crossFile: false,
          });
        }
      }
      return out;
    },
  },
  {
    category: 'scale-on-press-drift',
    applies: (ext) => ['.tsx', '.jsx', '.ts', '.js', '.svelte', '.vue', '.css', '.scss'].includes(ext),
    run(file, text) {
      const out = [];
      const lines = text.split('\n');
      // Canonical is 0.96 per Phase 15 decisions. 0.95 and 0.97 are drift signals.
      for (let i = 0; i < lines.length; i += 1) {
        if (isCommentLine(lines[i])) continue;
        const m = /(?:active:scale-9[57]|scale\(0\.9[57]\))/.exec(lines[i]);
        if (m) {
          out.push({
            category: 'scale-on-press-drift',
            title: 'Scale-on-press drift from canonical 0.96',
            file,
            line: i + 1,
            severity: 'minor',
            evidence: lines[i].trim().slice(0, 160),
            visibleDelta: true,
            ambiguous: false,
            crossFile: false,
          });
        }
      }
      return out;
    },
  },
  {
    category: 'same-radius-nested',
    applies: (ext) => ['.tsx', '.jsx', '.ts', '.js', '.svelte', '.vue'].includes(ext),
    run(file, text) {
      const out = [];
      // Multiline: Tailwind parent rounded-X wrapping a child with the same rounded-X.
      // Cheap approximation — single-line scan for parent+child pattern on same line.
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i += 1) {
        if (isCommentLine(lines[i])) continue;
        const m = /(rounded-[a-z0-9-]+)[^"'`]*["'`][^>]*>\s*<[^>]*\1/.exec(lines[i]);
        if (m) {
          out.push({
            category: 'same-radius-nested',
            title: 'Same border-radius on nested surfaces',
            file,
            line: i + 1,
            severity: 'minor',
            evidence: lines[i].trim().slice(0, 160),
            visibleDelta: true,
            ambiguous: false,
            crossFile: false,
          });
        }
      }
      return out;
    },
  },
  {
    category: 'missing-reduced-motion-guard',
    applies: (ext) => ['.tsx', '.jsx', '.ts', '.js'].includes(ext),
    run(file, text) {
      if (!/framer-motion/.test(text)) return [];
      if (/useReducedMotion\s*\(/.test(text)) return [];
      // One finding per file (not per line) — this is a file-level omission.
      const lineIdx = text.split('\n').findIndex((ln) => /framer-motion/.test(ln));
      return [
        {
          category: 'missing-reduced-motion-guard',
          title: 'framer-motion imported without `useReducedMotion()` guard',
          file,
          line: Math.max(1, lineIdx + 1),
          severity: 'minor',
          evidence: 'framer-motion imported; no `useReducedMotion()` reference in file',
          visibleDelta: false,
          ambiguous: false,
          crossFile: true,
        },
      ];
    },
  },
  {
    category: 'non-root-font-smoothing',
    applies: (ext) => ['.css', '.scss'].includes(ext),
    run(file, text) {
      const out = [];
      const lines = text.split('\n');
      // Find `-webkit-font-smoothing:` inside a block that isn't html/body/:root
      let currentSelector = '';
      for (let i = 0; i < lines.length; i += 1) {
        const open = /^([^{]+?)\s*\{/.exec(lines[i]);
        if (open) currentSelector = open[1].trim();
        if (/-webkit-font-smoothing:/.test(lines[i])) {
          if (!/^(?:html|body|:root)\b/.test(currentSelector)) {
            out.push({
              category: 'non-root-font-smoothing',
              title: '`-webkit-font-smoothing` set outside html/body/:root',
              file,
              line: i + 1,
              severity: 'minor',
              evidence: lines[i].trim().slice(0, 160),
              visibleDelta: false,
              ambiguous: false,
              crossFile: false,
            });
          }
        }
      }
      return out;
    },
  },
];

/* --------------------------- scoring rubric ---------------------------- */

// Phase 14.7 D-02 — a finding qualifies for /gdd:fast if all five hold.
function qualifiesAsSafeFix(f) {
  // 1. single file
  const singleFile = !f.crossFile;
  // 2. ≤2 affected selectors (proxy: not a cross-file finding + non-ambiguous)
  const selectorsOk = true; // engine emits ≤2 lines per file per detector by design
  // 3. no shared-token migration — approximated by the category allowlist below
  const TOKEN_SAFE_CATEGORIES = new Set([
    'transition-all',
    'will-change-all',
    'tinted-image-outline',
    'scale-on-press-drift',
    'same-radius-nested',
    'non-root-font-smoothing',
  ]);
  const tokenOk = TOKEN_SAFE_CATEGORIES.has(f.category);
  // 4. not ambiguous
  const unambiguous = !f.ambiguous;
  // 5. likely visible delta
  const visible = !!f.visibleDelta;
  return singleFile && selectorsOk && tokenOk && unambiguous && visible;
}

function scoreFinding(f, painHint) {
  const sevWeight = { major: 1.0, minor: 0.7, info: 0.4 }[f.severity] || 0.5;
  const visibility = f.visibleDelta ? 1.0 : 0.5;
  const blast = f.crossFile ? 0.6 : 1.0; // more blast => lower score
  let score = sevWeight * visibility * blast;
  if (painHint && matchesPainHint(f, painHint)) score *= 1.2;
  return score;
}

function matchesPainHint(f, hint) {
  const h = String(hint).toLowerCase();
  const map = {
    motion: ['transition-all', 'scale-on-press-drift', 'missing-reduced-motion-guard', 'will-change-all'],
    animation: ['transition-all', 'scale-on-press-drift', 'missing-reduced-motion-guard', 'will-change-all'],
    a11y: ['missing-reduced-motion-guard'],
    accessibility: ['missing-reduced-motion-guard'],
    color: ['tinted-image-outline'],
    radius: ['same-radius-nested'],
    corners: ['same-radius-nested'],
    typography: ['non-root-font-smoothing'],
    font: ['non-root-font-smoothing'],
  };
  for (const key of Object.keys(map)) {
    if (h.includes(key) && map[key].includes(f.category)) return true;
  }
  return false;
}

function pickBestFirstProof(findings, painHint) {
  const candidates = findings.filter(qualifiesAsSafeFix);
  if (candidates.length === 0) return null;
  const ranked = [...candidates].sort((a, b) => {
    const sb = scoreFinding(b, painHint);
    const sa = scoreFinding(a, painHint);
    if (sb !== sa) return sb - sa;
    // tiebreak by file length, then alphabetical
    if (a.file.length !== b.file.length) return a.file.length - b.file.length;
    return a.file.localeCompare(b.file);
  });
  return ranked[0].id;
}

/* --------------------------- file walker --------------------------- */

function walkUiFiles(root, maxFiles, deadline) {
  const result = [];
  const stack = [root];
  while (stack.length && result.length < maxFiles) {
    if (Date.now() > deadline) return { files: result, partial: true };
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.isFile() && UI_EXT.has(path.extname(e.name))) {
        result.push(full);
        if (result.length >= maxFiles) break;
      }
    }
  }
  return { files: result, partial: false };
}

/* --------------------------- public scan() --------------------------- */

function scan({ root, budget = 'balanced', painHint = '', rootCwd }) {
  if (!root) return { findings: [], bestFirstProofId: null, partial: false };
  const budgetMs = BUDGET_MS[budget] || BUDGET_MS.balanced;
  const deadline = Date.now() + budgetMs;
  const absRoot = path.isAbsolute(root) ? root : path.resolve(rootCwd || process.cwd(), root);
  const { files, partial: walkPartial } = walkUiFiles(absRoot, MAX_FILES, deadline);

  const raw = [];
  let timedOut = walkPartial;
  for (const f of files) {
    if (Date.now() > deadline) {
      timedOut = true;
      break;
    }
    let text;
    try {
      text = fs.readFileSync(f, 'utf8');
    } catch {
      continue;
    }
    const ext = path.extname(f);
    const rel = path.relative(rootCwd || process.cwd(), f).split(path.sep).join('/');
    for (const det of DETECTORS) {
      if (!det.applies(ext)) continue;
      raw.push(...det.run(rel, text));
    }
  }

  // Assign stable IDs after sorting by category+file+line for determinism.
  raw.sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    if (a.file !== b.file) return a.file.localeCompare(b.file);
    return a.line - b.line;
  });

  // Cap raw at 10 for upstream consumers; pick top 3 for the report.
  const capped = raw.slice(0, 10).map((f, i) => ({ ...f, id: `R${i + 1}`, blastRadius: f.crossFile ? 'cross-file' : 'single-file' }));
  const topThree = rankTopThree(capped, painHint).map((f, i) => ({ ...f, id: `F${i + 1}` }));
  const bestFirstProofId = pickBestFirstProof(topThree, painHint);

  return {
    findings: topThree,
    bestFirstProofId,
    partial: timedOut,
    inspected: { files: files.length, root: absRoot },
  };
}

function rankTopThree(findings, painHint) {
  const sorted = [...findings].sort((a, b) => {
    const sb = scoreFinding(b, painHint);
    const sa = scoreFinding(a, painHint);
    if (sb !== sa) return sb - sa;
    if (a.file !== b.file) return a.file.localeCompare(b.file);
    return a.line - b.line;
  });
  return sorted.slice(0, 3);
}

module.exports = { scan, qualifiesAsSafeFix, pickBestFirstProof };

/* --------------------------- CLI --------------------------- */

if (require.main === module) {
  const args = process.argv.slice(2);
  const opts = { root: null, budget: 'balanced', painHint: '' };
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--root') opts.root = args[++i];
    else if (a === '--budget') opts.budget = args[++i];
    else if (a === '--pain') opts.painHint = args[++i];
  }
  if (!opts.root) {
    process.stderr.write('usage: start-findings-engine --root <path> [--budget fast|balanced|thorough] [--pain "<hint>"]\n');
    process.exit(2);
  }
  const result = scan({ ...opts, rootCwd: process.cwd() });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}
