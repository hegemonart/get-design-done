// tests/helpers.ts — shared fixtures for the Node --test suite.
//
// Converted from tests/helpers.cjs in Plan 20-00 (Tier-1 TS conversion).
// Behavior must remain identical to the .cjs version so every existing
// test file continues to pass unchanged. Consumers updated their imports
// from `./helpers.cjs` to `./helpers.ts` in the same plan.
//
// Node 22+ `--experimental-strip-types` runs this file directly; TSC with
// `noEmit: true` is the only type gate. Do NOT add runtime-only TS syntax
// (enums, decorators, parameter properties) — only erasable constructs.

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';

// Import a single generated type from the schema codegen so this module
// participates in the generated-types graph (per Plan 20-00 success criterion:
// "all 4 converted files consume at least one type from
// reference/schemas/generated.d.ts").
import type { ConfigSchema } from '../reference/schemas/generated.js';

/**
 * Root of the get-design-done plugin repo.
 *
 * Resolution strategy: walk up from the current working directory until we
 * find a `package.json` whose `name` matches this package. This works in
 * both ESM (strip-types runtime) and CJS (tests loaded via require()) modes
 * without referencing `import.meta` or `__dirname` (which aren't portable
 * across the two module systems under Node 22 `--experimental-strip-types`).
 *
 * A suppressed export is retained for types that rely on the generated
 * ConfigSchema surface.
 */
