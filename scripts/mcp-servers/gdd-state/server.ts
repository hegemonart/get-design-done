#!/usr/bin/env -S node --experimental-strip-types
// scripts/mcp-servers/gdd-state/server.ts
//
// MCP server `gdd-state` — exposes the 11 typed STATE.md tools implemented
// under `./tools/` via stdio transport. Plan 20-05 (SDK-06/07).
//
// Lifecycle:
//   1. Construct a low-level Server (we use the low-level surface so we
//      can speak JSON Schema directly — the high-level McpServer wants
//      Zod shapes, and our per-tool schemas are Draft-07 JSON.)
//   2. Register `tools/list` — returns all 11 tools with their input
//      JSON Schemas loaded from disk.
//   3. Register `tools/call` — dispatches by name to the matching
//      handler. Each handler returns a typed ToolResponse; the server
//      wraps it into the MCP CallToolResult shape (one text content
//      item, JSON-stringified response; plus `structuredContent` for
//      richer clients; `isError: true` when `success:false`).
//   4. Attach StdioServerTransport; await connect.
//   5. On SIGINT / SIGTERM: close the transport, flush nothing (the
//      event writer uses `appendFileSync` so every write is already
//      durable), and exit 0.
//
// Invariant: handler throws are contained. The dispatcher wraps every
// call in a try/catch that funnels through toToolError() — the MCP
// harness never sees an uncaught throw from our tools.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { toToolError } from '../../lib/gdd-errors/classification.ts';
import { TOOL_MODULES, type ToolModule } from './tools/index.ts';

/** Server metadata advertised on initialize. */
const SERVER_NAME = 'gdd-state';
const SERVER_VERSION = '1.20.0';

/**
 * Resolve this module's directory. We deliberately avoid `import.meta.url`
 * (not permitted by our tsconfig's Node16+CommonJS-compatible module
 * resolution) and `__dirname` (not portable under strip-types ESM).
 *
 * Strategy: when this module is invoked as a script, `process.argv[1]`
 * points at this file; resolve its dirname. When it is imported for
 * tests, we fall back to walking from `process.cwd()` — tests run
 * from the repo root by convention, so `scripts/mcp-servers/gdd-state`
 * resolves reliably. Both branches are canonicalized against the
 * on-disk tools directory.
 */
function here(): string {
  const expectedRel = join('scripts', 'mcp-servers', 'gdd-state');
  // Script invocation: process.argv[1] === .../server.ts (or a shim).
  const entry = process.argv[1];
  if (typeof entry === 'string' && entry.length > 0) {
    const entryDir = dirname(resolve(entry));
    if (existsSync(join(entryDir, 'tools', 'index.ts'))) {
      return entryDir;
    }
  }
  // Library-import path (tests): walk cwd forward.
  const candidate = resolve(process.cwd(), expectedRel);
  if (existsSync(join(candidate, 'tools', 'index.ts'))) {
    return candidate;
  }
  // Last-resort: return the expected path even if it does not exist —
  // the subsequent readFileSync() call will produce a clear error.
  return candidate;
}

/** Eager cache of input schemas keyed by tool name. We load them once at
 *  startup so a tool-call handler never hits the filesystem in the hot
 *  path; subsequent schema edits (JSON file on disk) require a server
 *  restart, which matches every other part of the pipeline. */
interface LoadedTool extends ToolModule {
  inputSchema: Record<string, unknown>;
}

function loadTools(): LoadedTool[] {
  const baseDir = here();
  return TOOL_MODULES.map((m) => {
    const absPath = join(baseDir, 'tools', m.schemaPath);
    const raw = readFileSync(absPath, 'utf8');
    const parsed = JSON.parse(raw) as {
      properties?: {
        input?: { type?: string; properties?: Record<string, unknown> };
      };
    };
    // The per-tool schema files are Draft-07 wrappers shaped as:
    //   { type: "object", properties: { input: {...}, output: {...} } }
    // MCP's tools/list advertises only the INPUT half. We project
    // `properties.input` here; when the schema is malformed we fall
    // back to an open object so the tool is still listable.
    const rawInput = parsed.properties?.input;
    const inputSchema: Record<string, unknown> =
      rawInput !== undefined && typeof rawInput === 'object'
        ? (rawInput as Record<string, unknown>)
        : { type: 'object' };
    // MCP clients require inputSchema.type === "object" for tools/list.
    // Our per-tool inputs are already objects; defensively stamp the
    // field when absent.
    if (!('type' in inputSchema)) inputSchema['type'] = 'object';
    return { ...m, inputSchema };
  });
}

/**
 * Tool descriptions — short, scannable, lifted from the plan. Skill
 * prose uses these verbatim when suggesting a tool to the model.
 */
