---
name: debug-feedback-loops
type: heuristic
version: 1.0.0
phase: 28.5
tags: [debug, feedback-loop, deterministic-signal, iterate-on-loop, mit-port, mattpocock]
last_updated: 2026-05-18
---

Source: mattpocock/skills (MIT) — engineering/diagnose Phase 1 — adapted with permission. See `../NOTICE` for the full attribution block.

# Debug Feedback Loops

Build a feedback loop before any hypothesizing. A feedback loop is a deterministic, fast, agent-runnable pass/fail signal that tells you whether the bug is reproduced right now, every time, in well under a minute. Without it, debugging degenerates to speculation.

**Do not proceed to Phase 2 (hypothesis generation) until you have a loop you believe in.**

## The 10 construction paths

Listed in priority order — try the cheaper, faster paths first. Each entry: when to reach for it, the shape of the loop, and the verification snippet.

### 1. Failing test

The strongest signal. Write the failing test in the project's native test framework (pytest, jest, vitest, go test, cargo test, junit, rspec). Assert the buggy behavior; run with watch mode if available. When the test goes green, the bug is fixed. Best case: reproduces in under 2 seconds, runnable by a fresh agent with one command.

When to reach: the project already has a test runner the agent can invoke; the bug is in a unit/integration-testable code path; the symptom is expressible as a deterministic assertion.

### 2. `curl` against a running endpoint

For HTTP endpoints, a `curl` against the staging or local server with assertion on body/status. Pipe to `jq` for structured assertions. Cheap, reliable, framework-free. Wrap in a 3-line bash script so the loop is one command.

When to reach: the bug is in an HTTP endpoint; the server is already runnable locally; the symptom shows up in response body/status/headers.

### 3. CLI fixture

For CLI tools, a small shell script that invokes the binary with fixture inputs and `grep`s for the symptom in stdout/stderr. Bash one-liner is enough; no test framework. Capture exit code, stdout, and stderr separately.

When to reach: the bug is in a CLI tool; the symptom shows up in stdout/stderr/exit-code; the failure mode is reproducible from a fixed input.

### 4. Headless browser

For UI bugs, a Playwright or Puppeteer script that opens the page, performs the trigger action, and screenshots the symptom region. Compare against a known-good fixture or assert on a DOM selector's text/attribute. Use a deterministic seed for any randomness (animations, IDs, dates).

When to reach: the bug is visible only in a rendered browser context; DOM-level inspection isn't enough; the symptom involves layout, paint, or interaction timing.

### 5. Trace replay

For bugs reproducible from a captured execution trace, replay the trace deterministically. `rr` on Linux for native binaries, record-and-replay plugins for some browsers, Chrome DevTools recording for web, or a captured production trace for distributed systems. Replays are bit-for-bit reproducible — the gold standard for non-deterministic bugs that have been captured once.

When to reach: the bug is hard to reproduce live but you have a captured trace; the trace runtime is available; bit-identical replay is achievable.

### 6. Throwaway harness

Write a minimal `main()` that calls the buggy function with known inputs and prints the output. ~10 lines. Side-step framework startup costs entirely. Throw away when fixed. Useful when the test framework's setup is too heavy to iterate quickly.

When to reach: the bug is in a single function with a clear input/output contract; framework setup dominates iteration time; you'd rather iterate on a 10-line script than wait for the framework to boot.

### 7. Fuzz

When the bug surfaces unpredictably, use property-based testing (Hypothesis, fast-check, jqwik) or AFL/libfuzzer for native code. The fuzzer narrows on the failing input across runs. Combine with a "minimize" pass to shrink the failing input to its smallest form.

When to reach: the input space is exotic (parsers, serializers, network protocols); the bug isn't tied to a specific input you can name; you suspect a class of inputs but can't enumerate it.

### 8. Bisect

When you know "it worked on commit X, fails on commit Y," `git bisect` is the loop. Each iteration runs the test/curl/CLI from a higher path. Reproduces in O(log N) commits. Combine with `git bisect run <script>` to fully automate.

When to reach: the bug regressed between two known commits; you have a binary pass/fail script from one of the earlier paths; you don't yet know which commit introduced the regression.

### 9. Differential

