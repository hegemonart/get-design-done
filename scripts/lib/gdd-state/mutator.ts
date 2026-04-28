// scripts/lib/gdd-state/mutator.ts — serializer + `apply(raw, fn)` mutator.
//
// Two guarantees:
//   1. `serialize(parse(raw).state, parse(raw).raw_bodies)` === `raw`
//      for well-formed input (byte-identical round-trip).
//   2. `apply(raw, fn)` = `serialize(fn(clone(state)), raw_bodies)` with
//      one twist — when `fn` mutates a block's typed representation, the
//      serializer detects the semantic change and emits canonical form
//      for that block (dropping any HTML comments or idiosyncratic
//      whitespace). Unchanged blocks keep their raw body.
//
// The "semantic change" detection re-parses the raw body and compares
// against the current typed value. This is cheap (blocks are small)
// and gives us "preserve comments when the user didn't touch this block"
// behavior without asking consumers to mark blocks dirty.

import {
  parse,
  BLOCK_ORDER,
  type BlockGaps,
  type BlockName,
  type RawBlockBodies,
} from './parser.ts';
import {
  type Blocker,
  type ConnectionStatus,
  type Decision,
  type Frontmatter,
  type MustHave,
  type ParsedState,
  type Position,
  type PrototypingBlock,
  type QualityGateBlock,
  type QualityGateRun,
  type QualityGateStatus,
  type SketchEntry,
  type SkippedEntry,
  type SpikeEntry,
} from './types.ts';

/**
 * Optional fidelity hints from a prior `parse()` call. When provided and
 * the typed representation is semantically unchanged, the serializer
 * emits each component verbatim — yielding byte-identical round-trip
 * for unchanged blocks while still allowing targeted edits.
 */
export interface SerializeFidelity {
  raw_frontmatter?: string;
  raw_bodies?: RawBlockBodies;
  block_gaps?: BlockGaps;
  line_ending?: '\n' | '\r\n';
}

/**
 * Serialize a `ParsedState` back to STATE.md text.
 *
 * @param state      the parsed state (possibly mutated)
 * @param fidelity   optional fidelity hints from `parse()` — preserve
 *                   original formatting for untouched regions.
 */
export function serialize(
  state: ParsedState,
  fidelity: SerializeFidelity = {},
): string {
  const {
    raw_frontmatter,
    raw_bodies,
    block_gaps,
    line_ending = '\n',
  } = fidelity;

  const out: string[] = [];

  // --- frontmatter ---
  out.push('---\n');
  out.push(emitFrontmatter(state.frontmatter, raw_frontmatter));
  out.push('---\n');

  // --- blocks (canonical order, each preceded by its gap) ---
  for (const name of BLOCK_ORDER) {
    const rawBody = raw_bodies?.[name] ?? null;
    const emitted = emitBlock(name, state, rawBody);
    if (emitted === null) {
      // Block absent — do NOT emit a gap either (gaps belong to present blocks).
      continue;
    }
    // Prepend gap if we have one; otherwise fall back to a single '\n'
    // separator between consecutive blocks for canonical output.
    const gap =
      block_gaps?.[name] ?? (out.length > 0 && isFirstEmission(out) ? '' : '\n');
    out.push(gap);
    out.push(`<${name}>\n`);
    out.push(emitted);
    if (!emitted.endsWith('\n')) out.push('\n');
    out.push(`</${name}>\n`);
  }

  // --- trailer (verbatim) ---
  out.push(state.body_trailer);

  const joined = out.join('');
  return line_ending === '\r\n' ? joined.replace(/\n/g, '\r\n') : joined;
}

/** Helper: detect whether the current push would be the first block
 *  emission (`out` ends at the `---\n` fence). Used when `block_gaps` is
 *  absent — we preserve `state.body_preamble` for the first block and
 *  use a single '\n' between subsequent blocks. */
function isFirstEmission(out: string[]): boolean {
  return out.length <= 3; // ['---\n', frontmatter, '---\n']
}

