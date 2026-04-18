#!/usr/bin/env node
'use strict';

/**
 * validate-schemas.cjs
 *
 * Runs all Draft-07 JSON schemas under reference/schemas/ against their
 * corresponding subject files. Used by `npm run validate:schemas` and by the
 * CI validate job (added in plan 13-03).
 *
 * Primary path: spawn `npx --yes ajv-cli@5 validate -s <schema> -d <data>`.
 *
 * Fallback path: if `npx --yes` cannot fetch ajv-cli (offline/sandboxed
 * environment), fall back to a structural parse check: confirm each schema is
 * valid Draft-07 JSON (has $schema, type) and each data file is parseable JSON.
 * The fallback exits 0 on structural validity; CI will run the real ajv pass.
 *
 * Usage:
 *   node scripts/validate-schemas.cjs            # validate all schemas
 *   node scripts/validate-schemas.cjs --no-npx   # force fallback path
 *
 * Exit codes:
 *   0 — all present (schema, data) pairs pass
 *   1 — one or more pairs failed validation or a present schema is invalid
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const SCHEMA_DIR = path.join(REPO_ROOT, 'reference', 'schemas');

/**
 * (schema, data) pairs. `dataPath` is relative to repo root. `required=true`
 * means the data file MUST exist in the repo; `required=false` means the data
 * file is generated at runtime (gitignored) and only the schema itself is
 * compiled.
 */
const PAIRS = [
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
    // Only schema-compile it; Phase 13.2-02's watcher emits the data file at runtime.
    data: null,
    required: false,
  },
];

const USE_NPX = !process.argv.includes('--no-npx');

/**
 * Try running ajv-cli via npx. Returns { ok, stdout, stderr, status, fetchFailed }.
 * fetchFailed=true if npx couldn't fetch the package (offline); caller should fall back.
 *
 * We pass `-c ajv-formats` so schemas declaring `format: "date-time"` (etc.) are
 * validated against the standard JSON Schema formats plugin rather than being
 * rejected as unknown formats under ajv's strict mode. Schemas that declare no
 * formats (e.g., plugin, marketplace) are unaffected.
 */
function runAjv(args) {
  const injected = [...args];
  // Inject `-c ajv-formats` after the sub-command (compile/validate) but before -s flags.
  // Simpler: just append; ajv-cli accepts -c at any position.
  injected.push('-c', 'ajv-formats');
  const result = spawnSync(
    'npx',
    ['--yes', '-p', 'ajv-cli@5', '-p', 'ajv-formats@3', 'ajv', ...injected],
    { encoding: 'utf8', cwd: REPO_ROOT }
  );
  const combined = (result.stdout || '') + (result.stderr || '');
  // Heuristics for "network/fetch failed" — in that case fall back silently.
  const fetchFailed =
    result.status !== 0 &&
    /(ENOTFOUND|ECONNREFUSED|ETIMEDOUT|getaddrinfo|network|unable to resolve|unable to fetch|offline|E404|registry\.npmjs\.org)/i.test(combined);
  return {
    ok: result.status === 0,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    status: result.status,
    fetchFailed,
  };
}

/**
 * Fallback: confirm schema file is a valid Draft-07 JSON Schema (has $schema
 * pointing at draft-07). Confirm data file (if present) parses as JSON.
 */
function structuralCheck(schemaAbs, dataAbs) {
  let schema;
  try {
    schema = JSON.parse(fs.readFileSync(schemaAbs, 'utf8'));
  } catch (e) {
    return { ok: false, reason: `schema not parseable JSON: ${e.message}` };
  }
  if (!schema.$schema || !/draft-07/.test(schema.$schema)) {
    return { ok: false, reason: `schema missing Draft-07 $schema declaration` };
  }
  if (dataAbs) {
    try {
      JSON.parse(fs.readFileSync(dataAbs, 'utf8'));
    } catch (e) {
      return { ok: false, reason: `data file not parseable JSON: ${e.message}` };
    }
  }
  return { ok: true };
}

function main() {
  const results = [];
  let fallbackReason = null;

  for (const pair of PAIRS) {
    const schemaAbs = path.join(REPO_ROOT, pair.schema);
    const dataAbs = pair.data ? path.join(REPO_ROOT, pair.data) : null;

    if (!fs.existsSync(schemaAbs)) {
      results.push({
        name: pair.name,
        ok: false,
        via: 'missing-schema',
        reason: `schema not found at ${pair.schema}`,
      });
      continue;
    }

    const dataPresent = dataAbs && fs.existsSync(dataAbs);

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
          results.push({ name: pair.name, ok: true, via: 'ajv-compile', note: 'data not present in repo tree — schema compiled only' });
          continue;
        }
        if (r.fetchFailed) {
          fallbackReason = `npx fetch failed: ${r.stderr.split('\n')[0] || 'unknown'}`;
          // fall through to structural check below
        } else {
          results.push({ name: pair.name, ok: false, via: 'ajv-compile', reason: r.stderr || r.stdout || `exit ${r.status}` });
          continue;
        }
      }
      const s = structuralCheck(schemaAbs, null);
      results.push({
        name: pair.name,
        ok: s.ok,
        via: 'structural-compile',
        reason: s.ok ? 'schema is valid Draft-07 (data not in repo tree)' : s.reason,
      });
      continue;
    }

    // Both schema and data present — full validation.
    if (USE_NPX && !fallbackReason) {
      const r = runAjv(['validate', '-s', schemaAbs, '-d', dataAbs]);
      if (r.ok) {
        results.push({ name: pair.name, ok: true, via: 'ajv-validate' });
        continue;
      }
      if (r.fetchFailed) {
        fallbackReason = `npx fetch failed: ${r.stderr.split('\n')[0] || 'unknown'}`;
        // fall through to structural check below
      } else {
        results.push({ name: pair.name, ok: false, via: 'ajv-validate', reason: r.stderr || r.stdout || `exit ${r.status}` });
        continue;
      }
    }
    const s = structuralCheck(schemaAbs, dataAbs);
    results.push({
      name: pair.name,
      ok: s.ok,
      via: 'structural-validate',
      reason: s.ok ? 'schema is valid Draft-07 and data parses as JSON' : s.reason,
    });
  }

  // Report.
  console.log('validate-schemas: results');
  for (const r of results) {
    const status = r.ok ? 'OK' : 'FAIL';
    const note = r.note ? ` (${r.note})` : '';
    const reason = r.reason ? ` — ${r.reason}` : '';
    console.log(`  [${status}] ${r.name} via ${r.via}${note}${reason}`);
  }
  if (fallbackReason) {
    console.log(`\nnote: ajv-cli via npx unavailable (${fallbackReason}); fell back to structural checks. CI will run the authoritative ajv pass.`);
  }
  const failed = results.filter(r => !r.ok);
  console.log(`summary: ${results.length} pair(s) checked, ${failed.length} failure(s)`);

  process.exit(failed.length === 0 ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = { PAIRS };