When you have two systems and one's correct, write a differential harness: feed the same input to both, assert outputs match. Cheap for migration bugs (old → new implementation) and protocol bugs (your client vs reference client). The harness becomes the regression test once the bug is fixed.

When to reach: a known-good reference implementation exists; the buggy code is supposed to match the reference; input space is enumerable enough to drive both implementations side by side.

### 10. HITL bash (Human In The Loop)

Last resort. A documented sequence of bash commands a human runs that produces a pass/fail signal. Slower (human in the path), but better than no loop. The agent reads stdout/stderr; the human reads the screen and reports. Use only when no automatable signal is available — physical hardware, vendor portals, manual eyeball checks.

When to reach: every other path is blocked by an unautomatable surface; the human cost is acceptable for the duration of the investigation; the loop will be retired or upgraded the moment any earlier path becomes possible.

## Iterate on the loop itself

The loop is a first-class artifact. Iterate on it before iterating on hypotheses. A 5-minute loop run 20 times costs 100 minutes; a 5-second loop run 20 times costs 100 seconds. Spending 30 minutes tightening the loop pays back inside the same session.

- **Cache setup**: hoist expensive setup (DB seed, fixture load, container start) out of the loop body. Run the loop only on the fast inner part. Use `--no-rebuild`, persistent containers, or test-runner watch modes.
- **Narrow scope**: if the loop runs the full test suite to verify one bug, narrow to just the failing test/group. Fewer side-effects, faster iterations. `pytest -k`, `jest -t`, `vitest --testNamePattern`, `go test -run` are your friends.
- **Pin time**: when the bug is time-dependent, freeze the clock (`sinon.useFakeTimers`, `jest.useFakeTimers`, `freezegun`, `time-machine`). Removes wallclock as a variable.
- **Seed RNG**: every random source gets a fixed seed in the loop. `Math.random`, `crypto.randomBytes`, `random.seed(...)`, `rand::SeedableRng`. Determinism over coverage — the loop must be bit-identical given the same code state.
- **Isolate filesystem**: run in a `tmpdir`; reset between iterations. Avoids "fixed on my machine" via stale state. Bind-mount or copy fixtures into the tmpdir per iteration.
- **Freeze network**: mock or record/replay all outbound calls (`nock`, `vcr`, `polly.js`, `mitmproxy --replay`). Real-network loops are non-deterministic by definition.

The discipline: every iteration of the loop should be bit-identical given the same code state. If two iterations differ without a code change, the loop has a hidden input — find it and pin it before continuing.

## Non-deterministic bugs

Some bugs surface only sometimes. The goal is NOT a clean repro — the goal is to raise the reproduction rate to debuggable.

- **Measure baseline rate**: run the loop N=20 times. Note pass/fail count. Record the rate so you can tell whether later changes helped.
- **Raise stressors**: add concurrency, contention, memory pressure, network jitter (use `tc qdisc add dev lo root netem delay 100ms 50ms` on Linux, `Network Link Conditioner` on macOS). Re-measure.
- **Target the suspect axis**: if you suspect a race, add a deterministic sleep at the suspect point and measure. If reproduction jumps to 100% with sleep, the race is in that region. If it stays at baseline, the race is elsewhere.
- **A 30% reproduction rate is debuggable.** A 5% rate isn't — keep raising stressors until you cross 30%. At 30% you can iterate; at 5% you're guessing whether your fix helped or you got lucky.

## When the loop is good enough

The loop is good enough when:

- It runs in under a minute (preferably under 10 seconds).
- It's deterministic (or, for non-determinism, reproduces at least 30% of the time).
- It's automatable — no human in the inner loop except by explicit choice (Path 10).
- A fresh agent could pick up the loop and run it without context.

Only after the loop is good enough should you proceed to hypothesizing the fix. The hypothesis cycle is governed by `./debugger-philosophy.md` (one variable at a time, do not stop at first plausible cause, the bug is where you didn't look).

## Cross-references

- `./debugger-philosophy.md` — companion framing; the hypothesis-cycle discipline that runs in Phase 2 once the loop is in place.
- `../skills/debug/SKILL.md` — Phase 1 of the debug skill mandates this catalog before any hypothesis generation.
- `../NOTICE` — full mattpocock/skills MIT attribution.
