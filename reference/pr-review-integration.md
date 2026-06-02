# PR Review Integration - the gh-based contract for `agents/pr-commenter.md`

How GDD surfaces verify/audit output **inline on a pull request** and as a **status check**, using the `gh` CLI only (no GitHub SDK, no network library). `agents/pr-commenter.md` posts against this contract after `/gdd:ship` creates the PR. Every outbound string is redacted first; every failure mode degrades to a noop (never fails the ship).

---

## Resolve target

```bash
gh repo view --json nameWithOwner -q .nameWithOwner   # owner/repo
# PR number: supplied by /gdd:ship; or: gh pr view --json number,headRefOid -q '.number, .headRefOid'
```

`head_sha` (the PR head commit) is required for the check-run; get it from `gh pr view --json headRefOid`.

## Inline review comments (changed-line findings)

For a finding that maps to a changed `path` + `line`, post an inline comment:

```bash
gh api repos/{owner}/{repo}/pulls/{number}/comments \
  -f body="$SAFE_BODY" -f commit_id="$HEAD_SHA" -f path="src/Button.tsx" \
  -F line=42 -f side=RIGHT
```

- `body` - **redacted** finding text: the rule/pillar (`WCAG 1.4.3` / `audit:color`), the observation, a one-line suggested fix.
- `path` + `line` + `side=RIGHT` - the changed line locus (RIGHT = the new version).
- One comment per located finding. Findings with **no** changed-line locus go into a single summary review (below), not scattered.

## Summary review (findings without a line locus)

```bash
gh api repos/{owner}/{repo}/pulls/{number}/reviews \
  -f body="$SAFE_SUMMARY" -f event=COMMENT
```

`event=COMMENT` (never `REQUEST_CHANGES`/`APPROVE` - GDD does not gate human approval). The summary lists verify pass/fail counts + the unlocated findings.

## The `gdd/design-review` check-run (the team gate)

```bash
gh api repos/{owner}/{repo}/check-runs \
  -f name="gdd/design-review" -f head_sha="$HEAD_SHA" -f status=completed \
  -f conclusion="$CONCLUSION" \
  -f output[title]="GDD design review" -f output[summary]="$SAFE_SUMMARY"
```

- `conclusion`: **`success`** = verify passed AND no blocker-level pillar AND a11y-gate not failed; **`failure`** = verify failed OR a11y-gate failed; **`neutral`** = verify incomplete / degraded.
- `output.summary` (redacted) carries: per-pillar audit scores (from `.design/DESIGN-AUDIT.md`), verify pass/fail (from `.design/DESIGN-VERIFICATION.md`), and the a11y-gate result.

**Making it a required check (the team step - GDD never force-edits branch protection):** a maintainer enables `gdd/design-review` as a required status check via repo Settings → Branches, or via the bundled helper:

```bash
scripts/apply-branch-protection.sh --require-check "gdd/design-review"
```

GDD only **registers** the check-run; requiring it is an explicit, consent-driven repo-settings action.

## Screenshot-pair attachment (degrade)

When `.design/STATE.md` `<connections>` shows `preview: available` or `chromatic: available` AND a before-after image pair exists for a changed surface, embed the image refs in the inline/summary comment body (Markdown image syntax pointing at the uploaded/hosted artifact URLs the connection produced). When **absent** → text-only comment. Never a precondition; never block on a missing screenshot.

## Redaction (mandatory)

Every `$SAFE_*` body above is produced by `scripts/lib/redact.cjs`:

```js
const { redact } = require('scripts/lib/redact.cjs');
const SAFE_BODY = redact(rawBody);   // strips API keys / tokens / secrets (11 patterns, Phase 22 + 33.5)
```

No raw artifact excerpt reaches `gh` un-redacted.

## Kill-switch

`pr-commenter` is a noop when **either**:

- env `GDD_DISABLE_PR_COMMENTER=1`, or
- `.design/config.json` has `"pr_commenter": { "enabled": false }`.

`gsd-health` surfaces the enabled/disabled state (mirrors the Phase 30 issue-reporter kill-switch).

## Degrade-to-noop matrix

| Condition | Behavior |
|---|---|
| kill-switch on | noop + "pr-commenter disabled" note |
| `gh` absent / unauthenticated | print assembled bodies for manual paste; no error |
| no PR number (manual/failed creation) | noop + one-line note |
| a single `gh api` call fails (≤3 attempts) | print that body; continue with the rest |

In all cases pr-commenter exits cleanly - it **never** fails the `/gdd:ship` success path.

## Out of scope (per Phase 35 split)

Slack/Discord notifications (Phase 35.2); Linear/Jira ticket-sync (Phase 35.3); `pseudonymize.cjs` (Phase 30 - wired for third-party channels); video walkthroughs (still images only); a GDD-side approver list (branch protection owns approvals).
