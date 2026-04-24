#!/usr/bin/env node
/**
 * validate-schemas.ts
 *
 * Runs all Draft-07 JSON schemas under reference/schemas/ against their
 * corresponding subject files. Used by `npm run validate:schemas` and by the
 * CI validate job.
 *
 * Primary path: spawn `npx --yes ajv-cli@5 validate -s <schema> -d <data>`.
 *
 * Fallback path: if `npx --yes` cannot fetch ajv-cli (offline/sandboxed
 * environment), fall back to a structural parse check: confirm each schema is
 * valid Draft-07 JSON (has $schema, type) and each data file is parseable JSON.
 * The fallback exits 0 on structural validity; CI will run the real ajv pass.
 *
 * Usage:
 *   node --experimental-strip-types scripts/validate-schemas.ts
 *   node --experimental-strip-types scripts/validate-schemas.ts --no-npx
 *
 * Exit codes:
 *   0 — all present (schema, data) pairs pass
 *   1 — one or more pairs failed validation or a present schema is invalid
 *
 * Converted from scripts/validate-schemas.cjs in Plan 20-00. Behavior is
 * verbatim; only typing + generated-type-import were added.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';

// Generated types from reference/schemas/generated.d.ts — importing any one
// of them satisfies Plan 20-00's requirement that every Tier-1 TS file
// consumes the codegen graph. We re-export so downstream callers can also
// pin to these types for static validation.
import type {
  ConfigSchema,
  PluginSchema,
  MarketplaceSchema,
  HooksSchema,
  IntelSchema,
  AuthoritySnapshotSchema,
  EventsSchema,
  McpGddStateToolsSchema,
  BudgetSchema,
  RateLimitsSchema,
  IterationBudgetSchema,
} from '../reference/schemas/generated.js';

export type {
  ConfigSchema,
  PluginSchema,
  MarketplaceSchema,
  HooksSchema,
  IntelSchema,
  AuthoritySnapshotSchema,
  EventsSchema,
  McpGddStateToolsSchema,
  BudgetSchema,
  RateLimitsSchema,
  IterationBudgetSchema,
};

/**
 * Discover the repo root by walking up from cwd to find our package.json.
 * Kept identical to the approach in tests/helpers.ts so both modules behave
 * the same when invoked from worktrees, subdirectories, or CI.
 */
function findRepoRoot(): string {
  let dir: string = process.cwd();
  for (let i = 0; i < 10; i++) {
    try {
      const pkgPath: string = join(dir, 'package.json');
      const pkg: { name?: string } = JSON.parse(readFileSync(pkgPath, 'utf8')) as { name?: string };
      if (pkg.name === '@hegemonart/get-design-done') return dir;
    } catch {
      // not this level
    }
    const parent: string = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(process.cwd());
}

const REPO_ROOT: string = findRepoRoot();

/**
 * (schema, data) pairs. `data` is relative to repo root. `required=true`
 * means the data file MUST exist in the repo; `required=false` means the
 * data file is generated at runtime (gitignored) and only the schema itself
 * is compiled.
 */
interface Pair {
  name: string;
  schema: string;
  data: string | null;
  required: boolean;
}

export const PAIRS: readonly Pair[] = [
  {
    name: 'plugin',
    schema: 'reference/schemas/plugin.schema.json',
    data: '.claude-plugin/plugin.json',
    required: true,
  },
  {
    name: 'marketplace',
    schema: 'reference/schemas/marketplace.schema.json',
    data: '.claude-plugin/marketplace.json',
    required: true,
  },
  {
    name: 'hooks',
    schema: 'reference/schemas/hooks.schema.json',
    data: 'hooks/hooks.json',
    required: true,
  },
  {
    name: 'config',
    schema: 'reference/schemas/config.schema.json',
    data: '.design/config.json',
    required: false,
  },
  {
    name: 'intel',
    schema: 'reference/schemas/intel.schema.json',
    // intel files are runtime-only (gitignored). Only schema-compile it.
    data: null,
    required: false,
  },
  {
    name: 'authority-snapshot',
    schema: 'reference/schemas/authority-snapshot.schema.json',
    // .design/authority-snapshot.json is runtime-only (gitignored via .design/).
    // Only schema-compile it.
    data: null,
    required: false,
  },
  {
    name: 'events',
    schema: 'reference/schemas/events.schema.json',
    // .design/telemetry/events.jsonl is runtime-only (gitignored). It is
    // JSONL (one JSON object per line) rather than a single JSON document,
    // so we cannot point ajv-cli at it as a `data` subject — each *line*
    // is the schema subject, not the file. Schema-compile only here;
    // per-line structural discipline is enforced by the EventWriter at
    // runtime (Plan 20-06). See scripts/lib/event-stream/writer.ts.
    data: null,
    required: false,
  },
  {
    name: 'mcp-gdd-state-tools',
    schema: 'reference/schemas/mcp-gdd-state-tools.schema.json',
    // The combined tool manifest is a codegen artifact — individual per-tool
    // schemas live under scripts/mcp-servers/gdd-state/schemas/ and are
    // consumed directly by the server. Schema-compile only here so the
    // Draft-07 declaration stays valid as tools evolve. See Plan 20-05.
    data: null,
    required: false,
  },
  {
    name: 'budget',
    schema: 'reference/schemas/budget.schema.json',
    // .design/budget.json is runtime-only (created by scripts/bootstrap.sh
    // on first session if absent, per D-12). It's gitignored under .design/
    // so the data file isn't tracked — schema-compile only here. The
    // budget-enforcer.ts hook consumes BudgetSchema from generated.d.ts at
    // type-check time regardless of file presence. See Plan 20-13.
    data: null,
    required: false,
  },
  {
    name: 'rate-limits',
    schema: 'reference/schemas/rate-limits.schema.json',
    // .design/rate-limits/<provider>.json is runtime-only, written by
    // scripts/lib/rate-guard.cjs as a side-effect of every
    // ingestHeaders() call. One file per provider — they're all the same
    // shape — so no single subject data path exists. Schema-compile
    // only here; per-file structural discipline is enforced at write
    // time by rate-guard. See Plan 20-14.
    data: null,
    required: false,
  },
  {
    name: 'iteration-budget',
    schema: 'reference/schemas/iteration-budget.schema.json',
    // .design/iteration-budget.json is runtime-only, written by
    // scripts/lib/iteration-budget.cjs. Schema-compile only here.
    // See Plan 20-14.
    data: null,
    required: false,
  },
];

const USE_NPX: boolean = !process.argv.includes('--no-npx');

/** Shape of an ajv-cli invocation result. */
interface AjvResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  status: number | null;
  fetchFailed: boolean;
}

