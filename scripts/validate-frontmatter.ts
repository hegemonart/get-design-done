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
import { join, basename, dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';

import { readFrontmatter } from '../tests/helpers.ts';

// ── delegate_to capability matrix loader (Plan 27-06) ──────────────────────
//
// The `delegate_to: <peer>-<role> | none` field is validated against the
// capability matrix exported by scripts/lib/peer-cli/registry.cjs (Plan
// 27-05). Loading the .cjs from a .ts module under the strip-types loader
// requires createRequire — and we anchor it to the repo root so the
// validator survives being invoked from any cwd.
//
// Loading is lazy + defensive: if the registry module isn't on disk yet
// (e.g. during a fresh clone before Plan 27-05 lands, or in a partial
// checkout), we fall back to an inline literal mirror of the locked D-05
// capability matrix so this validator never crashes a CI run on a
// missing dependency. The literal mirror MUST stay in sync with
// registry.cjs's CAPABILITY_MATRIX — tests assert equivalence.
function _findRepoRootFromHere(): string {
  // process.argv[1] is the validator script path under strip-types; walk
  // up from its directory looking for package.json. Fall back to cwd.
  const start: string = (() => {
    const argv1 = process.argv[1];
    if (typeof argv1 === 'string' && argv1.length > 0) return dirname(argv1);
    return process.cwd();
  })();
  let dir = resolve(start);
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

/** Locked D-05 capability matrix mirror — fallback when registry.cjs unloadable. */
const _DELEGATE_MATRIX_FALLBACK: Readonly<Record<string, readonly string[]>> = Object.freeze({
  codex: Object.freeze(['execute']),
  copilot: Object.freeze(['review', 'research']),
  cursor: Object.freeze(['debug', 'plan']),
  gemini: Object.freeze(['research', 'exploration']),
  qwen: Object.freeze(['write']),
});

let _delegateMatrixCache: Readonly<Record<string, readonly string[]>> | null = null;

/**
 * Return the live capability matrix as a `peer -> roles[]` map. Cached
 * after first call. Uses registry.cjs as the source of truth; falls back
 * to the inline mirror only if the registry module fails to load.
 */
export function loadDelegateMatrix(): Readonly<Record<string, readonly string[]>> {
  if (_delegateMatrixCache !== null) return _delegateMatrixCache;
  try {
    const root = _findRepoRootFromHere();
    const req = createRequire(join(root, 'package.json'));
    const reg = req(resolve(root, 'scripts/lib/peer-cli/registry.cjs')) as {
      CAPABILITY_MATRIX?: Record<string, { roles: readonly string[] }>;
    };
    if (reg && typeof reg.CAPABILITY_MATRIX === 'object' && reg.CAPABILITY_MATRIX !== null) {
      const out: Record<string, readonly string[]> = {};
      for (const [peer, cap] of Object.entries(reg.CAPABILITY_MATRIX)) {
        if (cap && Array.isArray(cap.roles)) {
          out[peer] = Object.freeze([...cap.roles]);
        }
      }
      _delegateMatrixCache = Object.freeze(out);
      return _delegateMatrixCache;
    }
  } catch {
    // fall through to fallback
  }
  _delegateMatrixCache = _DELEGATE_MATRIX_FALLBACK;
  return _delegateMatrixCache;
}

/**
 * Build the flat set of valid `<peer>-<role>` IDs from the capability
 * matrix. e.g. `gemini-research`, `codex-execute`, etc. The literal
 * string `"none"` is the explicit opt-out and is accepted separately.
 */
export function validDelegateIds(): readonly string[] {
  const matrix = loadDelegateMatrix();
  const out: string[] = [];
  for (const [peer, roles] of Object.entries(matrix)) {
    for (const role of roles) {
      out.push(`${peer}-${role}`);
    }
  }
  return Object.freeze(out.sort());
}

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
  /**
   * Phase 27 (Plan 27-06) — peer-CLI delegation hint.
   *
   * Optional. Default unset = use local Anthropic call. Setting
   * `delegate_to: gemini-research` tells session-runner "try delegate
   * first, fall back to local on peer-absent / peer-error". Setting
   * `delegate_to: none` explicitly opts out (e.g. security-sensitive
   * agents). See agents/README.md "Peer-CLI delegation (delegate_to)"
   * for the additive-superset rationale (CONTEXT D-06).
   *
   * Valid values are `<peer>-<role>` IDs that the peer-CLI registry
   * capability matrix knows (e.g. `gemini-research`, `codex-execute`,
   * `cursor-debug`, `cursor-plan`, `copilot-review`, `copilot-research`,
   * `qwen-write`) plus the literal string `"none"`.
   */
  'delegate_to'?: string;
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

/**
 * Validate the optional Phase 27 (Plan 27-06) `delegate_to` field. Returns
 * an array of violation messages; empty means the agent passes.
 *
 * Rules (CONTEXT D-06):
 *   1. `delegate_to` is OPTIONAL. Absence = use local Anthropic call.
 *   2. If present, value MUST be a string.
 *   3. The literal value `"none"` is accepted as the explicit opt-out.
 *   4. Any other value MUST match a `<peer>-<role>` ID drawn from the
 *      peer-CLI capability matrix (Plan 27-05's registry.cjs is the
 *      source of truth; loadDelegateMatrix() resolves it lazily with
 *      a literal fallback if the registry is unloadable).
 *
 * The 26 v1.26 baseline agents do not carry this field; this helper
 * returns `[]` for them. The validator runs trivially clean on them.
 */
export function validateDelegateTo(
  fm: Record<string, unknown>,
  agentName: string,
): string[] {
  const violations: string[] = [];
  const has = 'delegate_to' in fm && !isMissing(fm['delegate_to']);
  if (!has) return violations;

  const raw = fm['delegate_to'];
  if (typeof raw !== 'string') {
    violations.push(
      `delegate_to: invalid value "${String(raw)}" for agent "${agentName}" — must be a string ("none" or "<peer>-<role>" e.g. "gemini-research")`,
    );
    return violations;
  }
  if (raw === 'none') return violations; // explicit opt-out

  const valid = validDelegateIds();
  if (!valid.includes(raw)) {
    violations.push(
      `delegate_to: invalid value "${raw}" for agent "${agentName}" — must be "none" or one of: ${valid.join(', ')} (peer-CLI capability matrix; see scripts/lib/peer-cli/registry.cjs)`,
    );
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

    // Plan 27-06 — peer-CLI delegate_to validation (additive optional field).
    const delegateViolations = validateDelegateTo(
      fm as Record<string, unknown>,
      agentName,
    );
    for (const msg of delegateViolations) {
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