const TOOL_DESCRIPTIONS: Record<string, string> = {
  gdd_state__get:
    'Read current STATE.md (parsed). Read-only; no event emitted. Optionally projects a subset of fields.',
  gdd_state__update_progress:
    'Update <position>.task_progress and/or status. Emits state.mutation.',
  gdd_state__transition_stage:
    'Run gate and advance <position>.stage on pass. Gate vetoes return {success:false, error:{context:{blockers:[...]}}}; never crashes the server. Emits state.transition.',
  gdd_state__add_blocker:
    'Append one entry to <blockers>. Defaults stage to current position.stage and date to today (UTC). Emits state.mutation.',
  gdd_state__resolve_blocker:
    'Remove one <blockers> entry by 0-based index or exact text match. Returns operation_failed when no row matches. Emits state.mutation on removal.',
  gdd_state__add_decision:
    'Append one entry to <decisions>. Auto-allocates D-N id when not supplied. Emits state.mutation.',
  gdd_state__add_must_have:
    'Append one entry to <must_haves>. Auto-allocates M-N id when not supplied. Emits state.mutation.',
  gdd_state__set_status:
    'Update <position>.status. Emits state.mutation.',
  gdd_state__checkpoint:
    'Update frontmatter.last_checkpoint and append a <timestamps> entry. Emits state.mutation.',
  gdd_state__probe_connections:
    'Merge probe results into <connections>. Overwrites keys present in the input; does NOT delete keys not in the input. Emits state.mutation.',
  gdd_state__frontmatter_update:
    'Patch one or more frontmatter fields. Rejects pipeline_state_version and stage (use transition_stage). Emits state.mutation.',
};

/** Human-readable annotation hints (MCP clients use these to style the
 *  tool in UI). `readOnlyHint: true` — tells clients this tool does NOT
 *  modify disk; `false` — tells them it does. */
const TOOL_READONLY: Record<string, boolean> = {
  gdd_state__get: true,
};

/**
 * Build the MCP server. The tools list and call handlers are the only
 * two request handlers we register; everything else (initialize, ping,
 * cancellation, shutdown) is handled internally by the Protocol class.
 */
export function buildServer(): Server {
  const tools = loadTools();
  const byName: Map<string, LoadedTool> = new Map();
  for (const t of tools) byName.set(t.name, t);

  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      capabilities: { tools: {} },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: tools.map((t) => {
        const description = TOOL_DESCRIPTIONS[t.name] ?? t.name;
        const readOnly = TOOL_READONLY[t.name] ?? false;
        return {
          name: t.name,
          description,
          inputSchema: t.inputSchema as {
            type: 'object';
            properties?: Record<string, unknown>;
            required?: string[];
          },
          annotations: {
            readOnlyHint: readOnly,
            destructiveHint: !readOnly,
            idempotentHint: false,
          },
        };
      }),
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name: toolName, arguments: args } = req.params;
    const tool = byName.get(toolName);
    if (tool === undefined) {
      // Unknown tool — return as CallToolResult isError=true so the
      // client gets a structured error rather than a JSON-RPC error.
      const payload = toToolError(
        new Error(`unknown tool: ${toolName}`),
      );
      return {
        isError: true,
        content: [
          { type: 'text' as const, text: JSON.stringify({ success: false, error: payload.error }) },
        ],
        structuredContent: { success: false, error: payload.error },
      };
    }

    let response;
    try {
      response = await tool.handle(args ?? {});
    } catch (err) {
      // Defensive catch — handlers shouldn't throw, but if one does
      // we translate rather than crashing the server.
      const payload = toToolError(err);
      response = { success: false as const, error: payload.error };
    }

    const text = JSON.stringify(response);
    if (response.success === true) {
      return {
        content: [{ type: 'text' as const, text }],
        structuredContent: response as unknown as Record<string, unknown>,
      };
    }
    return {
      isError: true,
      content: [{ type: 'text' as const, text }],
      structuredContent: response as unknown as Record<string, unknown>,
    };
  });

  return server;
}

/**
 * Run the server against stdio and block until the transport closes.
 * Called from CLI when this file is invoked as a script.
 */
export async function runStdio(): Promise<void> {
  const server = buildServer();
  const transport = new StdioServerTransport();

  const shutdown = async (signal: string): Promise<void> => {
    // Re-entrant: signal handlers can fire more than once on flaky
    // shells. Guard with a module-level flag.
    if (SHUTTING_DOWN) return;
    SHUTTING_DOWN = true;
    try {
      await server.close();
    } catch {
      // best-effort; we're exiting anyway.
    }
    // SIGTERM / SIGINT convention: exit(0) — orderly shutdown.
    process.exit(signal === 'SIGTERM' ? 0 : 0);
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  await server.connect(transport);
}

/** Re-entrancy guard for `shutdown()`. */
let SHUTTING_DOWN = false;

/**
 * Are we being invoked as a script? We compare the argv[1] file path's
 * basename to `server.ts` — test imports never match this because
 * `node --test tests/*.ts` sets argv[1] to the test runner entry, not
 * our file. A direct `node scripts/mcp-servers/gdd-state/server.ts`
 * invocation DOES match.
 */
function isMain(): boolean {
  const entry = process.argv[1];
  if (typeof entry !== 'string' || entry.length === 0) return false;
  return entry.replace(/\\/g, '/').endsWith('scripts/mcp-servers/gdd-state/server.ts');
}

if (isMain()) {
  runStdio().catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error(`[gdd-state] fatal: ${msg}`);
    process.exit(1);
  });
}
