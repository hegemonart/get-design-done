## Summary

<!-- 1-3 bullet points describing what changed and why. -->

-
-

## Checklist — self-review gate

- [ ] **Phase affected**: <!-- phase-NN name, or "none / utility" -->
- [ ] **Version bumped?** (Y/N) — required for phase closeout PRs; set Y + update `.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json`
- [ ] **CHANGELOG updated?** (Y/N) — append a `## [<version>]` section when Y
- [ ] **Baselines relocked?** (Y/N) — re-run `/gdd:explore` on `test-fixture/src/` and copy `.design/` artifacts into `test-fixture/baselines/phase-<N>/` if agent behavior changed
- [ ] **Tests pass** locally: `npm test` exits 0
- [ ] **Lint clean**: `npm run lint:md && npm run validate:schemas && npm run validate:frontmatter && npm run detect:stale-refs` exits 0

## Risk notes

<!-- Anything reviewers should double-check: migration paths, breaking changes, newly-introduced external deps. -->

## Release impact

<!-- If this PR bumps plugin.json version, the release workflow will auto-tag + create a GitHub Release on merge to main.
     Confirm CHANGELOG.md has a `## [<new-version>]` section before merging. -->
