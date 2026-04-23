// scripts/lib/prompt-sanitizer/index.ts
//
// sanitize() — remove human-gating constructs from skill markdown bodies so
// they can execute in Phase 21's headless Anthropic Agent SDK runner.
//
// This is a TEXT TRANSFORM, not a parser. Skills are markdown; we use regex
// and light structural parsing (frontmatter/code-fence boundary detection).
// A lossy transform is the correct fidelity here — skills were authored for
// interactive CC and we are neutering the interactive constructs.
//
// Contracts (verified by tests/prompt-sanitizer.test.ts):
//   - Deterministic: sanitize(x) === sanitize(x).
//   - Idempotent: sanitize(sanitize(x).sanitized).sanitized === sanitize(x).sanitized.
//   - Code fences are preserved byte-identical (content inside triple-backticks
//     is never transformed).
//   - Frontmatter (leading `---\n...\n---\n`) is preserved byte-identical.
//   - Empty input returns `{ sanitized: '', applied: [], removedSections: [] }`.
//
// Consumed by: Phase 21's session-runner (scripts/session-runner or similar).

import {
  PATTERNS,
  HUMAN_VERIFY_HEADING,
  HUMAN_VERIFY_LABEL,
  ASK_USER_Q_REPLACEMENT,
  type SanitizePattern,
} from './patterns.ts';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface SanitizeOptions {
  /** When false, code-fence content is treated as regular text. Default: true. */
  readonly preserveCodeFences?: boolean;
  /** When false, leading frontmatter is treated as regular text. Default: true. */
  readonly preserveFrontmatter?: boolean;
}

export interface SanitizeResult {
  /** The transformed text. */
  readonly sanitized: string;
  /** Pattern names that actually fired at least once (sorted, de-duplicated). */
  readonly applied: readonly string[];
  /** Headings of sections removed in full (e.g. 'HUMAN VERIFY'). */
  readonly removedSections: readonly string[];
}

/**
 * Strip human-gating constructs from a skill body.
 *
 * @param raw   the full SKILL.md contents (frontmatter + body).
 * @param opts  optional toggles; both default to true.
 * @returns     `{ sanitized, applied, removedSections }` — see types above.
 */
export function sanitize(raw: string, opts?: SanitizeOptions): SanitizeResult {
  if (raw.length === 0) {
    return { sanitized: '', applied: [], removedSections: [] };
  }

  const preserveCodeFences: boolean = opts?.preserveCodeFences !== false;
  const preserveFrontmatter: boolean = opts?.preserveFrontmatter !== false;

  // 1. Split out frontmatter.
  const { frontmatter, body } = preserveFrontmatter
    ? splitFrontmatter(raw)
    : { frontmatter: '', body: raw };

  // 2. Split body into text / code-fence segments.
  const segments: Segment[] = preserveCodeFences
    ? splitCodeFences(body)
    : [{ kind: 'text', content: body }];

  // 3. Transform text segments only.
  const applied: Set<string> = new Set<string>();
  const removedSections: string[] = [];

  const transformed: string[] = segments.map((seg: Segment): string => {
    if (seg.kind === 'code') return seg.content;
    return transformTextSegment(seg.content, applied, removedSections);
  });

  // 4. Reassemble.
  const rebuiltBody: string = transformed.join('');
  const sanitized: string = frontmatter + rebuiltBody;

  // 5. Normalize output: collapse 3+ consecutive blank lines to 2. Applied to
  //    the body only so frontmatter formatting is never altered.
  const normalizedBody: string = collapseBlankLines(rebuiltBody);
  const out: string = frontmatter + normalizedBody;

  return {
    sanitized: out === sanitized ? sanitized : out,
    applied: Array.from(applied).sort(),
    removedSections: removedSections.slice(),
  };
}

// ---------------------------------------------------------------------------
// Internal — segment model
// ---------------------------------------------------------------------------

interface TextSegment {
  readonly kind: 'text';
  readonly content: string;
}
interface CodeSegment {
  readonly kind: 'code';
  readonly content: string;
}
type Segment = TextSegment | CodeSegment;

// ---------------------------------------------------------------------------
// Frontmatter detection
// ---------------------------------------------------------------------------

/**
 * Detect a leading YAML-ish frontmatter block. A frontmatter block must begin
 * at position 0 with `---\n` (or `---\r\n`), contain any content, then end
 * with `\n---\n`. Anything else is treated as body.
 */
function splitFrontmatter(raw: string): { frontmatter: string; body: string } {
  // Accept CRLF or LF.
  const match: RegExpExecArray | null = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(raw);
  if (match === null) {
    return { frontmatter: '', body: raw };
  }
  const fm: string = match[0];
  return { frontmatter: fm, body: raw.slice(fm.length) };
}

// ---------------------------------------------------------------------------
// Code-fence splitter
// ---------------------------------------------------------------------------

/**
 * Walk the body line by line, toggling in/out of code-fence state whenever a
 * line matches `^```` (three-or-more backticks, optional language tag). An
 * unclosed fence at EOF keeps everything after the opening fence as `code`
 * (per plan spec: "Unclosed code fence → treat everything after the opening
 * fence as code").
 *
 * Content is preserved with original line endings. The returned segments,
 * when concatenated, reproduce the input exactly.
 */
