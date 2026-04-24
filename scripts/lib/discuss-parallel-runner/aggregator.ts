// scripts/lib/discuss-parallel-runner/aggregator.ts — Plan 21-07 (SDK-19).
//
// Aggregator session + AggregatedDiscussion parser.
//
// Public surface:
//   * buildAggregatorPrompt — construct the aggregator prompt from N
//                             DiscussionContributions (instructs dedup /
//                             cluster / rank / emit JSON block).
//   * spawnAggregator        — session-runner call → parse output → write
//                              Markdown to outputPath.
//   * parseAggregatorOutput  — parse a final_text containing a Markdown
//                              discussion + trailing ```json fence with
//                              { themes, questions }.
//
// Key format: AggregatedQuestion.key is SHA-256 of the normalized
// question text (lowercase, whitespace-collapsed) truncated to 8 hex
// chars. This function is available on `computeQuestionKey` for tests
// that want to assert stable keys.

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { run as defaultRun } from '../session-runner/index.ts';
import type {
  BudgetCap,
  SessionResult,
  SessionRunnerOptions,
} from '../session-runner/types.ts';
import { ValidationError } from '../gdd-errors/index.ts';
import { getLogger } from '../logger/index.ts';

import type {
  AggregatedDiscussion,
  AggregatedQuestion,
  DiscussantName,
  DiscussionContribution,
  Severity,
} from './types.ts';

/** Shared run-override shape. */
export type AggregatorRunOverride = (
  opts: SessionRunnerOptions,
) => Promise<SessionResult>;

/** Options for `spawnAggregator`. */
export interface SpawnAggregatorOptions {
  budget: BudgetCap;
  maxTurns: number;
  runOverride?: AggregatorRunOverride;
  cwd: string;
  customPrompt?: string;
  /** Output path for the aggregated Markdown. Default: `.design/DISCUSSION.md`. */
  outputPath?: string;
}

// ---------------------------------------------------------------------------
// Default aggregator prompt
// ---------------------------------------------------------------------------

/**
 * Default aggregator prompt. Instructs the model to dedupe, cluster,
 * rank, and emit both Markdown + a machine-readable JSON fence.
 *
 * The prompt is a literal so tests can assert its structure without
 * cross-referencing another file.
 */
const DEFAULT_AGGREGATOR_INSTRUCTION = [
  'You are the discussion aggregator. Below are N discussant contributions, each',
  'listing questions + concerns from a different angle. Your job:',
  '',
  '1. Dedupe: collapse near-duplicate questions into one.',
  '2. Cluster: assign each merged question to a named theme.',
  '3. Rank: order questions by severity (blocker > major > minor > nice-to-have),',
  '   breaking ties by frequency (how many discussants raised it).',
  '4. Emit Markdown at .design/DISCUSSION.md with theme sections + ranked question',
  '   list.',
  '5. Append a machine-readable JSON block at the end:',
  '',
  '```json',
  '{',
  '  "themes": [{"name": "...", "summary": "..."}],',
  '  "questions": [{"key": "hash", "text": "...", "severity": "...",',
  '                 "raised_by": ["..."], "theme": "...", "rank": 0}]',
  '}',
  '```',
  '',
  'Key rule: `key` is the SHA-256 of the normalized question text (lowercase,',
  'whitespace-collapsed) truncated to 8 hex chars. Use this for stable cross-run',
  'identity.',
  '',
  'Contributions follow:',
].join('\n');

/** Marker string used to separate instruction from contribution payload. */
const CONTRIBUTIONS_SEPARATOR = '\n\n---\n\n';

// ---------------------------------------------------------------------------
// buildAggregatorPrompt
// ---------------------------------------------------------------------------

/**
 * Build an aggregator prompt from N DiscussionContributions. The
 * instruction block is the default above (or `customPrompt` if
 * supplied), followed by `---` separator, followed by each contribution
 * serialized with a header:
 *
 *   ### Discussant: <name>
 *   <raw body>
 *
 * Contributions with empty `raw` still emit the header so the aggregator
 * sees every discussant's presence.
 */
export function buildAggregatorPrompt(
  contributions: readonly DiscussionContribution[],
  customPrompt?: string,
): string {
  const instruction = customPrompt !== undefined && customPrompt !== ''
    ? customPrompt
    : DEFAULT_AGGREGATOR_INSTRUCTION;

  const body: string[] = [];
  for (const c of contributions) {
    body.push(`### Discussant: ${c.discussant}`);
    body.push('');
    body.push(c.raw);
    body.push('');
  }

  if (body.length === 0) {
    return instruction;
  }

  return instruction + CONTRIBUTIONS_SEPARATOR + body.join('\n').trimEnd();
}

// ---------------------------------------------------------------------------
// spawnAggregator
// ---------------------------------------------------------------------------

