// scripts/lib/context-engine/truncate.ts — markdown-aware truncation that
// preserves frontmatter verbatim, every heading line, and the first paragraph
// of each section. Files at or below the threshold pass through byte-identical.
//
// Algorithm is deterministic and line-based: no regex over the full buffer,
// no streaming. Designed for `.design/*.md` files which are short enough that
// a line array fits comfortably in memory.

import { Buffer } from 'node:buffer';

/** Byte budget for preamble text between frontmatter close and the first heading. */
const PREAMBLE_BYTE_BUDGET = 500;
/** Cap on frontmatter scan depth to avoid pathological files. */
const FRONTMATTER_SCAN_CAP = 200;
/** Marker emitted when preamble exceeds its byte budget. */
const PREAMBLE_MARKER = '<!-- truncated preamble -->';

export interface TruncateResult {
  content: string;
  /** Lines removed in aggregate. */
  truncated_lines: number;
}

/**
 * If `raw` is at or under `thresholdBytes`, returns the input byte-identical
 * with `truncated_lines: 0`. Otherwise applies markdown-aware truncation per
 * the Plan 21-02 spec.
 */
export function truncateMarkdown(raw: string, thresholdBytes: number): TruncateResult {
  if (Buffer.byteLength(raw, 'utf8') <= thresholdBytes) {
    return { content: raw, truncated_lines: 0 };
  }

  // Split on \n; JavaScript's split drops the trailing empty fragment only
  // when the string ends with exactly one \n, so a file ending in "\n" gives
  // us an empty last entry we must preserve to round-trip exactly.
  const lines = raw.split('\n');

  const frontmatterEnd = detectFrontmatterEnd(lines);
  const frontmatterLines = frontmatterEnd >= 0 ? lines.slice(0, frontmatterEnd + 1) : [];
  const bodyStart = frontmatterEnd >= 0 ? frontmatterEnd + 1 : 0;
  const body = lines.slice(bodyStart);

  // First heading index inside the body slice (relative to body, not lines).
  const firstHeadingInBody = body.findIndex(isHeadingLine);

  // Preamble: lines between frontmatter close and the first heading.
  let preambleLines: string[] = [];
  let preambleDrops = 0;
  let preambleEndInBody = 0;
  if (firstHeadingInBody < 0) {
    // No headings at all. Everything in body is preamble — and the spec says
    // "entire body becomes one preamble -> truncated preamble marker" when
    // there are no headings in an over-threshold file. We still apply the
    // 500-byte budget: short prose is kept, long prose is replaced.
    preambleEndInBody = body.length;
    const preambleRaw = body.join('\n');
    if (Buffer.byteLength(preambleRaw, 'utf8') <= PREAMBLE_BYTE_BUDGET && preambleRaw.length > 0) {
      preambleLines = body.slice();
    } else if (body.length > 0) {
      preambleLines = [PREAMBLE_MARKER];
      preambleDrops = body.length;
    }
  } else {
    preambleEndInBody = firstHeadingInBody;
    if (firstHeadingInBody > 0) {
      const preambleSlice = body.slice(0, firstHeadingInBody);
      // Strip leading + trailing blanks so spacing is owned by the output
      // assembler, not double-emitted here. Leading blanks come from the
      // `\n` that follows frontmatter's closing `---`; trailing blanks
      // come from the gap before the first heading.
      const trimmed = stripTrailingBlank(stripLeadingBlank(preambleSlice));
      const preambleRaw = trimmed.join('\n');
      if (trimmed.length === 0) {
        preambleLines = [];
      } else if (Buffer.byteLength(preambleRaw, 'utf8') <= PREAMBLE_BYTE_BUDGET) {
        preambleLines = trimmed;
      } else {
        preambleLines = [PREAMBLE_MARKER];
        preambleDrops = trimmed.length;
      }
    }
  }

  // Walk headings + first paragraphs from the first heading onward.
  const afterPreamble = body.slice(preambleEndInBody);
  const { kept, droppedLines } = walkHeadingsAndParagraphs(afterPreamble);

  // Assemble output: frontmatter + (optional blank) + preamble + (optional blank) + kept.
  const out: string[] = [];
  if (frontmatterLines.length > 0) {
    out.push(...frontmatterLines);
  }
  if (preambleLines.length > 0) {
    // Spacing: ensure exactly one blank line between frontmatter and preamble
    // if both are present.
    if (out.length > 0 && out[out.length - 1] !== '') {
      out.push('');
    }
    out.push(...preambleLines);
  }
  if (kept.length > 0) {
    if (out.length > 0 && out[out.length - 1] !== '') {
      out.push('');
    }
    out.push(...kept);
  }

  const content = out.join('\n');
  const truncated_lines = preambleDrops + droppedLines;
  return { content, truncated_lines };
}

/**
 * Detect a YAML frontmatter block's closing index. Returns the index of the
 * closing `---` line, or -1 if no well-formed frontmatter is present.
 *
 * A well-formed frontmatter requires: first non-empty line is `---`, AND a
 * matching closing `---` exists within the first FRONTMATTER_SCAN_CAP lines
 * OR within the file length (whichever is smaller).
 */
