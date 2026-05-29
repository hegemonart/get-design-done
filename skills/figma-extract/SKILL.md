---
name: gdd-figma-extract
description: Off-context Figma design-system extraction into a compact local digest (DESIGN.md + tokens.json + components.json). Pulls the file via the Figma REST API and digests it without the raw JSON ever entering the model context.
---

# gdd-figma-extract

Pull a whole Figma design system into a compact, queryable local digest — **without** the raw JSON ever entering Claude context. The heavy lifting runs in tested `.cjs` tools; the model reads only the digest outputs.

## Usage

```
/gdd:figma-extract <file-key-or-url>                  # full design-system digest
/gdd:figma-extract <file-key-or-url> --component Button  # ~500-token single-component slice
```

`<file-key-or-url>` is a Figma file URL (`https://www.figma.com/file/<key>/…` or `/design/<key>/…`) or a bare file key.

## Behavior

1. **Preflight (D-10).** Confirm `FIGMA_TOKEN` is set in the environment:
   ```
   node -e "process.exit(process.env.FIGMA_TOKEN||process.env.FIGMA_PERSONAL_ACCESS_TOKEN?0:1)"
   ```
   If unset, tell the user to `export FIGMA_TOKEN=figd_…` (from https://www.figma.com/developers/api#access-tokens). The token comes from the environment **only** — never ask the user to paste it into a file or the chat, and never echo it back.

2. **Stage 1 — pull.** Pull the file's REST endpoints into the gitignored raw cache (D-09):
   ```
   node scripts/lib/figma-extract/pull.cjs "<file-key-or-url>"
   ```
   This caches to `.figma-extract-cache/raw/<file-key>/` and skips re-pulling when Figma's `version` is unchanged (D-11). Add `--force` to bypass the cache, `--out <dir>` to relocate the cache. The tool prints a JSON summary (endpoints, bytes, cached) on stdout — the raw bodies stay on disk.

3. **Stage 2 — plugin sync (OPTIONAL, Path C).** Only when the design tokens live in Figma Variables that the REST API cannot return (non-Enterprise plans → the pull summary shows `variables` skipped) and the user wants token coverage:
   ```
   node scripts/lib/figma-extract/receiver.cjs --out .figma-extract-cache/raw/<file-key>
   ```
   This binds `127.0.0.1:5179` (D-06). Tell the user to run the dev-installed **"GDD Sync"** plugin in Figma and click **"Export to GDD"** — see `figma-plugin/README.md` for the one-time dev-install. The receiver writes `variables.json` into the cache and exits on receipt or timeout. Skip this stage entirely for design systems whose tokens already come through the REST pull.

4. **Stage 3 — digest.** Transform the cache into the compact digest:
   ```
   node scripts/lib/figma-extract/digest.cjs --raw .figma-extract-cache/raw/<file-key> --out .figma-extract-cache/digest
   ```
   This writes `DESIGN.md`, `tokens.json`, and `components.json`. Add `--prefer-styles` to invert the token priority to styles-first (D-04). Add `--component <name>` (D-08) to emit a single-component slice instead of the full digest.

5. **Read the digest.** Open **only** `.figma-extract-cache/digest/DESIGN.md` (plus `tokens.json` / `components.json` when you need structured data). For a single component, pass `--component <name>` in Stage 3 and read the ~500-token slice instead of the full ~16K-token spec.

## Required Reading

- `.figma-extract-cache/digest/DESIGN.md` — the compact human/LLM-readable spec
- `.figma-extract-cache/digest/tokens.json` — resolved design tokens (when structured token data is needed)
- `.figma-extract-cache/digest/components.json` — components with variants/props/defaults (when structured component data is needed)

## Notes

- Two-stage pipeline (D-01): re-run Stage 3 against an existing cache without re-pulling. The digest does zero network calls.
- The spike proved **0 Claude tokens** during extraction (898× compression, 223 MB → 254 KB). That property holds only because this skill never surfaces the raw cache.
- Figma MCP remains the right tool for spot questions on a single live component; this skill is the cheaper path for whole-design-system workflows.

## Do Not

- **Do NOT read or `cat` the `raw/*.json` cache** (e.g. `.figma-extract-cache/raw/<file-key>/file.json`). It is tool-internal and often 100+ MB; loading it into context defeats the off-context guarantee (D-12). Read only the digest outputs above.
- **Do not persist, log, echo, or print `FIGMA_TOKEN`** (D-10). It belongs in the environment only — never write it to a file, a commit, or chat output.

## FIGMA-EXTRACT COMPLETE
