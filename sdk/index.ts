// sdk/index.ts — public SDK barrel (SC#15, D-04).
//
// Storybloq-style two-line-per-module re-export of the public SDK surface.
// The documented import contract (sdk/README.md, D-04) prefers EXPLICIT
// per-module paths (`@hegemonart/get-design-done/sdk/state`, `/sdk/cli`, …);
// this barrel exists for callers who want a single entry point.
//
// NOTE: `state` re-exports the three taxonomy error classes
// (TransitionGateFailed, LockAcquisitionError, ParseError) verbatim from
// `errors`, so the overlapping names resolve to a single shared binding —
// `export *` keeps them (no ambiguity, since both paths point at the same
// identity). The full public surface (read/mutate/transition, appendEvent/
// getWriter/…, the GDDError taxonomy, the CLI dispatch/main/USAGE) is
// reachable through this barrel and through the explicit per-module paths.

export * from './state/index.ts';
export * from './event-stream/index.ts';
export * from './errors/index.ts';
export * from './cli/index.ts';
