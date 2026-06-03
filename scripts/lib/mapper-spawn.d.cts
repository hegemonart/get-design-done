// scripts/lib/mapper-spawn.d.cts — types for mapper-spawn.cjs (Phase 54 COMP-01).

export interface DetectedStackInput {
  ds?: string | null;
  framework?: string | null;
  motion_libs?: string[];
}

export interface ComposeAddendumsOptions {
  /** Parsed reference/registry.json object ({ entries: [...] }). */
  registry?: unknown;
  /** Directory addendum `path`s resolve against (repo root or reference/). */
  refDir?: string;
  /** Max addendums in the block (default 3 = 1 system + 1 framework + 1 motion). */
  cap?: number;
}

export interface ComposeAddendumsResult {
  /** "## Stack-specific guidance" block text, or '' when nothing matched. */
  block: string;
  /** Names (or path basenames) of the addendums included. */
  used: string[];
  /** Detected stack values that had NO matching addendum (fallback flag). */
  missing: string[];
}

export interface ApplyAddendumsResult extends ComposeAddendumsResult {
  /** The (possibly mutated) spec object passed in. */
  spec: unknown;
}

export interface ClassifiedEntry {
  category: 'system' | 'framework' | 'motion' | null;
  key: string;
}

/**
 * Compose the stack-specific guidance block for one mapper. Pure (reads files);
 * NEVER throws. Detected-but-unmatched stack values land in `missing`.
 */
export function composeAddendums(
  mapperName: string,
  stack: DetectedStackInput | null | undefined,
  opts?: ComposeAddendumsOptions,
): ComposeAddendumsResult;

/**
 * Pre-spawn helper: composes the block for `spec.name` and APPENDS it to
 * `spec.prompt` (mutated in place) when non-empty. Backward-compatible: an
 * empty block leaves `spec.prompt` byte-for-byte unchanged. NEVER throws.
 */
export function applyAddendums(
  spec: { name?: string; prompt?: string } | null | undefined,
  stack: DetectedStackInput | null | undefined,
  opts?: ComposeAddendumsOptions,
): ApplyAddendumsResult;

export function classifyEntry(entry: Record<string, unknown>): ClassifiedEntry;
export function composesInto(entry: Record<string, unknown>, mapperName: string): boolean;
export const BLOCK_HEADER: string;