/**
 * Pure mutator. Parses, applies `fn`, serializes. Throws `ParseError`
 * on structurally invalid input.
 */
export function apply(
  raw: string,
  fn: (s: ParsedState) => ParsedState,
): string {
  const { state, raw_bodies, raw_frontmatter, block_gaps, line_ending } =
    parse(raw);
  // Deep-clone so `fn` cannot accidentally mutate the original parsed
  // result (which callers of `parse()` may also hold a reference to).
  const clone = structuredClone(state);
  const next = fn(clone);
  return serialize(next, {
    raw_frontmatter,
    raw_bodies,
    block_gaps,
    line_ending,
  });
}

/** --- helpers --- */

function emitFrontmatter(
  fm: Frontmatter,
  raw_frontmatter?: string,
): string {
  // Fidelity path: if the caller supplied the original raw frontmatter
  // and the parsed fm (after fn()) semantically equals a reparse of that
  // raw, emit the raw verbatim. This preserves quoting (e.g., `cycle: ""`
  // round-trips as `cycle: ""`, not `cycle: `) and author key ordering.
  if (raw_frontmatter !== undefined) {
    const reparsed = tryReparseFrontmatter(raw_frontmatter);
    if (reparsed !== null && frontmatterEqual(reparsed, fm)) {
      return raw_frontmatter + '\n';
    }
  }
  return canonicalFrontmatter(fm);
}

function tryReparseFrontmatter(raw: string): Frontmatter | null {
  try {
    const out: Record<string, unknown> = {};
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (trimmed === '' || trimmed.startsWith('#')) continue;
      const idx = line.indexOf(':');
      if (idx === -1) continue;
      const key = line.slice(0, idx).trim();
      let value: string = line.slice(idx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (key === 'wave') {
        const n = Number(value);
        out[key] = Number.isFinite(n) ? n : value;
      } else {
        out[key] = value;
      }
    }
    const fm: Frontmatter = {
      pipeline_state_version: String(out['pipeline_state_version'] ?? '1.0'),
      stage: String(out['stage'] ?? ''),
      cycle: String(out['cycle'] ?? ''),
      wave: typeof out['wave'] === 'number' ? (out['wave'] as number) : 1,
      started_at: String(out['started_at'] ?? ''),
      last_checkpoint: String(out['last_checkpoint'] ?? ''),
    };
    for (const [k, v] of Object.entries(out)) {
      if (!(k in fm)) fm[k] = v;
    }
    return fm;
  } catch {
    return null;
  }
}

function frontmatterEqual(a: Frontmatter, b: Frontmatter): boolean {
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (!(k in b)) return false;
    // Cheap comparison; strings & numbers only in this surface.
    if (a[k] !== b[k]) {
      // Handle the string/number coerce edge for `wave`.
      if (String(a[k]) !== String(b[k])) return false;
    }
  }
  return true;
}

function canonicalFrontmatter(fm: Frontmatter): string {
  // Emit in a stable order: template-defined keys first, then anything
  // else in insertion order. This keeps fresh → serialize byte-stable.
  const fixed = [
    'pipeline_state_version',
    'stage',
    'cycle',
    'wave',
    'started_at',
    'last_checkpoint',
  ];
  const lines: string[] = [];
  const emitted = new Set<string>();
  for (const k of fixed) {
    if (k in fm) {
      lines.push(`${k}: ${formatFrontmatterValue(fm[k])}`);
      emitted.add(k);
    }
  }
  for (const k of Object.keys(fm)) {
    if (emitted.has(k)) continue;
    lines.push(`${k}: ${formatFrontmatterValue(fm[k])}`);
  }
  return lines.join('\n') + '\n';
}

function formatFrontmatterValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'string') return v;
  // For arrays/objects, fall back to JSON (shouldn't occur in current template).
  return JSON.stringify(v);
}

/**
 * Emit a block's body (WITHOUT the open/close tags). Returns null to
 * signal "skip this block entirely" — only used when both the raw body
 * and the parsed value are absent.
 */
