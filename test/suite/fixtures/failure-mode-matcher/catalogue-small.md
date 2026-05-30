# Failure-mode matcher — small fixture (Plan 30.5-02)

Three entries, used by topN-clamping + ambiguity tests. Synthetic
content only — no copy from `reference/known-failure-modes.md`, no
real stack traces, no PII (D-10).

All IDs use the synthetic `FIX-` prefix to make them grep-distinguishable
from the production catalogue.

## Entries

```yaml
id: FIX-001
pattern: 'timeout|elapsed|deadline'
symptom: 'Operation exceeded the configured timeout before completing.'
root_cause: 'The remote endpoint is slow or unreachable; the local deadline elapsed first.'
fix: 'Increase the timeout, retry with backoff, or check the remote host responsiveness.'
severity: medium
propose_report: false
```

```yaml
id: FIX-002
pattern: 'permission denied|EACCES'
symptom: 'Filesystem write rejected with a permission-denied error.'
root_cause: 'The current user lacks write access to the target path.'
fix: 'Adjust file ownership with chown or run as a user with write privileges.'
severity: medium
propose_report: false
```

```yaml
id: FIX-003
pattern: 'syntax error|unexpected token'
symptom: 'Parser refused the input due to a malformed token.'
root_cause: 'Source text violates the expected grammar for the active mode.'
fix: 'Validate the input against the documented grammar and fix the highlighted token.'
severity: low
propose_report: false
```
