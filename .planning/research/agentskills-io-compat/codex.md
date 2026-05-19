---
runtime: codex
phase: 28.8
plan: A2
created: 2026-05-19
claimed_compat: verified
our_install_kind: skills
our_converter: scripts/lib/install/converters/codex.cjs
verdict: confirmed
---

# agentskills.io compat: Codex

## Wave A claim

Wave A research (`.planning/research/agentskills-io-2026-05-19.md` § Claimed-Compat Verification) records OpenAI Codex docs (`developers.openai.com/codex/skills`) as explicitly requiring the `name` + `description` frontmatter fields — the canonical agentskills.io minimum. Wave A assigned status **full / verified** because the docs page is static-fetchable and its required-field list matches agentskills.io.

## Our install path (Phase 28.7)

Our converter is `scripts/lib/install/converters/codex.cjs` (Phase 28.7 Plan 28.7-04). Per `scripts/lib/install/runtime-artifact-layout.cjs` line 318, Codex is registered via `skillsKind('skills', 'gdd-', './converters/codex.cjs', 'codex')` — install kind is **`skills/<gdd-name>/SKILL.md`**, on-axis with agentskills.io.

The converter:
- Normalizes frontmatter `name:` to `gdd-<skill>`.
- Rewrites `/gdd-<name>` prose references to Codex's `$gdd-<name>` shell-variable form.
- Rewrites code-fenced tool invocations per `CODEX_TOOL_MAP` (Read → `read_file`, Write/Edit → `apply_patch`, Bash/Grep/Glob/WebFetch → `shell`, WebSearch → `web_search`).
- Injects a 1-line HTML adapter header.

Phase 28.8 separately adds `scripts/lib/install/converters/codex-plugin.cjs` (Wave C C1 — `.codex-plugin/plugin.json` surface). The two coexist: A2 verifies the existing `skills/` surface; the plugin surface is orthogonal to the agentskills.io axis.

> Plan-text correction (Rule 1): the plan brief described codex as "writes AGENTS.md surface (Tier-1 file-drop per Phase 28.7 D-05)". The actual Phase 28.7 layout (line 318) registers codex on the `skills/` surface via `skillsKind`, not on AGENTS.md. AGENTS.md is a separate Tier-1 surface used by other runtimes; codex's primary install path is `skills/`. Report reflects the source-of-truth (`runtime-artifact-layout.cjs`).

## Lint invocation

```bash
node scripts/lint-agentskills-spec.cjs skills/
```

> Note: The plan text proposed `--skills skills/`, but the actual lint script CLI (`scripts/lint-agentskills-spec.cjs` line 339) takes a positional `<dir>` argument. Corrected invocation above. Exit code: **0**.

### Output

