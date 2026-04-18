---
phase: 10-knowledge-layer
version: 1.0.4
locked: 2026-04-18
---

# Phase 10 Regression Baseline

Locked at plugin v1.0.4 after Phase 10 (Knowledge Layer) completion.

## Tracked file counts

| Category | Count | Notes |
|----------|-------|-------|
| Agents (agents/*.md excl. README) | 25 | +3 from phase 10: gdd-intel-updater, gdd-learnings-extractor, gdd-graphify-sync |
| Skill directories (skills/*) | 47 | +3 from phase 10: analyze-dependencies, skill-manifest, extract-learnings |
| Reference files (reference/*.md) | 15 | +1 from phase 10: intel-schema.md |
| Connection docs (connections/*.md) | 3 | Unchanged from phase 6 baseline |
| Scripts (scripts/*.cjs) | 1 | +1 from phase 10: build-intel.cjs |
| Hooks (hooks/*.js) | 2 | +1 from phase 10: context-exhaustion.js |

## Agents present at baseline

- a11y-mapper.md
- component-taxonomy-mapper.md
- design-advisor.md
- design-assumptions-analyzer.md
- design-auditor.md
- design-context-builder.md (modified: added intel reads)
- design-context-checker.md
- design-discussant.md
- design-doc-writer.md
- design-executor.md (modified: added intel reads)
- design-figma-writer.md
- design-fixer.md
- design-integration-checker.md
- design-pattern-mapper.md
- design-phase-researcher.md (modified: added ARM + flow diagram directives + intel reads)
- design-plan-checker.md
- design-planner.md (modified: added intel reads)
- design-research-synthesizer.md
- design-verifier.md (modified: added intel reads)
- gdd-graphify-sync.md (new)
- gdd-intel-updater.md (new)
- gdd-learnings-extractor.md (new)
- motion-mapper.md
- token-mapper.md
- visual-hierarchy-mapper.md

## Skill directories present at baseline

analyze-dependencies, add-backlog, audit, brief, compare, complete-cycle, darkmode,
debug, design, discover, discuss, do, explore, extract-learnings, fast, figma-write,
health, help, list-assumptions, map, new-cycle, new-project, next, note, pause,
plan, plant-seed, pr-branch, progress, quick, reapply-patches, resume, review-backlog,
scan, settings, ship, sketch, sketch-wrap-up, skill-manifest, spike, spike-wrap-up,
stats, style, todo, undo, update, verify

## Reference files present at baseline

accessibility.md, anti-patterns.md, audit-scoring.md, checklists.md, config-schema.md,
debugger-philosophy.md, heuristics.md, intel-schema.md (new), motion.md,
parallelism-rules.md, priority-matrix.md, project-skills-guide.md, review-format.md,
STATE-TEMPLATE.md, typography.md

## New infrastructure files

- `scripts/build-intel.cjs` — intel store builder
- `hooks/context-exhaustion.js` — context exhaustion PostToolUse hook
- `reference/intel-schema.md` — ten-slice intel store schema

## Regression checks (run after each future phase)

```bash
# Agent count (excluding README.md)
actual=$(ls agents/*.md | grep -v README | wc -l)
expected=25
[ "$actual" -ge "$expected" ] && echo "PASS agents ($actual)" || echo "FAIL agents: expected $expected got $actual"

# Skill dir count
actual=$(ls -d skills/*/ | wc -l)
expected=47
[ "$actual" -ge "$expected" ] && echo "PASS skills ($actual)" || echo "FAIL skills: expected $expected got $actual"

# Reference count
actual=$(ls reference/*.md | wc -l)
expected=15
[ "$actual" -ge "$expected" ] && echo "PASS reference ($actual)" || echo "FAIL reference: expected $expected got $actual"

# Version check
version=$(node -e "console.log(require('./.claude-plugin/plugin.json').version)")
echo "Plugin version: $version"

# Intel schema present
[ -f reference/intel-schema.md ] && echo "PASS intel-schema.md" || echo "FAIL intel-schema.md missing"

# Build intel script present
[ -f scripts/build-intel.cjs ] && echo "PASS build-intel.cjs" || echo "FAIL build-intel.cjs missing"

# Hook present
[ -f hooks/context-exhaustion.js ] && echo "PASS context-exhaustion.js" || echo "FAIL context-exhaustion.js missing"
```

## Prior phase baselines

- Phase 6 baseline: 14 agents, 12 skill dirs, 3 connection docs at v1.0.0
- Phase 10 baseline (this file): 25 agents, 47 skill dirs at v1.0.4
