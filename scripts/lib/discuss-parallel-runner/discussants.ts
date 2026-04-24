// scripts/lib/discuss-parallel-runner/discussants.ts — Plan 21-07 (SDK-19).
//
// Discussant dispatch + DISCUSSION COMPLETE block parser.
//
// Public surface:
//   * spawnDiscussant        — one session per spec, parses final_text
//                              into DiscussionItem[].
//   * spawnDiscussantsParallel — N sessions with semaphore concurrency.
//   * parseDiscussionBlock    — pure parser for the DISCUSSION COMPLETE
//                               block (used standalone + by spawnDiscussant).
//
// Block grammar (lenient, regex-based — no YAML dep):
//
//   ## DISCUSSION COMPLETE
//
//   ### Questions
//   - Q: <text>
//     Concern: <stakeholder>
//     Severity: <blocker|major|minor|nice-to-have>
//     Rationale: <one sentence>
//
//   ### Concerns
//   - C: <text>
//     Area: <scope>
//     Severity: <...>
//
// Parse rules:
//   * DISCUSSION COMPLETE heading match is case-insensitive.
//   * Items start with `- Q:` or `- C:`.
//   * Field lines (Concern/Area/Severity/Rationale) continue until the
//     next `- Q:`/`- C:` item or the next heading.
//   * Severity normalization:
//       blocker / critical                 → 'blocker'
//       major / high                       → 'major'
//       minor / low                        → 'minor'
//       nice-to-have / nice to have / nth  → 'nice-to-have'
//       unknown / missing                  → 'minor' (default)
//   * Empty `- Q:` / `- C:` (no text after the colon) is skipped with
//     a logger warn.

import { run as defaultRun } from '../session-runner/index.ts';
import type {
  BudgetCap,
  SessionResult,
  SessionRunnerOptions,
} from '../session-runner/types.ts';
import { getLogger } from '../logger/index.ts';
import { parseAgentTools } from '../tool-scoping/parse-agent-tools.ts';
import type {
  DiscussantSpec,
  DiscussionContribution,
  DiscussionItem,
  Severity,
} from './types.ts';

/** Shared run-override shape consumed by both spawn* functions. */
export type DiscussantRunOverride = (
  opts: SessionRunnerOptions,
) => Promise<SessionResult>;

/** Options for `spawnDiscussant`. */
export interface SpawnDiscussantOptions {
  budget: BudgetCap;
  maxTurns: number;
  runOverride?: DiscussantRunOverride;
  cwd: string;
}

/** Options for `spawnDiscussantsParallel`. */
export interface SpawnDiscussantsParallelOptions {
  concurrency: number;
  budget: BudgetCap;
  maxTurns: number;
  runOverride?: DiscussantRunOverride;
  cwd: string;
}

// ---------------------------------------------------------------------------
// spawnDiscussant
// ---------------------------------------------------------------------------

/**
 * Spawn one discussant session via `session-runner.run()`. Parses the
 * DISCUSSION COMPLETE block from `session.final_text` into
 * `DiscussionItem[]`. Parse failures surface as `status: 'parse-error'`
 * with `raw` preserved. Session failures surface as `status: 'error'`
 * with `error` populated and `items: []`.
 *
 * NEVER throws — every failure mode becomes a typed Contribution.
 */
export async function spawnDiscussant(
  spec: DiscussantSpec,
  opts: SpawnDiscussantOptions,
): Promise<DiscussionContribution> {
  const logger = getLogger();
  const runImpl = opts.runOverride ?? defaultRun;

  // Resolve per-discussant allowedTools from agent frontmatter (if any).
  // `undefined` = stage default; empty list = MCP-only.
  let allowedTools: readonly string[] | undefined;
  if (spec.agentPath !== undefined && spec.agentPath !== '') {
    const parsed = parseAgentTools(spec.agentPath);
    // parseAgentTools returns null when the file is missing or the
    // frontmatter is absent — we treat null the same as undefined
    // (no override → stage default).
    if (parsed !== null) {
      allowedTools = parsed;
    }
  }

  const sessionOpts: SessionRunnerOptions = {
    prompt: spec.prompt,
    stage: 'custom',
    budget: opts.budget,
    turnCap: { maxTurns: opts.maxTurns },
  };
  if (allowedTools !== undefined) {
    sessionOpts.allowedTools = [...allowedTools];
  }

  logger.info('discuss.discussant.started', {
    discussant: spec.name,
    cwd: opts.cwd,
  });

  const result = await runImpl(sessionOpts);

  // Session-level failures (budget, turn cap, aborted, error) all
  // surface as status: 'error'. Items stay empty.
  if (result.status !== 'completed') {
    const contribution: DiscussionContribution = {
      discussant: spec.name,
      items: Object.freeze([]),
      raw: result.final_text ?? '',
      usage: { ...result.usage },
      status: 'error',
    };
    if (result.error !== undefined) {
      contribution.error = {
        code: result.error.code,
        message: result.error.message,
      };
    } else {
      contribution.error = {
        code: 'SESSION_FAILED',
        message: `session ended with status: ${result.status}`,
      };
    }
    logger.warn('discuss.discussant.error', {
      discussant: spec.name,
      status: result.status,
      code: contribution.error.code,
    });
    return contribution;
  }

  const raw = result.final_text ?? '';
  const parsed = parseDiscussionBlock(raw);

  if (parsed === null) {
    logger.warn('discuss.discussant.parse_error', {
      discussant: spec.name,
      reason: 'missing or malformed DISCUSSION COMPLETE block',
    });
    return {
      discussant: spec.name,
      items: Object.freeze([]),
      raw,
      usage: { ...result.usage },
      status: 'parse-error',
    };
  }

  logger.info('discuss.discussant.completed', {
    discussant: spec.name,
    items: parsed.length,
  });

  return {
    discussant: spec.name,
    items: parsed,
    raw,
    usage: { ...result.usage },
    status: 'completed',
  };
}

