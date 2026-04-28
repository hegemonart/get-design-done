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
 * Verdict for a `<spike>` entry — the answer the spike produced.
 * Phase 25 Plan 25-01: spikes resolve a "can this work?" question with one
 * of three outcomes. `partial` means the spike answered for some cases but
 * not all (e.g., works on one platform, not another).
 */
export type SpikeVerdict = 'yes' | 'no' | 'partial';

/**
 * Resolution status for a sketch or spike entry. Phase 25 keeps the surface
 * minimal — `resolved` is the only value v1.25 writes (sketches and spikes
 * either complete and produce a D-XX, or they get a `<skipped/>` entry).
 * Kept as a string union to leave room for `pending`/`abandoned` later
 * without a parser change.
 */
export type PrototypingEntryStatus = 'resolved';

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
 * Single `<sketch/>` child entry inside the `<prototyping>` block.
 *
 * Phase 25 Plan 25-01 (D-01): a sketch records a resolved exploration of a
 * visual / direction question. The wrap-up flow (Plan 25-05) writes the
 * resolution as a D-XX decision AND appends a `<sketch slug=… cycle=…
 * decision=D-XX status=resolved/>` entry here so the decision-injector
 * (Plan 25-06) can surface prior sketch outcomes to downstream agents.
 *
 * Unknown attributes seen by the parser are preserved in `extra_attrs` so
 * forward-compat additions (e.g., a future `confidence=` attribute) round-
 * trip through parse → serialize without loss.
 */
export interface SketchEntry {
  slug: string;
  cycle: string;
  decision: string;
  status: PrototypingEntryStatus;
  /** Verbatim copy of any attributes the parser did not recognize. Keys
   *  are attribute names; values are the unquoted attribute strings. */
  extra_attrs: Record<string, string>;
}

/**
 * Single `<spike/>` child entry inside the `<prototyping>` block.
 *
 * Phase 25 Plan 25-01 (D-01): a spike records a resolved feasibility
 * probe. The `verdict` field captures the answer (`yes` / `no` /
 * `partial`); the `decision` field links to the D-XX written by
 * `spike-wrap-up` (Plan 25-05).
 */
export interface SpikeEntry {
  slug: string;
  cycle: string;
  decision: string;
  verdict: SpikeVerdict;
  status: PrototypingEntryStatus;
  /** Forward-compat passthrough — same semantics as on `SketchEntry`. */
  extra_attrs: Record<string, string>;
}

/**
 * Single `<skipped/>` child entry inside the `<prototyping>` block.
 *
 * Phase 25 Plan 25-01 (D-02): cycle-scoped suppression of further prototype
 * gate prompts. `at` is the firing point that was skipped (typically
 * `explore` or `plan`); `cycle` mirrors the active cycle id; `reason` is a
 * short free-form string captured at skip time.
 */
export interface SkippedEntry {
  at: string;
  cycle: string;
  reason: string;
  /** Forward-compat passthrough — same semantics as on `SketchEntry`. */
  extra_attrs: Record<string, string>;
}

/**
 * Parsed `<prototyping>` block. `null` on `ParsedState` when the block is
 * absent; an instance with all three arrays empty represents a present-but-
 * empty block (rare — wrap-up flows always append something).
 *
 * The three arrays preserve insertion order — round-trip serialization
 * emits children in the same order they appeared in the source file.
 */
export interface PrototypingBlock {
  sketches: SketchEntry[];
  spikes: SpikeEntry[];
  skipped: SkippedEntry[];
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
  /**
   * Parsed `<prototyping>` block (Phase 25 Plan 25-01 / D-01). `null` when
   * the block is absent in the source — the serializer omits the block
   * entirely in that case rather than emitting an empty `<prototyping>`
   * pair. A non-null instance with all three arrays empty is permitted
   * but only emitted when the source already had a present-but-empty
   * block (preserves byte-identical round-trip).
   */
  prototyping: PrototypingBlock | null;
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

// Error classes migrated to the unified GDDError taxonomy in Plan 20-04.
// Re-exported here so existing consumers (tests, downstream modules) keep
// importing from `gdd-state/types.ts` unchanged.
//
//   * TransitionGateFailed  — StateConflictError subclass; retryable
//   * LockAcquisitionError  — StateConflictError subclass; retryable
//   * ParseError            — ValidationError subclass; fix your STATE.md
//
// See `scripts/lib/gdd-errors/index.ts` for the taxonomy definition.
export {
  TransitionGateFailed,
  LockAcquisitionError,
  ParseError,
} from '../gdd-errors/index.ts';

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

/** Type-guard for `SpikeVerdict`. */
export function isSpikeVerdict(value: unknown): value is SpikeVerdict {
  return value === 'yes' || value === 'no' || value === 'partial';
}

/** Type-guard for `PrototypingEntryStatus`. */
export function isPrototypingEntryStatus(
  value: unknown,
): value is PrototypingEntryStatus {
  return value === 'resolved';
}