function emitBlock(
  name: BlockName,
  state: ParsedState,
  rawBody: string | null,
): string | null {
  switch (name) {
    case 'position':
      return emitPosition(state.position, rawBody);
    case 'decisions':
      return emitDecisions(state.decisions, rawBody);
    case 'must_haves':
      return emitMustHaves(state.must_haves, rawBody);
    case 'prototyping':
      return emitPrototyping(state.prototyping, rawBody);
    case 'quality_gate':
      return emitQualityGate(state.quality_gate, rawBody);
    case 'connections':
      return emitConnections(state.connections, rawBody);
    case 'blockers':
      return emitBlockers(state.blockers, rawBody);
    case 'parallelism_decision':
      // parallelism_decision is free text — if null and no raw, skip entirely.
      if (rawBody !== null) {
        if (state.parallelism_decision === rawBody) return rawBody;
        return state.parallelism_decision ?? '';
      }
      return state.parallelism_decision;
    case 'todos':
      if (rawBody !== null) {
        if (state.todos === rawBody) return rawBody;
        return state.todos ?? '';
      }
      return state.todos;
    case 'timestamps':
      return emitTimestamps(state.timestamps, rawBody);
    default: {
      const _exhaustive: never = name;
      void _exhaustive;
      return null;
    }
  }
}

function emitPosition(pos: Position, rawBody: string | null): string {
  if (rawBody !== null) {
    const reparsed = tryReparsePosition(rawBody);
    if (reparsed !== null && positionEqual(reparsed, pos)) return rawBody;
  }
  // Canonical form.
  return [
    `stage: ${pos.stage}`,
    `wave: ${pos.wave}`,
    `task_progress: ${pos.task_progress}`,
    `status: ${pos.status}`,
    `handoff_source: ${quoteIfEmpty(pos.handoff_source)}`,
    `handoff_path: ${quoteIfEmpty(pos.handoff_path)}`,
    `skipped_stages: ${quoteIfEmpty(pos.skipped_stages)}`,
  ].join('\n');
}

function quoteIfEmpty(v: string): string {
  return v === '' ? '""' : v;
}

function emitDecisions(decisions: Decision[], rawBody: string | null): string {
  if (rawBody !== null) {
    const reparsed = tryReparseDecisions(rawBody);
    if (reparsed !== null && decisionsEqual(reparsed, decisions)) return rawBody;
  }
  if (decisions.length === 0) return ''; // empty block
  return decisions
    .map((d) => `${d.id}: ${d.text} (${d.status})`)
    .join('\n');
}

function emitMustHaves(mh: MustHave[], rawBody: string | null): string {
  if (rawBody !== null) {
    const reparsed = tryReparseMustHaves(rawBody);
    if (reparsed !== null && mustHavesEqual(reparsed, mh)) return rawBody;
  }
  if (mh.length === 0) return '';
  return mh.map((m) => `${m.id}: ${m.text} | status: ${m.status}`).join('\n');
}

function emitConnections(
  conns: Record<string, ConnectionStatus>,
  rawBody: string | null,
): string {
  if (rawBody !== null) {
    const reparsed = tryReparseConnections(rawBody);
    if (reparsed !== null && connectionsEqual(reparsed, conns)) return rawBody;
  }
  const keys = Object.keys(conns);
  if (keys.length === 0) return '';
  return keys.map((k) => `${k}: ${conns[k]}`).join('\n');
}

function emitBlockers(blockers: Blocker[], rawBody: string | null): string {
  if (rawBody !== null) {
    const reparsed = tryReparseBlockers(rawBody);
    if (reparsed !== null && blockersEqual(reparsed, blockers)) return rawBody;
  }
  if (blockers.length === 0) return '';
  return blockers.map((b) => `[${b.stage}] [${b.date}]: ${b.text}`).join('\n');
}

