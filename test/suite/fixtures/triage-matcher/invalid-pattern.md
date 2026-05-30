# Triage matcher invalid-pattern fixture

First entry has a deliberately unparseable regex; matcher must skip it,
warn once, and continue evaluating subsequent entries.

```yaml
id: FX-BAD
pattern: '[unterminated'
diagnosis: 'should never be returned'
remedy: 'should never be returned'
severity: low
```

```yaml
id: FX-GOOD
pattern: 'recoverable token'
diagnosis: 'Valid entry following an invalid one — must still match.'
remedy: 'Confirm the matcher skipped the invalid entry and reached this one.'
severity: medium
```
