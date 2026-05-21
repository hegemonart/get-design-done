# Failure-mode matcher — empty fixture (Plan 30.5-02)

Used by `tests/failure-mode-matcher.test.cjs` to assert that an empty
catalogue produces `[]` for any input — without throwing.

This file is intentionally devoid of fenced `yaml` blocks. The matcher
must treat it as zero entries and short-circuit cleanly.

## Entries

(none — see test case "empty catalogue → returns []")
