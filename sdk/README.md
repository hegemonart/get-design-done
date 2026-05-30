# `@hegemonart/get-design-done` SDK

The SDK is the typed, runtime-tested core that the GDD pipeline and both MCP
servers are built on. It is plain TypeScript run under Node 22+
`--experimental-strip-types` (no build step). Five concerns live here: the
**`gdd-state` MCP server** (11 typed STATE.md tools over stdio), **lockfile-safe
STATE.md** read / mutate / transition, the **append-only event stream** (JSONL +
in-process bus), the four **resilience primitives** (`.cjs` + `.d.cts`), and the
headless **`gdd-sdk` CLI**.

## Import contract (D-04)

Prefer the **explicit per-module path** for the surface you need. The
`sdk/index.ts` barrel re-exports state / event-stream / errors / cli for callers
who want one entry point; the bare-package root import is reserved for the
install bin. Every path below is importable from the published package.

| Module          | Public import                                       | Helpers (key exports)                                                                 | Stability |
| --------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------- | --------- |
| cli             | `@hegemonart/get-design-done/sdk/cli`               | `dispatch`, `main`, `USAGE`, `DispatcherDeps`                                          | beta      |
| state           | `@hegemonart/get-design-done/sdk/state`             | `read`, `mutate`, `transition`, `ParsedState`, `Stage`                                | beta      |
| event-stream    | `@hegemonart/get-design-done/sdk/event-stream`      | `appendEvent`, `getWriter`, `getBus`, `subscribe`, `subscribeAll`, `reset`, `readEvents`, `aggregate`, `EventBus`, `EventWriter`, `KNOWN_EVENT_TYPES` | beta      |
| errors          | `@hegemonart/get-design-done/sdk/errors`            | `GDDError`, `ValidationError`, `StateConflictError`, `OperationFailedError`, `TransitionGateFailed`, `LockAcquisitionError`, `ParseError` | beta      |
| primitives/error-classifier   | `@hegemonart/get-design-done/sdk/primitives/error-classifier`   | `classify`, `FailoverReason`                              | stable    |
| primitives/iteration-budget   | `@hegemonart/get-design-done/sdk/primitives/iteration-budget`   | `consume`, `refund`, `remaining`, `reset`, `IterationBudgetExhaustedError` | stable    |
| primitives/jittered-backoff   | `@hegemonart/get-design-done/sdk/primitives/jittered-backoff`   | `delayMs`, `sleep`, `DEFAULTS`                            | stable    |
| primitives/lockfile           | `@hegemonart/get-design-done/sdk/primitives/lockfile`           | `acquire`, `renameWithRetry`                              | stable    |
| mcp/gdd-state   | `@hegemonart/get-design-done/sdk/mcp/gdd-state`     | `buildServer` (server.ts) — 11 STATE.md tools over stdio                              | beta      |

The barrel: `import { read, appendEvent, ValidationError } from '@hegemonart/get-design-done/sdk'`.

## Notes

- **Primitives are `stable`** (D-05): they ship as `.cjs` + `.d.cts` pairs and
  are the most-imported surface; the TS migration is a separate phase.
- **`state` re-exports the three error classes** (`TransitionGateFailed`,
  `LockAcquisitionError`, `ParseError`) from `errors` verbatim, so importing
  them from either path yields the same identity.
- The event stream persists to `.design/telemetry/events.jsonl`; `appendEvent`
  is persist-first / broadcast-second and never throws on the persist path.
- `mutate()` / `transition()` take an advisory sibling lockfile; one process per
  `.design/` is the design contract.

See `connections/gdd-state.md` for the MCP wiring and the runtime fallback that
imports the `state` module directly when the MCP is `not_configured`.
