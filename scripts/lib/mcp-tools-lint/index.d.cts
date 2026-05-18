// scripts/lib/mcp-tools-lint/index.d.cts — ambient types for the .cjs lib.
//
// The runtime consumer is tests/gdd-mcp-tools-lint.test.cjs (CommonJS, so
// types are not strictly required). This .d.cts ships the Phase 27.6
// convention (any .cjs lib that may be imported from a .ts file gets a
// sibling .d.cts) so that a future TypeScript consumer (e.g. a /lint:gdd
// slash command) gets correct types without a follow-up patch.

/** One detected lint failure. */
export interface LintViolation {
  /** Filename (relative to scan dir) or the dir itself for cap violations. */
  file: string;
  rule: 'forbid-fs-path' | 'max-loc' | 'no-write-names' | 'tool-count-cap';
  /** 1-based source line; 0 for whole-file or whole-directory violations. */
  line: number;
  /** Human-readable diagnostic, e.g. `loc=42 > max=30`. */
  message: string;
}

/** Counts for the scan as a whole. */
export interface LintSummary {
  files_scanned: number;
  violations_count: number;
}

/** Return shape of {@link lintMcpToolsDir}. */
export interface LintResult {
  violations: LintViolation[];
  summary: LintSummary;
}

/** Inputs to {@link lintMcpToolsDir}. Only `dir` is required. */
export interface LintOptions {
  /** Directory to scan. Tool files match `gdd_*.ts`. */
  dir: string;
  /** Max non-blank-non-comment LOC per tool file. Defaults to 30. */
  maxLoc?: number;
  /** Max number of `gdd_*.ts` tool files. Defaults to 12. */
  toolCap?: number;
  /**
   * Filenames in `dir` exempt from forbid-fs-path + max-loc rules.
   * Defaults to {'index.ts', 'shared.ts'}.
   */
  exemptions?: Set<string>;
}

/**
 * Scan a directory of MCP tool .ts files and apply the 4 invariant rules.
 * Pure-static — never executes the modules.
 *
 * - Rule A (`forbid-fs-path`): no fs/path imports in tool files (D-06).
 * - Rule B (`max-loc`): each tool ≤ {@link LintOptions.maxLoc} LOC (D-06).
 * - Rule C (`no-write-names`): no tool name with write-verb substring (D-04).
 * - Rule D (`tool-count-cap`): ≤ {@link LintOptions.toolCap} tool files (D-03).
 */
export function lintMcpToolsDir(opts: LintOptions): LintResult;

/** Ordered list of all rule names this module enforces. */
export const RULES: readonly LintViolation['rule'][];

/** Default exempt filenames (index.ts + shared.ts). */
export const DEFAULT_EXEMPTIONS: Set<string>;

/** Default value for the LOC ceiling. */
export const DEFAULT_MAX_LOC: number;

/** Default value for the tool-count cap. */
export const DEFAULT_TOOL_CAP: number;

/** The regexes Rule A scans for, line by line. */
export const FORBIDDEN_IMPORT_PATTERNS: readonly RegExp[];

/** The regex Rule C matches against the extracted `export const name`. */
export const WRITE_NAME_PATTERN: RegExp;
