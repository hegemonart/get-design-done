---
name: debug-feedback-loops
type: heuristic
version: 1.0.0
phase: 28.5
tags: [debug, feedback-loop, deterministic-signal, iterate-on-loop, mit-port, mattpocock]
last_updated: 2026-05-18
---

Source: mattpocock/skills (MIT) — adapted with permission. See `../NOTICE` for the full attribution block.

# Debug Feedback Loops

**Scaffold note (Phase 28.5-07).** This file is created empty-of-content in Plan 28.5-07
solely to register the cross-link from `skills/debug/SKILL.md`. The full content — the
10 priority-ordered construction paths, the "iterate on the loop itself" discipline, and
the non-deterministic-bug branch — lands in Plan 28.5-09 (Wave C `debug` Phase 1 content
patch). Until 28.5-09 lands, this file is intentionally a skeleton: section headings are
present so consumers (`skills/debug/SKILL.md`) and the reference-registry round-trip stay
honest, but the practitioner catalog is deliberately absent.

## Overview

A debug feedback loop is the smallest, fastest, most deterministic signal that tells you
whether a hypothesized fix actually worked. mattpocock's framing: before you start
investigating, you build the loop. Before you build the loop, you decide what signal you
want. The 10 construction paths catalog the concrete options.

## 10 construction paths (in priority order — content arrives in 28.5-09)

The following ten paths are filled in by Plan 28.5-09. Each carries a one-paragraph
description, a "when to use it" trigger, and a verification snippet. Order is priority —
prefer earlier paths over later paths when more than one would work.

1. **Failing test** — *(content arrives in 28.5-09)*
2. **`curl` against a real endpoint** — *(content arrives in 28.5-09)*
3. **CLI fixture replay** — *(content arrives in 28.5-09)*
4. **Headless browser snapshot** — *(content arrives in 28.5-09)*
5. **Trace replay from production** — *(content arrives in 28.5-09)*
6. **Throwaway harness script** — *(content arrives in 28.5-09)*
7. **Property-based / fuzz** — *(content arrives in 28.5-09)*
8. **Bisect against a known-good commit** — *(content arrives in 28.5-09)*
9. **Differential against a reference implementation** — *(content arrives in 28.5-09)*
10. **HITL bash transcript** — *(content arrives in 28.5-09)*

## Iterate on the loop itself

mattpocock's second discipline: when the loop is slow, flaky, or expensive, *iterate on
the loop before you iterate on the bug*. A 5-minute loop run 20 times costs 100 minutes;
a 5-second loop run 20 times costs 100 seconds. Investing 30 minutes to tighten the loop
pays back inside the same session. Content arrives in 28.5-09.

## Non-deterministic-bug branch

When the symptom does not reproduce on demand, the loop is "run it N times, count
failures, compare to the no-change rate." Content arrives in 28.5-09.

## Cross-references

- `./debugger-philosophy.md` — companion file; the framing five-principle list. This file
  is the practitioner catalog, `debugger-philosophy.md` is the framing.
- `../skills/debug/SKILL.md` — Phase 1 of the `gdd-debug` skill consumes this catalog at
  loop-construction time.
- `../NOTICE` — full mattpocock/skills MIT attribution.