/**
 * Emit the body of a `<prototyping>` block (Phase 25 Plan 25-01).
 *
 * Returns `null` when the block should be omitted entirely — i.e. the
 * parsed state has `prototyping === null` AND no raw body is on file.
 * That signal short-circuits `emitBlock` so we don't litter the output
 * with empty `<prototyping></prototyping>` pairs on fresh files.
 *
 * Fidelity rule (matches the other blocks): when `rawBody` round-trips
 * through `tryReparsePrototyping` and matches the current value
 * structurally, emit the raw body verbatim. Otherwise canonicalize.
 */
function emitPrototyping(
  block: PrototypingBlock | null,
  rawBody: string | null,
): string | null {
  if (block === null && rawBody === null) return null;
  if (block === null) {
    // Block was present in source but state set it to null — caller wants
    // to drop the block. Still return null so emitBlock skips emission.
    return null;
  }
  if (rawBody !== null) {
    const reparsed = tryReparsePrototyping(rawBody);
    if (reparsed !== null && prototypingEqual(reparsed, block)) {
      return rawBody;
    }
  }
  return canonicalPrototyping(block);
}

function canonicalPrototyping(block: PrototypingBlock): string {
  const lines: string[] = [];
  for (const s of block.sketches) {
    lines.push(canonicalSketch(s));
  }
  for (const sp of block.spikes) {
    lines.push(canonicalSpike(sp));
  }
  for (const sk of block.skipped) {
    lines.push(canonicalSkipped(sk));
  }
  return lines.join('\n');
}

function canonicalSketch(s: SketchEntry): string {
  const parts: string[] = [
    `slug=${formatPrototypingAttr(s.slug)}`,
    `cycle=${formatPrototypingAttr(s.cycle)}`,
    `decision=${formatPrototypingAttr(s.decision)}`,
    `status=${formatPrototypingAttr(s.status)}`,
  ];
  for (const [k, v] of Object.entries(s.extra_attrs)) {
    parts.push(`${k}=${formatPrototypingAttr(v)}`);
  }
  return `<sketch ${parts.join(' ')}/>`;
}

function canonicalSpike(s: SpikeEntry): string {
  const parts: string[] = [
    `slug=${formatPrototypingAttr(s.slug)}`,
    `cycle=${formatPrototypingAttr(s.cycle)}`,
    `decision=${formatPrototypingAttr(s.decision)}`,
    `verdict=${formatPrototypingAttr(s.verdict)}`,
    `status=${formatPrototypingAttr(s.status)}`,
  ];
  for (const [k, v] of Object.entries(s.extra_attrs)) {
    parts.push(`${k}=${formatPrototypingAttr(v)}`);
  }
  return `<spike ${parts.join(' ')}/>`;
}

function canonicalSkipped(s: SkippedEntry): string {
  const parts: string[] = [
    `at=${formatPrototypingAttr(s.at)}`,
    `cycle=${formatPrototypingAttr(s.cycle)}`,
    `reason=${formatPrototypingAttr(s.reason)}`,
  ];
  for (const [k, v] of Object.entries(s.extra_attrs)) {
    parts.push(`${k}=${formatPrototypingAttr(v)}`);
  }
  return `<skipped ${parts.join(' ')}/>`;
}

/**
 * Format an attribute value for emission. We always quote with double
 * quotes for canonical output: this avoids ambiguity on values containing
 * whitespace, equal signs, or solidus. Embedded `"` are escaped to `&quot;`
 * which is what the parser already strips when re-reading. Empty strings
 * are emitted as `""` (the parser tolerates them).
 */
function formatPrototypingAttr(v: string): string {
  return `"${v.replace(/"/g, '&quot;')}"`;
}

/**
 * Emit the body of a `<quality_gate>` block (Phase 25 Plan 25-03).
 *
 * Returns `null` when the block should be omitted entirely — i.e. the
 * parsed state has `quality_gate === null` AND no raw body is on file.
 * Mirror of `emitPrototyping`'s short-circuit behavior so fresh STATE.md
 * files don't carry an empty `<quality_gate></quality_gate>` pair.
 *
 * Fidelity rule (matches the other blocks): when `rawBody` round-trips
 * through `tryReparseQualityGate` and matches the current value
 * structurally, emit the raw body verbatim. Otherwise canonicalize.
 */
