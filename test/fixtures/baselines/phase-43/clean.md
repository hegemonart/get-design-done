# Clean fixture

This prose has no banned tokens. CLI flags live in code spans like `--json` and `--dry-run`.
A spaced hyphen - used as a separator - reads fine and is allowed.

A fenced command block is skipped entirely:

```bash
git log --oneline --after="x" -- .design/ 2>/dev/null | head
```

That is all.
