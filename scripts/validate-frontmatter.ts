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
  'reasoning-class'?: 'high' | 'medium' | 'low';
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

/**
 * Phase 26 (Plan 26-08) — runtime-neutral `reasoning-class` alias for
 * `default-tier`. Equivalence table is locked in CONTEXT D-10 / D-11:
 *
 *   high   <-> opus
 *   medium <-> sonnet
 *   low    <-> haiku
 *
 * The alias is OPTIONAL (no per-agent retrofit lands in v1.26 — see
 * agents/README.md "Runtime-neutral reasoning class"). When both fields
 * appear together they MUST satisfy the equivalence; mismatched dual
 * annotations are a validation error.
 */
export type DefaultTier = 'haiku' | 'sonnet' | 'opus';
export type ReasoningClass = 'high' | 'medium' | 'low';

export const REASONING_CLASS_VALUES: readonly ReasoningClass[] = [
  'high',
  'medium',
  'low',
];

export const DEFAULT_TIER_VALUES: readonly DefaultTier[] = [
  'opus',
  'sonnet',
  'haiku',
];

/** Equivalence map: reasoning-class -> default-tier. */
export const CLASS_TO_TIER: Readonly<Record<ReasoningClass, DefaultTier>> = {
  high: 'opus',
  medium: 'sonnet',
  low: 'haiku',
};

/** Equivalence map: default-tier -> reasoning-class. */
export const TIER_TO_CLASS: Readonly<Record<DefaultTier, ReasoningClass>> = {
  opus: 'high',
  sonnet: 'medium',
  haiku: 'low',
};

/** Type guard for a valid `reasoning-class` value. */
export function isReasoningClass(v: unknown): v is ReasoningClass {
  return typeof v === 'string' && REASONING_CLASS_VALUES.includes(v as ReasoningClass);
}

/** Type guard for a valid `default-tier` value. */
export function isDefaultTier(v: unknown): v is DefaultTier {
  return typeof v === 'string' && DEFAULT_TIER_VALUES.includes(v as DefaultTier);
}

/**
 * Validate the optional `reasoning-class` field and its equivalence with
 * `default-tier` when both are present. Returns an array of violation
 * messages; an empty array means the agent passes the Plan 26-08 rules.
 *
 * Rules (Plan 26-08, CONTEXT D-11):
 *   1. `reasoning-class` is OPTIONAL. Absence is fine.
 *   2. If present, it MUST be one of `high|medium|low`.
 *   3. If both `default-tier` and `reasoning-class` are present, the values
 *      MUST satisfy the equivalence table (high+opus, medium+sonnet,
 *      low+haiku). Mismatch is a validation error.
 *
 * Existing agents that carry only `default-tier` (the v1.26 baseline state
 * for all 26 shipped agents) are unaffected — this helper returns an empty
 * array for them.
 *
 * The `agentName` argument is used in error messages to surface which agent
 * is misconfigured when the validator runs against the full roster.
 */
export function validateReasoningClass(
  fm: Record<string, unknown>,
  agentName: string,
): string[] {
  const violations: string[] = [];
  const hasClass = 'reasoning-class' in fm && !isMissing(fm['reasoning-class']);
  const hasTier = 'default-tier' in fm && !isMissing(fm['default-tier']);

  if (!hasClass) {
    // Field absent — allowed. `default-tier` is the v1.26 source of truth and
    // is enforced by separate Phase 10.1 contracts (not this validator).
    return violations;
  }

  const rawClass = fm['reasoning-class'];
  if (!isReasoningClass(rawClass)) {
    violations.push(
      `reasoning-class: invalid value "${String(rawClass)}" for agent "${agentName}" — must be one of ${REASONING_CLASS_VALUES.join('|')}`,
    );
    return violations;
  }

  if (hasTier) {
    const rawTier = fm['default-tier'];
    if (!isDefaultTier(rawTier)) {
      // default-tier shape is enforced elsewhere; we still surface a clear
      // message so co-validation is debuggable in one pass.
      violations.push(
        `default-tier: invalid value "${String(rawTier)}" for agent "${agentName}" — must be one of ${DEFAULT_TIER_VALUES.join('|')}`,
      );
      return violations;
    }
    const expectedTier = CLASS_TO_TIER[rawClass];
    if (rawTier !== expectedTier) {
      violations.push(
        `reasoning-class/default-tier: mismatch for agent "${agentName}" — reasoning-class="${rawClass}" expects default-tier="${expectedTier}", but got default-tier="${rawTier}". Equivalence table: high<->opus, medium<->sonnet, low<->haiku.`,
      );
    }
  }

  return violations;
}

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

    // Plan 26-08 — runtime-neutral reasoning-class alias validation.
    const agentName: string =
      typeof fm.name === 'string' && fm.name.length > 0
        ? fm.name
        : basename(f).replace(/\.md$/, '');
    const classViolations = validateReasoningClass(
      fm as Record<string, unknown>,
      agentName,
    );
    for (const msg of classViolations) {
      console.log(`${f}:${msg}`);
      violations++;
    }
  }

  console.log(`summary: ${files.length} file(s) checked, ${violations} violation(s)`);
  process.exit(violations === 0 ? 0 : 1);
}

// Only run as a CLI when invoked directly (Plan 26-08: tests import the
// helpers above without triggering process.exit). Node's strip-types ESM
// loader sets `process.argv[1]` to the resolved entry path; a substring
// match against this filename catches both direct execution and the
// `node --experimental-strip-types` wrapper used by `npm run validate:frontmatter`.
const entry: string = process.argv[1] ?? '';
if (entry.endsWith('validate-frontmatter.ts') || entry.endsWith('validate-frontmatter.js')) {
  main();
}
