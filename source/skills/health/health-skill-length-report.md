# Health skill — skill-length report subsection

Phase 28.5-11 / D-11 reference. Read by `skills/health/SKILL.md` to render the
"Skill-length report" subsection after the standard health checks.

## JSON shape (from `validate-skill-length.cjs --quiet --json`)

```jsonc
{
  "summary": {
    "total":    70,   // number of SKILL.md files under skills/
    "clean":    70,   // skills with 0 errors and 0 warnings
    "warnings": 0,    // skills with >=100 lines but <250 (D-01 warn band)
    "blockers": 0     // skills with any block-level error (>=250 lines,
                      //   missing frontmatter field, description out of
                      //   range, disable-model-invocation non-whitelisted)
  },
  "skills": [
    {
      "name": "...",           // skill folder name (matches skills/<name>/SKILL.md)
      "path": "...",           // absolute path to the file on disk
      "lines": 0,              // wc -l semantics
      "descriptionLength": 0,  // length of frontmatter.description string
      "hasRequiredFields": true,
      "level": "clean",        // "clean" | "warn" | "block"
      "errors": [{ "code": "...", "message": "..." }],
      "warnings": [{ "code": "...", "message": "..." }],
      "reasons": ["..."]       // human-readable summary lines
    }
  ]
}
```

## Render contract

The health skill prints two lines after the existing checks table:

```
Skill-length: <total> total | <clean> clean | <warnings> warn (>=100) | <blockers> block (>=250)
  All skills within contract.
```

If `summary.blockers > 0`, replace the second line with one indented row per
blocker entry (skills where `level === "block"`):

```
Skill-length: 70 total | 67 clean | 2 warn (>=100) | 1 block (>=250)
  - <name> (<lines> lines)
```

## Thresholds (D-01)

- `warn >=100` — skill flagged as advisory; CI emits `::warning::` annotation
  but does not fail the build.
- `block >=250` — skill flagged as blocker; CI emits `::error::` and fails
  the build via exit code 2.

## Strict description-format (D-02)

`STRICT_DESCRIPTION=1` / `--strict-description` is OFF by default. Phase 33
will graduate the strict `<what>. Use when <triggers>.` regex from advisory
to hard-block based on A/B evidence at
`.design/research/description-format-ab.md`.

## Cross-link from health

- `skills/health/SKILL.md` — emits the report after the main checks table.
- `scripts/validate-skill-length.cjs` — provides the JSON.
- `tests/phase-28.5-baseline.test.cjs` — locks the post-rework distribution.
