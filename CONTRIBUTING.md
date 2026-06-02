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

The baseline lives at `test-fixture/baselines/current/` and is updated
in-place — no new phase subdirectories are created. If a change adds,
renames, or removes agents/skills/connections, or changes `build-intel.cjs`
output, relock as part of the closeout PR. Full procedure in
`test-fixture/baselines/current/README.md`. In short:

```bash
git ls-files agents/ | grep 'design-.*\.md' | xargs -I{} basename {} | sort \
  > test-fixture/baselines/current/agent-list.txt
git ls-files skills/ | awk -F/ 'NF>=2{print $2}' | sort -u \
  > test-fixture/baselines/current/skill-list.txt
ls connections/*.md | xargs -I{} basename {} | sort \
  > test-fixture/baselines/current/connection-list.txt
node -e "process.stdout.write(require('./.claude-plugin/plugin.json').version + '\n')" \
  > test-fixture/baselines/current/plugin-version.txt
```

Then update `BASELINE.md`, run `npm test`, and include the updated
`current/` in your PR.

## How to add a pressure scenario

The skill-behavior harness (Phase 33) tests whether a skill holds **under
pressure** (time / sunk-cost / authority / exhaustion / scope-minimization),
complementing the static validators. To add a scenario:

1. **Author the manifest** under `test/suite/skill-behavior/scenarios/<skill>.json`,
   conforming to [`reference/schemas/pressure-scenario.schema.json`](reference/schemas/pressure-scenario.schema.json).
   It names the target skill, the pressure prompt, the `expected_compliance[]`
   regexes (must all match a compliant response) and the `expected_violations[]`
   regexes (any match = a violation). Run `npm run validate:schemas` to check it.
2. **Add a synthetic RED baseline** under `test/fixtures/skill-behavior-baseline/<skill>.md`
   — a "synthetic-from-observed-cycle-drift" example of the agent rationalizing
   its way out of the skill (the failing-without-the-skill case the skill must
   counter).
3. **Wire it into the structural tests.** The stub-driven tests
   (`test/suite/skill-behavior-scenarios.test.cjs`) pick up new manifests in the
   scenarios dir; run `npm test` to confirm the manifest is valid and the stub
   path stays green. The structural (stub) tests run in the default suite and CI.
4. **Run the live behavior pass (opt-in, key-gated — D-06).** Live agent runs are
   **not** in the default `npm test` (LLM non-determinism). To run them you need
   `ANTHROPIC_API_KEY` and a wired invoker:

   ```bash
   ANTHROPIC_API_KEY=sk-... GDD_BEHAVIOR_INVOKER=./path/to/invoker.cjs npm run test:behavior
   ```

   The invoker is a module exporting `invokeAgent(prompt, opts) -> { text }` (a
   peer-CLI ACP spawn of a local `claude`/`codex`, or a thin keyed SDK adapter);
   the harness itself ships no Anthropic SDK dependency (D-03). Without the key the
   command prints a skip message and exits 0.

The description-format A/B methodology lives at
[`docs/research/description-format-ab.md`](docs/research/description-format-ab.md).

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

## Editorial style (Phase 43)

The project holds its own prose to an editorial floor. `npm run lint:prose` (CI-gated) fails on em
dashes, prose double hyphens, and AI-prose tells (load-bearing, leverage, robust, seamless, ...) in
`README.md`, `README.*.md`, `SKILL.md`, `source/skills/**`, `agents/**`, `CHANGELOG.md`, and
`reference/**` (bodies AND frontmatter `description` fields). The full ruleset + rationale lives in
`STYLE.md`, which is GENERATED from `scripts/lib/manifest/prose-denylist.json` (run `npm run build:style`;
CI drift-gates it via `build:style:check`).

What is skipped: fenced and inline code, YAML frontmatter delimiters, HTML comments, and Cyrillic-majority
files (the denylist is English-only in v1). Put CLI flags in `code` spans. For a genuine quote that must
contain a banned token, wrap it in `<!-- prose-lint-disable -->` ... `<!-- prose-lint-enable -->`.

Replace an em dash with a comma, a colon, parentheses, or a spaced hyphen. Do not edit `skills/` or
`dist/` by hand (Phase 42 makes them generated); edit `source/skills/` and run `npm run build:skills`.
