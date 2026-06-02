#!/usr/bin/env node
'use strict';
/**
 * hooks/gdd-design-quality-check.js — advisory PostToolUse hook for the
 * default-AI-aesthetic regex floor (Phase 49, Quick Anti-Slop Floor).
 *
 * The cheapest possible anti-slop pass: on every front-end file write, scan the
 * written content for the visual tells that mark a UI as "an AI generated this"
 * (gradient spam, the purple/violet default palette, glassmorphism stacks, the
 * Inter default, centered-everything heroes, undraw/isometric clip art, filler
 * CTA copy, decorative motion with no loading intent). Each match is a non
 * blocking WARN. The catalog the rules come from lives at
 * reference/visual-tells.md (8 named categories, 1:1 with the 8 rules here).
 *
 * Contract (mirrors hooks/gdd-a11y-gate.js):
 *   - Read stdin JSON (the PostToolUse payload: {tool_name, tool_input,
 *     tool_response, cwd, ...}).
 *   - Only act on Write/Edit/MultiEdit tools targeting a .tsx/.vue/.svelte/.astro
 *     file. Everything else is a bare {continue:true}.
 *   - Scan the written content against 8 regex rules; collect matches as warnings.
 *   - Emit one `design_quality_warn` event through scripts/lib/event-chain.cjs
 *     (baseDir injected from cwd; the emit is best-effort and never fatal).
 *   - Print a concise advisory to stdout and ALWAYS write {continue:true}, exit 0.
 *     This hook is WARN-only. It never blocks a write.
 *
 * Dependency-free: core fs/path plus the in-repo event-chain helper. No npm deps.
 */

const fs = require('fs');
const path = require('path');

/** Front-end source extensions this hook scans. */
const FRONTEND_EXT = ['.tsx', '.vue', '.svelte', '.astro'];

/**
 * The 8 v1 rules. Each `category` matches a heading in reference/visual-tells.md.
 * `test(content)` returns an array of { line, match } hits (possibly empty).
 * Regexes are tuned for precision (low false-positive) over recall.
 */

/** Find the 1-based line number for a character offset in `content`. */
function lineOf(content, index) {
  let line = 1;
  for (let i = 0; i < index && i < content.length; i++) {
    if (content[i] === '\n') line += 1;
  }
  return line;
}

/** Collect up to `cap` global-regex matches as {line, match}. */
function collect(content, re, cap = 5) {
  const hits = [];
  let m;
  re.lastIndex = 0;
  while ((m = re.exec(content)) !== null) {
    hits.push({ line: lineOf(content, m.index), match: m[0] });
    if (m.index === re.lastIndex) re.lastIndex += 1; // zero-width guard
    if (hits.length >= cap) break;
  }
  return hits;
}

/** Count global-regex matches without allocating the match list. */
function countMatches(content, re) {
  let n = 0;
  let m;
  re.lastIndex = 0;
  while ((m = re.exec(content)) !== null) {
    n += 1;
    if (m.index === re.lastIndex) re.lastIndex += 1;
  }
  return n;
}

