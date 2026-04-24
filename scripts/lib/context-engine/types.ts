// scripts/lib/context-engine/types.ts — typed shapes for the context-engine
// module. The context-engine deterministically assembles the per-stage file
// manifest a headless Phase 21 session needs. Types are data-only; all
// behavior lives in sibling modules (manifest.ts, truncate.ts, index.ts).

/**
 * Pipeline stage identifier. Mirrors the `stage` field in `.design/STATE.md`
 * and the orchestrator routes in skills/*. The `init` stage is headless-only —
 * it prepares a fresh working directory before the `brief` stage begins.
 */
export type Stage = 'brief' | 'explore' | 'plan' | 'design' | 'verify' | 'init';

/**
 * Per-file record inside a {@link ContextBundle}. Captures both raw on-disk
 * size and post-truncation content size so callers can preview prompt budget
 * before invoking the Agent SDK.
 */
export interface ContextFile {
  /** Absolute or cwd-relative path as given in the manifest. */
  path: string;
  /** True if the file exists on disk at bundling time. */
  present: boolean;
  /** Raw UTF-8 byte length on disk. 0 when present=false. */
  raw_bytes: number;
  /** File content, with markdown-aware truncation applied when > 8 KiB. Empty string when present=false. */
  content: string;
  /** Byte length of .content (post-truncation). */
  content_bytes: number;
  /** Number of lines stripped by truncation; 0 when file was <= 8 KiB. */
  truncated_lines: number;
}

/**
 * Typed context bundle returned by {@link buildContextBundle}. Consumed by
 * pipeline-runner (21-05), explore-parallel-runner (21-06),
 * discuss-parallel-runner (21-07), and init (21-08).
 */
export interface ContextBundle {
  stage: Stage;
  /** Ordered list of files for this stage (manifest order preserved). */
  files: ContextFile[];
  /** Total .content_bytes summed across files. Used by pipeline-runner for budget preview. */
  total_bytes: number;
  /** ISO 8601 timestamp when bundle was built. */
  built_at: string;
}

/**
 * Options accepted by {@link buildContextBundle}. Every field is optional;
 * default cwd is `process.cwd()` and default threshold is 8192 bytes.
 */
export interface BundleOptions {
  /** Repo root / working directory; defaults to process.cwd(). */
  cwd?: string;
  /** Override 8 KiB truncation threshold (bytes). Default 8192. */
  truncationThresholdBytes?: number;
  /** When true, throw on any missing manifest file instead of recording present:false. */
  strict?: boolean;
}
