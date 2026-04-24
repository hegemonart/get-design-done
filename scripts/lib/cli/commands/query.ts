// scripts/lib/cli/commands/query.ts — Plan 21-09 Task 4 (SDK-21).
//
// `gdd-sdk query <op>` — typed STATE.md read operations. Mirrors the
// read side of the gdd-state MCP server. Never mutates — use the
// dedicated MCP tools (via Claude Code) for writes.
//
// Operations:
//   get                    → full ParsedState (JSON).
//   stage                  → frontmatter.stage.
//   position               → { cycle, stage, task_progress }.
//   decisions              → decisions[].
//   must-haves             → must_haves[].
//   blockers               → blockers[].
//   status                 → position.status.
//   events [--tail N]      → last N events from .design/events.jsonl.
//   can-transition <to>    → { ok, blockers? } gate result.
//
// Exit codes: 0 ok, 1 tool error (missing STATE.md, etc.), 3 arg error.

import { existsSync, readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

import { read } from '../../gdd-state/index.ts';
import { gateFor } from '../../gdd-state/gates.ts';
import { isStage, type ParsedState, type Stage } from '../../gdd-state/types.ts';

import {
  coerceFlags,
  COMMON_FLAGS,
  type FlagSpec,
  type ParsedArgs,
} from '../parse-args.ts';

// ---------------------------------------------------------------------------
// Flag spec + help.
// ---------------------------------------------------------------------------

const QUERY_FLAGS: readonly FlagSpec[] = [
  ...COMMON_FLAGS,
  { name: 'tail', type: 'number', default: 20 },
  { name: 'state-path', type: 'string' },
  { name: 'events-path', type: 'string' },
];

const USAGE = `gdd-sdk query <op> [args] [flags]

Typed STATE.md read operations.

Operations:
  get                     Full parsed STATE.md as JSON.
  stage                   Current stage name.
  position                { cycle, stage, task_progress }.
  decisions               Locked + tentative decisions.
  must-haves              Must-haves list with statuses.
  blockers                Active blockers.
  status                  Current position status.
  events [--tail N]       Last N events from .design/events.jsonl (default 20).
  can-transition <to>     Gate check for stage "<to>".

Flags:
  --cwd <dir>             Working directory (resolves .design/STATE.md)
  --state-path <path>     Override STATE.md path directly
  --events-path <path>    Override events.jsonl path directly
  --tail <n>              Number of tail events (default 20)
  --json                  JSON output (default)
  --text                  Human-readable output (only for simple scalars)

Exit codes:
  0  ok
  1  tool error (missing STATE.md / parse error)
  3  arg error (unknown op, bad --tail value)
`;

// ---------------------------------------------------------------------------
// Deps.
// ---------------------------------------------------------------------------

export type ReadFn = typeof read;

export interface QueryCommandDeps {
  readonly readState?: ReadFn;
  readonly stdout?: NodeJS.WritableStream;
  readonly stderr?: NodeJS.WritableStream;
}

// ---------------------------------------------------------------------------
// Entry point.
// ---------------------------------------------------------------------------

const KNOWN_OPS = new Set<string>([
  'get',
  'stage',
  'position',
  'decisions',
  'must-haves',
  'blockers',
  'status',
  'events',
  'can-transition',
]);

export async function queryCommand(
  args: ParsedArgs,
  deps: QueryCommandDeps = {},
): Promise<number> {
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;

  if (args.flags['help'] === true || args.flags['h'] === true) {
    stdout.write(USAGE);
    return 0;
  }

  const op: string | undefined = args.positionals[0];
  if (op === undefined || op.length === 0) {
    stderr.write('gdd-sdk query: missing operation\n');
    stderr.write(USAGE);
    return 3;
  }
  if (!KNOWN_OPS.has(op)) {
    stderr.write(
      `gdd-sdk query: unknown operation "${op}"\n` +
        `Valid: get | stage | position | decisions | must-haves | blockers | status | events | can-transition\n`,
    );
    return 3;
  }

  let flags: Record<string, unknown>;
  try {
    flags = coerceFlags(args, QUERY_FLAGS);
  } catch (err) {
    stderr.write(`gdd-sdk query: ${errMessage(err)}\n`);
    return 3;
  }

  const cwd: string =
    typeof flags['cwd'] === 'string' ? (flags['cwd'] as string) : process.cwd();
  const statePath: string =
    typeof flags['state-path'] === 'string' && (flags['state-path'] as string).length > 0
      ? resolvePath(cwd, flags['state-path'] as string)
      : resolvePath(cwd, '.design', 'STATE.md');

  // `events` has no dependency on STATE.md, so resolve it before the
  // STATE-read guard below.
  if (op === 'events') {
    return handleEvents(flags, cwd, stdout, stderr);
  }

  // Every other op needs STATE.md.
  if (!existsSync(statePath)) {
    stderr.write(
      `gdd-sdk query: STATE.md not found at ${statePath}\n`,
    );
    return 1;
  }

  const readFn: ReadFn = deps.readState ?? read;
  let state: ParsedState;
  try {
    state = await readFn(statePath);
  } catch (err) {
    stderr.write(`gdd-sdk query: failed to read STATE.md: ${errMessage(err)}\n`);
    return 1;
  }

  // Dispatch by op.
  switch (op) {
    case 'get':
      writeResult(stdout, flags, state);
      return 0;
    case 'stage':
      writeResult(stdout, flags, state.frontmatter.stage);
      return 0;
    case 'position':
      writeResult(stdout, flags, {
        cycle: state.frontmatter.cycle,
        stage: state.position.stage,
        task_progress: state.position.task_progress,
      });
      return 0;
    case 'decisions':
      writeResult(stdout, flags, state.decisions);
      return 0;
    case 'must-haves':
      writeResult(stdout, flags, state.must_haves);
      return 0;
    case 'blockers':
      writeResult(stdout, flags, state.blockers);
      return 0;
    case 'status':
      writeResult(stdout, flags, state.position.status);
      return 0;
    case 'can-transition':
      return handleCanTransition(args, state, stdout, stderr, flags);
    default: {
      stderr.write(`gdd-sdk query: unhandled op "${op}"\n`);
      return 3;
    }
  }
}

// ---------------------------------------------------------------------------
// Handlers.
// ---------------------------------------------------------------------------

function handleCanTransition(
  args: ParsedArgs,
  state: ParsedState,
  stdout: NodeJS.WritableStream,
  stderr: NodeJS.WritableStream,
  flags: Record<string, unknown>,
): number {
  const to: string | undefined = args.positionals[1];
  if (to === undefined || to.length === 0) {
    stderr.write('gdd-sdk query can-transition: missing target stage\n');
    return 3;
  }
  if (!isStage(to)) {
    stderr.write(
      `gdd-sdk query can-transition: "${to}" is not a valid Stage (brief|explore|plan|design|verify)\n`,
    );
    return 3;
  }
  const from: string = state.position.stage;
  if (!isStage(from)) {
    writeResult(stdout, flags, {
      ok: false,
      blockers: [`Invalid transition: from="${from}" is not a recognized Stage`],
    });
    return 0;
  }
  const gate = gateFor(from, to as Stage);
  if (gate === null) {
    writeResult(stdout, flags, {
      ok: false,
      blockers: [`Invalid transition: ${from} → ${to}`],
    });
    return 0;
  }
  const result = gate(state);
  writeResult(
    stdout,
    flags,
    result.pass ? { ok: true } : { ok: false, blockers: result.blockers },
  );
  return 0;
}

function handleEvents(
  flags: Record<string, unknown>,
  cwd: string,
  stdout: NodeJS.WritableStream,
  stderr: NodeJS.WritableStream,
): number {
  const eventsPath: string =
    typeof flags['events-path'] === 'string' && (flags['events-path'] as string).length > 0
      ? resolvePath(cwd, flags['events-path'] as string)
      : resolvePath(cwd, '.design', 'events.jsonl');

  const tail: number =
    typeof flags['tail'] === 'number' ? (flags['tail'] as number) : 20;
  if (!Number.isFinite(tail) || tail < 0) {
    stderr.write(`gdd-sdk query events: --tail must be a non-negative integer\n`);
    return 3;
  }

  if (!existsSync(eventsPath)) {
    // Missing events file is a tool error: operator expected events but
    // the stream was never written.
    stderr.write(`gdd-sdk query events: events.jsonl not found at ${eventsPath}\n`);
    return 1;
  }

  let raw: string;
  try {
    raw = readFileSync(eventsPath, 'utf8');
  } catch (err) {
    stderr.write(
      `gdd-sdk query events: failed to read events.jsonl: ${errMessage(err)}\n`,
    );
    return 1;
  }

  const lines = raw.split(/\r?\n/).filter((l) => l.length > 0);
  const slice = lines.slice(-tail);
  const parsed: unknown[] = [];
  for (const line of slice) {
    try {
      parsed.push(JSON.parse(line));
    } catch {
      // Malformed event line — surface as raw string to avoid losing data.
      parsed.push({ malformed: true, raw: line });
    }
  }
  writeResult({ write: (s: string) => stdout.write(s) } as NodeJS.WritableStream, flags, parsed);
  return 0;
}

// ---------------------------------------------------------------------------
// Output helper.
// ---------------------------------------------------------------------------

function writeResult(
  stdout: NodeJS.WritableStream,
  flags: Record<string, unknown>,
  value: unknown,
): void {
  // JSON is the default; --text prints scalars / simple arrays more plainly.
  if (flags['text'] === true) {
    if (typeof value === 'string') {
      stdout.write(value + '\n');
      return;
    }
    if (
      Array.isArray(value) &&
      value.every((v) => typeof v === 'string')
    ) {
      stdout.write((value as string[]).join('\n') + '\n');
      return;
    }
    // Complex values fall through to JSON.
  }
  stdout.write(JSON.stringify(value, null, 2) + '\n');
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
