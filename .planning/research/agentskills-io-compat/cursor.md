---
runtime: cursor
phase: 28.8
plan: A2
created: 2026-05-19
claimed_compat: claim-only
our_install_kind: skills
our_converter: scripts/lib/install/converters/cursor.cjs
verdict: confirmed
---

# agentskills.io compat: Cursor

## Wave A claim

Wave A research (`.planning/research/agentskills-io-2026-05-19.md` § Claimed-Compat Verification) records Cursor on the agentskills.io carousel as a claimed adopter. The vendor doc page (`cursor.com/docs/skills`) is a Vercel SPA on 2026-05-19: content is JS-rendered and not extractable via static fetch (Wave A § Fetch Issues notes a `308 Permanent` redirect from `/docs/context/skills` → `/docs/skills`, then SPA shell). Wave A assigned status **claim-only** — the carousel adoption is observable, but the spec-fields list on the docs page could not be verified against agentskills.io without JS execution.

## Our install path (Phase 28.7)

Our converter is `scripts/lib/install/converters/cursor.cjs` (Phase 28.7 Plan 28.7-04). Per `scripts/lib/install/runtime-artifact-layout.cjs` line 301, Cursor is registered via `skillsKind('skills', 'gdd-', './converters/cursor.cjs', 'cursor')` — install kind is **`skills/<gdd-name>/SKILL.md`**, which is the on-axis surface for agentskills.io. The converter normalizes frontmatter `name:` to `gdd-<skill>`, passes through `/gdd-<name>` slash references and Claude tool vocabulary unchanged, and injects a 1-line HTML adapter header.

Because our install surface (`skills/`) matches the agentskills.io spec surface, compat is **on-axis** for Cursor: any spec fields the schema requires must be present in our source `skills/<name>/SKILL.md` frontmatter for our Cursor install to be spec-compliant by construction.

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

Exit code: 0. Zero `FAIL` rows; all 32 `WARN` rows are advisory W2 (Phase 28.5 D-01 >200-char description cap) — non-blocking.

## Verdict

`compat: confirmed`

Cursor compat is confirmed on the **schema axis**: every required agentskills.io field (`name`, `description`) is present in our 70 source skills (0 FAIL), and our `cursor.cjs` converter preserves them on the `skills/<gdd-name>/SKILL.md` surface that Cursor consumes. Doc-level field verification against `cursor.com/docs/skills` remains **deferred** (SPA unverifiable on 2026-05-19) and would be re-runnable when Cursor docs serve static HTML or JS-extractable content. The carousel adoption + on-axis install path are sufficient to declare schema-level compat; deeper doc-field cross-check is non-blocking for Phase 28.8.

## References

- Wave A research: `.planning/research/agentskills-io-2026-05-19.md` (§ Claimed-Compat Verification — Cursor row; § Fetch Issues — Cursor SPA caveat)
- Phase 28.7 converter: `scripts/lib/install/converters/cursor.cjs`
- Phase 28.7 layout registration: `scripts/lib/install/runtime-artifact-layout.cjs` (line 301, `skillsKind('skills', 'gdd-', './converters/cursor.cjs', 'cursor')`)
- A1 lint script: `scripts/lint-agentskills-spec.cjs`
- Vendor doc (SPA — unverifiable static fetch): `https://cursor.com/docs/skills`
