// scripts/lib/gdd-state/parser.ts — turns STATE.md text into ParsedState.
//
// Design constraints:
//   1. Pure function (no I/O). `read()` in index.ts supplies the file.
//   2. Byte-identical round-trip for well-formed files. The serializer
//      uses `body_preamble` / `body_trailer` + each block's raw body text
//      to reproduce the input exactly (when inner arrays were not mutated).
//   3. No YAML dependency. STATE frontmatter is flat `key: value`.
//   4. Tolerant of unknown frontmatter keys, unknown blocks, extra blank
//      lines — but rejects fundamentally broken structure (missing
//      closing frontmatter, unterminated `<block>` tags).
//   5. Preserves each block's raw body so the serializer can emit it
//      verbatim when the consumer did not touch the parsed structure.
//
// Block tag conventions (from reference/STATE-TEMPLATE.md):
//   <position> ... </position>
//   <decisions> ... </decisions>
//   <must_haves> ... </must_haves>
//   <connections> ... </connections>
//   <blockers> ... </blockers>
//   <parallelism_decision> ... </parallelism_decision>
//   <todos> ... </todos>
//   <timestamps> ... </timestamps>
//
// Tags always appear at column 0, each on its own line. Bodies may span
// multiple lines and may contain `<!-- ... -->` comments (which are
// preserved in `raw_bodies` for round-trip).

import {
  ParseError,
  isConnectionStatus,
  isDecisionStatus,
  isMustHaveStatus,
  type Blocker,
  type ConnectionStatus,
  type Decision,
  type DecisionStatus,
  type Frontmatter,
  type MustHave,
  type MustHaveStatus,
  type ParsedState,
  type Position,
} from './types.ts';

/** Block names recognized by the parser in canonical order. */
export const BLOCK_ORDER = [
  'position',
  'decisions',
  'must_haves',
  'connections',
  'blockers',
  'parallelism_decision',
  'todos',
  'timestamps',
] as const;

export type BlockName = (typeof BLOCK_ORDER)[number];

/** Raw bodies captured from the input; used by the serializer to preserve
 *  formatting when a block's parsed representation round-trips unchanged. */
export interface RawBlockBodies {
  position: string | null;
  decisions: string | null;
  must_haves: string | null;
  connections: string | null;
  blockers: string | null;
  parallelism_decision: string | null;
  todos: string | null;
  timestamps: string | null;
}

/** Separator text appearing BEFORE each block's opening tag, counted from
 *  the end of the previous recognized block (or from the end of the
 *  frontmatter for the first block). Captures the blank lines and
 *  free-form markdown that template authors place between blocks. */
export interface BlockGaps {
  position: string;
  decisions: string;
  must_haves: string;
  connections: string;
  blockers: string;
  parallelism_decision: string;
  todos: string;
  timestamps: string;
}

/** Full parser result — `ParsedState` plus the raw bodies map and raw
 *  frontmatter. The `raw_bodies` map is consumed by `serialize()` so
 *  untouched blocks can emit verbatim. */
export interface ParseResult {
  state: ParsedState;
  raw_bodies: RawBlockBodies;
  /** Verbatim frontmatter body (between the `---` fences). Serializer
   *  emits it back when `state.frontmatter` is semantically unchanged. */
  raw_frontmatter: string;
  /** Map of per-block preceding separators. Serializer emits these before
   *  each present block. */
  block_gaps: BlockGaps;
  /** Detected line-ending: '\n' or '\r\n'. Serializer emits this back. */
  line_ending: '\n' | '\r\n';
  /** True when the last byte of the original input was a newline. */
  trailing_newline: boolean;
}

const EMPTY_RAW_BODIES: RawBlockBodies = {
  position: null,
  decisions: null,
  must_haves: null,
  connections: null,
  blockers: null,
  parallelism_decision: null,
  todos: null,
  timestamps: null,
};

/**
 * Parse STATE.md text.
 *
 * @throws ParseError on structurally invalid input.
 */