/**
 * Try running ajv-cli via npx. Returns { ok, stdout, stderr, status, fetchFailed }.
 * fetchFailed=true if npx couldn't fetch the package (offline); caller should fall back.
 *
 * We pass `-c ajv-formats` so schemas declaring `format: "date-time"` (etc.) are
 * validated against the standard JSON Schema formats plugin rather than being
 * rejected as unknown formats under ajv's strict mode.
 */
function runAjv(args: readonly string[]): AjvResult {
  const injected: string[] = [...args, '-c', 'ajv-formats'];
  // Windows ships `npx.cmd` (batch shim); Node's spawnSync cannot invoke .cmd
  // files without `shell: true`. On POSIX `shell: true` is a no-op here since
  // the argv is a fixed whitelist (no user-controlled substitution). This
  // fixes the pre-existing Windows-local failure while preserving CI
  // behavior on Linux runners.
  const result = spawnSync(
    'npx',
    ['--yes', '-p', 'ajv-cli@5', '-p', 'ajv-formats@3', 'ajv', ...injected],
    { encoding: 'utf8', cwd: REPO_ROOT, shell: process.platform === 'win32' },
  );
  const stdout: string = result.stdout ?? '';
  const stderr: string = result.stderr ?? '';
  const combined: string = stdout + stderr;
  // fetchFailed heuristic now also catches the "npx binary not on PATH /
  // spawn ENOENT" case so offline or missing-npx sandboxes fall back cleanly.
  const spawnFailed: boolean =
    result.error !== undefined &&
    ((result.error as NodeJS.ErrnoException).code === 'ENOENT' ||
      (result.error as NodeJS.ErrnoException).code === 'ENOTDIR');
  const fetchFailed: boolean =
    spawnFailed ||
    (result.status !== 0 &&
      /(ENOTFOUND|ECONNREFUSED|ETIMEDOUT|getaddrinfo|network|unable to resolve|unable to fetch|offline|E404|registry\.npmjs\.org)/i.test(
        combined,
      ));
  return {
    ok: result.status === 0,
    stdout,
    stderr,
    status: result.status,
    fetchFailed,
  };
}

/** Outcome of a structural (fallback) schema/data parse check. */
interface StructuralResult {
  ok: boolean;
  reason?: string;
}

/**
 * Fallback: confirm schema file is a valid Draft-07 JSON Schema (has $schema
 * pointing at draft-07). Confirm data file (if present) parses as JSON.
 */
