// scripts/lib/cli/commands/audit.ts — Plan 21-09 Task 5 (SDK-21).
//
// `gdd-sdk audit` — regression + verification dry-run.
//
//   1. Probe connections (via in-process probe_connections handler —
//      Plan 21-09 deliberately avoids the MCP stdio roundtrip here;
//      Plan 21-10 exercises the full MCP boundary).
//   2. Read current STATE.md; enumerate must_haves and evaluate each.
//   3. (Optional --baseline <dir>) compare the connections map + a
//      minimal manifest signature to a baseline snapshot.
//   4. Print a summary report (JSON or human-readable) to stdout.
//
// Exit codes:
//   * 0 — all probes green + all must_haves pass + no baseline drift.
//   * 1 — one or more regressions detected.
//   * 3 — arg / config error.
//
// Note: the PROBE handler in probe_connections.ts expects a caller-
// supplied `probe_results` array. Here we do not have live probe data
// (the actual figma / refero health checks live in Phase-20 skill
// flows); instead, `audit` inspects the LAST-KNOWN connections map from
// STATE.md and flags any `unavailable` entries as degraded. A future
// plan (21-10 cross-harness) can wire in live probes.

import { existsSync, readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

import { read } from '../../gdd-state/index.ts';
import type { ConnectionStatus, ParsedState } from '../../gdd-state/types.ts';

import {
  coerceFlags,
  COMMON_FLAGS,
  type FlagSpec,
  type ParsedArgs,
} from '../parse-args.ts';

// ---------------------------------------------------------------------------
// Flag spec + help.
// ---------------------------------------------------------------------------

const AUDIT_FLAGS: readonly FlagSpec[] = [
  ...COMMON_FLAGS,
  { name: 'baseline', type: 'string' },
  { name: 'state-path', type: 'string' },
];

const USAGE = `gdd-sdk audit [flags]

Probe connections + dry-run verify.

Flags:
  --baseline <dir>        Compare connections + must-haves against baseline snapshot
                          (expects <dir>/STATE.md with pre-recorded state)
  --state-path <path>     Override STATE.md path
  --cwd <dir>             Working directory
  --json                  Emit JSON report (default: human-readable)

Exit codes:
  0  clean — all probes available, all must-haves pass, no baseline drift
  1  regressions — any probe unavailable OR any must-have failed OR baseline drift
  3  arg / config error
`;

// ---------------------------------------------------------------------------
// Report types.
// ---------------------------------------------------------------------------

export interface ConnectionReport {
  readonly name: string;
  readonly status: ConnectionStatus;
  readonly ok: boolean;
}

export interface MustHaveReport {
  readonly id: string;
  readonly text: string;
  readonly status: 'pending' | 'pass' | 'fail';
  readonly ok: boolean;
}

export interface BaselineReport {
  readonly ok: boolean;
  readonly connection_drift: readonly string[];
  readonly must_have_drift: readonly string[];
}

export interface AuditReport {
  readonly connections: readonly ConnectionReport[];
  readonly must_haves: readonly MustHaveReport[];
  readonly baseline?: BaselineReport;
  readonly summary: {
    readonly connections_ok: boolean;
    readonly must_haves_ok: boolean;
    readonly baseline_ok: boolean;
    readonly overall_ok: boolean;
  };
}

// ---------------------------------------------------------------------------
// Deps.
// ---------------------------------------------------------------------------

export type ReadFn = typeof read;

export interface AuditCommandDeps {
  readonly readState?: ReadFn;
  readonly stdout?: NodeJS.WritableStream;
  readonly stderr?: NodeJS.WritableStream;
}

// ---------------------------------------------------------------------------
// Entry point.
// ---------------------------------------------------------------------------

export async function auditCommand(
  args: ParsedArgs,
  deps: AuditCommandDeps = {},
): Promise<number> {
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;

  if (args.flags['help'] === true || args.flags['h'] === true) {
    stdout.write(USAGE);
    return 0;
  }

  let flags: Record<string, unknown>;
  try {
    flags = coerceFlags(args, AUDIT_FLAGS);
  } catch (err) {
    stderr.write(`gdd-sdk audit: ${errMessage(err)}\n`);
    return 3;
  }

  const cwd: string =
    typeof flags['cwd'] === 'string' ? (flags['cwd'] as string) : process.cwd();
  const statePath: string =
    typeof flags['state-path'] === 'string' && (flags['state-path'] as string).length > 0
      ? resolvePath(cwd, flags['state-path'] as string)
      : resolvePath(cwd, '.design', 'STATE.md');

  if (!existsSync(statePath)) {
    stderr.write(`gdd-sdk audit: STATE.md not found at ${statePath}\n`);
    return 3;
  }

  const readFn = deps.readState ?? read;
  let state: ParsedState;
  try {
    state = await readFn(statePath);
  } catch (err) {
    stderr.write(`gdd-sdk audit: failed to read STATE.md: ${errMessage(err)}\n`);
    return 3;
  }

  // 1. Connection report.
  const connections: ConnectionReport[] = [];
  let connectionsOk = true;
  for (const [name, status] of Object.entries(state.connections ?? {})) {
    const ok = status === 'available' || status === 'not_configured';
    if (!ok) connectionsOk = false;
    connections.push(Object.freeze({ name, status, ok }));
  }

  // 2. Must-have report.
  const mustHaves: MustHaveReport[] = [];
  let mustHavesOk = true;
  for (const mh of state.must_haves ?? []) {
    // `pending` and `pass` are acceptable at audit time; only `fail` is
    // a definite regression. (Pending items may be verify-stage
    // responsibilities still in progress.)
    const ok = mh.status !== 'fail';
    if (!ok) mustHavesOk = false;
    mustHaves.push(
      Object.freeze({
        id: mh.id,
        text: mh.text,
        status: mh.status,
        ok,
      }),
    );
  }

  // 3. Optional baseline drift check.
  let baselineReport: BaselineReport | undefined;
  const baselineFlag = flags['baseline'];
  if (typeof baselineFlag === 'string' && baselineFlag.length > 0) {
    try {
      baselineReport = computeBaselineDrift(state, resolvePath(cwd, baselineFlag));
    } catch (err) {
      stderr.write(`gdd-sdk audit: baseline error: ${errMessage(err)}\n`);
      return 3;
    }
  }

  const baselineOk = baselineReport === undefined ? true : baselineReport.ok;
  const overallOk = connectionsOk && mustHavesOk && baselineOk;

  const report: AuditReport = {
    connections: Object.freeze(connections),
    must_haves: Object.freeze(mustHaves),
    ...(baselineReport !== undefined ? { baseline: baselineReport } : {}),
    summary: {
      connections_ok: connectionsOk,
      must_haves_ok: mustHavesOk,
      baseline_ok: baselineOk,
      overall_ok: overallOk,
    },
  };

  if (flags['json'] === true) {
    stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    stdout.write(renderHuman(report));
  }

  return overallOk ? 0 : 1;
}

// ---------------------------------------------------------------------------
// Baseline comparison.
// ---------------------------------------------------------------------------

/**
 * Compare current `state` against a baseline STATE.md at
 * `<baselineDir>/STATE.md`. Returns drift as arrays of human-readable
 * strings; `ok` is `true` iff both arrays are empty.
 *
 * The comparison is intentionally minimal:
 *   * Connection drift: any name whose status differs between baseline
 *     and current (or is missing from one side).
 *   * Must-have drift: any baseline must-have whose status got WORSE
 *     (e.g., baseline=pass → current=fail). Improvements are not drift.
 */
function computeBaselineDrift(
  current: ParsedState,
  baselineDir: string,
): BaselineReport {
  const baselinePath = resolvePath(baselineDir, 'STATE.md');
  if (!existsSync(baselinePath)) {
    throw new Error(`baseline STATE.md not found at ${baselinePath}`);
  }
  // Load + parse the baseline. We re-use `read()` for consistency, but
  // baseline may live outside any lock regime — that's fine since we
  // never mutate it.
  const baselineRaw: string = readFileSync(baselinePath, 'utf8');
  // Use a lazy require of the parser to avoid the async indirection —
  // baseline comparison should be synchronous + deterministic.
  // We can safely `JSON.parse` a tiny normalized block... actually, the
  // simplest correct approach is to also call `read()`. Do that inline.
  const baselineState = parseBaselineStateSync(baselineRaw);

  const connectionDrift: string[] = [];
  const cur = current.connections ?? {};
  const base = baselineState.connections ?? {};
  const allConnKeys = new Set([...Object.keys(cur), ...Object.keys(base)]);
  for (const k of allConnKeys) {
    const a = cur[k];
    const b = base[k];
    if (a === undefined && b !== undefined) {
      connectionDrift.push(`${k}: missing in current (baseline=${b})`);
      continue;
    }
    if (a !== undefined && b === undefined) {
      connectionDrift.push(`${k}: new in current (current=${a})`);
      continue;
    }
    if (a !== b) {
      connectionDrift.push(`${k}: ${b} → ${a}`);
    }
  }

  const mustHaveDrift: string[] = [];
  const byId = new Map<string, string>(); // id → current status
  for (const mh of current.must_haves ?? []) {
    byId.set(mh.id, mh.status);
  }
  for (const bMh of baselineState.must_haves ?? []) {
    const curStatus = byId.get(bMh.id);
    if (curStatus === undefined) {
      mustHaveDrift.push(`${bMh.id}: missing in current (baseline=${bMh.status})`);
      continue;
    }
    // Worst-first ordering: fail > pending > pass. A regression is
    // moving in that direction.
    const rank = (s: string): number => (s === 'fail' ? 2 : s === 'pending' ? 1 : 0);
    if (rank(curStatus) > rank(bMh.status)) {
      mustHaveDrift.push(`${bMh.id}: ${bMh.status} → ${curStatus}`);
    }
  }

  const ok = connectionDrift.length === 0 && mustHaveDrift.length === 0;
  return {
    ok,
    connection_drift: Object.freeze(connectionDrift),
    must_have_drift: Object.freeze(mustHaveDrift),
  };
}

/**
 * Synchronous baseline parse. We want a stand-alone parser that works
 * on the baseline file without taking a lock — gdd-state's `read()` is
 * async but lock-free, so we wrap it with a top-level await via
 * readFileSync + the gdd-state parser exports. Since parser.ts is not
 * exported from the public index, we duplicate the minimal parse here:
 * grab the `<connections>` and `<must_haves>` blocks via regex. This is
 * fine because baseline audit tolerates a simplified shape — any
 * baseline drift we can detect is enough.
 */
function parseBaselineStateSync(raw: string): Pick<ParsedState, 'connections' | 'must_haves'> {
  const connections: Record<string, ConnectionStatus> = {};
  const connBlock = /<connections>([\s\S]*?)<\/connections>/.exec(raw);
  if (connBlock) {
    const body = connBlock[1] ?? '';
    for (const line of body.split(/\r?\n/)) {
      // Shape: "- name: status" or "name: status"
      const m = /^\s*[-*]?\s*([A-Za-z0-9_-]+)\s*:\s*(available|unavailable|not_configured)\s*$/.exec(
        line,
      );
      if (m !== null && m[1] !== undefined && m[2] !== undefined) {
        connections[m[1]] = m[2] as ConnectionStatus;
      }
    }
  }

  const mustHaves: { id: string; text: string; status: 'pending' | 'pass' | 'fail' }[] = [];
  const mhBlock = /<must_haves>([\s\S]*?)<\/must_haves>/.exec(raw);
  if (mhBlock) {
    const body = mhBlock[1] ?? '';
    for (const line of body.split(/\r?\n/)) {
      // Shape: "- M-01 [status] text" or "M-01 [status] text"
      const m =
        /^\s*[-*]?\s*(M-\d+)\s*\[(pending|pass|fail)\]\s*(.*)$/.exec(line) ??
        /^\s*[-*]?\s*(M-\d+)\s*:\s*(pending|pass|fail)\s*(.*)$/.exec(line);
      if (m !== null && m[1] !== undefined && m[2] !== undefined) {
        mustHaves.push({
          id: m[1],
          status: m[2] as 'pending' | 'pass' | 'fail',
          text: (m[3] ?? '').trim(),
        });
      }
    }
  }

  return { connections, must_haves: mustHaves };
}

// ---------------------------------------------------------------------------
// Human-readable summary.
// ---------------------------------------------------------------------------

function renderHuman(report: AuditReport): string {
  const lines: string[] = [];
  lines.push(`audit: ${report.summary.overall_ok ? 'clean' : 'REGRESSIONS'}`);
  lines.push('');
  lines.push(`connections (${report.summary.connections_ok ? 'ok' : 'degraded'}):`);
  for (const c of report.connections) {
    lines.push(`  ${c.name}: ${c.status}${c.ok ? '' : ' ← degraded'}`);
  }
  lines.push('');
  lines.push(`must-haves (${report.summary.must_haves_ok ? 'ok' : 'failing'}):`);
  for (const m of report.must_haves) {
    lines.push(`  ${m.id} [${m.status}] ${m.text}${m.ok ? '' : ' ← fail'}`);
  }
  if (report.baseline !== undefined) {
    lines.push('');
    lines.push(`baseline (${report.baseline.ok ? 'no drift' : 'drift'}):`);
    for (const d of report.baseline.connection_drift) {
      lines.push(`  connection drift: ${d}`);
    }
    for (const d of report.baseline.must_have_drift) {
      lines.push(`  must-have drift: ${d}`);
    }
  }
  return lines.join('\n') + '\n';
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
