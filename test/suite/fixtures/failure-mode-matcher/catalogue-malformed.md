# Failure-mode matcher — malformed fixture (Plan 30.5-02)

Two entries: one valid (`FIX-V01`), one whose `pattern` contains an
invalid regex. The matcher must skip the broken entry without throwing
and return only the valid one. Synthetic content only (D-10).

## Entries

```yaml
id: FIX-V01
pattern: 'disk full|ENOSPC'
symptom: 'A write failed because the underlying volume is out of free space.'
root_cause: 'Filesystem inodes or blocks are exhausted on the mount point.'
fix: 'Free up disk space or expand the volume, then retry the operation.'
severity: high
propose_report: false
```

```yaml
id: FIX-V02
pattern: '[unterminated character class'
symptom: 'This entry is deliberately broken to exercise the skip-on-error path.'
root_cause: 'Regex compilation should fail; downstream entries must still be considered.'
fix: 'Parser must drop this entry and continue.'
severity: low
propose_report: false
```
