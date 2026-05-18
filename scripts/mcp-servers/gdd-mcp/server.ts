#!/usr/bin/env -S node --experimental-strip-types
// scripts/mcp-servers/gdd-mcp/server.ts
//
// MCP server `gdd-mcp` — read-mostly project-state surface (Phase 27.7).
// Exposes STATE.md sections, phases, decisions, plans, telemetry, intel
// slices, and the latest reflection as typed MCP tools backed by the
// same `scripts/lib/*` modules the CLI uses.
//
// Lifecycle (mirrors Phase 20 `gdd-state` server):
//   1. Construct a low-level Server (we use the low-level surface so we
//      can speak JSON Schema directly — the high-level McpServer wants
//      Zod shapes, and our per-tool schemas are Draft-07 JSON.)
//   2. Register `tools/list` — returns the registered tools with their
//      input JSON Schemas loaded from disk. Scaffold ships with 0
//      tools; Plan 27.7-02 populates `TOOL_MODULES` with 12 entries.
//   3. Register `tools/call` — dispatches by name to the matching
//      handler. Each handler returns a typed ToolResponse; the server
//      wraps it into the MCP CallToolResult shape. Unknown tool names
//      return `isError: true` with a structured payload.
//   4. Attach StdioServerTransport; await connect. NO port allocation
//      (D-05 stdio-only).
//   5. On SIGINT / SIGTERM: close the transport, exit 0. Re-entrant
//      shutdown is guarded with a module-level `SHUTTING_DOWN` flag.
//
// Project-root discovery (D-05): `resolveProjectRoot()` lives in
// `./tools/shared.ts` and walks up from `process.cwd()` looking for
// `.design/` OR `.planning/` OR `.claude-plugin/plugin.json`. Server
// infrastructure is allowed to import `node:fs`/`node:path` directly;
// only individual TOOL files are bound by the thin-wrapper rule (D-06).
//
// Invariant: handler throws are contained. The dispatcher wraps every
// call in a try/catch that funnels through `toToolError()` — the MCP
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
export const SERVER_NAME = 'gdd-mcp';
export const SERVER_VERSION = '1.27.7';

/**
 * Resolve this module's directory. We deliberately avoid `import.meta.url`
 * (not permitted by our tsconfig's Node16+CommonJS-compatible module
 * resolution) and `__dirname` (not portable under strip-types ESM).
 *
 * Strategy: when this module is invoked as a script, `process.argv[1]`
 * points at this file; resolve its dirname. When it is imported for
 * tests, we fall back to walking from `process.cwd()` — tests run
 * from the repo root by convention, so `scripts/mcp-servers/gdd-mcp`
 * resolves reliably. Both branches are canonicalized against the
 * on-disk tools directory.
 */
function here(): string {
  const expectedRel = join('scripts', 'mcp-servers', 'gdd-mcp');
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
 *  restart, which matches every other part of the pipeline.
 *
 *  Scaffold ships with 0 tools — loadTools() returns []. Plan 27.7-02
 *  adds 12 tool modules, each with its own `schemaPath` pointing into
 *  `scripts/mcp-servers/gdd-mcp/schemas/`. */
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
    if (!('type' in inputSchema)) inputSchema['type'] = 'object';
    return { ...m, inputSchema };
  });
}

/**
 * Tool descriptions — short, scannable, lifted from the plan. Skill
 * prose uses these verbatim when suggesting a tool to the model.
 *
 * Plan 27.7-01 ships an empty map (no tools yet). Plan 27.7-02 populates
 * 12 entries (one per tool: gdd_status, gdd_phase_current, gdd_phases_list,
 * gdd_plans_list, gdd_decisions_list, gdd_intel_get, gdd_telemetry_query,
 * gdd_cycle_recap, gdd_reflections_latest, gdd_learnings_digest,
 * gdd_events_tail, gdd_health).
 */
export const TOOL_DESCRIPTIONS: Record<string, string> = {};

/** Human-readable annotation hints (MCP clients use these to style the
 *  tool in UI). `readOnlyHint: true` — tells clients this tool does NOT
 *  modify disk. v1 is read-only (D-04) so every entry will be `true`
 *  once Plan 27.7-02 populates this map. */
export const TOOL_READONLY: Record<string, boolean> = {};

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
        const readOnly = TOOL_READONLY[t.name] ?? true;
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
          {
            type: 'text' as const,
            text: JSON.stringify({ success: false, error: payload.error }),
          },
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
 * our file. A direct `node scripts/mcp-servers/gdd-mcp/server.ts`
 * invocation DOES match. The Windows-safe path normalization uses
 * `.replace(/\\/g, '/')` before the endsWith check.
 */
function isMain(): boolean {
  const entry = process.argv[1];
  if (typeof entry !== 'string' || entry.length === 0) return false;
  return entry.replace(/\\/g, '/').endsWith('scripts/mcp-servers/gdd-mcp/server.ts');
}

if (isMain()) {
  runStdio().catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error(`[gdd-mcp] fatal: ${msg}`);
    process.exit(1);
  });
}