function emitQualityGate(
  block: QualityGateBlock | null,
  rawBody: string | null,
): string | null {
  if (block === null && rawBody === null) return null;
  if (block === null) {
    // Block was present in source but state set it to null — caller wants
    // to drop the block. Still return null so emitBlock skips emission.
    return null;
  }
  if (rawBody !== null) {
    const reparsed = tryReparseQualityGate(rawBody);
    if (reparsed !== null && qualityGateEqual(reparsed, block)) {
      return rawBody;
    }
  }
  return canonicalQualityGate(block);
}

function canonicalQualityGate(block: QualityGateBlock): string {
  if (block.run === null) return '';
  return canonicalQualityGateRun(block.run);
}

function canonicalQualityGateRun(run: QualityGateRun): string {
  const parts: string[] = [
    `started_at=${formatPrototypingAttr(run.started_at)}`,
    `completed_at=${formatPrototypingAttr(run.completed_at)}`,
    `status=${formatPrototypingAttr(run.status)}`,
    `iteration=${formatPrototypingAttr(String(run.iteration))}`,
    `commands_run=${formatPrototypingAttr(run.commands_run)}`,
  ];
  for (const [k, v] of Object.entries(run.extra_attrs)) {
    parts.push(`${k}=${formatPrototypingAttr(v)}`);
  }
  return `<run ${parts.join(' ')}/>`;
}

function emitTimestamps(
  ts: Record<string, string>,
  rawBody: string | null,
): string {
  if (rawBody !== null) {
    const reparsed = tryReparseTimestamps(rawBody);
    if (reparsed !== null && recordsEqual(reparsed, ts)) return rawBody;
  }
  const keys = Object.keys(ts);
  if (keys.length === 0) return '';
  return keys.map((k) => `${k}: ${ts[k]}`).join('\n');
}

/* --- semantic equality helpers --- */

function positionEqual(a: Position, b: Position): boolean {
  return (
    a.stage === b.stage &&
    a.wave === b.wave &&
    a.task_progress === b.task_progress &&
    a.status === b.status &&
    a.handoff_source === b.handoff_source &&
    a.handoff_path === b.handoff_path &&
    a.skipped_stages === b.skipped_stages
  );
}

function decisionsEqual(a: Decision[], b: Decision[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x === undefined || y === undefined) return false;
    if (x.id !== y.id || x.text !== y.text || x.status !== y.status) return false;
  }
  return true;
}

function mustHavesEqual(a: MustHave[], b: MustHave[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x === undefined || y === undefined) return false;
    if (x.id !== y.id || x.text !== y.text || x.status !== y.status) return false;
  }
  return true;
}

function connectionsEqual(
  a: Record<string, ConnectionStatus>,
  b: Record<string, ConnectionStatus>,
): boolean {
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (let i = 0; i < ak.length; i++) {
    if (ak[i] !== bk[i]) return false;
    const key = ak[i]!;
    if (a[key] !== b[key]) return false;
  }
  return true;
}

function blockersEqual(a: Blocker[], b: Blocker[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x === undefined || y === undefined) return false;
    if (x.stage !== y.stage || x.date !== y.date || x.text !== y.text) return false;
  }
  return true;
}

function prototypingEqual(
  a: PrototypingBlock,
  b: PrototypingBlock,
): boolean {
  if (a.sketches.length !== b.sketches.length) return false;
  if (a.spikes.length !== b.spikes.length) return false;
  if (a.skipped.length !== b.skipped.length) return false;
  for (let i = 0; i < a.sketches.length; i++) {
    if (!sketchEqual(a.sketches[i]!, b.sketches[i]!)) return false;
  }
  for (let i = 0; i < a.spikes.length; i++) {
    if (!spikeEqual(a.spikes[i]!, b.spikes[i]!)) return false;
  }
  for (let i = 0; i < a.skipped.length; i++) {
    if (!skippedEqual(a.skipped[i]!, b.skipped[i]!)) return false;
  }
  return true;
}

