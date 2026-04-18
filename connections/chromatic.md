# Chromatic — Connection Specification

This file is the connection specification for Chromatic within the get-design-done pipeline. It lives in `connections/` alongside other connection specs. See `connections/connections.md` for the full connection index and capability matrix.

---

Chromatic is the **verify stage's visual regression tool** and the **plan stage's change-risk scoping tool**. It captures Storybook story snapshots in the cloud and compares them to approved baselines. Its pipeline role: after a design executor pass, run Chromatic to surface which stories changed visually — the verify stage narrates these changes in plain English. Before planning a token or component change, use `--trace-changed` to enumerate exactly which stories depend on the files being changed, turning vague "this might affect things" into "23 stories are at risk."

**Key dependency:** Chromatic requires Storybook. If `storybook: not_configured`, Chromatic cannot function even if its project token is present.

---

## Setup

**Prerequisites:**

- Storybook configured in the project (see `connections/storybook.md` — Chromatic builds require a working Storybook configuration)
- Chromatic account created at [chromatic.com](https://www.chromatic.com) — free tier available

**Install:**

```bash
npm install --save-dev chromatic
```

**Account and token:**

1. Create a Chromatic account at chromatic.com
2. Link your repository and create a project
3. Copy the project token from the project settings page
4. Set the environment variable — **NEVER commit the token to git or to a tracked `.env` file:**

```bash
export CHROMATIC_PROJECT_TOKEN=<your-token>
```

Add this to your shell profile or CI environment secrets. Do not add it to `.env` files that are tracked in version control.

**First run (baseline establishment):**

```bash
npx chromatic --project-token $CHROMATIC_PROJECT_TOKEN
```

The first run creates baseline snapshots for all stories. Every story appears as "new" — this is not a regression. See the Baseline Management section below.

**Verification:**

```bash
command -v chromatic 2>/dev/null || npx chromatic --version
```

---

## Why Chromatic is useful

Visual regressions are invisible to code review. A token change from `#3B82F6` to `#2563EB` looks like a one-character diff in a CSS file but visually affects every component that uses that token — buttons, links, badges, focus rings — across every state: hover, disabled, active, dark mode.

Chromatic snapshots every component state (every Storybook story) and flags pixel-level differences against approved baselines. Without Chromatic:

- Manual visual review of all story states is impractical at scale
- Token changes silently regress secondary states (disabled, loading, edge cases)
- Dark mode parity breaks go unnoticed until user report

With Chromatic:

- Every story state is a regression test
- Changes surface immediately with before/after visual diff
- `--trace-changed` tells the planner exactly how many stories depend on a given source file before any change is made

---

## When to use Chromatic

**Verify stage:** After the design executor runs, run Chromatic to check for visual regressions. The verify stage reads `.design/chromatic-results.json` and narrates the delta in plain English.

**Plan stage:** Before writing DESIGN-PLAN.md, run `--trace-changed` to enumerate which stories are affected by the planned token or component changes. Annotate tasks with the at-risk story count.

---

## CLI Commands (not MCP tools — Bash)

Chromatic is a CLI tool, not an MCP. All interactions are via Bash commands.

| Command | Flags | Returns | Pipeline use |
|---------|-------|---------|--------------|
| `npx chromatic` | `--project-token $TOKEN --output json` | JSON build results → `.design/chromatic-results.json` | verify: delta narration (CHR-01) |
| `npx chromatic` | `--project-token $TOKEN --trace-changed=expanded --dry-run` | Story dependency tree (stdout) | plan: change-risk scoping (CHR-02) |
| `npx chromatic` | `--project-token $TOKEN --junit-report` | JUnit XML report | CI integration (optional) |

**Exit codes:**

| Code | Meaning |
|------|---------|
| 0 | Build OK — no visual changes detected |
| 1 | Build has visual changes detected (not necessarily regressions — needs review on chromatic.com) |
| 2 | Build has errors |
| 11 | Account quota reached |

**Important:** Exit code 1 means changes were detected, NOT that an error occurred. In CI scripts, use `|| true` or check the exit code explicitly — do not treat exit code 1 as a build failure without review.

**Full verify run command:**

```bash
npx chromatic --project-token $CHROMATIC_PROJECT_TOKEN --output json 2>&1 | tee .design/chromatic-results.json
```

**TurboSnap change-risk command:**

```bash
npx chromatic --project-token $CHROMATIC_PROJECT_TOKEN --trace-changed=expanded --dry-run 2>&1
```

`--dry-run` skips publishing to the Chromatic cloud. `--trace-changed=expanded` outputs the full dependency tree showing which story files are affected by which source file changes.

---

## Which Stages Use This Connection

| Stage | Agent | Command | Purpose |
|-------|-------|---------|---------|
| verify | `agents/design-verifier.md` | `npx chromatic --project-token $TOKEN --output json` | Delta narration; visual regression flagging (CHR-01) |
| plan | `agents/design-planner.md` | `npx chromatic --project-token $TOKEN --trace-changed=expanded --dry-run` | Story-count annotation for change-risk scoping (CHR-02) |

---

## Availability Probe

Chromatic is a CLI tool — the probe is Bash-based, not ToolSearch-based.

**Step C1 — CLI presence:**

```bash
command -v chromatic 2>/dev/null || npx chromatic --version 2>/dev/null
```

- Command found → proceed to Step C2
- Not found → `chromatic: not_configured` (skip all Chromatic steps)

**Step C2 — Token check:**

```bash
test -n "${CHROMATIC_PROJECT_TOKEN}"
```

- Non-empty → `chromatic: available`
- Empty → `chromatic: unavailable` (CLI present but no project token)

**Also check:** If `storybook: not_configured` in STATE.md `<connections>`, Chromatic is effectively unavailable even if the token is present. Emit: "Chromatic requires Storybook — storybook not configured" and skip all Chromatic steps.

**Write chromatic status to `.design/STATE.md` `<connections>` after probing.**

---

## Baseline Management

Chromatic requires an approved baseline build before it can compute visual diffs. The first run establishes the baseline.

**First run behavior:**

- Every story snapshot appears with `status: "new"` — this means "first snapshot captured", NOT a regression
- All stories are automatically accepted as the baseline
- Subsequent runs compare against these accepted baselines

**Subsequent run behavior:**

- `status: "unchanged"` — story matches baseline
- `status: "changed"` — story differs from baseline (regression candidate — review required on chromatic.com)
- `status: "accepted"` — change was intentionally approved by a reviewer on chromatic.com
- `status: "new"` — new story added since last build (not a regression)
- `status: "error"` — story failed to render

**Narration rules:**

- **First run** (all entries have `status: "new"`): emit "Baseline established — no regressions detected (first run creates baseline)."
- **Subsequent runs with changes** (`status: "changed"` entries exist): emit "VISUAL REGRESSION CANDIDATES: N stories changed — review required on chromatic.com before merging."
- **Clean run** (all `status: "unchanged"` or `status: "accepted"`): emit "Visual regression check passed — all stories match baseline."

---

## Fallback Behavior

**verify stage:**

- `chromatic: unavailable` → skip delta narration; skip visual regression check; note in DESIGN-VERIFICATION.md: "Visual regression check skipped — CHROMATIC_PROJECT_TOKEN not set."
- `chromatic: not_configured` → same as unavailable; note: "Visual regression check skipped — chromatic CLI not installed (npm install --save-dev chromatic)."
- `storybook: not_configured` → skip; note: "Visual regression check skipped — Chromatic requires Storybook, which is not configured."

**plan stage:**

- `chromatic: unavailable` or `not_configured` → skip story-count annotation; design-planner proceeds without at-risk story counts.
- `storybook: not_configured` → same skip behavior.

**Graceful degradation required:** The pipeline must continue when Chromatic is unavailable. Missing visual regression data is a quality reduction, not a blocking error.

---

## STATE.md Integration

Every stage that probes Chromatic writes the result to `.design/STATE.md` under the `<connections>` section:

```xml
<connections>
figma: available
refero: not_configured
storybook: unavailable
chromatic: available
</connections>
```

**Status values:**

| Value | Meaning |
|-------|---------|
| `available` | CLI present AND `CHROMATIC_PROJECT_TOKEN` is set |
| `unavailable` | CLI present but `CHROMATIC_PROJECT_TOKEN` is empty |
| `not_configured` | CLI not found — chromatic not installed |

**Note:** Even with `chromatic: available`, if `storybook: not_configured`, Chromatic cannot run. Stages must check both statuses before invoking Chromatic.

---

## Caveats and Pitfalls

**1. First run is always 100% "new" — not regressions**

On the first Chromatic run (no existing baseline), every story registers as `status: "new"`. This is expected and correct — Chromatic is establishing the baseline, not detecting regressions. The verify stage must detect this condition (all entries `status: "new"`) and emit the baseline-establishment message rather than a regression alert.

**2. CHROMATIC_PROJECT_TOKEN security**

`CHROMATIC_PROJECT_TOKEN` grants write access to your Chromatic project (publish builds, approve snapshots). Treat it like a password:
- Set it as an environment variable in your shell profile or CI secrets
- Never commit it to git (not in source files, not in `.env`, not in configuration files)
- Never log it in CI output
- Rotate it if it is exposed

**3. Exit code 1 is not an error**

Exit code 1 means visual changes were detected — it is expected and normal after a design pass. Do not configure CI to fail on exit code 1 without a review step. Use `|| true` in scripts if you want the command to not block CI, then check the results separately.

**4. `--dry-run` and `--output json` are separate, incompatible for narration**

`--dry-run` skips publishing to Chromatic cloud — it does NOT produce chromatic-results.json. Use `--output json` (without `--dry-run`) for verify-stage narration. Use `--trace-changed=expanded --dry-run` for plan-stage scoping (which doesn't need the results file).

**5. Storybook dependency is hard**

Chromatic builds your Storybook and uploads the output to the cloud. If Storybook is not installed or `storybook build` fails, Chromatic will fail. Always check `storybook: not_configured` before attempting to run Chromatic.