// ---------------------------------------------------------------------------
// spawnDiscussantsParallel
// ---------------------------------------------------------------------------

/**
 * Spawn N discussants with a semaphore bounding concurrency. All
 * discussants START as soon as a slot is free; none cascade on error.
 *
 * Output order: matches input `specs` order (NOT completion order).
 * Implementation detail: each slot runs `spawnDiscussant`; the outer
 * `Promise.all` preserves index → contribution mapping.
 *
 * NEVER throws — per-discussant failures are captured as contribution
 * records with `status: 'error'` or `'parse-error'`.
 */
export async function spawnDiscussantsParallel(
  specs: readonly DiscussantSpec[],
  opts: SpawnDiscussantsParallelOptions,
): Promise<readonly DiscussionContribution[]> {
  const concurrency = Math.max(1, Math.floor(opts.concurrency));
  const results: Array<DiscussionContribution | undefined> = new Array(specs.length);

  // Semaphore via next-pointer: each worker pulls the next unclaimed
  // index until the list is exhausted. This preserves order in
  // `results[]` because workers write to their claimed index.
  let nextIndex = 0;
  const total = specs.length;

  async function worker(): Promise<void> {
    while (true) {
      const idx = nextIndex;
      nextIndex += 1;
      if (idx >= total) return;
      const spec = specs[idx];
      if (spec === undefined) continue;
      const spawnOpts: SpawnDiscussantOptions = {
        budget: opts.budget,
        maxTurns: opts.maxTurns,
        cwd: opts.cwd,
      };
      if (opts.runOverride !== undefined) {
        spawnOpts.runOverride = opts.runOverride;
      }
      // spawnDiscussant never throws, so the worker never aborts on
      // one discussant's failure.
      const contribution = await spawnDiscussant(spec, spawnOpts);
      results[idx] = contribution;
    }
  }

  const workers: Array<Promise<void>> = [];
  const workerCount = Math.min(concurrency, total);
  for (let i = 0; i < workerCount; i += 1) {
    workers.push(worker());
  }
  await Promise.all(workers);

  // Replace any undefined slots (shouldn't happen, but defensively
  // surface as an error contribution so callers never see undefined).
  const finalized: DiscussionContribution[] = [];
  for (let i = 0; i < results.length; i += 1) {
    const entry = results[i];
    if (entry === undefined) {
      const spec = specs[i];
      finalized.push({
        discussant: spec?.name ?? 'unknown',
        items: Object.freeze([]),
        raw: '',
        usage: { input_tokens: 0, output_tokens: 0, usd_cost: 0 },
        status: 'error',
        error: {
          code: 'INTERNAL_SCHEDULER_ERROR',
          message: 'discussant slot was never claimed',
        },
      });
    } else {
      finalized.push(entry);
    }
  }
  return Object.freeze(finalized);
}

// ---------------------------------------------------------------------------
// parseDiscussionBlock — pure parser
// ---------------------------------------------------------------------------

/**
 * Parse a DISCUSSION COMPLETE block from the given text. Returns null
 * when the block is absent. Malformed individual items are skipped
 * with a logger.warn; the function never throws.
 *
 * Heading match is case-insensitive; the block extends from the
 * `## DISCUSSION COMPLETE` line to end-of-text (or the next top-level
 * `## ` heading — whichever is first).
 */
