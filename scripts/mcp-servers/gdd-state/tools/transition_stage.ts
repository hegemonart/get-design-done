// scripts/mcp-servers/gdd-state/tools/transition_stage.ts
//
// Tool: gdd_state__transition_stage
// Purpose: Run gate and advance <position>.stage / frontmatter.stage on
// pass. On gate veto, returns {success:false, error:{code:'TRANSITION_
// GATE_FAILED', context:{blockers:[...]}}}. Does NOT throw to the MCP
// harness — the plan mandates a contained error path so gate failures
// do not crash the server.
//
// Emits state.transition (pass=true) on success and state.transition
// (pass=false) on gate veto. Plan 20-06's event-stream surface accepts
// both forms; Plan 22+ dashboards render both.

import { read, transition } from '../../../lib/gdd-state/index.ts';
import { isStage, type Stage } from '../../../lib/gdd-state/types.ts';
import { TransitionGateFailed } from '../../../lib/gdd-errors/index.ts';
import {
  emitStateTransition,
  errorResponse,
  okResponse,
  resolveStatePath,
  throwValidation,
  type ToolResponse,
} from './shared.ts';

export const name = 'gdd_state__transition_stage';
export const schemaPath = '../schemas/transition_stage.schema.json';

export interface TransitionStageInput {
  to: Stage;
}

export async function handle(input: unknown): Promise<ToolResponse> {
  try {
    const typed = (input ?? {}) as TransitionStageInput;
    if (!isStage(typed.to)) {
      throwValidation(
        'STAGE_INVALID',
        `to "${String(typed.to)}" is not a recognized Stage`,
      );
    }

    const path = resolveStatePath();
    // Read current state before transition so the event + response can
    // report `from` accurately, even when the gate vetoes (and therefore
    // the state is unchanged).
    const before = await read(path);
    const fromValue = before.position.stage;

    try {
      const result = await transition(path, typed.to);
      // transition() only returns a result when pass=true — the gate
      // failure path throws TransitionGateFailed.
      const fromNarrow = isStage(fromValue) ? fromValue : typed.to;
      emitStateTransition(fromNarrow, typed.to, true, [], result.state);
      return okResponse({
        from: fromValue,
        to: typed.to,
        state: result.state,
      });
    } catch (inner) {
      // Emit the failure as an event — gate vetoes are useful telemetry
      // — then translate into {success:false,error} so the MCP harness
      // never sees the throw.
      if (inner instanceof TransitionGateFailed) {
        const fromNarrow = isStage(fromValue) ? fromValue : typed.to;
        emitStateTransition(
          fromNarrow,
          typed.to,
          false,
          [...inner.blockers],
          before,
        );
      }
      throw inner;
    }
  } catch (err) {
    return errorResponse(err);
  }
}
