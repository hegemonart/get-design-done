# Contributing to get-design-done

Thanks for helping improve gdd. This guide documents the CI/CD contract that
keeps the plugin shippable.

## Branch strategy

While the project has a single maintainer (@hegemonart), direct pushes to
`main` are the default workflow. Branch protection is **advisory** in this
mode (CI runs but does not block). Once a contributor joins, posture shifts
to **enforcing**: all status checks must pass; linear history is required;
no force-push. See `reference/BRANCH-PROTECTION.md` for the two-phase rollout.

## PR checklist

Every PR must self-verify against `.github/pull_request_template.md`:

- [ ] Phase affected
- [ ] Version bumped? (Y/N)
- [ ] CHANGELOG updated? (Y/N)
- [ ] Baselines relocked? (Y/N)
- [ ] `npm test` passes
- [ ] Lint suite passes: `npm run lint:md && npm run validate:schemas && npm run validate:frontmatter && npm run detect:stale-refs`

## Required checks

The following CI jobs must pass before merge once branch protection is in
enforcing mode:

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

## Version-bump workflow

Phase-closeout PRs bump the plugin version:

1. Edit `.claude-plugin/plugin.json`: change `version`.
2. Edit `.claude-plugin/marketplace.json`: update BOTH `metadata.version` AND `plugins[0].version` to match.
3. Edit `package.json`: update `version` to match (keeps all three in sync).
4. Append a `## [<new-version>] — YYYY-MM-DD` section to `CHANGELOG.md` with `### Added`, `### Changed`, `### Fixed` subsections as applicable.
5. Commit, merge to `main`.
6. On merge, `.github/workflows/release.yml` detects the plugin.json diff, creates the `v<new-version>` tag, creates the GitHub Release with the CHANGELOG section as body, and runs the release smoke test against the current phase's baseline.

## Baseline relock how-to

Baselines live at `test-fixture/baselines/phase-<N>/`. If a phase changes
agent behavior such that the release smoke test would flag a diff, relock
the baseline as part of the phase-closeout PR:

1. Rerun the deterministic portion of `/gdd:explore` on `test-fixture/src/`:

   ```bash
   TMPDIR=$(mktemp -d)
   cp -r test-fixture/src/* "$TMPDIR/"
   (cd "$TMPDIR" && node "$OLDPWD/scripts/build-intel.cjs" .)
   ```

2. Copy the resulting `.design/intel/*.json` plus any `DESIGN-CONTEXT.md` fragments into `test-fixture/baselines/phase-<N>/`.
3. Write a short `BASELINE.md` in the new phase directory documenting what changed vs the prior baseline.
4. Update `scripts/release-smoke-test.cjs` + `.github/workflows/release.yml` release-smoke-test step if the artifact shape changed.
5. Include the baseline commit in the phase-closeout PR.

## Adding CI checks

New CI checks go in `.github/workflows/ci.yml`. Follow the existing
job-separation pattern (lint / validate / test / security / size-budget).
New required checks must also be added to:

- `reference/BRANCH-PROTECTION.md` §Phase B contexts list
- `scripts/apply-branch-protection.sh` enforcing branch

## Local dev loop

```bash
npm test                      # run all tests
npm run lint:md               # markdown lint
npm run validate:schemas      # JSON schema validation
npm run validate:frontmatter  # agent frontmatter contract
npm run detect:stale-refs     # legacy namespace detector
npm run scan:injection        # prompt-injection scanner
npm run test:size-budget      # agent size budget only
```

## Rolling back a release

If a release ships with a broken pipeline:

```bash
bash scripts/rollback-release.sh <version>
```

This prompts for confirmation, then deletes the tag + GitHub Release.
Manual-only per D-22 — auto-rollback is intentionally not implemented.
