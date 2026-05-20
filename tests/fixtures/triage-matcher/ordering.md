# Triage matcher first-match-wins fixture

Two entries whose patterns both match the same input. The matcher must
return the FIRST entry by file order, never the second.

```yaml
id: FX-FIRST
pattern: 'overlap'
diagnosis: 'First-in-file diagnosis.'
remedy: 'First remedy.'
severity: medium
```

```yaml
id: FX-SECOND
pattern: 'overlap-too'
diagnosis: 'Second-in-file diagnosis — should NEVER win when input contains both tokens.'
remedy: 'Second remedy — should NEVER be returned for overlapping input.'
severity: high
```