function detectFrontmatterEnd(lines: string[]): number {
  // Find the first non-empty line.
  let firstNonEmpty = -1;
  for (let i = 0; i < lines.length; i++) {
    if ((lines[i] ?? '').length > 0) {
      firstNonEmpty = i;
      break;
    }
  }
  if (firstNonEmpty < 0) return -1;
  if (lines[firstNonEmpty] !== '---') return -1;

  const scanCap = Math.min(FRONTMATTER_SCAN_CAP, lines.length - 1);
  for (let i = firstNonEmpty + 1; i <= scanCap; i++) {
    if (lines[i] === '---') return i;
  }
  return -1;
}

/**
 * True when `line` starts with 1-6 hashes followed by whitespace and at
 * least one non-whitespace character — i.e. a real ATX heading, not `####`
 * on its own (which is legal markdown but uninformative here).
 */
function isHeadingLine(line: string): boolean {
  // Quick reject: must start with '#'.
  if (line.length === 0 || line.charCodeAt(0) !== 35 /* '#' */) return false;
  return /^#{1,6}\s+\S/.test(line);
}

function stripTrailingBlank(arr: string[]): string[] {
  let end = arr.length;
  while (end > 0 && arr[end - 1] === '') end--;
  return arr.slice(0, end);
}

function stripLeadingBlank(arr: string[]): string[] {
  let start = 0;
  while (start < arr.length && arr[start] === '') start++;
  return arr.slice(start);
}

/**
 * Core walker over the post-preamble body. Produces `kept` — the output
 * lines (headings, first paragraphs, markers) — and `droppedLines` — the
 * aggregate count of lines classified as drop.
 *
 * Classification per line:
 *   - heading (#{1,6} + space) -> keep
 *   - non-blank line immediately after a heading or after a prior keep-para
 *     line (still in the same first-paragraph run) -> keep
 *   - blank line -> terminates the current paragraph; itself dropped
 *     from output (we re-insert exactly one blank between preserved chunks)
 *   - everything else -> drop (counts into droppedLines)
 *
 * When a run of drop lines flushes (i.e. the next keeper arrives), we emit
 * `<!-- truncated: N lines removed -->` exactly once before that keeper.
 */
function walkHeadingsAndParagraphs(body: string[]): { kept: string[]; droppedLines: number } {
  const kept: string[] = [];
  let droppedLines = 0;
  let pendingDropCount = 0;
  // Modes:
  //   'start'        — before the first heading (normally empty after preamble).
  //   'await-para'   — after a heading, skipping leading blanks until the
  //                    first non-blank line (which starts the first paragraph).
  //                    Blank lines in this mode are neither kept nor counted
  //                    as drops — they are standard heading/paragraph gaps.
  //   'para'         — collecting first-paragraph lines under the current
  //                    heading. Terminates on blank or next heading.
  //   'gap'          — after the paragraph's terminating blank; dropping
  //                    until the next heading.
  type Mode = 'start' | 'await-para' | 'para' | 'gap';
  let mode: Mode = 'start';

  const flushDropsBeforeKeeper = (): void => {
    if (pendingDropCount > 0) {
      // Separate the marker from whatever preceded it with a blank line,
      // but only if `kept` is non-empty and its last line is not already
      // blank. This matches the spec's "single blank between preserved
      // runs" rule.
      if (kept.length > 0 && kept[kept.length - 1] !== '') {
        kept.push('');
      }
      kept.push(`<!-- truncated: ${pendingDropCount} lines removed -->`);
      pendingDropCount = 0;
    }
  };

  for (let i = 0; i < body.length; i++) {
    const line = body[i] ?? '';
    const heading = isHeadingLine(line);

    if (heading) {
      flushDropsBeforeKeeper();
      // Ensure a single blank line before the heading if the previous output
      // isn't already blank (and there is previous output).
      if (kept.length > 0 && kept[kept.length - 1] !== '') {
        kept.push('');
      }
      kept.push(line);
      // Enter await-para: standard markdown wraps heading/paragraph with a
      // blank line; we must skip that blank before collecting the first
      // paragraph, otherwise the paragraph is dropped entirely.
      mode = 'await-para';
      continue;
    }

    if (mode === 'await-para') {
      if (line === '') {
        // Leading blank between heading and its first paragraph. Skip it —
        // do not count as a drop (it is structural whitespace).
        continue;
      }
      // First non-blank line after the heading: emit our blank separator
      // (so the heading is followed by exactly one blank) and start the
      // paragraph run.
      kept.push('');
      kept.push(line);
      mode = 'para';
      continue;
    }

    if (mode === 'para') {
      if (line === '') {
        // End the first-paragraph run; switch to drop-gap mode. The blank
        // itself is not kept (the next heading will re-insert one blank
        // before its own line).
        mode = 'gap';
        continue;
      }
      // Non-blank line inside first-paragraph run: keep verbatim.
      kept.push(line);
      continue;
    }

    // mode is 'start' or 'gap' — drop everything until the next heading.
    if (line === '') {
      // Blank lines inside the drop-gap don't count as lines-we-dropped for
      // byte-saving purposes but the spec counts dropped lines strictly, so
      // include them in the count. This matches plan acceptance 3.8:
      // "truncated_lines count matches exactly the number of dropped lines".
      pendingDropCount += 1;
      droppedLines += 1;
      continue;
    }
    pendingDropCount += 1;
    droppedLines += 1;
  }

  // Trailing drop run: emit the marker so callers can see the removed count
  // for the file tail even when no heading follows.
  if (pendingDropCount > 0) {
    if (kept.length > 0 && kept[kept.length - 1] !== '') {
      kept.push('');
    }
    kept.push(`<!-- truncated: ${pendingDropCount} lines removed -->`);
  }

  return { kept, droppedLines };
}
