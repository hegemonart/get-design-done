---
runtime: claude-code
phase: 28.8
plan: A2
created: 2026-05-19
claimed_compat: verified
our_install_kind: passthrough
our_converter: none (canonical source)
verdict: confirmed
---

# agentskills.io compat: Claude Code

## Wave A claim

Wave A research (`.planning/research/agentskills-io-2026-05-19.md` § Claimed-Compat Verification) records Claude Code (anthropic.com) as the **canonical source** of the agentskills.io spec — Anthropic published the SKILL.md frontmatter contract, and Claude Code supports the spec's required fields (`name`, `description`) plus extensions: `argument-hint`, `disable-model-invocation`, `allowed-tools`, model selection, etc. Wave A assigned status **full (superset)** — Claude Code is on the carousel, docs are explicit and static-fetchable, and the runtime is the reference implementation.

## Our install path (Phase 28.7)

There is **no converter** for Claude Code — install is **passthrough / identity**. Per `scripts/lib/install/runtime-artifact-layout.cjs` line 287-295, the `'claude'` runtime is registered as `skillsKind('skills', 'gdd-', null, 'claude')` (line 295) with `null` converter; the slash-command path (line 290) is similarly `commandsKind('commands/gdd', 'gdd-', null, 'claude')`. The `null` converter slot is documented as "passthrough — no transformation" in `runtime-artifact-layout.cjs` § comments around line 168.

In other words: our `skills/<name>/SKILL.md` source files ARE the artifact Claude Code consumes — no rewriting of frontmatter, no slash-shape conversion, no tool-vocabulary mapping. The agentskills.io schema axis maps 1:1 onto Claude Code's expected shape because Claude Code IS the canonical source the schema was extracted from.

agentskills.io compat is **on-axis** for Claude Code, and the install path is identity.

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

Exit code: 0.

## Verdict

`compat: confirmed`

Claude Code compat is **confirmed by construction**: our `skills/` tree is the canonical agentskills.io shape (Anthropic-published spec source), our install is identity (passthrough — `null` converter), and the A1 lint reports 0 FAIL against the source. The 32 W2 warnings (>200-char description advisory cap from Phase 28.5 D-01) are intentionally permitted by our project's spec extension — Claude Code itself imposes no length cap on `description`, so they do not affect runtime compat.

## References

- Wave A research: `.planning/research/agentskills-io-2026-05-19.md` (§ Claimed-Compat Verification — Claude Code row)
- Phase 28.7 layout registration: `scripts/lib/install/runtime-artifact-layout.cjs` (lines 287-295, passthrough — `null` converter)
- A1 lint script: `scripts/lint-agentskills-spec.cjs`
- Vendor doc (canonical): `https://docs.anthropic.com/claude-code/skills`
