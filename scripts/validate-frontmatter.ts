#!/usr/bin/env node
/**
 * validate-frontmatter.ts — CI-friendly frontmatter validator for agents/*.md.
 *
 * Enforces the Phase 7 agent frontmatter hygiene contract. Exits 0 on
 * success, 1 on any violation. One finding per stdout line.
 *
 * Converted from scripts/validate-frontmatter.cjs in Plan 20-00 (Tier-1).
 * Behavior preserved verbatim; strict types added for the frontmatter shape.
 *
 * Usage:
 *   node --experimental-strip-types scripts/validate-frontmatter.ts [paths...]
 *   # default path is `agents/` when none given.
 */

import { existsSync, statSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';

import { readFrontmatter } from '../tests/helpers.ts';

// Importing a type from generated.d.ts satisfies the Plan 20-00 rule that
// every Tier-1 TS file participates in the codegen graph. We don't use
// IntelSchema at runtime; the re-export keeps it visible for static checks.
import type { IntelSchema } from '../reference/schemas/generated.js';
export type { IntelSchema };

/**
 * Strict shape of the agent-frontmatter subset this validator enforces.
 * Matches REQUIRED_FIELDS below. `readFrontmatter` returns a permissive
 * `Record<string, string | boolean | string[]>` — we narrow per-field as
 * needed rather than asserting the whole object at once.
 */
export interface AgentFrontmatter {
  name: string;
  description: string;
  tools: string;
  color: string;
  'parallel-safe': boolean | string;
  'typical-duration-seconds': string | number;
  'reads-only': boolean | string;
  writes: string | string[];
  'default-tier'?: 'haiku' | 'sonnet' | 'opus';
  'size_budget'?: 'S' | 'M' | 'L' | 'XL';
}

const REQUIRED_FIELDS: readonly (keyof AgentFrontmatter)[] = [
  'name',
  'description',
  'tools',
  'color',
  'parallel-safe',
  'typical-duration-seconds',
  'reads-only',
  'writes',
];

function walkMd(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full: string = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkMd(full));
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

/**
 * Return true when the frontmatter value is "missing" per the original
 * .cjs contract: undefined / null / empty string. Preserves the semantics
 * exactly so the CI gate fires on the same inputs.
 */
function isMissing(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string' && v === '') return true;
  return false;
}

function main(): void {
  const args: string[] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const targets: string[] = args.length ? args : ['agents/'];
  const files: string[] = [];
  for (const t of targets) {
    if (!existsSync(t)) {
      console.error(`${t}: path does not exist`);
      process.exit(1);
    }
    const stat = statSync(t);
    if (stat.isDirectory()) files.push(...walkMd(t));
    else files.push(t);
  }

  let violations = 0;
  for (const f of files) {
    const fm = readFrontmatter(f);
    if (Object.keys(fm).length === 0) {
      // README.md under agents/ may have no frontmatter — skip
      if (basename(f).toLowerCase() === 'readme.md') continue;
      console.log(`${f}:frontmatter: missing`);
      violations++;
      continue;
    }
    for (const field of REQUIRED_FIELDS) {
      if (!(field in fm) || isMissing((fm as Record<string, unknown>)[field])) {
        console.log(`${f}:${field}: missing`);
        violations++;
      }
    }
  }

  console.log(`summary: ${files.length} file(s) checked, ${violations} violation(s)`);
  process.exit(violations === 0 ? 0 : 1);
}

main();
