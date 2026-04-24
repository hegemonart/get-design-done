// scripts/lib/prompt-sanitizer/patterns.ts
//
// Frozen pattern list used by `sanitize()` (see ./index.ts).
// Each entry is applied in order, per-segment, against the non-code-fence text
// of a skill body. Keep patterns independent — order is only relevant when two
// patterns would overlap (none do today, but add tests if you introduce one).
//
// Required by Phase 21's session-runner. Do NOT add runtime behavior here —
// this file is declarative only.

/**
 * A single sanitization rule.
 *
 * `match` is a global regex run via `String.prototype.replace`.
 * `replace` is either a static string or a function receiving the full match
 * (and any captured groups, per the standard replace callback contract).
 */
export interface SanitizePattern {
  readonly name: string;
  readonly match: RegExp;
  readonly replace: string | ((substring: string, ...args: unknown[]) => string);
  readonly description: string;
}

/**
 * `@file:` references — the headless runner resolves paths differently from
 * interactive CC, so these would leak stale context. Replace with a marker so
 * downstream prompts don't silently omit the fact that something was stripped.
 *
 * Example: `@file:./notes.md` → `(file reference removed)`.
 */
const FILE_REF: SanitizePattern = {
  name: 'file-ref',
  match: /@file:[^\s)]+/g,
  replace: '(file reference removed)',
  description: '@file:path.md style references (stripped — Claude Code resolves them at read time, headless runner does not)',
};

/**
 * `@./` or `@/` path prefixes — same rationale as `file-ref` but different
 * surface. Captures the leading whitespace/BOS so we don't accidentally glue
 * adjacent tokens together.
 *
 * Example: `See @./skill.md for details` → `See (file reference removed) for details`.
 *
 * Carefully does NOT match `@hegemonart/npm-package` (the char after `@` must
 * be `/` or `.`), or `@file-finder` (no slash at all).
 */
const AT_PREFIX: SanitizePattern = {
  name: 'at-prefix',
  match: /(^|\s)@\.?\/[^\s)]+/g,
  replace: (_m: string, ...args: unknown[]): string => {
    const lead: string = typeof args[0] === 'string' ? args[0] : '';
    return `${lead}(file reference removed)`;
  },
  description: '@./ or @/ relative path prefixes (stripped — same reason as file-ref)',
};

/**
 * `/gdd:` slash-command invocations. No dispatch target exists in a headless
 * session — CC's slash-command router is a CC-only construct. Trailing args
 * on the same line are consumed.
 *
 * Example: `Run /gdd:progress` → `Run (slash command removed)`.
 */
const SLASH_CMD: SanitizePattern = {
  // NOTE: trailing-arg group uses [ \t]+ not \s+ to avoid eating the final
  // newline on `Run /gdd:progress\n` style inputs (the \s class includes \n).
  name: 'slash-cmd',
  match: /\/gdd:[a-z-]+(?:[ \t]+[^\n]*)?/g,
  replace: '(slash command removed)',
  description: '/gdd:command invocations (stripped — no dispatch target in headless mode)',
};

/**
 * `AskUserQuestion(` call-site markers. Only matches the opening token —
 * paren balancing is done by the sanitizer driver in index.ts (can't express
 * balanced parens in RE2-compatible regex). This entry exists so the pattern
 * name is registered in the `applied` array; the actual substitution happens
 * in the driver.
 *
 * The driver scans from each `AskUserQuestion(` forward, tracking string
 * literals and paren depth, and replaces the entire call with the marker.
 *
 * Example: `AskUserQuestion({ title: 'x' })` → `(user question removed — proceed with default)`.
 */
const ASK_USER_Q: SanitizePattern = {
  name: 'ask-user-q',
  // The driver in index.ts owns the paren-balanced walk. This regex is used
  // only for match detection in the applied-array report, not for replacement.
  match: /AskUserQuestion\s*\(/g,
  replace: '(user question removed — proceed with default)',
  description: 'AskUserQuestion(...) call sites (stripped with paren balancing — no user to answer in headless mode)',
};

/**
 * Bare `STOP` directives on their own line — strip the entire line including
 * any trailing prose on the same line. Matches `STOP`, `STOP if ...`, `STOP —
 * verify X`, but NOT mid-sentence `stop` (case-sensitive, word-boundary).
 *
 * Example:
 *   Before the next step:
 *   STOP until the user confirms
 *   Then proceed.
 * →
 *   Before the next step:
 *
 *   Then proceed.
 */
const STOP_LINE: SanitizePattern = {
  // NOTE: leading-whitespace class is [ \t]* not \s* — \s includes \n which
  // would cause the match to greedily consume the preceding blank line's
  // newline when STOP is the last line of input, producing one-fewer newline
  // than the authored separator between "resolution." and EOF.
  name: 'stop-line',
  match: /^[ \t]*STOP\b.*$/gm,
  replace: '',
  description: 'Lines starting with STOP (halt directives are interactive-only)',
};

/**
 * English prose that describes waiting for a human. These phrases are
 * case-insensitive (prose varies) but word-bounded so we don't match tokens
 * embedded in identifiers.
 *
 * NOTE: keep this list narrow — overmatching risks neutering legitimate
 * documentation about user-facing features. If a skill author wants to
 * preserve such prose, they can quote it inside a code fence.
 */
const PROSE_WAIT: SanitizePattern = {
  name: 'prose-wait',
  match: /\b(wait for user|ask the user|pause for|human confirmation|user approval)\b/gi,
  replace: '(interactive gate removed)',
  description: 'Prose interactive gates (e.g. "wait for user", "ask the user") replaced with a neutral marker',
};

/**
 * The full ordered list. Exported as a `readonly` frozen array so consumers
 * can enumerate but not mutate. Order matters only insofar as callers
 * iterating this array expect `file-ref` and `at-prefix` to resolve before
 * `slash-cmd` (distinct surfaces, no real conflict).
 */
export const PATTERNS: readonly SanitizePattern[] = Object.freeze([
  FILE_REF,
  AT_PREFIX,
  SLASH_CMD,
  ASK_USER_Q,
  STOP_LINE,
  PROSE_WAIT,
]);

/**
 * Multi-line section stripper. Matches a `## HUMAN VERIFY` heading (with any
 * trailing text on the heading line) and consumes everything up to the next
 * `## ` heading at column 0 or end-of-input.
 *
 * Used by the sanitizer driver; not part of the `PATTERNS` list because its
 * match/replace shape is different (consumes multiple lines, always strips
 * to empty).
 */
export const HUMAN_VERIFY_HEADING: RegExp = /^## HUMAN VERIFY[^\n]*\n[\s\S]*?(?=^## |$(?![\r\n]))/m;

/**
 * Marker used when the ask-user-q paren-balancing walker collapses a call.
 * Exported so tests can assert the exact substitution text.
 */
export const ASK_USER_Q_REPLACEMENT: string = '(user question removed — proceed with default)';

/**
 * Human-verify section removal marker stored in `removedSections`. Not written
 * into the output (section is fully removed), only reported.
 */
export const HUMAN_VERIFY_LABEL: string = 'HUMAN VERIFY';