function splitCodeFences(body: string): Segment[] {
  const segments: Segment[] = [];
  // Split keeping newlines. We build segments by iterating lines and tracking
  // mode. A segment boundary coincides with a fence line.
  const fenceRe: RegExp = /^ {0,3}`{3,}[^`\n]*$/;

  let mode: 'text' | 'code' = 'text';
  let buf: string[] = [];

  // Preserve original line endings by splitting on \n and tracking whether
  // each line ended with \r. We'll re-emit the exact trailing newline.
  const parts: string[] = body.split('\n');
  // When we split on '\n', the last element is what followed the final '\n'.
  // Reassembly: parts.join('\n') === body exactly.

  const flush = (): void => {
    if (buf.length === 0) return;
    const joined: string = buf.join('\n');
    if (mode === 'text') {
      segments.push({ kind: 'text', content: joined });
    } else {
      segments.push({ kind: 'code', content: joined });
    }
    buf = [];
  };

  for (let i = 0; i < parts.length; i++) {
    const line: string = parts[i] as string;
    const lineNoCr: string = line.endsWith('\r') ? line.slice(0, -1) : line;
    const isFence: boolean = fenceRe.test(lineNoCr);

    if (isFence) {
      if (mode === 'text') {
        // Close text segment; fence line starts the code segment.
        flush();
        mode = 'code';
        buf.push(line);
      } else {
        // Close code segment; fence line is the last code line.
        buf.push(line);
        flush();
        mode = 'text';
      }
    } else {
      buf.push(line);
    }
  }

  // Emit trailing segment. If we're still in 'code' mode (unclosed fence), it
  // stays code per spec.
  flush();

  // Join segments back with '\n' separators — the parts array uses '\n' as
  // the split delimiter, so reassembly needs the same.
  // Insert '\n' between consecutive segments.
  const joined: Segment[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg: Segment = segments[i] as Segment;
    if (i === 0) {
      joined.push(seg);
    } else {
      // Prepend '\n' onto this segment so concat(seg0.content + seg1.content + ...) === body.
      const prev: Segment = joined[joined.length - 1] as Segment;
      if (seg.kind === prev.kind) {
        // Merge (shouldn't normally happen due to toggle logic).
        joined[joined.length - 1] = { kind: prev.kind, content: prev.content + '\n' + seg.content };
      } else {
        joined.push({ kind: seg.kind, content: '\n' + seg.content });
      }
    }
  }

  return joined;
}

// ---------------------------------------------------------------------------
// Text-segment transformation
// ---------------------------------------------------------------------------

/**
 * Apply all pattern replacements to a single text segment.
 *
 * The order is:
 *   1. Strip `## HUMAN VERIFY` sections.
 *   2. Paren-balanced replacement of `AskUserQuestion(...)` calls.
 *   3. Iterate `PATTERNS` (file-ref, at-prefix, slash-cmd, stop-line,
 *      prose-wait). We skip the `ask-user-q` regex because step 2 owns it.
 *
 * Mutates `applied` and `removedSections`.
 */
function transformTextSegment(
  segment: string,
  applied: Set<string>,
  removedSections: string[],
): string {
  let text: string = segment;

  // 1. HUMAN VERIFY sections.
  text = stripHumanVerifySections(text, removedSections);

  // 2. AskUserQuestion(...) — paren-balanced.
  const afterAsk: { text: string; replaced: number } = replaceAskUserQuestion(text);
  if (afterAsk.replaced > 0) applied.add('ask-user-q');
  text = afterAsk.text;

  // 3. Regex patterns.
  for (const pattern of PATTERNS) {
    if (pattern.name === 'ask-user-q') continue; // owned by step 2
    const before: string = text;
    const replace: SanitizePattern['replace'] = pattern.replace;
    text =
      typeof replace === 'string'
        ? text.replace(pattern.match, replace)
        : text.replace(pattern.match, ((match: string, ...args: unknown[]): string =>
            replace(match, ...args)) as unknown as (substring: string, ...args: unknown[]) => string);
    if (text !== before) applied.add(pattern.name);
  }

  return text;
}

/**
 * Remove `## HUMAN VERIFY` sections from start of a heading line through the
 * next `## ` heading (or end-of-segment). Records each removed section in
 * `removedSections`.
 */
function stripHumanVerifySections(text: string, removedSections: string[]): string {
  let out: string = text;
  // Loop because multiple HUMAN VERIFY sections could exist in one segment.
  for (;;) {
    const re: RegExp = new RegExp(HUMAN_VERIFY_HEADING.source, HUMAN_VERIFY_HEADING.flags);
    const m: RegExpExecArray | null = re.exec(out);
    if (m === null) break;
    removedSections.push(HUMAN_VERIFY_LABEL);
    const before: string = out.slice(0, m.index);
    const after: string = out.slice(m.index + m[0].length);
    out = before + after;
  }
  return out;
}