const RULES = [
  {
    rule: 'gradient-spam',
    category: 'gradient-spam',
    // >=3 Tailwind gradient-direction utilities in one file.
    run(content) {
      const re = /\bbg-gradient-to-(?:r|br|tr|b|bl|l|tl|t)\b/g;
      const count = countMatches(content, re);
      if (count < 3) return [];
      const hits = collect(content, re, 5);
      // Tag the first hit with the aggregate count for the advisory.
      if (hits.length) hits[0].match = `${hits[0].match} (x${count})`;
      return hits;
    },
  },
  {
    rule: 'generic-cta',
    category: 'default-AI-hero',
    // Filler hero / CTA copy. Word-boundaried, case-insensitive.
    run(content) {
      const re = /\b(?:Get Started|Welcome to|Lorem ipsum|Learn More)\b/gi;
      return collect(content, re, 5);
    },
  },
  {
    rule: 'centered-everything-syndrome',
    category: 'centered-everything-syndrome',
    // mx-auto AND text-center co-occurring inside one className string.
    run(content) {
      // Match a quoted class string that contains both utilities, in either order.
      const re =
        /(["'`])(?=[^"'`]*\bmx-auto\b)(?=[^"'`]*\btext-center\b)[^"'`]*\1/g;
      return collect(content, re, 5);
    },
  },
  {
    rule: 'inter-everything',
    category: 'inter-everything',
    // font-inter utility OR a font-family: Inter declaration, when no other
    // custom font token (font-<name>, --font-*, or a second font-family) is near.
    run(content) {
      const interRe = /\bfont-inter\b|font-family:\s*['"]?Inter\b/gi;
      const interCount = countMatches(content, interRe);
      if (interCount === 0) return [];
      // A sibling custom-font signal suppresses the warning (a deliberate stack).
      const siblingFont =
        /\bfont-(?!inter\b|sans\b|serif\b|mono\b|medium\b|semibold\b|bold\b|light\b|normal\b|thin\b|black\b|extrabold\b|extralight\b)[a-z]/i.test(
          content,
        ) ||
        /--font-[a-z]/i.test(content) ||
        /font-family:\s*['"]?(?!Inter\b)[A-Za-z]/i.test(content);
      if (siblingFont) return [];
      return collect(content, interRe, 5);
    },
  },
  {
    rule: 'purple-violet-default',
    category: 'purple-violet-default',
    // The default-AI palette bg-(purple|violet)-(500|600|700) with no theme
    // token class (bg-primary / bg-brand / bg-accent / a CSS var) nearby.
    run(content) {
      const re = /\bbg-(?:purple|violet)-(?:500|600|700)\b/g;
      if (countMatches(content, re) === 0) return [];
      const themeToken =
        /\bbg-(?:primary|brand|accent|surface|foreground|background|muted)\b/i.test(
          content,
        ) || /bg-\[(?:var\(--|hsl|oklch|rgb)/i.test(content);
      if (themeToken) return [];
      return collect(content, re, 5);
    },
  },
  {
    rule: 'glassmorphism-spam',
    category: 'glassmorphism-spam',
    // >=3 of backdrop-blur* / bg-white/(10|20|30) in one file.
    run(content) {
      const re = /\bbackdrop-blur(?:-\w+)?\b|\bbg-white\/(?:10|20|30)\b/g;
      const count = countMatches(content, re);
      if (count < 3) return [];
      const hits = collect(content, re, 5);
      if (hits.length) hits[0].match = `${hits[0].match} (x${count})`;
      return hits;
    },
  },
  {
    rule: 'isometric-illustration-fallback',
    category: 'isometric-illustration-fallback',
    // undraw / isometric markers in an asset path or src attribute.
    run(content) {
      const re = /\b(?:undraw|isometric)[\w./-]*/gi;
      return collect(content, re, 5);
    },
  },
  {
    rule: 'decorative-motion-without-intent',
    category: 'decorative-motion-without-intent',
    // animate-(pulse|bounce|spin) on a non-loading, non-icon element.
    // Conservative: only flag a className that has the animate utility but no
    // loading/skeleton/spinner/icon signal on the same class string.
    run(content) {
      const re =
        /(["'`])(?=[^"'`]*\banimate-(?:pulse|bounce|spin)\b)(?![^"'`]*(?:\b(?:animate-(?:pulse|bounce|spin)\s+)?(?:loading|loader|spinner|skeleton|icon|i-)\b|sr-only))[^"'`]*\1/g;
      return collect(content, re, 5);
    },
  },
];

/**
 * Resolve the written content from a PostToolUse payload, tolerating Write
 * (tool_input.content), Edit (new_string), and MultiEdit (edits[].new_string),
 * and falling back to a tool_response filePath/content when present.
 *
 * Returns { filename, content } or null when there is nothing front-end to scan.
 */
function extractWrite(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const tool = payload.tool_name || payload.toolName;
  if (tool !== 'Write' && tool !== 'Edit' && tool !== 'MultiEdit') return null;

  const input = payload.tool_input || payload.toolInput || {};
  const filename =
    input.file_path ||
    input.filePath ||
    input.path ||
    (payload.tool_response &&
      (payload.tool_response.filePath || payload.tool_response.file_path)) ||
    '';
  if (!filename) return null;

  const ext = path.extname(String(filename)).toLowerCase();
  if (!FRONTEND_EXT.includes(ext)) return null;

  const parts = [];
  if (typeof input.content === 'string') parts.push(input.content);
  if (typeof input.new_string === 'string') parts.push(input.new_string);
  if (Array.isArray(input.edits)) {
    for (const e of input.edits) {
      if (e && typeof e.new_string === 'string') parts.push(e.new_string);
    }
  }
  // Fall back to a post-write file content echo if the input carried none.
  if (parts.length === 0 && payload.tool_response) {
    const tr = payload.tool_response;
    if (typeof tr.content === 'string') parts.push(tr.content);
  }

  const content = parts.join('\n');
  if (!content) return null;
  return { filename: String(filename), content };
}

/**
 * Pure evaluator: scan `content` (with `filename` for category context) against
 * the 8 rules. Exported for unit testing without a process.
 *
 * @returns {{ warnings: Array<{rule, category, line, match}>, count: number }}
 */
function evaluate(content, filename) {
  const warnings = [];
  if (typeof content !== 'string' || content.length === 0) {
    return { warnings, count: 0 };
  }
  for (const r of RULES) {
    let hits = [];
    try {
      hits = r.run(content) || [];
    } catch {
      hits = []; // a misbehaving rule must never break the advisory
    }
    for (const h of hits) {
      warnings.push({
        rule: r.rule,
        category: r.category,
        line: h.line,
        match: h.match,
      });
    }
  }
  return { warnings, count: warnings.length };
}

/** Best-effort event emit through the in-repo event-chain helper. Never throws. */
function emitEvent(cwd, filename, result) {
  try {
    const { appendChainEvent } = require('../scripts/lib/event-chain.cjs');
    appendChainEvent({
      agent: 'gdd-design-quality-check',
      outcome: 'warn',
      event: 'design_quality_warn',
      file: filename,
      warning_count: result.count,
      categories: [...new Set(result.warnings.map((w) => w.category))],
      warnings: result.warnings.slice(0, 20),
      baseDir: cwd,
    });
  } catch {
    /* observability is best-effort — swallow */
  }
}

/** Build the concise stdout advisory string for a non-empty result. */
function advisoryNote(filename, result) {
  const cats = [...new Set(result.warnings.map((w) => w.category))];
  const base = path.basename(filename);
  const lines = [
    `gdd-design-quality-check: ${result.count} visual-tell ` +
      `warning${result.count === 1 ? '' : 's'} in ${base} ` +
      `across ${cats.length} categor${cats.length === 1 ? 'y' : 'ies'} ` +
      `(${cats.join(', ')}).`,
  ];
  for (const w of result.warnings.slice(0, 8)) {
    lines.push(`  - [${w.rule}] line ${w.line}: ${w.match}`);
  }
  lines.push('  See reference/visual-tells.md for remediation patterns. (advisory, non-blocking)');
  return lines.join('\n');
}

/**
 * Core hook entry. Accepts a parsed payload, returns the decision object to
 * write to stdout. Always returns { continue: true } (advisory only).
 * Exported for unit testing without spawning a process.
 */
function main(payload, opts = {}) {
  const cwd = (payload && payload.cwd) || opts.cwd || process.cwd();
  const write = extractWrite(payload);
  if (!write) return { continue: true };

  const result = evaluate(write.content, write.filename);
  if (result.count === 0) return { continue: true };

  emitEvent(cwd, write.filename, result);
  const note = advisoryNote(write.filename, result);
  return { continue: true, systemMessage: note };
}

async function run(stdin = process.stdin, stdout = process.stdout) {
  let buf = '';
  for await (const chunk of stdin) buf += chunk;
  let payload;
  try {
    payload = JSON.parse(buf || '{}');
  } catch {
    stdout.write(JSON.stringify({ continue: true }));
    return;
  }
  const decision = main(payload);
  if (decision.systemMessage) {
    // Surface the advisory on stderr too so it is visible in plain hook logs.
    try {
      process.stderr.write(decision.systemMessage + '\n');
    } catch {
      /* swallow */
    }
  }
  stdout.write(JSON.stringify(decision));
}

// Run as a CLI only when invoked directly; tests require() this module and call
// evaluate()/main() against mock payloads without triggering stdin reads.
if (require.main === module) {
  run().catch(() => {
    process.stdout.write(JSON.stringify({ continue: true }));
  });
}

module.exports = { main, evaluate, extractWrite, RULES, FRONTEND_EXT };
