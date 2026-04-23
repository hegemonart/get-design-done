# TypeScript Migration Policy

Plan 20-00 establishes the TypeScript toolchain for `get-design-done`. This doc documents which files are TS today and what rules govern future conversions.

## Philosophy

- **No bundler, no emit.** `tsconfig.json` sets `"noEmit": true`. Node 22+ runs `.ts` files directly via `--experimental-strip-types`. TypeScript only gates types — it never produces `.js` artifacts.
- **Strict by default.** `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noImplicitAny`, `noImplicitReturns`, `noFallthroughCasesInSwitch` are all on. New `.ts` files MUST type-check against this config.
- **Generated types are authoritative.** `reference/schemas/generated.d.ts` is produced from `reference/schemas/*.schema.json` by `scripts/codegen-schema-types.ts`. Regenerate with `npm run codegen:schemas`. Hand-edits to the generated file are prohibited — update the schema and regenerate.

## Tier-1 (landed in Plan 20-00)

These are the four files converted in Plan 20-00. Every one consumes at least one type from `reference/schemas/generated.d.ts`:

| File | Role | Runs via |
| --- | --- | --- |
| `tests/helpers.ts` | Shared test fixtures (scaffoldDesignDir, readFrontmatter, countLines, mockMCP) | `require('./helpers.ts')` from `tests/*.test.cjs` under `node --test --experimental-strip-types` |
| `scripts/validate-schemas.ts` | ajv-cli runner + structural fallback for every `reference/schemas/*.schema.json` pair | `npm run validate:schemas` |
| `scripts/validate-frontmatter.ts` | Frontmatter hygiene validator for `agents/*.md` | `npm run validate:frontmatter` |
| `scripts/aggregate-agent-metrics.ts` | Incremental per-agent telemetry aggregator | Detached child of `hooks/budget-enforcer.js`; `/gdd:optimize` refresh step; manual `npm`-free invocation `node --experimental-strip-types scripts/aggregate-agent-metrics.ts` |

## Tier-2 (opportunistic)

**Remaining tests and small text-munging scripts (<60 LOC, no structured parsing) convert to `.ts` when touched for an unrelated reason. No en-masse rewrite.**

- `tests/*.test.cjs` — may migrate incrementally as each test gains new assertions.
- Small scripts (`scripts/extract-changelog-section.cjs`, `scripts/verify-version-sync.cjs`, `scripts/detect-stale-refs.cjs`, etc.) — convert when the next substantive edit lands.
- Larger structured scripts (`scripts/build-intel.cjs`, `scripts/install.cjs`, `scripts/release-smoke-test.cjs`) follow Tier-1 rigor when promoted, with generated-type imports.

Tier-2 conversions:
- MUST still type-check under strict mode.
- SHOULD consume at least one generated type where the module touches config/plugin/marketplace/hooks/intel/authority-snapshot surfaces.
- MUST delete the original `.cjs`/`.js` in the same commit as the `.ts` lands.

## Hooks

**Hooks stay as `.js` until Plan 20-13** — the rewrite-once policy. Plan 20-13 owns `hooks/budget-enforcer.js`, `hooks/context-exhaustion.js`, and `hooks/gdd-read-injection-scanner.js` conversions because those files also become event-stream consumers there. Converting them now would mean rewriting them twice.

Plan 20-00 does update one single line in `hooks/budget-enforcer.js`: the detached-child spawn arg targeting `scripts/aggregate-agent-metrics.ts` (needed because the aggregator filename changed in Task 6). That is the only hook edit allowed in Plan 20-00.

## New-file checklist

When adding a new `.ts` file under `scripts/` or `tests/`:

1. Name it `.ts`, never `.mts` or `.cts`.
2. Import Node built-ins with the `node:` prefix (`import { readFileSync } from 'node:fs'`).
3. If importing another TS file in this repo, use the `.ts` extension directly — `allowImportingTsExtensions` is enabled.
4. If importing the generated schema types, import from `'../reference/schemas/generated.js'` (note `.js` — Node16 module resolution). The re-export in Tier-1 files works as a convenience path too.
5. Do NOT use `import.meta.url` / `__dirname` for repo-root resolution. Use the `process.cwd()`-walk-up pattern from `tests/helpers.ts`.
6. Run `npm run typecheck` before committing.
7. If the file is invoked outside `npm` (e.g., from a hook spawn or a test), include `--experimental-strip-types` in the invocation.

## CI gate

`.github/workflows/ci.yml` runs `npm run typecheck` in the `validate` job before `npm run validate:schemas`. A type regression fails CI before any schema check runs.