export function parse(raw: string): ParseResult {
  // Normalize line endings for parsing; remember the original choice so
  // the serializer emits them back. We do the substring math on the
  // normalized string (simpler to reason about); the serializer converts
  // back when writing.
  const line_ending: '\n' | '\r\n' = raw.includes('\r\n') ? '\r\n' : '\n';
  const normalized: string = line_ending === '\r\n' ? raw.replace(/\r\n/g, '\n') : raw;
  const trailing_newline: boolean = normalized.endsWith('\n');

  // --- 1. Frontmatter --------------------------------------------------
  if (!normalized.startsWith('---\n')) {
    throw new ParseError('file must begin with "---" frontmatter fence', 1);
  }
  const fmEnd: number = normalized.indexOf('\n---\n', 4);
  if (fmEnd === -1) {
    throw new ParseError('unterminated frontmatter (missing closing "---")', 1);
  }
  const fmText: string = normalized.slice(4, fmEnd);
  const frontmatter: Frontmatter = parseFrontmatter(fmText);
  const afterFm: number = fmEnd + 5; // past "\n---\n"

  // --- 2. Body scan (locate blocks) ------------------------------------
  const body: string = normalized.slice(afterFm);
  const lines: string[] = body.split('\n');
  // Track line ranges (inclusive) for each recognized block.
  const blocks: Array<{ name: BlockName; openLine: number; closeLine: number }> = [];
  const seen = new Set<BlockName>();
  const blockOpen = /^<([a-z_]+)>\s*$/;
  const blockClose = /^<\/([a-z_]+)>\s*$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const openMatch = line.match(blockOpen);
    if (!openMatch) continue;
    const name = openMatch[1] as BlockName;
    if (!BLOCK_ORDER.includes(name)) {
      // Unknown block — skip (forward compat); don't record.
      continue;
    }
    if (seen.has(name)) {
      // Duplicate block — first one wins; reject to avoid silent drops.
      throw new ParseError(`duplicate block <${name}>`, lineToFileLine(afterFm, normalized, i));
    }
    // Find matching close at the same col-0 position.
    let close = -1;
    for (let j = i + 1; j < lines.length; j++) {
      const cm = (lines[j] ?? '').match(blockClose);
      if (cm && cm[1] === name) {
        close = j;
        break;
      }
    }
    if (close === -1) {
      throw new ParseError(
        `unterminated block <${name}> (no </${name}>)`,
        lineToFileLine(afterFm, normalized, i),
      );
    }
    blocks.push({ name, openLine: i, closeLine: close });
    seen.add(name);
    i = close; // continue scanning after the close tag
  }

  // --- 3. Compute body_preamble / body_trailer / block_gaps ------------
  // body_preamble = text between frontmatter-end and first block's <tag>.
  // body_trailer  = text after the last block's </tag>.
  // block_gaps[name] = text between the previous recognized block's </tag>
  //                    and this block's <tag>. For the first block this
  //                    equals body_preamble.
  let body_preamble: string;
  let body_trailer: string;
  const block_gaps: BlockGaps = {
    position: '',
    decisions: '',
    must_haves: '',
    connections: '',
    blockers: '',
    parallelism_decision: '',
    todos: '',
    timestamps: '',
  };
  if (blocks.length === 0) {
    // No recognized blocks at all — everything is preamble; trailer is empty.
    body_preamble = body;
    body_trailer = '';
  } else {
    const firstBlock = blocks[0];
    const lastBlock = blocks[blocks.length - 1];
    if (firstBlock === undefined || lastBlock === undefined) {
      // unreachable — length-checked above — but keeps noUncheckedIndexedAccess happy.
      throw new ParseError('internal: block index inconsistency', 1);
    }
    body_preamble = lines.slice(0, firstBlock.openLine).join('\n');
    if (firstBlock.openLine > 0) body_preamble += '\n';
    body_trailer = lines.slice(lastBlock.closeLine + 1).join('\n');

    // Populate block_gaps: preceding separator for each block.
    for (let bi = 0; bi < blocks.length; bi++) {
      const cur = blocks[bi];
      if (cur === undefined) continue;
      if (bi === 0) {
        block_gaps[cur.name] = body_preamble;
      } else {
        const prev = blocks[bi - 1];
        if (prev === undefined) continue;
        // Text strictly between prev.closeLine and cur.openLine (exclusive).
        // That's lines[prev.closeLine+1 .. cur.openLine-1] joined by '\n',
        // plus a trailing '\n' if cur.openLine > prev.closeLine + 1 (to
        // separate the gap content from the opening tag).
        const gapLines = lines.slice(prev.closeLine + 1, cur.openLine);
        let gap = gapLines.join('\n');
        if (cur.openLine > prev.closeLine + 1) gap += '\n';
        block_gaps[cur.name] = gap;
      }
    }
  }

  // --- 4. Parse each block ---------------------------------------------
  const raw_bodies: RawBlockBodies = { ...EMPTY_RAW_BODIES };
  let position: Position | null = null;
  let decisions: Decision[] = [];
  let must_haves: MustHave[] = [];
  let connections: Record<string, ConnectionStatus> = {};
  let blockers: Blocker[] = [];
  let parallelism_decision: string | null = null;
  let todos: string | null = null;
  let timestamps: Record<string, string> = {};

  for (const blk of blocks) {
    const rawBody: string = lines
      .slice(blk.openLine + 1, blk.closeLine)
      .join('\n');
    raw_bodies[blk.name] = rawBody;
    const fileLineOfBody = lineToFileLine(afterFm, normalized, blk.openLine + 1);
    switch (blk.name) {
      case 'position':
        position = parsePositionBody(rawBody, fileLineOfBody);
        break;
      case 'decisions':
        decisions = parseDecisionsBody(rawBody, fileLineOfBody);
        break;
      case 'must_haves':
        must_haves = parseMustHavesBody(rawBody, fileLineOfBody);
        break;
      case 'connections':
        connections = parseConnectionsBody(rawBody, fileLineOfBody);
        break;
      case 'blockers':
        blockers = parseBlockersBody(rawBody, fileLineOfBody);
        break;
      case 'parallelism_decision':
        parallelism_decision = rawBody;
        break;
      case 'todos':
        todos = rawBody;
        break;
      case 'timestamps':
        timestamps = parseTimestampsBody(rawBody, fileLineOfBody);
        break;
      default: {
        // Exhaustive — TS enforces.
        const _exhaustive: never = blk.name;
        void _exhaustive;
      }
    }
  }

  // --- 5. Backfill defaults for absent mandatory blocks ----------------
  // `<position>` is the one block we MUST have to be semantically usable,
  // because `mutate()` and `transition()` read/write it. Refuse to parse
  // a STATE.md that lacks it — callers should have run scan first.
  if (position === null) {
    throw new ParseError(
      'missing required <position> block (run scan to initialize STATE.md)',
      1,
    );
  }

  const state: ParsedState = {
    frontmatter,
    position,
    decisions,
    must_haves,
    connections,
    blockers,
    parallelism_decision,
    todos,
    timestamps,
    body_preamble,
    body_trailer,
  };

  return {
    state,
    raw_bodies,
    raw_frontmatter: fmText,
    block_gaps,
    line_ending,
    trailing_newline,
  };
}

