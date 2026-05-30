# Failure-mode matcher — full fixture (Plan 30.5-02)

Five entries with distinct, realistic symptom/root_cause text drawn
from synthetic scenarios (ENOENT, EACCES, EMFILE, ECONNRESET, EPIPE).
Used by scoring + dominance tests. Synthetic content only — no copy
from `reference/known-failure-modes.md`, no real stack traces, no PII
(D-10).

All IDs use the synthetic `FIX-` prefix.

## Entries

```yaml
id: FIX-101
pattern: 'ENOENT|no such file or directory'
symptom: 'A file or directory was referenced but does not exist on disk.'
root_cause: 'The referenced path was deleted, renamed, or never created before the operation.'
fix: 'Verify the path with stat or ls; create the directory before writing into it.'
severity: medium
propose_report: false
```

```yaml
id: FIX-102
pattern: 'EACCES|permission denied'
symptom: 'A filesystem operation failed because the user lacks access rights.'
root_cause: 'Ownership or mode bits on the target path forbid the requested action.'
fix: 'Run chmod or chown to grant write access, or invoke the operation as the correct user.'
severity: medium
propose_report: false
```

```yaml
id: FIX-103
pattern: 'EMFILE|too many open files'
symptom: 'The process exhausted its file-descriptor budget before completing.'
root_cause: 'A loop or pool opened handles faster than they were closed; ulimit was reached.'
fix: 'Audit handle lifecycle, close streams promptly, or raise the process ulimit.'
severity: high
propose_report: false
```

```yaml
id: FIX-104
pattern: 'ECONNRESET|connection reset by peer'
symptom: 'The remote peer terminated an in-flight TCP connection unexpectedly.'
root_cause: 'A network intermediary, the remote host, or a load balancer dropped the socket mid-transfer.'
fix: 'Retry with exponential backoff; check upstream health and any idle-connection limits.'
severity: medium
propose_report: false
```

```yaml
id: FIX-105
pattern: 'EPIPE|broken pipe'
symptom: 'A write to a stream failed because the reader closed its end.'
root_cause: 'The downstream consumer terminated before the producer finished writing.'
fix: 'Handle EPIPE on the writer; flush early; ensure consumers stay alive long enough.'
severity: low
propose_report: false
```
