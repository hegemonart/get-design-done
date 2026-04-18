# Branch Protection — Two-Phase Rollout

Per D-16 / D-17: branch protection on `main` is rolled out in two phases. The
repo admin applies each phase manually via `scripts/apply-branch-protection.sh`
(no CI automation — avoids leaking repo admin credentials).

## Phase A — Advisory (initial state)

Status checks **run** on every push, but they are **not required to merge**.
This is the default posture while CI stabilizes and baselines are established.

Apply:

```bash
bash scripts/apply-branch-protection.sh --advisory
```

Effects:

- Required status checks: **none** (checks run but don't block)
- `main` accepts direct pushes (the solo maintainer's existing workflow)
- Force-push: allowed by admins

## Phase B — Enforcing (after first clean release)

After the first full release cycle ships clean (plan 13-06 / 13-07 smoke test
passes on a real tag + GitHub Release), tighten to enforcing.

Apply:

```bash
bash scripts/apply-branch-protection.sh --enforcing
```

Effects:

- Required status checks (all must pass to merge):
  - `Lint (markdown + frontmatter + stale-refs)`
  - `Validate (schemas + plugin + shellcheck)`
  - `Test (Node 22 / ubuntu-latest)`
  - `Test (Node 22 / macos-latest)`
  - `Test (Node 22 / windows-latest)`
  - `Test (Node 24 / ubuntu-latest)`
  - `Test (Node 24 / macos-latest)`
  - `Test (Node 24 / windows-latest)`
  - `Security (secrets + injection scan)`
  - `Size budget (blocking)`
- Require linear history (no merge commits)
- Disallow force-push
- Admins still bypass for emergency fixes (logged)

## When to promote Phase A → Phase B

- [ ] Wave A + B of Phase 13 merged to main
- [ ] `release.yml` (plan 13-06) merged and triggered at least once successfully
- [ ] Release smoke test (plan 13-07) passed on a real tag
- [ ] Baseline lock (plan 13-08) committed

When all four are true, run `apply-branch-protection.sh --enforcing`.

## Rollback

To revert either phase: `apply-branch-protection.sh --disable` removes all
protection rules. Use only if a protection misconfiguration is blocking a
legitimate merge.
