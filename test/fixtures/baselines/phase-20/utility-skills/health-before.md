---
name: gdd-health
description: "Reports .design/ artifact health — staleness, missing files, token drift, broken state transitions."
tools: Read, Bash, Glob, Grep
---

# /gdd:health

**Role:** Report the health of the `.design/` directory. Print a score and list the checks that failed.

## Checks

1. **Artifact inventory** — `ls -la .design/*.md` with size and mtime. Print a table.
2. **Missing expected artifacts** — by `stage:` in STATE.md:
   - `brief` expects BRIEF.md
   - `explore` expects DESIGN.md, DESIGN-DEBT.md, DESIGN-CONTEXT.md
   - `plan` expects DESIGN-PLAN.md
   - `design` expects DESIGN-SUMMARY.md
   - `verify` expects DESIGN-VERIFICATION.md
   FAIL per missing.
3. **Token drift** — `wc -c .design/DESIGN.md .design/DESIGN-CONTEXT.md`; approx tokens = bytes/4. WARN if combined >40000.
4. **Aged DESIGN-DEBT** — items in `.design/DESIGN-DEBT.md` not touched in >14 days (file mtime). WARN.
5. **Broken state transitions** — STATE.md `stage:` inconsistent with artifacts present (e.g. stage=`verify` but DESIGN-SUMMARY.md missing). FAIL.
6. **Pending sketch/spike wrap-ups** — any `.design/sketches/*` or `.design/spikes/*` directory lacking a SUMMARY.md. WARN.
7. **Seed germination** — scan `.design/SEEDS.md` (if present) for seeds whose trigger keywords match current STATE.md / CYCLES.md content. List as "Seed ready: <text>".

## Output

```
━━━ Design health ━━━
Artifacts:
  BRIEF.md           2.1 KB   2026-04-14
  DESIGN.md          18.4 KB  2026-04-17
  DESIGN-CONTEXT.md  7.2 KB   2026-04-17

Checks:
  [PASS] Missing artifacts
  [WARN] Token drift (42,100)
  [PASS] Aged DESIGN-DEBT
  [PASS] State transitions
  [PASS] Sketch/spike wrap-ups
  [PASS] Seed germination

Health: 5 / 6 checks passing.
━━━━━━━━━━━━━━━━━━━━━
```

## Update notice (safe-window surface)

After the health table, emit the plugin-update banner if one is present:

```bash
[ -f .design/update-available.md ] && cat .design/update-available.md
```

Written by `hooks/update-check.sh`; suppressed mid-pipeline and when the latest release is dismissed.

## HEALTH COMPLETE
