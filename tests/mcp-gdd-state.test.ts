// tests/mcp-gdd-state.test.ts — Plan 20-05 (SDK-06 / SDK-07).
//
// End-to-end integration tests for the `gdd-state` MCP server. Each test
// spawns the server as a child process via stdio, sends JSON-RPC
// messages over its stdin, and reads JSON-RPC responses from its stdout.
// This exercises every layer — transport, protocol, request dispatch,
// handler, state module, event stream — in one shot, which is what the
// plan contracts for ("spawn the server process and send real MCP
// messages").
//
// A handful of helpers below wrap the stdio plumbing so each test reads
// like a linear script (initialize → call → assert). We deliberately
// keep the client side minimal rather than pulling in
// `@modelcontextprotocol/sdk/client/*` — the harness we need is four
// functions, and rolling our own keeps the test surface honest to the
// wire-level shape of what consumers see.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { REPO_ROOT } from './helpers.ts';

// ── stdio JSON-RPC harness ───────────────────────────────────────────────────

const SERVER_ENTRY = join(
  REPO_ROOT,
  'scripts',
  'mcp-servers',
  'gdd-state',
  'server.ts',
);

/**
 * The test-side send shape. `jsonrpc` is omitted by callers and stamped
 * automatically by `send()`; `params` is free-form because every tool
 * call uses a different param shape.
 */
interface JsonRpcRequest {
  jsonrpc?: '2.0';
  id?: number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id?: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface ServerHandle {
  proc: ChildProcessWithoutNullStreams;
  send(msg: JsonRpcRequest): void;
  /** Wait for the next response carrying a matching id. Rejects on 3s timeout. */
  await_(id: number, timeoutMs?: number): Promise<JsonRpcResponse>;
  close(): Promise<void>;
}

/**
 * Spawn the server with the given CWD + env overrides. Returns a handle
 * exposing `send` and `await_` for JSON-RPC flow. The server is killed
 * on test end via `close()`.
 *
 * CWD matters: the writer under the server resolves
 * `.design/telemetry/events.jsonl` relative to its CWD. Tests point the
 * server at a scaffolded temp dir so events land there, not in the
 * developer's repo tree.
 */
function startServer(
  cwd: string,
  env: NodeJS.ProcessEnv = {},
): ServerHandle {
  const proc = spawn(
    process.execPath,
    ['--experimental-strip-types', SERVER_ENTRY],
    {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );

  let stdoutBuffer = '';
  const pending: Map<number, (msg: JsonRpcResponse) => void> = new Map();
  const rejectAll = (err: Error): void => {
    for (const resolver of pending.values()) {
      // Resolvers take a response; to reject we pass a synthesized error
      // object with a sentinel id so await_() can detect and throw.
      resolver({
        jsonrpc: '2.0',
        id: -1,
        error: { code: -32000, message: err.message },
      });
    }
    pending.clear();
  };

  proc.stdout.on('data', (chunk: Buffer) => {
    stdoutBuffer += chunk.toString('utf8');
    // The server writes one JSON object per line.
    let idx: number;
    while ((idx = stdoutBuffer.indexOf('\n')) !== -1) {
      const line = stdoutBuffer.slice(0, idx).trim();
      stdoutBuffer = stdoutBuffer.slice(idx + 1);
      if (line === '') continue;
      let msg: JsonRpcResponse;
      try {
        msg = JSON.parse(line) as JsonRpcResponse;
      } catch {
        // Skip garbage lines (e.g. transient warnings) — the server
        // writes only JSON-RPC to stdout; stderr is separate.
        continue;
      }
      if (typeof msg.id === 'number' && pending.has(msg.id)) {
        const resolver = pending.get(msg.id);
        pending.delete(msg.id);
        resolver?.(msg);
      }
    }
  });

  // Swallow stderr — the strip-types warning is noisy on Node 22+ and
  // we don't want to fail the test just because a line went to stderr.
  proc.stderr.on('data', () => {
    // no-op
  });

  proc.on('error', (err) => {
    rejectAll(err);
  });
  proc.on('exit', () => {
    rejectAll(new Error('server exited before response'));
  });

  const send = (msg: JsonRpcRequest): void => {
    proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...msg }) + '\n');
  };

  const await_ = (id: number, timeoutMs = 5000): Promise<JsonRpcResponse> => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`timed out waiting for id=${id} after ${timeoutMs}ms`));
      }, timeoutMs);
      pending.set(id, (msg) => {
        clearTimeout(timer);
        resolve(msg);
      });
    });
  };

  const close = async (): Promise<void> => {
    try {
      proc.stdin.end();
    } catch {
      // already closed
    }
    // Wait briefly for graceful close; fall back to kill after 500ms.
    await new Promise<void>((resolve) => {
      const killer = setTimeout(() => {
        try {
          proc.kill('SIGKILL');
        } catch {
          // already dead
        }
        resolve();
      }, 500);
      proc.once('exit', () => {
        clearTimeout(killer);
        resolve();
      });
    });
  };

  return { proc, send, await_, close };
}

