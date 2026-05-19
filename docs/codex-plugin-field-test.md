# Codex Plugin — maintainer field-test runbook

Single-step maintainer flow for live install verification after the
v1.28.8 merge. Codex install-by-URL works immediately per **D-03**
(Phase 28.8 CONTEXT) — there is no review window, no publisher
application, no marketplace submission, and no SLA to wait through.
A maintainer on any Codex-installed machine runs **one** command to
register the plugin from this repo's GitHub URL, and the install is
live in under a minute.

> **Contrast with Cursor (D-16):** the Cursor Marketplace field-test
> (`docs/cursor-marketplace-field-test.md`) is **multi-step** — submit
> publisher application → await review → publish through marketplace
> UI → record marketplace state. That multi-step pattern is **Cursor-
> only**. Codex stays **single-step** per D-03 + D-16.

## Prerequisites

- Codex CLI installed locally (`codex --version` returns a version).
- v1.28.8 merged to `main` AND the git tag `v1.28.8` pushed to GitHub.
- `.codex-plugin/plugin.json` shipped at repo root (built by Plan 28-8-C1).
- `.claude-plugin/marketplace.json` shipped at repo root (reused per
  **D-14** — the same catalog file serves both Claude Code marketplace
  and Codex's legacy-compatible catalog path; no Codex-specific
  catalog artifact is needed).

## The single step

The entire user-facing install is **one command**. Items 2-5 below are
verification steps, not part of the install action.

1. **Install the plugin from any Codex-installed machine:**

   ```
   codex plugin marketplace add hegemonart/get-design-done
   ```

   This command — verbatim, no flags, no `--registry` — is the entire
   single-step flow per **D-03**. Codex resolves the GitHub URL, fetches
   the repo, reads `.codex-plugin/plugin.json` for the plugin manifest
   and `.claude-plugin/marketplace.json` for the legacy-compatible
   catalog, and registers the plugin in its local cache. No account,
   no review, no SLA.

2. **Verify the install cache landed:**

   ```
   ls ~/.codex/plugins/cache/get-design-done/get-design-done/1.28.8/
   ```

   The path schema is documented in
   `.planning/research/codex-plugins-2026-05-19.md` §
   Plugin cache layout:
   `~/.codex/plugins/cache/$MARKETPLACE_NAME/$PLUGIN_NAME/$VERSION/`.
   For GDD: `$MARKETPLACE_NAME = $PLUGIN_NAME = get-design-done`,
   `$VERSION = 1.28.8`. The directory should contain the manifest plus
   a `skills/` subtree.

3. **Run any skill from Codex** to confirm runtime discovery picks up
   the installed plugin tree. For example, invoke the design-pipeline
   intro skill or any registered `$gdd-*` agent. If the skill loads,
   Codex's plugin loader successfully consumed the
   `.codex-plugin/plugin.json` manifest.

4. **Run the local doctor on the repo:**

   ```
   node scripts/install.cjs --doctor
   ```

   The `Codex Plugin status` section should report
   `verdict: ready-to-install`. Once Plan 28-8-X2 lands, the aggregated
   tier-2 doctor section will additionally show `tier-2 codex: ready`,
   but the per-channel section is the single source of truth today.

5. **(Optional) Sanity-check the catalog reuse.** Run
   `cat .claude-plugin/marketplace.json | jq '.plugins[].name'` from
   the repo root and confirm the plugin is listed (D-14 catalog reuse).

## What the doctor reports

The happy-path rendering of `node scripts/install.cjs --doctor`'s
Codex Plugin section, against the shipped v1.28.8 artifacts:

```
Codex Plugin status
  manifest .codex-plugin/plugin.json: present (version 1.28.8) — schema valid
  catalog .claude-plugin/marketplace.json: present — referenced by codex-plugin per D-14 (legacy-compatible catalog reuse)
  install path (computed, not verified): ~/.codex/plugins/cache/get-design-done/get-design-done/1.28.8/
  verdict: ready-to-install
```

**Note (D-10):** the doctor **computes** the install cache path; it does
**not** verify the path exists. The maintainer's step 2 above is the
authoritative cache-presence check, run on a Codex-installed machine.
The doctor can run anywhere — including CI, dev machines without Codex
installed, or contributors' laptops — without requiring `codex` to be
present.

## Troubleshooting

- **Step 1 errors with "marketplace not found".** Confirm the GitHub
  URL `https://github.com/hegemonart/get-design-done` resolves and the
  `.claude-plugin/marketplace.json` file is at the repo root (Codex
  consumes it as the legacy-compatible catalog per **D-14**). Re-check
  by browsing to the raw GitHub URL of the manifest file.

- **Step 2 path is empty.** Confirm `codex plugin marketplace add` exited
  0. Re-run with the verbatim command — do **not** add `--registry` or
  similar flags (those exist on later Codex versions for the upcoming
  self-serve registry, but the install-by-URL path is the form documented
  by D-03). If still empty, run
  `codex plugin marketplace add hegemonart/get-design-done --refresh`
  to force a re-fetch.

- **Step 4 reports `manifest-only-not-ready`.** The local repo is missing
  artifacts that should have been built by **Plan 28-8-C1**. Re-run the
  build pipeline (`npm run build:bundles` — Plan 28-8-X1) or check for
  divergence between your local worktree and `main`. The
  `verdictReasons` parenthetical on the verdict line will name the
  missing piece (e.g., `(catalog absent)` or
  `(manifest schema invalid: ...)`).

## References

- `.planning/phases/28.8-tier-2-distribution-channels/CONTEXT.md` —
  decision register entries **D-03** (install-by-URL works today),
  **D-10** (tmpdir test discipline + no live CLI), **D-14** (catalog
  reuse from Claude Code marketplace), **D-16** (Codex stays single-
  step; Cursor carries the multi-step pattern).
- `.planning/research/codex-plugins-2026-05-19.md` — canonical Codex
  manifest spec, cache path schema, and the install-by-URL command
  surface.
- `https://developers.openai.com/codex/plugins/build` — Codex's upstream
  plugin authoring documentation.
- `28-8-C1` (`.planning/phases/28.8-tier-2-distribution-channels/28-8-C1-PLAN.md`)
  — plugin manifest schema and converter.
- `28-8-X2` (Wave C, lands later) — aggregated tier-2 doctor section
  that will compose this report alongside the Cursor Marketplace
  report (B2).
- `docs/cursor-marketplace-field-test.md` — the multi-step Cursor
  field-test, which Codex's single-step flow deliberately contrasts.