function sketchEqual(a: SketchEntry, b: SketchEntry): boolean {
  return (
    a.slug === b.slug &&
    a.cycle === b.cycle &&
    a.decision === b.decision &&
    a.status === b.status &&
    extraAttrsEqual(a.extra_attrs, b.extra_attrs)
  );
}

function spikeEqual(a: SpikeEntry, b: SpikeEntry): boolean {
  return (
    a.slug === b.slug &&
    a.cycle === b.cycle &&
    a.decision === b.decision &&
    a.verdict === b.verdict &&
    a.status === b.status &&
    extraAttrsEqual(a.extra_attrs, b.extra_attrs)
  );
}

function skippedEqual(a: SkippedEntry, b: SkippedEntry): boolean {
  return (
    a.at === b.at &&
    a.cycle === b.cycle &&
    a.reason === b.reason &&
    extraAttrsEqual(a.extra_attrs, b.extra_attrs)
  );
}

function extraAttrsEqual(
  a: Record<string, string>,
  b: Record<string, string>,
): boolean {
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (let i = 0; i < ak.length; i++) {
    if (ak[i] !== bk[i]) return false;
    const key = ak[i]!;
    if (a[key] !== b[key]) return false;
  }
  return true;
}

function qualityGateEqual(
  a: QualityGateBlock,
  b: QualityGateBlock,
): boolean {
  if (a.run === null && b.run === null) return true;
  if (a.run === null || b.run === null) return false;
  return qualityGateRunEqual(a.run, b.run);
}

function qualityGateRunEqual(a: QualityGateRun, b: QualityGateRun): boolean {
  return (
    a.started_at === b.started_at &&
    a.completed_at === b.completed_at &&
    a.status === b.status &&
    a.iteration === b.iteration &&
    a.commands_run === b.commands_run &&
    extraAttrsEqual(a.extra_attrs, b.extra_attrs)
  );
}

function recordsEqual(
  a: Record<string, string>,
  b: Record<string, string>,
): boolean {
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (let i = 0; i < ak.length; i++) {
    if (ak[i] !== bk[i]) return false;
    const key = ak[i]!;
    if (a[key] !== b[key]) return false;
  }
  return true;
}

/* --- reparse helpers (small, self-contained — avoid importing the file-
       level parse() to prevent re-running frontmatter parsing) --- */

function tryReparsePosition(raw: string): Position | null {
  try {
    const fields: Record<string, string> = {};
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (trimmed === '' || trimmed.startsWith('<!--')) continue;
      const idx = line.indexOf(':');
      if (idx === -1) continue;
      const key = line.slice(0, idx).trim();
      let value = line.slice(idx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      fields[key] = value;
    }
    const waveNum = Number(fields['wave'] ?? '1');
    if (!Number.isFinite(waveNum)) return null;
    return {
      stage: fields['stage'] ?? '',
      wave: waveNum,
      task_progress: fields['task_progress'] ?? '0/0',
      status: fields['status'] ?? 'initialized',
      handoff_source: fields['handoff_source'] ?? '',
      handoff_path: fields['handoff_path'] ?? '',
      skipped_stages: fields['skipped_stages'] ?? '',
    };
  } catch {
    return null;
  }
}

function tryReparseDecisions(raw: string): Decision[] | null {
  try {
    const out: Decision[] = [];
    const re = /^(D-\d+):\s*(.*?)\s*\((locked|tentative)\)\s*$/;
    for (const line of raw.split('\n')) {
      const t = line.trim();
      if (t === '' || t.startsWith('<!--')) continue;
      const m = t.match(re);
      if (!m) continue;
      out.push({
        id: m[1] ?? '',
        text: m[2] ?? '',
        status: m[3] as 'locked' | 'tentative',
      });
    }
    return out;
  } catch {
    return null;
  }
}