/**
 * Spawn the aggregator session via `session-runner.run()`. Parses the
 * final_text with `parseAggregatorOutput`. Always writes the parsed
 * Markdown to `opts.outputPath` (defaults to `.design/DISCUSSION.md`).
 *
 * Throws `ValidationError('AGGREGATOR_PARSE_ERROR')` when the JSON
 * fence is absent/malformed; the caller decides whether that's fatal.
 * Session-level failures (budget / turn cap / abort / error) also
 * throw `OperationFailedError`-shaped errors via an
 * `AGGREGATOR_SESSION_FAILED` code.
 */
export async function spawnAggregator(
  contributions: readonly DiscussionContribution[],
  opts: SpawnAggregatorOptions,
): Promise<AggregatedDiscussion> {
  const logger = getLogger();
  const runImpl = opts.runOverride ?? defaultRun;
  const outputPath = opts.outputPath ?? '.design/DISCUSSION.md';

  const prompt = buildAggregatorPrompt(
    contributions,
    opts.customPrompt,
  );

  const sessionOpts: SessionRunnerOptions = {
    prompt,
    stage: 'custom',
    budget: opts.budget,
    turnCap: { maxTurns: opts.maxTurns },
  };

  logger.info('discuss.aggregator.started', {
    contributions: contributions.length,
    output_path: outputPath,
  });

  const result = await runImpl(sessionOpts);

  if (result.status !== 'completed') {
    const code = 'AGGREGATOR_SESSION_FAILED';
    const message = `aggregator session ended with status: ${result.status}`;
    logger.error('discuss.aggregator.session_failed', {
      status: result.status,
      code,
    });
    throw new ValidationError(message, code, {
      status: result.status,
      ...(result.error !== undefined ? { session_error: result.error } : {}),
    });
  }

  const aggregated = parseAggregatorOutput(
    result.final_text ?? '',
    outputPath,
  );

  // Overwrite usage with this session's numbers (parseAggregatorOutput
  // returns {0,0,0} since it has no session context).
  const withUsage: AggregatedDiscussion = {
    themes: aggregated.themes,
    questions: aggregated.questions,
    output_path: aggregated.output_path,
    usage: { ...result.usage },
  };

  logger.info('discuss.aggregator.completed', {
    themes: withUsage.themes.length,
    questions: withUsage.questions.length,
    output_path: outputPath,
  });

  return withUsage;
}

// ---------------------------------------------------------------------------
// parseAggregatorOutput
// ---------------------------------------------------------------------------

/**
 * Parse a ```json fenced block containing { themes, questions } into
 * an AggregatedDiscussion. Writes the Markdown portion (everything
 * before the LAST json fence) to `outputPath` as a side effect.
 *
 * Parse rules:
 *   * LAST `` ```json ... ``` `` fence wins (the prompt may show an
 *     example fence earlier; the final answer is always last).
 *   * JSON.parse the fence body. Validates:
 *       themes:    array of { name, summary }
 *       questions: array of { key, text, severity, raised_by, theme, rank }
 *   * On malformed JSON or missing fields: throws
 *     `ValidationError('AGGREGATOR_PARSE_ERROR')` with the final-text
 *     tail in context for operator debugging.
 *   * `usage` in the return value is zeroed — the caller (spawnAggregator)
 *     overwrites with real session usage. parseAggregatorOutput is a
 *     pure text→structure function except for the side-effect write.
 */