export function parseDiscussionBlock(text: string): readonly DiscussionItem[] | null {
  const logger = getLogger();

  // Locate the DISCUSSION COMPLETE heading, case-insensitive.
  // Use a regex that anchors on a `## ` or start-of-line with optional
  // leading whitespace for robustness.
  const headingRe = /^[ \t]*##[ \t]+DISCUSSION[ \t]+COMPLETE[ \t]*$/im;
  const headingMatch = headingRe.exec(text);
  if (headingMatch === null) return null;

  // Slice from after the heading.
  const afterHeading = text.slice(headingMatch.index + headingMatch[0].length);

  // Find the end of the block: next top-level `## ` heading, else end.
  // We allow `###` subheadings inside the block.
  const nextBlockRe = /^[ \t]*##[ \t]+(?!#)/m;
  const endMatch = nextBlockRe.exec(afterHeading);
  const blockText = endMatch === null
    ? afterHeading
    : afterHeading.slice(0, endMatch.index);

  // Split into Questions + Concerns subsections.
  const lines = blockText.split(/\r?\n/);
  const items: DiscussionItem[] = [];

  // Walk line-by-line, tracking active subsection kind.
  //   'question' when we're in a ### Questions subsection
  //   'concern'  when we're in a ### Concerns subsection
  //   null       outside any subsection
  let sectionKind: 'question' | 'concern' | null = null;
  let pending: PendingItem | null = null;

  const flushPending = (): void => {
    if (pending === null) return;
    const text = pending.text.trim();
    if (text === '') {
      logger.warn('discuss.parse.skipped_item', {
        reason: 'empty text',
        kind: pending.kind,
      });
      pending = null;
      return;
    }
    const item: DiscussionItem = {
      kind: pending.kind,
      text,
      severity: normalizeSeverity(pending.severity),
    };
    if (pending.tag !== undefined) item.tag = pending.tag;
    if (pending.rationale !== undefined) item.rationale = pending.rationale;
    items.push(item);
    pending = null;
  };

  for (const rawLine of lines) {
    const line = rawLine;
    const trimmed = line.trim();

    // Subsection heading: ### Questions / ### Concerns
    const subMatch = /^[ \t]*###[ \t]+(Questions|Concerns)[ \t]*$/i.exec(trimmed);
    if (subMatch !== null) {
      flushPending();
      const label = (subMatch[1] ?? '').toLowerCase();
      sectionKind = label === 'questions' ? 'question' : 'concern';
      continue;
    }

    // Item start: - Q: ... or - C: ... (honor explicit kind marker over section)
    const itemMatch = /^[ \t]*-[ \t]+([QqCc]):[ \t]*(.*)$/.exec(line);
    if (itemMatch !== null) {
      flushPending();
      const markerRaw = itemMatch[1] ?? '';
      const marker = markerRaw.toUpperCase();
      const textRest = (itemMatch[2] ?? '').trim();
      // If inside a section, trust the section kind; otherwise infer
      // from the marker. The explicit marker is also honored even
      // when it disagrees with the section (e.g., a `- Q:` inside
      // Concerns is treated as a question).
      const kind: 'question' | 'concern' =
        marker === 'Q' ? 'question'
        : marker === 'C' ? 'concern'
        : sectionKind ?? 'question';
      pending = {
        kind,
        text: textRest,
      };
      continue;
    }

    // Field line: indented Concern: / Area: / Severity: / Rationale:
    const fieldMatch = /^[ \t]+(Concern|Area|Severity|Rationale):[ \t]*(.*)$/.exec(line);
    if (fieldMatch !== null && pending !== null) {
      const fieldRaw = fieldMatch[1] ?? '';
      const field = fieldRaw.toLowerCase();
      const value = (fieldMatch[2] ?? '').trim();
      if (field === 'concern' || field === 'area') {
        if (value !== '') pending.tag = value;
      } else if (field === 'severity') {
        pending.severity = value;
      } else if (field === 'rationale') {
        if (value !== '') pending.rationale = value;
      }
      continue;
    }

    // Blank lines or irrelevant prose: leave pending open so a trailing
    // field on the next line still attaches to the same item.
    if (trimmed === '') continue;

    // Unrecognized non-blank line inside a section terminates the current
    // item but does not abort parsing — this is the "lenient" rule.
    // We flush and keep walking.
    if (pending !== null && !line.startsWith(' ') && !line.startsWith('\t')) {
      flushPending();
    }
  }

  flushPending();

  return Object.freeze(items);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface PendingItem {
  kind: 'question' | 'concern';
  text: string;
  tag?: string;
  severity?: string;
  rationale?: string;
}

/**
 * Normalize a raw severity string to the `Severity` union. Unknown /
 * empty / missing values fall back to `'minor'` per the parse rules.
 */
function normalizeSeverity(raw: string | undefined): Severity {
  if (raw === undefined) return 'minor';
  const v = raw.trim().toLowerCase();
  if (v === '') return 'minor';
  if (v === 'blocker' || v === 'critical') return 'blocker';
  if (v === 'major' || v === 'high') return 'major';
  if (v === 'minor' || v === 'low') return 'minor';
  if (v === 'nice-to-have' || v === 'nice to have' || v === 'nth') return 'nice-to-have';
  return 'minor';
}