function tryReparseMustHaves(raw: string): MustHave[] | null {
  try {
    const out: MustHave[] = [];
    const re = /^(M-\d+):\s*(.*?)\s*\|\s*status:\s*(pending|pass|fail)\s*$/;
    for (const line of raw.split('\n')) {
      const t = line.trim();
      if (t === '' || t.startsWith('<!--')) continue;
      const m = t.match(re);
      if (!m) continue;
      out.push({
        id: m[1] ?? '',
        text: m[2] ?? '',
        status: m[3] as 'pending' | 'pass' | 'fail',
      });
    }
    return out;
  } catch {
    return null;
  }
}

function tryReparseConnections(
  raw: string,
): Record<string, ConnectionStatus> | null {
  try {
    const out: Record<string, ConnectionStatus> = {};
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (trimmed === '' || trimmed.startsWith('<!--')) continue;
      const idx = line.indexOf(':');
      if (idx === -1) continue;
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim() as ConnectionStatus;
      if (
        value !== 'available' &&
        value !== 'unavailable' &&
        value !== 'not_configured'
      ) {
        return null;
      }
      out[key] = value;
    }
    return out;
  } catch {
    return null;
  }
}

function tryReparseBlockers(raw: string): Blocker[] | null {
  try {
    const out: Blocker[] = [];
    const re = /^\[([^\]]+)\]\s*\[([^\]]+)\]:\s*(.*)$/;
    for (const line of raw.split('\n')) {
      const t = line.trim();
      if (t === '' || t.startsWith('<!--')) continue;
      const m = t.match(re);
      if (!m) return null;
      out.push({ stage: m[1] ?? '', date: m[2] ?? '', text: m[3] ?? '' });
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * Reparse a `<prototyping>` body for fidelity comparison. Mirrors the
 * shape of `parsePrototypingBody` in parser.ts but is intentionally
 * separate (and tolerant) — returns `null` on any structural surprise so
 * the caller falls back to canonical emission rather than throwing.
 *
 * Unlike the parser, this helper does NOT throw on missing required
 * attributes. If the source body has been hand-edited into something the
 * parser would reject, we treat it as "definitely changed" and return
 * `null` so the canonical writer takes over.
 */
function tryReparsePrototyping(raw: string): PrototypingBlock | null {
  try {
    const sketches: SketchEntry[] = [];
    const spikes: SpikeEntry[] = [];
    const skipped: SkippedEntry[] = [];
    const selfClose = /^<([a-z_]+)(\s+[^>]*?)?\s*\/>\s*$/;
    for (const line of raw.split('\n')) {
      const t = line.trim();
      if (t === '' || t.startsWith('<!--')) continue;
      const m = t.match(selfClose);
      if (!m) {
        // Anything non-comment that isn't a self-closing tag means the
        // raw body is no longer a clean match for the parsed value.
        return null;
      }
      const tag = m[1] ?? '';
      const attrs = parseAttrInline(m[2] ?? '');
      if (tag === 'sketch') {
        const slug = attrs['slug'];
        const cycle = attrs['cycle'];
        const decision = attrs['decision'];
        const status = attrs['status'] ?? 'resolved';
        if (slug === undefined || cycle === undefined || decision === undefined) {
          return null;
        }
        if (status !== 'resolved') return null;
        sketches.push({
          slug,
          cycle,
          decision,
          status: 'resolved',
          extra_attrs: extractExtras(attrs, [
            'slug',
            'cycle',
            'decision',
            'status',
          ]),
        });
      } else if (tag === 'spike') {
        const slug = attrs['slug'];
        const cycle = attrs['cycle'];
        const decision = attrs['decision'];
        const verdict = attrs['verdict'];
        const status = attrs['status'] ?? 'resolved';
        if (
          slug === undefined ||
          cycle === undefined ||
          decision === undefined ||
          verdict === undefined
        ) {
          return null;
        }
        if (verdict !== 'yes' && verdict !== 'no' && verdict !== 'partial') {
          return null;
        }
        if (status !== 'resolved') return null;
        spikes.push({
          slug,
          cycle,
          decision,
          verdict,
          status: 'resolved',
          extra_attrs: extractExtras(attrs, [
            'slug',
            'cycle',
            'decision',
            'verdict',
            'status',
          ]),
        });
      } else if (tag === 'skipped') {
        const at = attrs['at'];
        const cycle = attrs['cycle'];
        const reason = attrs['reason'];
        if (at === undefined || cycle === undefined || reason === undefined) {
          return null;
        }
        skipped.push({
          at,
          cycle,
          reason,
          extra_attrs: extractExtras(attrs, ['at', 'cycle', 'reason']),
        });
      } else {
        // Unknown self-closing tag — return null to force canonical path.
        return null;
      }
    }
    return { sketches, spikes, skipped };
  } catch {
    return null;
  }
}

/** Mirror of parser's `parsePrototypingAttrs` — kept local to avoid
 *  cross-file circular reach (mutator must not import parser internals). */
function parseAttrInline(span: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([a-zA-Z_][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s/>]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(span)) !== null) {
    const key = m[1] ?? '';
    const value: string =
      (m[2] !== undefined ? m[2] : undefined) ??
      (m[3] !== undefined ? m[3] : undefined) ??
      m[4] ??
      '';
    if (key !== '') out[key] = value;
  }
  return out;
}