/** --- helpers --- */

function lineToFileLine(bodyStartOffset: number, normalized: string, bodyLineIdx: number): number {
  // Count newlines from 0 to bodyStartOffset plus the body line index.
  const prefix: string = normalized.slice(0, bodyStartOffset);
  const prefixLines: number = prefix.split('\n').length - 1;
  return prefixLines + bodyLineIdx + 1; // 1-indexed
}

function parseFrontmatter(raw: string): Frontmatter {
  const out: Record<string, unknown> = {};
  const lines = raw.split('\n');
  for (const line of lines) {
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
    // Numeric coercion for `wave` only (template-defined numeric field).
    if (key === 'wave') {
      const n = Number(value);
      out[key] = Number.isFinite(n) ? n : value;
    } else {
      out[key] = value;
    }
  }
  // Fill required keys with sensible defaults if missing (tolerant parse —
  // stages should have created a valid frontmatter via the template).
  const fm: Frontmatter = {
    pipeline_state_version: String(out['pipeline_state_version'] ?? '1.0'),
    stage: String(out['stage'] ?? ''),
    cycle: String(out['cycle'] ?? ''),
    wave: typeof out['wave'] === 'number' ? (out['wave'] as number) : 1,
    started_at: String(out['started_at'] ?? ''),
    last_checkpoint: String(out['last_checkpoint'] ?? ''),
  };
  // Copy any extra keys unchanged.
  for (const [k, v] of Object.entries(out)) {
    if (!(k in fm)) fm[k] = v;
  }
  return fm;
}

