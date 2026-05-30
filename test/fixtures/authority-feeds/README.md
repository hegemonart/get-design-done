# Authority-Feeds Fixtures

Deterministic mock feeds for the authority-watcher CI diff test (`scripts/tests/test-authority-watcher-diff.sh`, shipped in Plan 13.2-04). These fixtures let the watcher run end-to-end in CI without touching the network.

## Files

| File | Format | Kind coverage |
|---|---|---|
| `wai-aria-apg.atom` | Atom 1.0 | `spec-source` |
| `radix-ui-releases.atom` | Atom 1.0 | `component-system` |
| `nng-articles.rss` | RSS 2.0 | `research` |
| `arena-channel-sample.json` | Are.na v2 API body | `arena` |

`named-practitioner` is intentionally excluded — the other four kinds exercise every branch of the classification decision table (D-17) in `agents/design-authority-watcher.md`. A practitioner fixture would add maintenance cost without covering new rules.

## Determinism contract

No field in any fixture is permitted to vary across runs. No timestamps newer than `2026-04-18T00:00:00Z`. No randomness. No inline comments whose content depends on the current time. Byte-stability is load-bearing for Plan 13.2-04's baseline comparison.

## How the watcher is run against these fixtures

Plan 13.2-04 ships the diff-test wrapper. It invokes the watcher with an override map that rewrites whitelist `url:` values to `file://test-fixture/authority-feeds/<filename>` at runtime. The watcher's fetch loop accepts the `file://` scheme via `WebFetch` (or a local-read adapter) without changes to the agent body. See the diff-test plan for the exact wiring.