export function parseAggregatorOutput(
  finalText: string,
  outputPath: string,
): AggregatedDiscussion {
  // Locate the LAST ```json ... ``` fence. The fence opener may have
  // optional whitespace before the triple backticks.
  const fenceRe = /```json\s*\r?\n([\s\S]*?)\r?\n```/g;
  let lastMatch: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(finalText)) !== null) {
    lastMatch = m;
  }

  if (lastMatch === null) {
    throw new ValidationError(
      'aggregator output missing ```json fence',
      'AGGREGATOR_PARSE_ERROR',
      { final_text_tail: tail(finalText, 500) },
    );
  }

  const jsonBody = lastMatch[1] ?? '';

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonBody);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ValidationError(
      `aggregator JSON.parse failed: ${msg}`,
      'AGGREGATOR_PARSE_ERROR',
      { final_text_tail: tail(finalText, 500) },
    );
  }

  const validated = validateAggregatorShape(parsed, finalText);

  // Extract the Markdown portion (everything BEFORE the last fence).
  const markdown = finalText.slice(0, lastMatch.index).trimEnd() + '\n';

  // Write Markdown to outputPath (create parent dir if needed).
  try {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, markdown, 'utf8');
  } catch (err) {
    // Write failures shouldn't abort the parse — they're an I/O
    // problem, not a validation problem. But we log them loudly.
    getLogger().error('discuss.aggregator.write_failed', {
      output_path: outputPath,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return {
    themes: validated.themes,
    questions: validated.questions,
    output_path: outputPath,
    usage: { input_tokens: 0, output_tokens: 0, usd_cost: 0 },
  };
}

// ---------------------------------------------------------------------------
// computeQuestionKey — public helper for stable key generation
// ---------------------------------------------------------------------------

/**
 * Compute a stable AggregatedQuestion.key for a given question text.
 * SHA-256 of the normalized text (lowercase, whitespace-collapsed),
 * truncated to 8 hex chars. Deterministic across runs.
 */
export function computeQuestionKey(questionText: string): string {
  const normalized = questionText.trim().toLowerCase().replace(/\s+/g, ' ');
  const hash = createHash('sha256').update(normalized, 'utf8').digest('hex');
  return hash.slice(0, 8);
}

// ---------------------------------------------------------------------------
// Internal validators
// ---------------------------------------------------------------------------

interface ValidatedShape {
  themes: readonly { name: string; summary: string }[];
  questions: readonly AggregatedQuestion[];
}

function validateAggregatorShape(raw: unknown, finalText: string): ValidatedShape {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ValidationError(
      'aggregator JSON root must be an object',
      'AGGREGATOR_PARSE_ERROR',
      { final_text_tail: tail(finalText, 500) },
    );
  }
  const obj = raw as Record<string, unknown>;

  const rawThemes = obj['themes'];
  if (!Array.isArray(rawThemes)) {
    throw new ValidationError(
      'aggregator JSON.themes must be an array',
      'AGGREGATOR_PARSE_ERROR',
      { final_text_tail: tail(finalText, 500) },
    );
  }
  const themes: Array<{ name: string; summary: string }> = [];
  for (let i = 0; i < rawThemes.length; i += 1) {
    const t = rawThemes[i];
    if (t === null || typeof t !== 'object' || Array.isArray(t)) {
      throw new ValidationError(
        `aggregator JSON.themes[${i}] must be an object`,
        'AGGREGATOR_PARSE_ERROR',
        { final_text_tail: tail(finalText, 500) },
      );
    }
    const th = t as Record<string, unknown>;
    const name = th['name'];
    const summary = th['summary'];
    if (typeof name !== 'string' || typeof summary !== 'string') {
      throw new ValidationError(
        `aggregator JSON.themes[${i}] requires string name + summary`,
        'AGGREGATOR_PARSE_ERROR',
        { final_text_tail: tail(finalText, 500) },
      );
    }
    themes.push({ name, summary });
  }

  const rawQuestions = obj['questions'];
  if (!Array.isArray(rawQuestions)) {
    throw new ValidationError(
      'aggregator JSON.questions must be an array',
      'AGGREGATOR_PARSE_ERROR',
      { final_text_tail: tail(finalText, 500) },
    );
  }
  const questions: AggregatedQuestion[] = [];
  for (let i = 0; i < rawQuestions.length; i += 1) {
    const q = rawQuestions[i];
    if (q === null || typeof q !== 'object' || Array.isArray(q)) {
      throw new ValidationError(
        `aggregator JSON.questions[${i}] must be an object`,
        'AGGREGATOR_PARSE_ERROR',
        { final_text_tail: tail(finalText, 500) },
      );
    }
    const qr = q as Record<string, unknown>;
    const key = qr['key'];
    const text = qr['text'];
    const severity = qr['severity'];
    const raisedBy = qr['raised_by'];
    const theme = qr['theme'];
    const rank = qr['rank'];
    if (
      typeof key !== 'string' ||
      typeof text !== 'string' ||
      typeof severity !== 'string' ||
      !Array.isArray(raisedBy) ||
      typeof theme !== 'string' ||
      typeof rank !== 'number'
    ) {
      throw new ValidationError(
        `aggregator JSON.questions[${i}] missing required fields`,
        'AGGREGATOR_PARSE_ERROR',
        { final_text_tail: tail(finalText, 500) },
      );
    }
    // Validate raised_by entries are strings.
    const rbStrings: DiscussantName[] = [];
    for (let j = 0; j < raisedBy.length; j += 1) {
      const v = raisedBy[j];
      if (typeof v !== 'string') {
        throw new ValidationError(
          `aggregator JSON.questions[${i}].raised_by[${j}] must be a string`,
          'AGGREGATOR_PARSE_ERROR',
          { final_text_tail: tail(finalText, 500) },
        );
      }
      rbStrings.push(v);
    }
    // Coerce severity to the union (lenient — treat unknowns as 'minor').
    const sev = coerceSeverity(severity);
    questions.push({
      key,
      text,
      severity: sev,
      raised_by: Object.freeze(rbStrings),
      theme,
      rank,
    });
  }

  return {
    themes: Object.freeze(themes),
    questions: Object.freeze(questions),
  };
}

function coerceSeverity(raw: string): Severity {
  const v = raw.trim().toLowerCase();
  if (v === 'blocker') return 'blocker';
  if (v === 'major') return 'major';
  if (v === 'minor') return 'minor';
  if (v === 'nice-to-have' || v === 'nice to have') return 'nice-to-have';
  // Lenient fallback — unknown severity values become 'minor' rather
  // than throwing. The aggregator prompt constrains the model, but we
  // shouldn't make the entire parse fail over a severity typo.
  return 'minor';
}

function tail(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(s.length - n);
}
