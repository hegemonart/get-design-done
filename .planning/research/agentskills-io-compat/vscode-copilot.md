---
runtime: vscode-copilot
phase: 28.8
plan: A2
created: 2026-05-19
claimed_compat: verified
our_install_kind: skills
our_converter: none (gap — see below)
verdict: deferred
---

# agentskills.io compat: VS Code Copilot

## Wave A claim

Wave A research (`.planning/research/agentskills-io-2026-05-19.md` § Claimed-Compat Verification) records VS Code Copilot via `docs.github.com/copilot/skills` and `docs.microsoft.com` citing agentskills.io by name and requiring a `chatSkills` manifest contribution to surface skills inside VS Code's Copilot Chat panel. Wave A assigned status **full / verified** — the docs are static-fetchable, the spec citation is explicit, and the `chatSkills` manifest field is documented.

## Our install path (Phase 28.7)

There is **no Phase 28.7 converter targeting VS Code Copilot's `chatSkills` manifest** specifically. Our existing `scripts/lib/install/converters/copilot.cjs` exists and is registered in `runtime-artifact-layout.cjs` line 324 as `skillsKind('skills', 'gdd-', './converters/copilot.cjs', 'copilot')` — but that converter targets the GitHub Copilot agents/chat surface as a file-drop into `skills/<gdd-name>/SKILL.md`. It does NOT emit a VS Code extension manifest with a `chatSkills` contribution, nor does it integrate with the VS Code Marketplace.

In other words: our skills land in a directory that the GitHub-Copilot-as-CLI variant can consume, but **delivering the same skills to VS Code Copilot's UI specifically requires either**:
1. A `package.json` extension manifest with `contributes.chatSkills` declaring each skill, plus a `.vsix` packaging step, OR
2. Discovery via a Copilot-published skill registry (out of scope for our installer).

This is a known **converter gap** for the VS Code Copilot install path.

agentskills.io compat is **on-axis** for VS Code Copilot's `chatSkills` surface — but our installer does not currently land there.

## Lint invocation

```bash
node scripts/lint-agentskills-spec.cjs skills/
```

> Note: The plan text proposed `--skills skills/`, but the actual lint script CLI (`scripts/lint-agentskills-spec.cjs` line 339) takes a positional `<dir>` argument. Corrected invocation above. Exit code: **0**.

The lint runs against our 70-skill source tree, which is the artifact a hypothetical `vscode-copilot.cjs` converter would consume.

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

Exit code: 0. Source tree is spec-compliant; the gap is downstream packaging.

## Verdict

`compat: deferred`

Our 70 source skills pass schema lint cleanly (38 PASS / 32 WARN advisory / 0 FAIL), and structurally they would satisfy VS Code Copilot's `chatSkills` requirements. However, our installer **does not deliver them to VS Code Copilot's UI surface** — no `vscode-copilot.cjs` converter exists, no `.vsix` packaging path, no `package.json` `contributes.chatSkills` emission. Verdict is **deferred**: schema-compliant source ✓, install-path delivery ✗.

**Resolution path** (out of scope for Phase 28.8): Add `scripts/lib/install/converters/vscode-copilot.cjs` that emits a `package.json` extension manifest with `contributes.chatSkills` entries pointing at each skill's `SKILL.md`. Register via `skillsKind('chatSkills/', 'gdd-', './converters/vscode-copilot.cjs', 'vscode-copilot')` in `runtime-artifact-layout.cjs`. Add a marketplace-publish path if Phase 28.x dist scope expands. Flag for **Phase 28.9+** if user demand surfaces.

## References

- Wave A research: `.planning/research/agentskills-io-2026-05-19.md` (§ Claimed-Compat Verification — VS Code Copilot row)
- Existing GitHub Copilot converter (different surface): `scripts/lib/install/converters/copilot.cjs`
- Phase 28.7 layout registration: `scripts/lib/install/runtime-artifact-layout.cjs` (line 324, copilot via `skillsKind`)
- A1 lint script: `scripts/lint-agentskills-spec.cjs`
- Vendor docs: `https://docs.github.com/copilot/skills`, `https://code.visualstudio.com/api/extension-guides/chat-skills`
