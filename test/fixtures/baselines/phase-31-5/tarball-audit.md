# npm tarball audit — Phase 31.5, Plan 08 (D-09 corrected allowlist)

Golden manifest: `tarball-manifest.txt` (620 paths, paths-only per D-07).
Source of truth: `package.json` `files`. `.npmignore` is a defense-in-depth duplicate (D-10).
Prior tarball (v1.31.0, `scripts/` wholesale, no sdk/recipes/docs-i18n/NOTICE): ~549 files.
This tarball: 620 files (net +71 = +91 added − 23 maintainer dropped + 3 compiled SDK-bin .js).

**Plan 31-5-9.5 (D-16) update — +3 compiled SDK-bin `.js`:** `prepack`
(`npm run build:sdk` → `scripts/build-sdk-bins.cjs`) esbuild-bundles the three
TS-entry bins to self-contained CommonJS SIBLINGS that NOW SHIP so a fresh
`npm install` has runnable bins (raw `.ts` cannot run under
`--experimental-strip-types` from inside `node_modules`). The `.ts` remain the
source of truth (the `.js` are gitignored build artifacts regenerated each
pack; `postpack` cleans them). 617 → 620:
  - `sdk/cli/index.js`            (gdd-sdk compiled entry)
  - `sdk/mcp/gdd-state/server.js` (gdd-state-mcp compiled entry)
  - `sdk/mcp/gdd-mcp/server.js`   (gdd-mcp compiled entry)

One line per top-level entry (or notable subtree): KEPT (why it ships) / DROPPED (why removed) / ADDED.

## KEPT — runtime-required (the D-09 keep-runtime-subtrees guarantee)

- `scripts/lib/` (190 files) — KEPT (runtime). Includes the two pinned subtrees below plus ~50 helper libs, deprecation-shim primitives, recipe-loader.
- `scripts/lib/graph/` — KEPT (gdd-graph bin runtime; D-14).
- `scripts/lib/figma-extract/` — KEPT (figma-extract SKILL runs `node scripts/lib/figma-extract/*.cjs`; D-15).
- `scripts/mcp-servers/` (2 files: gdd-state/server.ts, gdd-mcp/server.ts) — KEPT (gdd-state + gdd-mcp deprecation shims; external grace window → v1.33.0; 31-5-06).
- `scripts/cli/` (1 file: gdd-events.mjs) — KEPT (gdd-events bin target).
- `scripts/install.cjs` — KEPT (get-design-done install bin / npm postinstall entry).
- `bin/` (4 files: gdd-graph, gdd-mcp, gdd-sdk, gdd-state-mcp) — KEPT (bin trampolines).
- `.claude-plugin/` (2) — KEPT (marketplace.json + plugin.json; plugin discovery).
- `agents/` (41) — KEPT (public agent surface).
- `skills/` (95) — KEPT (public skill surface).
- `hooks/` (15) — KEPT (hooks.json + hook scripts).
- `connections/` (15) — KEPT (peer-CLI connection configs).
- `reference/` (155) — KEPT (schemas + reference docs, incl. recipe.schema.json).
- `SKILL.md`, `README.md`, `CHANGELOG.md`, `LICENSE` — KEPT (root harness/docs/legal).
- `package.json` — KEPT (always included by npm, not via `files`).

## ADDED (new in this allowlist vs prior tarball)

- `sdk/` (86 files) — ADDED (the new SDK: cli, state, event-stream, errors, primitives, mcp/gdd-state, mcp/gdd-mcp, index.ts barrel, README.md; plugin.json advertises it). Includes the 3 compiled-bin `.js` siblings (31-5-9.5, D-16): `sdk/cli/index.js`, `sdk/mcp/gdd-state/server.js`, `sdk/mcp/gdd-mcp/server.js`.
- `recipes/` (1 file: `.gitkeep`) — ADDED (scaffold; ships empty of recipes).
- `docs/i18n/` (6 files: README.{de,fr,it,ja,ko,zh-CN}.md) — ADDED (translations relocated from root in 31-5-07; D-11).
- `NOTICE` — ADDED (third-party attributions; was missing from prior `files`).

## DROPPED — maintainer-only, never reach a user's node_modules (23 files)

Mechanism: `files` lists the runtime DIRECTORIES under `scripts/` (lib/, mcp-servers/, cli/) plus the single `scripts/install.cjs`. By NOT listing `scripts/` wholesale, every file sitting directly under `scripts/` (and the maintainer subtrees) is excluded.

- `scripts/bootstrap.sh`, `scripts/bootstrap-manifest.txt` — DROPPED (maintainer bootstrap).
- `scripts/rollback-release.sh`, `scripts/apply-branch-protection.sh` — DROPPED (release ops).
- `scripts/release-smoke-test.cjs`, `scripts/verify-version-sync.cjs`, `scripts/extract-changelog-section.cjs` — DROPPED (release tooling).
- `scripts/detect-stale-refs.cjs`, `scripts/run-injection-scanner-ci.cjs`, `scripts/injection-patterns.cjs` — DROPPED (CI scanners).
- `scripts/build-distribution-bundles.cjs`, `scripts/build-sdk-bins.cjs`, `scripts/build-intel.cjs` — DROPPED (build tooling; build-sdk-bins.cjs is the 31-5-9.5 prepack compiler — runs at pack time, never ships).
- `scripts/gsd-cleanup-incubator.cjs`, `scripts/validate-incubator-scope.cjs`, `scripts/validate-skill-length.cjs` — DROPPED (maintainer validation/cleanup).
- `scripts/validate-frontmatter.ts`, `scripts/validate-schemas.ts`, `scripts/codegen-schema-types.ts`, `scripts/aggregate-agent-metrics.ts` — DROPPED (maintainer .ts tooling).
- `scripts/lint-agentskills-spec.cjs` — DROPPED (maintainer lint).
- `scripts/e2e/` (run-headless.ts) — DROPPED (maintainer E2E harness).
- `scripts/tests/` (3 `.sh` harnesses) — DROPPED (maintainer test harnesses).

Also excluded by `files` (not listed at all): `test/`, `test-fixture/`, `.planning/`, `.github/`, `.claude/`, `.design/` — repo/dev/private content that never belonged in the tarball. `.npmignore` (D-10) restates the `scripts/` maintainer excludes + `e2e/`/`tests/` so they stay out even if `scripts/` were ever re-added wholesale to `files`.