function structuralCheck(schemaAbs: string, dataAbs: string | null): StructuralResult {
  let schema: { $schema?: string };
  try {
    schema = JSON.parse(readFileSync(schemaAbs, 'utf8')) as { $schema?: string };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: `schema not parseable JSON: ${msg}` };
  }
  if (!schema.$schema || !/draft-07/.test(schema.$schema)) {
    return { ok: false, reason: `schema missing Draft-07 $schema declaration` };
  }
  if (dataAbs) {
    try {
      JSON.parse(readFileSync(dataAbs, 'utf8'));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, reason: `data file not parseable JSON: ${msg}` };
    }
  }
  return { ok: true };
}

/** Per-pair validation result. */
interface PairResult {
  name: string;
  ok: boolean;
  via: string;
  note?: string;
  reason?: string;
}

function main(): void {
  const results: PairResult[] = [];
  let fallbackReason: string | null = null;

  for (const pair of PAIRS) {
    const schemaAbs: string = join(REPO_ROOT, pair.schema);
    const dataAbs: string | null = pair.data ? join(REPO_ROOT, pair.data) : null;

    if (!existsSync(schemaAbs)) {
      results.push({
        name: pair.name,
        ok: false,
        via: 'missing-schema',
        reason: `schema not found at ${pair.schema}`,
      });
      continue;
    }

    const dataPresent: boolean = Boolean(dataAbs) && existsSync(dataAbs as string);

    if (!dataPresent && pair.required) {
      results.push({
        name: pair.name,
        ok: false,
        via: 'missing-data',
        reason: `required data file missing at ${pair.data}`,
      });
      continue;
    }

    if (!dataPresent) {
      // Schema-only: compile to confirm the schema is structurally valid.
      if (USE_NPX && !fallbackReason) {
        const r = runAjv(['compile', '-s', schemaAbs]);
        if (r.ok) {
          results.push({
            name: pair.name,
            ok: true,
            via: 'ajv-compile',
            note: 'data not present in repo tree — schema compiled only',
          });
          continue;
        }
        if (r.fetchFailed) {
          fallbackReason = `npx fetch failed: ${r.stderr.split('\n')[0] || 'unknown'}`;
        } else {
          results.push({
            name: pair.name,
            ok: false,
            via: 'ajv-compile',
            reason: r.stderr || r.stdout || `exit ${r.status ?? 'null'}`,
          });
          continue;
        }
      }
      const s = structuralCheck(schemaAbs, null);
      const reason: string = s.ok
        ? 'schema is valid Draft-07 (data not in repo tree)'
        : s.reason ?? 'unknown failure';
      results.push({ name: pair.name, ok: s.ok, via: 'structural-compile', reason });
      continue;
    }

    // Both schema and data present — full validation.
    if (USE_NPX && !fallbackReason) {
      const r = runAjv(['validate', '-s', schemaAbs, '-d', dataAbs as string]);
      if (r.ok) {
        results.push({ name: pair.name, ok: true, via: 'ajv-validate' });
        continue;
      }
      if (r.fetchFailed) {
        fallbackReason = `npx fetch failed: ${r.stderr.split('\n')[0] || 'unknown'}`;
      } else {
        results.push({
          name: pair.name,
          ok: false,
          via: 'ajv-validate',
          reason: r.stderr || r.stdout || `exit ${r.status ?? 'null'}`,
        });
        continue;
      }
    }
    const s = structuralCheck(schemaAbs, dataAbs);
    const reason: string = s.ok
      ? 'schema is valid Draft-07 and data parses as JSON'
      : s.reason ?? 'unknown failure';
    results.push({ name: pair.name, ok: s.ok, via: 'structural-validate', reason });
  }

  // Report.
  console.log('validate-schemas: results');
  for (const r of results) {
    const status: string = r.ok ? 'OK' : 'FAIL';
    const note: string = r.note ? ` (${r.note})` : '';
    const reason: string = r.reason ? ` — ${r.reason}` : '';
    console.log(`  [${status}] ${r.name} via ${r.via}${note}${reason}`);
  }
  if (fallbackReason) {
    console.log(
      `\nnote: ajv-cli via npx unavailable (${fallbackReason}); fell back to structural checks. CI will run the authoritative ajv pass.`,
    );
  }
  const failed: PairResult[] = results.filter((r) => !r.ok);
  console.log(`summary: ${results.length} pair(s) checked, ${failed.length} failure(s)`);

  process.exit(failed.length === 0 ? 0 : 1);
}

main();