function parsePositionBody(body: string, startLine: number): Position {
  const fields: Record<string, string> = {};
  const lines = body.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
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
  const stage = fields['stage'] ?? '';
  const waveRaw = fields['wave'] ?? '1';
  const waveNum = Number(waveRaw);
  if (!Number.isFinite(waveNum)) {
    throw new ParseError(`<position> wave not numeric: ${waveRaw}`, startLine);
  }
  return {
    stage,
    wave: waveNum,
    task_progress: fields['task_progress'] ?? '0/0',
    status: fields['status'] ?? 'initialized',
    handoff_source: fields['handoff_source'] ?? '',
    handoff_path: fields['handoff_path'] ?? '',
    skipped_stages: fields['skipped_stages'] ?? '',
  };
}

function parseDecisionsBody(body: string, startLine: number): Decision[] {
  const out: Decision[] = [];
  const lines = body.split('\n');
  // D-NN: text (locked|tentative)
  const re = /^(D-\d+):\s*(.*?)\s*\((locked|tentative)\)\s*$/;
  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? '').trim();
    if (line === '' || line.startsWith('<!--')) continue;
    const m = line.match(re);
    if (!m) {
      // Non-matching non-comment line — tolerate (may be a stray note).
      continue;
    }
    const id = m[1] ?? '';
    const text = m[2] ?? '';
    const status = m[3] as DecisionStatus;
    if (!isDecisionStatus(status)) {
      throw new ParseError(
        `<decisions> invalid status for ${id}: ${status}`,
        startLine + i,
      );
    }
    out.push({ id, text, status });
  }
  return out;
}

function parseMustHavesBody(body: string, startLine: number): MustHave[] {
  const out: MustHave[] = [];
  const lines = body.split('\n');
  // M-NN: text | status: pending|pass|fail
  const re = /^(M-\d+):\s*(.*?)\s*\|\s*status:\s*(pending|pass|fail)\s*$/;
  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? '').trim();
    if (line === '' || line.startsWith('<!--')) continue;
    const m = line.match(re);
    if (!m) continue;
    const id = m[1] ?? '';
    const text = m[2] ?? '';
    const status = m[3] as MustHaveStatus;
    if (!isMustHaveStatus(status)) {
      throw new ParseError(
        `<must_haves> invalid status for ${id}: ${status}`,
        startLine + i,
      );
    }
    out.push({ id, text, status });
  }
  return out;
}

function parseConnectionsBody(
  body: string,
  startLine: number,
): Record<string, ConnectionStatus> {
  const out: Record<string, ConnectionStatus> = {};
  const lines = body.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('<!--')) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!isConnectionStatus(value)) {
      throw new ParseError(
        `<connections> invalid status for ${key}: ${value}`,
        startLine + i,
      );
    }
    out[key] = value;
  }
  return out;
}

function parseBlockersBody(body: string, startLine: number): Blocker[] {
  const out: Blocker[] = [];
  const lines = body.split('\n');
  // [stage] [YYYY-MM-DD or ISO]: text
  const re = /^\[([^\]]+)\]\s*\[([^\]]+)\]:\s*(.*)$/;
  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? '').trim();
    if (line === '' || line.startsWith('<!--')) continue;
    const m = line.match(re);
    if (!m) {
      // Malformed blocker line — throw so operators see it rather than
      // silently dropping a blocker (Rule 1: correctness over tolerance).
      throw new ParseError(
        `<blockers> malformed line: "${line}"`,
        startLine + i,
      );
    }
    out.push({ stage: m[1] ?? '', date: m[2] ?? '', text: m[3] ?? '' });
  }
  return out;
}

function parseTimestampsBody(
  body: string,
  _startLine: number,
): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = body.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('<!--')) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    out[key] = value;
  }
  return out;
}