/** Shorthand: initialize the server and send the initialized notification. */
async function handshake(server: ServerHandle): Promise<JsonRpcResponse> {
  server.send({
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'gdd-state-test', version: '0.0.1' },
    },
  });
  const initResp = await server.await_(1);
  server.send({ method: 'notifications/initialized' });
  return initResp;
}

interface CallToolResult {
  content: Array<{ type: string; text?: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

/**
 * Send tools/call and return the typed CallToolResult. Auto-increments
 * the id so callers don't fight over numbering.
 */
let NEXT_CALL_ID = 100;
async function callTool(
  server: ServerHandle,
  name: string,
  args: Record<string, unknown> = {},
  timeoutMs = 5000,
): Promise<CallToolResult> {
  const id = NEXT_CALL_ID++;
  server.send({
    id,
    method: 'tools/call',
    params: { name, arguments: args },
  });
  const resp = await server.await_(id, timeoutMs);
  if (resp.error) {
    throw new Error(`tool call ${name} returned JSON-RPC error: ${resp.error.message}`);
  }
  return resp.result as CallToolResult;
}

/** Minimal "mid-pipeline" STATE.md fixture — same shape as tests/fixtures/state/mid-pipeline.md. */
function fixtureState(): string {
  return readFileSync(
    join(REPO_ROOT, 'tests', 'fixtures', 'state', 'mid-pipeline.md'),
    'utf8',
  );
}

interface ScaffoldHandle {
  dir: string;
  statePath: string;
  eventsPath: string;
  cleanup: () => void;
}

/**
 * Create a temp dir with a STATE.md. The events file ends up at
 * `<dir>/.design/telemetry/events.jsonl` because we run the server with
 * cwd=<dir>; we expose the expected path so tests can read events back.
 */
function scaffold(initialState?: string): ScaffoldHandle {
  const dir = mkdtempSync(join(tmpdir(), 'mcp-gdd-state-'));
  const statePath = join(dir, 'STATE.md');
  const eventsPath = join(dir, '.design', 'telemetry', 'events.jsonl');
  writeFileSync(statePath, initialState ?? fixtureState(), 'utf8');
  return {
    dir,
    statePath,
    eventsPath,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

/** Read the events JSONL file. Returns [] if the file doesn't exist. */
function readEvents(path: string): Array<Record<string, unknown>> {
  try {
    return readFileSync(path, 'utf8')
      .split('\n')
      .filter((l) => l.length > 0)
      .map((l) => JSON.parse(l) as Record<string, unknown>);
  } catch {
    return [];
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

test('server: responds to initialize handshake', async () => {
  const { dir, statePath, eventsPath, cleanup } = scaffold();
  const server = startServer(dir, {
    GDD_STATE_PATH: statePath,
  });
  try {
    const resp = await handshake(server);
    assert.ok(resp.result !== undefined, 'initialize returned a result');
    const result = resp.result as {
      protocolVersion: string;
      serverInfo: { name: string; version: string };
      capabilities: { tools?: Record<string, unknown> };
    };
    assert.equal(result.serverInfo.name, 'gdd-state');
    assert.ok(result.capabilities.tools !== undefined, 'advertises tools capability');
  } finally {
    await server.close();
    cleanup();
  }
});

test('server: tools/list returns exactly 11 tools with prefix gdd_state__', async () => {
  const { dir, statePath, eventsPath, cleanup } = scaffold();
  const server = startServer(dir, {
    GDD_STATE_PATH: statePath,
  });
  try {
    await handshake(server);
    server.send({ id: 10, method: 'tools/list', params: {} });
    const resp = await server.await_(10);
    const result = resp.result as {
      tools: Array<{ name: string; inputSchema: Record<string, unknown> }>;
    };
    assert.equal(result.tools.length, 11, 'exactly 11 tools advertised');
    for (const t of result.tools) {
      assert.match(t.name, /^gdd_state__/, `tool ${t.name} has correct prefix`);
      assert.equal(
        t.inputSchema['type'],
        'object',
        `${t.name} inputSchema.type is object`,
      );
    }
    const names = result.tools.map((t) => t.name).sort();
    const expected = [
      'gdd_state__add_blocker',
      'gdd_state__add_decision',
      'gdd_state__add_must_have',
      'gdd_state__checkpoint',
      'gdd_state__frontmatter_update',
      'gdd_state__get',
      'gdd_state__probe_connections',
      'gdd_state__resolve_blocker',
      'gdd_state__set_status',
      'gdd_state__transition_stage',
      'gdd_state__update_progress',
    ];
    assert.deepEqual(names, expected, 'tool catalog matches plan');
  } finally {
    await server.close();
    cleanup();
  }
});

test('gdd_state__get: returns parsed STATE.md matching read() output', async () => {
  const { dir, statePath, eventsPath, cleanup } = scaffold();
  const server = startServer(dir, {
    GDD_STATE_PATH: statePath,
  });
  try {
    await handshake(server);
    const result = await callTool(server, 'gdd_state__get', {});
    assert.equal(result.isError, undefined, 'get is not an error');
    const payload = result.structuredContent as {
      success: boolean;
      data: { state: { position: { stage: string }; decisions: unknown[] } };
    };
    assert.equal(payload.success, true);
    assert.equal(payload.data.state.position.stage, 'design');
    assert.equal(payload.data.state.decisions.length, 3);
    // get() does NOT emit an event.
    const events = readEvents(eventsPath);
    assert.equal(events.length, 0, 'get() is read-only — no events emitted');
  } finally {
    await server.close();
    cleanup();
  }
});

test('gdd_state__add_decision: appends to <decisions> and emits state.mutation', async () => {
  const { dir, statePath, eventsPath, cleanup } = scaffold();
  const server = startServer(dir, {
    GDD_STATE_PATH: statePath,
  });
  try {
    await handshake(server);
    const before = await callTool(server, 'gdd_state__get', {});
    const beforeCount = (
      before.structuredContent as {
        data: { state: { decisions: unknown[] } };
      }
    ).data.state.decisions.length;

    const add = await callTool(server, 'gdd_state__add_decision', {
      text: 'Adopt 8px spacing grid for all layout primitives',
      status: 'locked',
    });
    assert.equal(add.isError, undefined);
    const addPayload = add.structuredContent as {
      success: boolean;
      data: {
        decision: { id: string; text: string; status: string };
        count: number;
      };
    };
    assert.equal(addPayload.success, true);
    assert.equal(addPayload.data.count, beforeCount + 1);
    assert.match(addPayload.data.decision.id, /^D-\d+$/);
    assert.equal(addPayload.data.decision.status, 'locked');

    // Re-read and confirm the new entry is present.
    const after = await callTool(server, 'gdd_state__get', {});
    const afterPayload = after.structuredContent as {
      data: { state: { decisions: Array<{ id: string; text: string }> } };
    };
    const found = afterPayload.data.state.decisions.find(
      (d) => d.text === 'Adopt 8px spacing grid for all layout primitives',
    );
    assert.ok(found !== undefined, 'new decision persisted');

    // Event emitted with correct type.
    const events = readEvents(eventsPath);
    const stateMutation = events.find((e) => e['type'] === 'state.mutation');
    assert.ok(stateMutation !== undefined, 'state.mutation event emitted');
    const payloadCheck = stateMutation['payload'] as { tool?: string };
    assert.equal(payloadCheck.tool, 'gdd_state__add_decision');
  } finally {
    await server.close();
    cleanup();
  }
});

test('gdd_state__transition_stage: gate veto returns {success:false, TRANSITION_GATE_FAILED} without crashing server', async () => {
  // mid-pipeline fixture has stage=design and a <blockers> entry; design→verify
  // will pass the gate unless one of the must_haves is pending+design-keyword.
  // Our fixture has M-02 pending "Navigation collapses…" (no design keyword) so
  // design→verify PASSES. We need to build a failing scenario.
  // Put the fixture into "plan" stage and a must_haves list lacking any locked
  // decision — the planToDesign gate will veto.
  const badState = `---
pipeline_state_version: 1.0
stage: plan
cycle: ""
wave: 2
started_at: 2026-04-20T10:00:00Z
last_checkpoint: 2026-04-24T18:30:00Z
---

<position>
stage: plan
wave: 2
task_progress: 3/7
status: in_progress
handoff_source: ""
handoff_path: ""
skipped_stages: ""
</position>

<decisions>
D-01: Tentative decision (tentative)
</decisions>

<must_haves>
M-01: Baseline must-have | status: pending
</must_haves>

<connections>
figma: available
</connections>

<blockers>
</blockers>

<parallelism_decision>
</parallelism_decision>

<todos>
</todos>

<timestamps>
</timestamps>
`;
  const { dir, statePath, eventsPath, cleanup } = scaffold(badState);
  const server = startServer(dir, {
    GDD_STATE_PATH: statePath,
  });
  try {
    await handshake(server);
    const result = await callTool(server, 'gdd_state__transition_stage', {
      to: 'design',
    });
    assert.equal(result.isError, true, 'gate veto marks call as isError');
    const payload = result.structuredContent as {
      success: boolean;
      error: {
        code: string;
        kind: string;
        context?: { blockers?: string[] };
      };
    };
    assert.equal(payload.success, false);
    assert.equal(payload.error.code, 'TRANSITION_GATE_FAILED');
    assert.equal(payload.error.kind, 'state_conflict');
    assert.ok(
      Array.isArray(payload.error.context?.blockers) &&
        payload.error.context.blockers.length > 0,
      'blockers carried in error.context',
    );

    // Server still responsive — a follow-up tool call must succeed.
    const readBack = await callTool(server, 'gdd_state__get', {});
    assert.equal(readBack.isError, undefined);
    assert.equal(
      (
        readBack.structuredContent as {
          data: { state: { position: { stage: string } } };
        }
      ).data.state.position.stage,
      'plan',
      'stage unchanged after gate veto',
    );

    // state.transition event emitted with pass=false.
    const events = readEvents(eventsPath);
    const transitionEvent = events.find((e) => e['type'] === 'state.transition');
    assert.ok(
      transitionEvent !== undefined,
      'state.transition event emitted on veto',
    );
    const tpayload = transitionEvent['payload'] as {
      pass?: boolean;
      blockers?: string[];
      from?: string;
      to?: string;
    };
    assert.equal(tpayload.pass, false);
    assert.equal(tpayload.from, 'plan');
    assert.equal(tpayload.to, 'design');
    assert.ok(Array.isArray(tpayload.blockers) && tpayload.blockers.length > 0);
  } finally {
    await server.close();
    cleanup();
  }
});

test('invalid input: missing required field returns {success:false, VALIDATION_*} without crashing server', async () => {
  const { dir, statePath, eventsPath, cleanup } = scaffold();
  const server = startServer(dir, {
    GDD_STATE_PATH: statePath,
  });
  try {
    await handshake(server);
    // add_blocker requires `text` — omit it.
    const result = await callTool(server, 'gdd_state__add_blocker', {});
    assert.equal(result.isError, true);
    const payload = result.structuredContent as {
      success: boolean;
      error: { code: string; kind: string };
    };
    assert.equal(payload.success, false);
    assert.match(
      payload.error.code,
      /^VALIDATION_/,
      'code starts with VALIDATION_',
    );
    assert.equal(payload.error.kind, 'validation');

    // Server still responsive.
    const read = await callTool(server, 'gdd_state__get', {});
    assert.equal(read.isError, undefined);
  } finally {
    await server.close();
    cleanup();
  }
});

test('gdd_state__frontmatter_update: rejects patching "stage" with VALIDATION_FORBIDDEN_KEY', async () => {
  const { dir, statePath, eventsPath, cleanup } = scaffold();
  const server = startServer(dir, {
    GDD_STATE_PATH: statePath,
  });
  try {
    await handshake(server);
    const result = await callTool(server, 'gdd_state__frontmatter_update', {
      patch: { stage: 'verify' },
    });
    assert.equal(result.isError, true);
    const payload = result.structuredContent as {
      success: boolean;
      error: { code: string; kind: string };
    };
    assert.equal(payload.success, false);
    assert.equal(payload.error.code, 'VALIDATION_FORBIDDEN_KEY');
    assert.equal(payload.error.kind, 'validation');

    // Fixture stage is untouched.
    const read = await callTool(server, 'gdd_state__get', {});
    const stage = (
      read.structuredContent as {
        data: { state: { position: { stage: string } } };
      }
    ).data.state.position.stage;
    assert.equal(stage, 'design');
  } finally {
    await server.close();
    cleanup();
  }
});

test('concurrent add_blocker calls: 3 children serialize through the lockfile (no lost writes)', async () => {
  const { dir, statePath, cleanup } = scaffold();
  // Spawn three independent servers against the same STATE.md. Each
  // server is its own process, so they compete for the lockfile
  // exactly as three separate Claude Code sessions would. They all
  // share a CWD so their events.jsonl files resolve to the same path
  // and we can assert ordering off the tail of a single file.
  const servers = Array.from({ length: 3 }, () =>
    startServer(dir, {
      GDD_STATE_PATH: statePath,
    }),
  );
  try {
    await Promise.all(servers.map((s) => handshake(s)));
    const results = await Promise.all(
      servers.map((s, i) =>
        callTool(s, 'gdd_state__add_blocker', {
          text: `concurrent blocker ${i}`,
          stage: 'design',
          date: '2026-04-24',
        }),
      ),
    );
    for (const r of results) {
      assert.equal(r.isError, undefined, 'each blocker succeeded');
    }

    // Read back via any server; we expect the fixture's 2 blockers plus
    // all 3 new ones = 5, with no dropped writes.
    const final = await callTool(servers[0]!, 'gdd_state__get', {});
    const blockers = (
      final.structuredContent as {
        data: { state: { blockers: Array<{ text: string }> } };
      }
    ).data.state.blockers;
    assert.equal(blockers.length, 5, 'no lost writes under contention');
    for (let i = 0; i < 3; i++) {
      const texts = blockers.map((b) => b.text);
      assert.ok(
        texts.includes(`concurrent blocker ${i}`),
        `blocker ${i} present`,
      );
    }
  } finally {
    await Promise.all(servers.map((s) => s.close()));
    cleanup();
  }
});

test('server exits cleanly on SIGTERM', async () => {
  const { dir, statePath, eventsPath, cleanup } = scaffold();
  const server = startServer(dir, {
    GDD_STATE_PATH: statePath,
  });
  try {
    await handshake(server);
    const exited = new Promise<number | null>((resolve) => {
      server.proc.once('exit', (code) => resolve(code));
    });
    // On Windows, SIGTERM isn't truly supported — the runtime emulates
    // it via a forceful kill, which still produces a clean exit event.
    server.proc.kill('SIGTERM');
    const code = await Promise.race([
      exited,
      new Promise<number | null>((resolve) =>
        setTimeout(() => resolve(-1), 3000),
      ),
    ]);
    assert.notEqual(code, -1, 'server exited within 3s of SIGTERM');
  } finally {
    await server.close();
    cleanup();
  }
});
