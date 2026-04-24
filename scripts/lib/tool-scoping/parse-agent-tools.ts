// scripts/lib/tool-scoping/parse-agent-tools.ts — extract the `tools:`
// list from an agent markdown file's YAML frontmatter.
//
// Why a hand-rolled parser instead of pulling in js-yaml:
//   * No new npm deps (Plan 21-03 hard constraint).
//   * The `tools:` field grammar is narrow (4 YAML shapes + wildcard +
//     empty). A minimal parser covering exactly those shapes is
//     maintainable and keeps the surface area tight.
//
// Supported frontmatter shapes:
//   tools: Read, Write, Grep              → ['Read','Write','Grep']
//   tools: [Read, Write]                  → ['Read','Write']
//   tools: "*"                            → null (wildcard fallback)
//   tools: []                             → []    (MCP-only narrow)
//   tools:
//     - Read
//     - Write                             → ['Read','Write']
//
// Return contract:
//   null         — file missing, no frontmatter, tools key absent, OR wildcard.
//   []           — tools: [] OR tools: (no children).
//   string[]     — the declared, trimmed, de-quoted list.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Read the `tools:` field from an agent markdown file's YAML
 * frontmatter. See module header for the full grammar.
 *
 * @param agentMdPath absolute or cwd-relative path to an `agents/*.md`.
 * @returns readonly string[] | null per the contract above.
 */
export function parseAgentTools(
  agentMdPath: string,
): readonly string[] | null {
  let raw: string;
  try {
    raw = readFileSync(agentMdPath, 'utf8');
  } catch (err) {
    // ENOENT or any read error → treat as "no override" (null).
    if (
      err !== null &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: string }).code === 'ENOENT'
    ) {
      return null;
    }
    // Permission/IO errors also fall through to null — a parser that
    // throws on any fs hiccup would crash the entire session at scope
    // computation time; fail-closed (null = stage default) is safer.
    return null;
  }

  const frontmatter: string | null = extractFrontmatter(raw);
  if (frontmatter === null) return null;

  return extractToolsField(frontmatter);
}

/**
 * Convenience: look up an agent by bare name under `<agentsRoot>/<name>.md`
 * and delegate to `parseAgentTools`. Defaults to `./agents` when no root
 * is supplied.
 */
export function parseAgentToolsByName(
  name: string,
  agentsRoot: string = 'agents',
): readonly string[] | null {
  const path: string = resolve(agentsRoot, `${name}.md`);
  return parseAgentTools(path);
}

// ---------------------------------------------------------------------------
// Internal — frontmatter splitter
// ---------------------------------------------------------------------------

/**
 * Return the text between the opening `---\n` and closing `---\n` lines,
 * or null when no valid frontmatter block exists.
 *
 * Matches the splitter in `scripts/lib/prompt-sanitizer/index.ts` — kept
 * local (rather than imported) to avoid coupling the tool-scoping module
 * to prompt-sanitizer internals.
 */
function extractFrontmatter(raw: string): string | null {
  // Accept LF or CRLF. First line must be exactly `---`.
  const match: RegExpExecArray | null = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(
    raw,
  );
  if (match === null) return null;
  const body: string | undefined = match[1];
  return body ?? null;
}

// ---------------------------------------------------------------------------
// Internal — tools field extractor
// ---------------------------------------------------------------------------

/**
 * Given the frontmatter body (text between `---` fences), return the
 * parsed `tools:` field per the contract. Absence returns null.
 */
function extractToolsField(frontmatter: string): readonly string[] | null {
  const lines: string[] = frontmatter.split(/\r?\n/);
  const toolsLineRe = /^tools:\s*(.*)$/;

  for (let i = 0; i < lines.length; i += 1) {
    const line: string = lines[i] ?? '';
    const m: RegExpExecArray | null = toolsLineRe.exec(line);
    if (m === null) continue;

    const rest: string = (m[1] ?? '').trim();

    // Case 1: wildcard — `tools: "*"` or `tools: *`.
    //   Per the Plan 21-03 frontmatter contract, this is a forward-compat
    //   escape that falls back to stage default (NOT "everything"), so we
    //   return null to signal "no override".
    if (rest === '*' || rest === '"*"' || rest === "'*'") {
      return null;
    }

    // Case 2: flow-style `tools: [...]` or empty `tools: []`.
    if (rest.startsWith('[') && rest.endsWith(']')) {
      const inner: string = rest.slice(1, -1).trim();
      if (inner === '') return Object.freeze([]);
      return Object.freeze(splitAndClean(inner));
    }

    // Case 3: YAML list (empty value on tools: line, items follow).
    if (rest === '') {
      const items: string[] = [];
      for (let j = i + 1; j < lines.length; j += 1) {
        const next: string = lines[j] ?? '';
        // A blank line or a non-list-item line ends the block.
        if (next.trim() === '') continue;
        const listItem: RegExpExecArray | null = /^\s*-\s*(\S.*)$/.exec(next);
        if (listItem === null) break;
        const entry: string | undefined = listItem[1];
        if (entry === undefined) break;
        items.push(cleanToken(entry));
      }
      return Object.freeze(items);
    }

    // Case 4: inline comma-separated list (may have quoted entries).
    return Object.freeze(splitAndClean(rest));
  }

  return null;
}

/**
 * Split a comma-separated list while honoring double-quoted entries
 * (so `"Read, with-comma", "Write"` stays a 2-element list). Trims
 * whitespace and strips surrounding single / double quotes from each
 * token.
 */
function splitAndClean(input: string): string[] {
  const out: string[] = [];
  let buf: string[] = [];
  let inDouble = false;
  let inSingle = false;

  for (const ch of input) {
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      buf.push(ch);
      continue;
    }
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      buf.push(ch);
      continue;
    }
    if (ch === ',' && !inDouble && !inSingle) {
      out.push(cleanToken(buf.join('')));
      buf = [];
      continue;
    }
    buf.push(ch);
  }

  const tail: string = cleanToken(buf.join(''));
  if (tail !== '' || out.length === 0) {
    out.push(tail);
  }

  return out.filter((t) => t !== '');
}

/**
 * Trim whitespace + strip matching leading/trailing quote pairs.
 * Applied to each split list entry.
 */
function cleanToken(token: string): string {
  let t: string = token.trim();
  if (t.length >= 2) {
    const first: string = t[0] ?? '';
    const last: string = t[t.length - 1] ?? '';
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      t = t.slice(1, -1).trim();
    }
  }
  return t;
}