function findRepoRoot(): string {
  let dir: string = process.cwd();
  for (let i = 0; i < 10; i++) {
    try {
      const pkgPath: string = join(dir, 'package.json');
      const pkg: { name?: string } = JSON.parse(readFileSync(pkgPath, 'utf8')) as { name?: string };
      if (pkg.name === '@hegemonart/get-design-done') return dir;
    } catch {
      // not this level
    }
    const parent: string = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback: cwd. npm test runs from repo root so this is usually correct.
  return resolve(process.cwd());
}

export const REPO_ROOT: string = findRepoRoot();

// Keep the generated-type import live under --isolatedModules — re-export the
// type so downstream callers can pin to it.
export type { ConfigSchema };

/** Shape of overrides accepted by `scaffoldDesignDir`. */
export interface ScaffoldOverrides {
  /** Full contents of .design/STATE.md — replaces the default stub. */
  stateContent?: string;
  /**
   * Raw JSON string for .design/config.json. When present, it is written
   * verbatim. Must parse as a `ConfigSchema` for downstream readers to work.
   */
  configContent?: string;
}

/** Handle returned by `scaffoldDesignDir`. */
export interface ScaffoldHandle {
  dir: string;
  designDir: string;
  cleanup: () => void;
}

/**
 * Create a temporary .design/ directory with a minimal STATE.md.
 * Returns { dir, designDir, cleanup } where `dir` is the temp path and
 * `cleanup()` deletes it recursively.
 */
export function scaffoldDesignDir(overrides: ScaffoldOverrides = {}): ScaffoldHandle {
  const dir: string = mkdtempSync(join(tmpdir(), 'gdd-test-'));
  const designDir: string = join(dir, '.design');
  mkdirSync(designDir, { recursive: true });

  const defaultState: string = [
    '---',
    'pipeline_state_version: 1.0',
    'stage: scan',
    'cycle: default',
    'wave: 1',
    'started_at: 1970-01-01T00:00:00Z',
    'last_checkpoint: 1970-01-01T00:00:00Z',
    'model_profile: balanced',
    '---',
    '',
    '# Pipeline State',
  ].join('\n');

  writeFileSync(
    join(designDir, 'STATE.md'),
    overrides.stateContent ?? defaultState,
    'utf8',
  );

  if (overrides.configContent) {
    // We write the raw string verbatim; schema-validation is the caller's
    // responsibility. The `ConfigSchema` type is imported above to keep the
    // codegen graph live and surface drift at typecheck time.
    writeFileSync(join(designDir, 'config.json'), overrides.configContent, 'utf8');
  }

  return {
    dir,
    designDir,
    cleanup(): void {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** Scalar value types returnable by `readFrontmatter`. */
export type FrontmatterValue = string | boolean | string[];
/** Map of parsed frontmatter key→value. */
export type Frontmatter = Record<string, FrontmatterValue>;

/**
 * Parse YAML frontmatter from a markdown file.
 * Returns an object of key→value pairs from the --- ... --- block.
 * Handles: string values, quoted strings, arrays (inline and block), booleans.
 */
export function readFrontmatter(filePath: string): Frontmatter {
  const content: string = readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const raw: string = match[1] ?? '';
  const result: Frontmatter = {};
  const lines: string[] = raw.split('\n');
  let currentKey: string | null = null;
  let arrayAccum: string[] | null = null;

  for (const line of lines) {
    // Block array item
    if (arrayAccum !== null && /^\s+-\s+/.test(line)) {
      arrayAccum.push(line.replace(/^\s+-\s+/, '').trim());
      continue;
    }
    // End of block array
    if (arrayAccum !== null && !/^\s+-\s+/.test(line) && line.trim() !== '') {
      if (currentKey !== null) result[currentKey] = arrayAccum;
      arrayAccum = null;
    }

    const kvMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_-]*):\s*(.*)$/);
    if (!kvMatch) continue;

    const key: string = kvMatch[1] ?? '';
    const rawVal: string = (kvMatch[2] ?? '').trim();
    currentKey = key;

    if (rawVal === '') {
      // Start block array
      arrayAccum = [];
      result[key] = [];
    } else if (rawVal.startsWith('[')) {
      // Inline array
      result[key] = rawVal
        .replace(/^\[|\]$/g, '')
        .split(',')
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
      arrayAccum = null;
    } else if (rawVal === 'true') {
      result[key] = true;
      arrayAccum = null;
    } else if (rawVal === 'false') {
      result[key] = false;
      arrayAccum = null;
    } else {
      result[key] = rawVal.replace(/^['"]|['"]$/g, '');
      arrayAccum = null;
    }
  }

  // Flush trailing array
  if (arrayAccum !== null && currentKey !== null) {
    result[currentKey] = arrayAccum;
  }

  return result;
}

/**
 * Count the number of lines in a file (newline-delimited, trailing newline
 * ignored).
 */
export function countLines(filePath: string): number {
  const content: string = readFileSync(filePath, 'utf8');
  const lines: string[] = content.split('\n');
  // Ignore trailing empty line from trailing newline
  if (lines[lines.length - 1] === '') lines.pop();
  return lines.length;
}

/** One recorded call made against a `mockMCP` instance. */
export interface MockMCPCall {
  toolName: string;
  args: Record<string, unknown>;
}

/** Response map passed to `mockMCP`. A function form is called with args. */
export type MockMCPResponses = Record<
  string,
  unknown | ((args: Record<string, unknown>) => unknown)
>;

/** Shape returned by `mockMCP`. */
export interface MockMCPInstance {
  name: string;
  calls: MockMCPCall[];
  call(toolName: string, args?: Record<string, unknown>): unknown;
  assertCalled(toolName: string): void;
  assertNotCalled(toolName: string): void;
}

/**
 * Create a minimal mock object that simulates MCP tool responses.
 * Pass name (string) and responses (object: toolName → returnValue).
 * Returns an object with a call(toolName, args) method and a calls[] log.
 */
export function mockMCP(name: string, responses: MockMCPResponses = {}): MockMCPInstance {
  const calls: MockMCPCall[] = [];
  const mock: MockMCPInstance = {
    name,
    calls,
    call(toolName: string, args: Record<string, unknown> = {}): unknown {
      calls.push({ toolName, args });
      if (toolName in responses) {
        const resp = responses[toolName];
        return typeof resp === 'function'
          ? (resp as (a: Record<string, unknown>) => unknown)(args)
          : resp;
      }
      throw new Error(`mockMCP(${name}): unexpected tool call "${toolName}"`);
    },
    assertCalled(toolName: string): void {
      const found = calls.some((c) => c.toolName === toolName);
      if (!found) {
        throw new Error(`mockMCP(${name}): expected "${toolName}" to be called, but it wasn't`);
      }
    },
    assertNotCalled(toolName: string): void {
      const found = calls.some((c) => c.toolName === toolName);
      if (found) {
        throw new Error(`mockMCP(${name}): expected "${toolName}" NOT to be called, but it was`);
      }
    },
  };
  return mock;
}