```
STATUS  SKILL                 RULE  DETAIL
------  --------------------  ----  -----------------------------------------------------------
PASS    add-backlog           -     -
PASS    analyze-dependencies  -     -
PASS    apply-reflections     -     -
WARN    audit                 W2    description: 313 chars (>200 advisory cap, Phase 28.5 D-01)
WARN    bandit-status         W2    description: 298 chars (>200 advisory cap, Phase 28.5 D-01)
WARN    benchmark             W2    description: 298 chars (>200 advisory cap, Phase 28.5 D-01)
WARN    brief                 W2    description: 238 chars (>200 advisory cap, Phase 28.5 D-01)
WARN    cache-manager         W2    description: 351 chars (>200 advisory cap, Phase 28.5 D-01)
WARN    check-update          W2    description: 205 chars (>200 advisory cap, Phase 28.5 D-01)
WARN    compare               W2    description: 422 chars (>200 advisory cap, Phase 28.5 D-01)
WARN    complete-cycle        W2    description: 265 chars (>200 advisory cap, Phase 28.5 D-01)
WARN    connections           W2    description: 529 chars (>200 advisory cap, Phase 28.5 D-01)
PASS    continue              -     -
WARN    darkmode              W2    description: 432 chars (>200 advisory cap, Phase 28.5 D-01)
WARN    debug                 W2    description: 214 chars (>200 advisory cap, Phase 28.5 D-01)
WARN    design                W2    description: 293 chars (>200 advisory cap, Phase 28.5 D-01)
WARN    discover              W2    description: 335 chars (>200 advisory cap, Phase 28.5 D-01)
WARN    discuss               W2    description: 297 chars (>200 advisory cap, Phase 28.5 D-01)
PASS    do                    -     -
WARN    explore               W2    description: 310 chars (>200 advisory cap, Phase 28.5 D-01)
PASS    extract-learnings     -     -
PASS    fast                  -     -
WARN    figma-write           W2    description: 425 chars (>200 advisory cap, Phase 28.5 D-01)
PASS    graphify              -     -
PASS    health                -     -
PASS    help                  -     -
PASS    list-assumptions      -     -
PASS    map                   -     -
PASS    new-cycle             -     -
PASS    new-project           -     -
PASS    next                  -     -
PASS    note                  -     -
PASS    optimize              -     -
PASS    pause                 -     -
WARN    peer-cli-add          W2    description: 292 chars (>200 advisory cap, Phase 28.5 D-01)
WARN    peer-cli-customize    W2    description: 256 chars (>200 advisory cap, Phase 28.5 D-01)
WARN    peers                 W2    description: 272 chars (>200 advisory cap, Phase 28.5 D-01)
WARN    plan                  W2    description: 305 chars (>200 advisory cap, Phase 28.5 D-01)
PASS    plant-seed            -     -
PASS    pr-branch             -     -
PASS    progress              -     -
WARN    quality-gate          W2    description: 339 chars (>200 advisory cap, Phase 28.5 D-01)
PASS    quick                 -     -
PASS    reapply-patches       -     -
PASS    recall                -     -
PASS    reflect               -     -
PASS    resume                -     -
PASS    review-backlog        -     -
WARN    router                W2    description: 301 chars (>200 advisory cap, Phase 28.5 D-01)
WARN    scan                  W2    description: 301 chars (>200 advisory cap, Phase 28.5 D-01)
PASS    settings              -     -
PASS    ship                  -     -
WARN    sketch                W2    description: 257 chars (>200 advisory cap, Phase 28.5 D-01)
PASS    sketch-wrap-up        -     -
PASS    skill-manifest        -     -
WARN    spike                 W2    description: 274 chars (>200 advisory cap, Phase 28.5 D-01)
PASS    spike-wrap-up         -     -
PASS    start                 -     -
PASS    stats                 -     -
WARN    style                 W2    description: 413 chars (>200 advisory cap, Phase 28.5 D-01)
WARN    synthesize            W2    description: 256 chars (>200 advisory cap, Phase 28.5 D-01)
PASS    timeline              -     -
PASS    todo                  -     -
WARN    turn-closeout         W2    description: 339 chars (>200 advisory cap, Phase 28.5 D-01)
PASS    undo                  -     -
PASS    update                -     -
WARN    verify                W2    description: 300 chars (>200 advisory cap, Phase 28.5 D-01)
WARN    warm-cache            W2    description: 375 chars (>200 advisory cap, Phase 28.5 D-01)
WARN    watch-authorities     W2    description: 205 chars (>200 advisory cap, Phase 28.5 D-01)
WARN    zoom-out              W2    description: 229 chars (>200 advisory cap, Phase 28.5 D-01)

Lint summary: 70 skills, 38 PASS, 32 WARN, 0 FAIL
```

Exit code: 0. Zero `FAIL` rows.

## Verdict

`compat: confirmed`

Codex compat is **confirmed**: the docs page is the most explicit static-fetchable agentskills.io citation among our 14 runtimes, and our 70 source skills all carry the required `name` + `description` fields (0 FAIL). The `codex.cjs` converter installs on the on-axis `skills/` surface, preserving frontmatter while rewriting only tool-vocabulary and slash-reference shape. The forthcoming Wave C `codex-plugin.cjs` surface is additive and does not affect schema compat.

## References

- Wave A research: `.planning/research/agentskills-io-2026-05-19.md` (§ Claimed-Compat Verification — Codex row)
- Phase 28.7 converter: `scripts/lib/install/converters/codex.cjs`
- Phase 28.8 plugin converter (orthogonal): `scripts/lib/install/converters/codex-plugin.cjs`
- Phase 28.7 layout registration: `scripts/lib/install/runtime-artifact-layout.cjs` (line 318, `skillsKind('skills', 'gdd-', './converters/codex.cjs', 'codex')`)
- A1 lint script: `scripts/lint-agentskills-spec.cjs`
- Vendor doc: `https://developers.openai.com/codex/skills`
