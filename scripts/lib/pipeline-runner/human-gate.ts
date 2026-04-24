// scripts/lib/pipeline-runner/human-gate.ts — Plan 21-05 Task 4.
//
// Human-gate extraction + dispatch. The pipeline recognizes HTML-comment
// markers of the form:
//
//   <!-- AWAIT_USER_GATE: name="..." -->
//
// emitted by skills that want to pause mid-session. When the
// session-runner's `final_text` contains such a marker, the stage
// handler maps the session's terminal status to `halted-human-gate`
// and surfaces the gate name plus stdout tail.
//
// The pipeline driver (index.ts) then invokes `dispatchHumanGate`:
//   * With `config.onHumanGate` → call it; its decision drives the
//     driver.
//   * Without a callback → default `{decision: 'stop'}` (safe default
//     for headless operation — never proceed past a gate on autopilot).
//   * Callback throws → caught; logged as warn; default `stop`.

import { getLogger } from '../logger/index.ts';
import type {
  HumanGateDecision,
  HumanGateInfo,
  PipelineConfig,
} from './types.ts';

/**
 * Regex for the canonical gate marker. Name is the first capture group;
 * whitespace around `:` and inside the double quotes is tolerated.
 *
 * Intentionally LENIENT about surrounding whitespace (sanitizers may
 * normalize around the comment), but STRICT about the core token
 * shape so false positives (e.g., docs discussing AWAIT_USER_GATE)
 * don't trip it — the marker must be inside an HTML comment AND
 * carry a double-quoted `name`.
 */
const GATE_MARKER_RE =
  /<!--\s*AWAIT_USER_GATE\s*:\s*name\s*=\s*"([^"]+)"\s*-->/;

/**
 * Extract the first `AWAIT_USER_GATE` marker from a session's stdout /
 * final text. Returns `null` when no marker is present.
 *
 * Only the FIRST marker is returned — subsequent gates in the same
 * session's output are ignored by design (one pause per stage).
 */
export function extractGateMarker(
  stdout: string,
): { readonly name: string } | null {
  if (typeof stdout !== 'string' || stdout.length === 0) return null;
  const m = GATE_MARKER_RE.exec(stdout);
  if (m === null) return null;
  const name: string | undefined = m[1];
  if (name === undefined || name === '') return null;
  return { name };
}

/**
 * Dispatch a single human gate. Calls `config.onHumanGate` when
 * supplied; otherwise returns `{decision: 'stop'}`.
 *
 * Never throws — callback exceptions are caught and converted into a
 * `stop` decision, with a warn-level log entry for observability.
 */
export async function dispatchHumanGate(
  info: HumanGateInfo,
  config: PipelineConfig,
): Promise<HumanGateDecision> {
  if (config.onHumanGate === undefined) {
    // No callback — default stop. We log this at debug (not warn)
    // because it's a normal headless flow: the operator wanted to
    // pause, and the orchestrator will resume via a fresh `run()`
    // invocation with `resumeFrom` set.
    try {
      getLogger().debug('human-gate: no callback; default stop', {
        stage: info.stage,
        gateName: info.gateName,
      });
    } catch {
      // Logger failures must not propagate.
    }
    return { decision: 'stop' };
  }

  try {
    const decision = await config.onHumanGate(info);
    // Validate the decision shape — callbacks may return partial
    // objects from user code. Fall back to `stop` on anything invalid.
    if (
      decision === null ||
      decision === undefined ||
      typeof decision !== 'object'
    ) {
      try {
        getLogger().warn('human-gate: callback returned non-object; defaulting to stop', {
          stage: info.stage,
          gateName: info.gateName,
        });
      } catch {
        // Logger failures must not propagate.
      }
      return { decision: 'stop' };
    }
    if (decision.decision !== 'resume' && decision.decision !== 'stop') {
      try {
        getLogger().warn('human-gate: callback returned unknown decision; defaulting to stop', {
          stage: info.stage,
          gateName: info.gateName,
          received: String(decision.decision),
        });
      } catch {
        // Logger failures must not propagate.
      }
      return { decision: 'stop' };
    }
    // The decision's `payload` is optional; pass it through verbatim
    // when present.
    if (decision.decision === 'resume' && decision.payload !== undefined) {
      return { decision: 'resume', payload: decision.payload };
    }
    return { decision: decision.decision };
  } catch (err) {
    try {
      getLogger().warn('human-gate: callback threw; defaulting to stop', {
        stage: info.stage,
        gateName: info.gateName,
        error: err instanceof Error ? err.message : String(err),
      });
    } catch {
      // Logger failures must not propagate.
    }
    return { decision: 'stop' };
  }
}
