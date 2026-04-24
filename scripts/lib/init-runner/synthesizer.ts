// scripts/lib/init-runner/synthesizer.ts — composes
// `.design/DESIGN-CONTEXT.md` from researcher outputs (Plan 21-08, SDK-20).
//
// The synthesizer is a single headless session spawned through
// `session-runner.run()` with a prompt that embeds every researcher's
// content. Its success contract is simple: did the agent write
// `.design/DESIGN-CONTEXT.md` to disk? We don't parse its text output —
// the file's presence is the sole pass/fail signal.
//
// Exports:
//   * DEFAULT_SYNTHESIZER_PROMPT  — the embedded prompt (frozen string).
//   * buildSynthesizerPrompt       — splice researcher bodies into the prompt.
//   * spawnSynthesizer             — session dispatch + file-presence check.

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { run as runSession } from '../session-runner/index.ts';
import type {
  BudgetCap,
  QueryOverride,
} from '../session-runner/types.ts';
import { enforceScope } from '../tool-scoping/index.ts';
import type { ResearcherName } from './types.ts';

/**
 * Default synthesizer prompt with a `{{RESEARCH_BLOCKS}}` placeholder
 * that `buildSynthesizerPrompt` substitutes with the researcher
 * content. The template encodes the DESIGN-CONTEXT.md schema the
 * downstream discuss stage expects (decisions, must-haves, connections,
 * ARM, flow diagram, open questions).
 *
 * The prompt is explicit about "write file; emit no prose" because the
 * synthesizer's success is measured by file-on-disk — we don't need the
 * agent's text stream in the transcript.
 */
export const DEFAULT_SYNTHESIZER_PROMPT: string = Object.freeze(
  `You are the init-synthesizer. Four researchers have produced these outputs:

{{RESEARCH_BLOCKS}}

Compose .design/DESIGN-CONTEXT.md following this schema:

---
cycle: init
generated_at: <ISO>
---

# Design Context (Draft)

## Decisions
(Draft as D-01, D-02, … from researcher outputs. Each decision gets id,
 rationale, source researcher.)

## Must-Haves
(Draft as M-01, M-02, … from researcher blockers. Each must-have gets id,
 stakeholder, test.)

## Connections
(Which AI-design-tool connections the project's tech stack recommends.)

## Architectural Responsibility Map
(ARM tiers inferred from the codebase.)

## Flow Diagram
\`\`\`mermaid
flowchart TD
  ...
\`\`\`

## Open Questions
(Anything that requires the user to answer before brief can start.)

Write the final content to .design/DESIGN-CONTEXT.md via Write tool.
Do NOT emit any prose response — only write the file.
`,
) as string;

export interface SynthesizerInput {
  readonly name: ResearcherName;
  readonly path: string;
  readonly content: string;
}

/**
 * Build the synthesizer prompt by substituting `{{RESEARCH_BLOCKS}}`
 * with concatenated research bodies. Each block is wrapped in an HTML
 * comment header so the agent can parse the boundaries deterministically.
 *
 * Exported for tests + for callers that want to assert prompt content
 * without running a session.
 */
export function buildSynthesizerPrompt(
  inputs: readonly SynthesizerInput[],
  override?: string,
): string {
  const template = override ?? DEFAULT_SYNTHESIZER_PROMPT;
  const blocks = inputs
    .map((inp) => `<!-- ${inp.name} -->\n${inp.content}`)
    .join('\n\n');
  // If the caller's override doesn't include the placeholder, append
  // the blocks. This keeps custom prompts functional without forcing
  // them to adopt our template marker.
  if (!template.includes('{{RESEARCH_BLOCKS}}')) {
    return `${template}\n\n${blocks}`;
  }
  return template.split('{{RESEARCH_BLOCKS}}').join(blocks);
}

export interface SpawnSynthesizerArgs {
  readonly researcherOutputs: readonly SynthesizerInput[];
  readonly cwd: string;
  readonly budget: BudgetCap;
  readonly maxTurns: number;
  readonly runOverride?: QueryOverride;
  readonly promptOverride?: string;
}

export interface SpawnSynthesizerResult {
  readonly status: 'completed' | 'error';
  /** Absolute path to where .design/DESIGN-CONTEXT.md should live. */
  readonly design_context_path: string;
  readonly usage: {
    readonly input_tokens: number;
    readonly output_tokens: number;
    readonly usd_cost: number;
  };
  readonly error?: string;
}

/**
 * Spawn one synthesizer session. Success is determined by the presence
 * of `.design/DESIGN-CONTEXT.md` inside `cwd` after the session ends —
 * we do NOT inspect the session's text output.
 *
 * Never throws; session-level errors and missing-file outcomes both
 * land as `status: 'error'` with `error` populated.
 */
export async function spawnSynthesizer(
  args: SpawnSynthesizerArgs,
): Promise<SpawnSynthesizerResult> {
  const designContextPath = resolve(
    args.cwd,
    '.design',
    'DESIGN-CONTEXT.md',
  );

  // Resolve allowed tools. The synthesizer only needs Read (to load
  // research outputs if the prompt drops the inline bodies) and Write
  // (to produce DESIGN-CONTEXT.md). The init stage scope covers both.
  let allowedTools: readonly string[];
  try {
    allowedTools = enforceScope({ stage: 'init' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Object.freeze({
      status: 'error' as const,
      design_context_path: designContextPath,
      usage: { input_tokens: 0, output_tokens: 0, usd_cost: 0 },
      error: `scope enforcement failed: ${message}`,
    });
  }

  const prompt = buildSynthesizerPrompt(
    args.researcherOutputs,
    args.promptOverride,
  );

  let usage = { input_tokens: 0, output_tokens: 0, usd_cost: 0 };
  try {
    const session = await runSession({
      prompt,
      stage: 'init',
      budget: args.budget,
      turnCap: { maxTurns: args.maxTurns },
      allowedTools: [...allowedTools],
      ...(args.runOverride !== undefined
        ? { queryOverride: args.runOverride }
        : {}),
    });
    usage = {
      input_tokens: session.usage.input_tokens,
      output_tokens: session.usage.output_tokens,
      usd_cost: session.usage.usd_cost,
    };

    if (session.status !== 'completed') {
      const code = session.error?.code ?? session.status.toUpperCase();
      const msg = session.error?.message ?? `session ended: ${session.status}`;
      return Object.freeze({
        status: 'error' as const,
        design_context_path: designContextPath,
        usage,
        error: `${code}: ${msg}`,
      });
    }
  } catch (err) {
    // session-runner is documented never-throws, but a test-injected
    // runOverride could throw during setup. Package gracefully.
    const message = err instanceof Error ? err.message : String(err);
    return Object.freeze({
      status: 'error' as const,
      design_context_path: designContextPath,
      usage,
      error: `session threw: ${message}`,
    });
  }

  // Success is file-on-disk, NOT session.status.
  if (!existsSync(designContextPath)) {
    return Object.freeze({
      status: 'error' as const,
      design_context_path: designContextPath,
      usage,
      error: 'synthesizer did not produce .design/DESIGN-CONTEXT.md',
    });
  }

  return Object.freeze({
    status: 'completed' as const,
    design_context_path: designContextPath,
    usage,
  });
}