function extractExtras(
  all: Record<string, string>,
  known: readonly string[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(all)) {
    if (!known.includes(k)) out[k] = v;
  }
  return out;
}

/**
 * Reparse a `<quality_gate>` body for fidelity comparison. Mirror of
 * `tryReparsePrototyping` — returns `null` on any structural surprise so
 * the caller falls back to canonical emission rather than throwing.
 *
 * Tolerant of multiple `<run/>` lines (last-wins, matching the parser),
 * blank lines, and comments. Strict on attribute presence and enum
 * validity — a hand-edited body that drops `commands_run` will fail to
 * round-trip and fall through to canonical form, which is correct.
 */
function tryReparseQualityGate(raw: string): QualityGateBlock | null {
  try {
    let run: QualityGateRun | null = null;
    const selfClose = /^<([a-z_]+)(\s+[^>]*?)?\s*\/>\s*$/;
    for (const line of raw.split('\n')) {
      const t = line.trim();
      if (t === '' || t.startsWith('<!--')) continue;
      const m = t.match(selfClose);
      if (!m) {
        // Anything non-comment that isn't a self-closing tag means the
        // raw body is no longer a clean match for the parsed value.
        return null;
      }
      const tag = m[1] ?? '';
      if (tag !== 'run') {
        // Unknown self-closing tag inside <quality_gate> — force canonical.
        return null;
      }
      const attrs = parseAttrInline(m[2] ?? '');
      const started_at = attrs['started_at'];
      const completed_at = attrs['completed_at'];
      const status = attrs['status'];
      const iterationRaw = attrs['iteration'];
      const commands_run = attrs['commands_run'];
      if (
        started_at === undefined ||
        completed_at === undefined ||
        status === undefined ||
        iterationRaw === undefined ||
        commands_run === undefined
      ) {
        return null;
      }
      if (
        status !== 'pass' &&
        status !== 'fail' &&
        status !== 'timeout' &&
        status !== 'skipped'
      ) {
        return null;
      }
      const iteration = Number(iterationRaw);
      if (
        !Number.isFinite(iteration) ||
        !Number.isInteger(iteration) ||
        iteration < 0
      ) {
        return null;
      }
      run = {
        started_at,
        completed_at,
        status: status as QualityGateStatus,
        iteration,
        commands_run,
        extra_attrs: extractExtras(attrs, [
          'started_at',
          'completed_at',
          'status',
          'iteration',
          'commands_run',
        ]),
      };
    }
    return { run };
  } catch {
    return null;
  }
}

function tryReparseTimestamps(
  raw: string,
): Record<string, string> | null {
  try {
    const out: Record<string, string> = {};
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (trimmed === '' || trimmed.startsWith('<!--')) continue;
      const idx = line.indexOf(':');
      if (idx === -1) continue;
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      out[key] = value;
    }
    return out;
  } catch {
    return null;
  }
}
