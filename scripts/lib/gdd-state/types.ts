// scripts/lib/gdd-state/types.ts — typed shape of a parsed STATE.md.
//
// Plan 20-01 (SDK-01/02): canonical type surface consumed by the parser,
// mutator, and public read/mutate/transition API. Everything here is
// erasable so Node 22 `--experimental-strip-types` runs the module
// without a bundler step.
//
// The shape mirrors the blocks declared in reference/STATE-TEMPLATE.md:
//   <position>, <decisions>, <must_haves>, <connections>, <blockers>,
//   <parallelism_decision>, <todos>, <timestamps>
// plus leading YAML frontmatter and the verbatim `body_preamble` /
// `body_trailer` spans that surround the typed blocks.

/**
 * Pipeline stage identifiers, per reference/STATE-TEMPLATE.md.
 * The pipeline also recognizes `scan` as a transitional/initial stage name
 * emitted by the installer; it is NOT in the Plan 20-01 `Stage` contract
 * and callers that receive `scan` from a parsed STATE.md must treat it
 * with care (see parser tolerance below).
 */
export type Stage = 'brief' | 'explore' | 'plan' | 'design' | 'verify';

/** Lifecycle status of the active `<position>` block. */
export type PositionStatus =
  | 'initialized'
  | 'in_progress'
  | 'completed'
  | 'blocked';

/** Availability classification for one entry in `<connections>`. */
export type ConnectionStatus = 'available' | 'unavailable' | 'not_configured';

/** Lock/tentative state for a `<decisions>` entry. */
export type DecisionStatus = 'locked' | 'tentative';

/** Verification state for a `<must_haves>` entry. */
export type MustHaveStatus = 'pending' | 'pass' | 'fail';

/**
 * Frontmatter block (between leading `---` fences). STATE.md frontmatter is
 * flat `key: value` — we parse it with a tiny hand-rolled reader (no YAML
 * dep). Unknown keys are preserved via the string-indexed fall-through so
 * downstream plans (e.g. 20-02 adding `model_profile`) can read/write new
 * fields without a parser change.
 */
export interface Frontmatter {
  pipeline_state_version: string;
  /**
   * Raw stage string as it appeared in the file. Kept as a broad `string`
   * because the template permits `scan` pre-brief, which is not part of
   * the tight `Stage` union. Use `toStage()` helpers to narrow.
   */
  stage: string;
  cycle: string;
  wave: number;
  started_at: string;
  last_checkpoint: string;
  [k: string]: unknown;
}

/** Parsed `<position>` block. Strings preserve whatever the file held. */
export interface Position {
  stage: string;
  wave: number;
  task_progress: string;
  status: string;
  handoff_source: string;
  handoff_path: string;
  skipped_stages: string;
}

/** Single entry of `<decisions>`. */
export interface Decision {
  id: string;
  text: string;
  status: DecisionStatus;
}

/** Single entry of `<must_haves>`. */
export interface MustHave {
  id: string;
  text: string;
  status: MustHaveStatus;
}

/** Single entry of `<blockers>` (append-only log). */
export interface Blocker {
  stage: string;
  date: string;
  text: string;
}

/**
 * Canonical parsed shape of a STATE.md file. Consumers mutate this in-place
 * inside `mutate(path, fn)`, then the serializer projects it back to
 * markdown.
 *
 * `body_preamble` captures the span between the closing frontmatter `---`
 * and the first recognized block; `body_trailer` captures everything after
 * the last recognized block. Both are preserved verbatim to guarantee
 * byte-identical round-trips for files that hold user-authored content
 * (titles, decorative headings) in those regions.
 */
export interface ParsedState {
  frontmatter: Frontmatter;
  position: Position;
  decisions: Decision[];
  must_haves: MustHave[];
  connections: Record<string, ConnectionStatus>;
  blockers: Blocker[];
  parallelism_decision: string | null;
  /**
   * Body of the `<todos>` block, verbatim (without the opening/closing
   * tags). `null` when the block is absent. The template ships this block
   * with illustrative comments, so most fresh files carry a non-null body.
   */
  todos: string | null;
  timestamps: Record<string, string>;
  /** Verbatim span between frontmatter end and the first recognized block. */
  body_preamble: string;
  /** Verbatim span after the last recognized block. */
  body_trailer: string;
}

/** Raw shape of a transition gate response (Plan 20-02 supplies the body). */
export interface GateResult {
  pass: boolean;
  blockers: string[];
}

/** Result of a successful `transition()` call. */
export interface TransitionResult extends GateResult {
  state: ParsedState;
}

/** Error thrown when a transition gate vetos a stage advance. */
export class TransitionGateFailed extends Error {
  readonly blockers: string[];
  constructor(toStage: Stage, blockers: string[]) {
    super(
      `transition to "${toStage}" blocked by gate: ${blockers.join('; ') || '(no detail)'}`,
    );
    this.name = 'TransitionGateFailed';
    this.blockers = blockers;
  }
}

/**
 * Error thrown when `acquire()` cannot obtain the lockfile within
 * `maxWaitMs`. Carries the contents of the offending lockfile (as
 * text — may be JSON, may be garbage if corrupted) so callers can
 * surface them to operators.
 */
export class LockAcquisitionError extends Error {
  readonly lockPath: string;
  readonly lockContents: string;
  constructor(lockPath: string, lockContents: string, waitedMs: number) {
    super(
      `failed to acquire lock at ${lockPath} after ${waitedMs}ms; current holder: ${lockContents}`,
    );
    this.name = 'LockAcquisitionError';
    this.lockPath = lockPath;
    this.lockContents = lockContents;
  }
}

/** Error thrown by `parse()` when the input cannot be interpreted. */
export class ParseError extends Error {
  readonly line: number;
  constructor(message: string, line: number) {
    super(`STATE.md parse error at line ${line}: ${message}`);
    this.name = 'ParseError';
    this.line = line;
  }
}

/** Type-guard for `Stage`. */
export function isStage(value: unknown): value is Stage {
  return (
    value === 'brief' ||
    value === 'explore' ||
    value === 'plan' ||
    value === 'design' ||
    value === 'verify'
  );
}

/** Type-guard for `ConnectionStatus`. */
export function isConnectionStatus(value: unknown): value is ConnectionStatus {
  return (
    value === 'available' ||
    value === 'unavailable' ||
    value === 'not_configured'
  );
}

/** Type-guard for `DecisionStatus`. */
export function isDecisionStatus(value: unknown): value is DecisionStatus {
  return value === 'locked' || value === 'tentative';
}

/** Type-guard for `MustHaveStatus`. */
export function isMustHaveStatus(value: unknown): value is MustHaveStatus {
  return value === 'pending' || value === 'pass' || value === 'fail';
}
