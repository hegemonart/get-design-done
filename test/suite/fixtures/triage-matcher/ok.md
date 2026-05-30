# Triage matcher OK fixture

Two well-formed entries for "happy-path" tests.

```yaml
id: FX-001
pattern: 'EACCES.*\.design'
diagnosis: 'Permission denied writing to .design/.'
remedy: 'Fix the directory ownership and retry.'
severity: medium
```

```yaml
id: FX-002
pattern: 'spawn gh ENOENT'
diagnosis: 'gh CLI is not installed.'
remedy: 'Install gh from https://cli.github.com.'
severity: low
```