/**
 * Find every `AskUserQuestion(` and replace the entire balanced call (paren
 * depth tracked across string/template literals) with a neutral marker.
 *
 * Returns the transformed text and a count of replacements.
 *
 * Implementation notes:
 *   - Tracks single-quote, double-quote, and backtick string literals.
 *     Template-literal `${...}` re-enters code mode for paren counting.
 *   - Does NOT attempt to track comments — skill bodies aren't JS, they may
 *     contain prose like "// foo" that coincidentally sits inside a call.
 *     Close parens inside string literals are still safely skipped.
 *   - If a match opens but never closes (malformed input), the whole tail
 *     from the open paren is replaced — the input is broken anyway.
 */
function replaceAskUserQuestion(text: string): { text: string; replaced: number } {
  const opener: RegExp = /AskUserQuestion\s*\(/g;
  let result: string = '';
  let cursor: number = 0;
  let replaced: number = 0;

  for (;;) {
    opener.lastIndex = cursor;
    const match: RegExpExecArray | null = opener.exec(text);
    if (match === null) {
      result += text.slice(cursor);
      break;
    }

    const matchStart: number = match.index;
    const openParenIdx: number = match.index + match[0].length - 1; // index of the '('

    // Emit text before the match untouched.
    result += text.slice(cursor, matchStart);

    // Walk forward from openParenIdx, tracking paren depth + string state.
    const endExclusive: number = findBalancedClose(text, openParenIdx);
    // endExclusive is the index AFTER the closing ')'. If malformed, it's text.length.

    result += ASK_USER_Q_REPLACEMENT;
    cursor = endExclusive;
    replaced += 1;
  }

  return { text: result, replaced };
}

/**
 * Starting at index `openIdx` (which must be an opening paren), walk forward
 * and return the index AFTER the matching close paren, honoring string/
 * template literals and `${...}` template expressions.
 *
 * If the paren never closes, returns `text.length`.
 */
function findBalancedClose(text: string, openIdx: number): number {
  // State stack: tracks what context we're in.
  //   'paren' — inside parens, counts toward depth.
  //   'sq'    — inside single-quoted string.
  //   'dq'    — inside double-quoted string.
  //   'tpl'   — inside template-literal (backtick) string.
  //   'tpl-expr' — inside ${...} expression inside a template literal.
  type State = 'paren' | 'sq' | 'dq' | 'tpl' | 'tpl-expr';
  const stack: State[] = ['paren'];
  let i: number = openIdx + 1;
  const n: number = text.length;

  while (i < n) {
    const ch: string = text[i] as string;
    const top: State = stack[stack.length - 1] as State;

    // Escape: inside any string, a backslash consumes the next char.
    if ((top === 'sq' || top === 'dq' || top === 'tpl') && ch === '\\') {
      i += 2;
      continue;
    }

    switch (top) {
      case 'paren':
      case 'tpl-expr': {
        if (ch === '(') {
          stack.push('paren');
        } else if (ch === ')') {
          stack.pop();
          if (stack.length === 0) return i + 1;
        } else if (ch === "'") {
          stack.push('sq');
        } else if (ch === '"') {
          stack.push('dq');
        } else if (ch === '`') {
          stack.push('tpl');
        } else if (top === 'tpl-expr' && ch === '}') {
          stack.pop();
        } else if (ch === '{') {
          // Inside a nested expression `${...}` we count braces so we don't
          // mistake inner `}` for the template-expression terminator.
          // Push a sentinel paren-equivalent: reuse 'paren' so '(' / ')' logic
          // also correctly counts inner calls, but we need a distinct marker
          // for '}'. Simplest approach: track braces via a separate counter.
          // Here we just ignore '{' because inside 'paren' context plain JS
          // object literals don't affect our close-paren search (we only
          // care about parens + strings). Intentional no-op.
        }
        break;
      }
      case 'sq': {
        if (ch === "'") stack.pop();
        break;
      }
      case 'dq': {
        if (ch === '"') stack.pop();
        break;
      }
      case 'tpl': {
        if (ch === '`') {
          stack.pop();
        } else if (ch === '$' && text[i + 1] === '{') {
          stack.push('tpl-expr');
          i += 2;
          continue;
        }
        break;
      }
    }
    i += 1;
  }

  // Unterminated.
  return n;
}

// ---------------------------------------------------------------------------
// Post-processing — collapse runs of blank lines
// ---------------------------------------------------------------------------

/**
 * Replace any run of 3+ consecutive blank lines with exactly two blank lines
 * (i.e. three consecutive '\n'). Preserves CRLF vs LF.
 *
 * Rationale: stripping `STOP` lines and HUMAN VERIFY sections can leave
 * visually large holes in the output. Collapsing to at most 2 blank lines
 * keeps the transform stable (idempotent) and readable.
 */
function collapseBlankLines(text: string): string {
  // Handle CRLF first so we don't double-transform.
  if (text.includes('\r\n')) {
    return text.replace(/(\r\n){3,}/g, '\r\n\r\n\r\n');
  }
  return text.replace(/\n{4,}/g, '\n\n\n');
}
