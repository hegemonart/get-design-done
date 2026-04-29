'use strict';
// tests/peer-cli-adapters.test.cjs — Plan 27-04.
//
// Verifies the 5 per-peer adapters in scripts/lib/peer-cli/adapters/:
//   codex, gemini, cursor, copilot, qwen.
//
// Coverage matrix per adapter:
//   1. Module surface — name, protocol, ROLES_CLAIMED, ROLE_PREFIX,
//      claims(), dispatch() are all exported in the documented shape.
//   2. claims(role) returns true for every role the peer claims and
//      false for at least one role from another peer's claim set
//      (proves CONTEXT.md D-05's per-peer matrix is honored).
//   3. dispatch(peer, role, ...) rejects with a "does not claim role"
//      error when invoked with an unclaimed role.
//   4. dispatch() routes through the underlying client (ACP for the
//      four ACP peers; ASP for codex), prepending ROLE_PREFIX[role] to
//      the user-supplied text. We verify this with require.cache
//      injection so we capture the exact text passed to the client
//      module — no real peer binary needed.
//   5. Integration: codex.dispatch() + gemini.dispatch() drive the
//      bundled mock servers end-to-end, proving the wire path works
//      (initialize→prompt for ACP; threadStart→turn for ASP) without
//      mocking the client module.
//
// require.cache injection is the cleanest way to assert "the prefix
// was prepended". The adapters call createAcpClient / createAspClient
// from their respective client modules; replacing the exports with a
// recorder lets us see the exact prompt+role+threadId without spawning
// anything.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');

const ACP_CLIENT_PATH = require.resolve('../scripts/lib/peer-cli/acp-client.cjs');
const ASP_CLIENT_PATH = require.resolve('../scripts/lib/peer-cli/asp-client.cjs');

const ADAPTER_DIR = path.join(__dirname, '..', 'scripts', 'lib', 'peer-cli', 'adapters');

const MOCK_ACP_SERVER = path.join(__dirname, 'fixtures', 'peer-cli', 'mock-acp-server.cjs');
const MOCK_ASP_SERVER = path.join(__dirname, 'fixtures', 'peer-cli', 'mock-asp-server.cjs');

/**
 * Load an adapter through a fresh require so we can inject mocked
 * client modules per-test without polluting other tests. Returns the
 * adapter module + the recorder objects, and tears down on reset().
 */
function loadAdapterWithMocks(adapterName) {
  // Drop any cached copies so the adapter re-resolves the (mocked)
  // client module on the next require.
  delete require.cache[ACP_CLIENT_PATH];
  delete require.cache[ASP_CLIENT_PATH];
  delete require.cache[path.join(ADAPTER_DIR, `${adapterName}.cjs`)];

  /** @type {{calls: object[]}} */
  const acpRecorder = { calls: [] };
  /** @type {{calls: object[]}} */
  const aspRecorder = { calls: [] };

  // Build a fake acp-client module: createAcpClient returns an object
  // whose `prompt` records the prompt text + opts, then resolves with
  // a stub result. initialize() and close() are both recorded too.
  const fakeAcpClient = {
    createAcpClient: function createAcpClient(spawnOpts) {
      const callRecord = {
        spawnOpts,
        initializeCalls: [],
        promptCalls: [],
        closed: false,
      };
      acpRecorder.calls.push(callRecord);
      return {
        async initialize(params) {
          callRecord.initializeCalls.push(params);
          return { protocolVersion: '2025-06-18', serverCapabilities: {} };
        },
        async prompt(text, opts) {
          callRecord.promptCalls.push({ text, opts });
          return { content: `acp-mock:${text}`, finish_reason: 'stop' };
        },
        async close() { callRecord.closed = true; },
      };
    },
    MAX_LINE_BYTES: 16 * 1024 * 1024,
    DEFAULT_PROTOCOL_VERSION: '2025-06-18',
  };

  // Build a fake asp-client module: createAspClient returns an object
  // whose threadStart and turn record their args.
  const fakeAspClient = {
    createAspClient: function createAspClient(spawnOpts) {
      const callRecord = {
        spawnOpts,
        threadStartCalls: [],
        turnCalls: [],
        closed: false,
      };
      aspRecorder.calls.push(callRecord);
      return {
        async threadStart(params) {
          callRecord.threadStartCalls.push(params);
          return { threadId: 'thr_mock_1' };
        },
        async turn(threadId, text, opts) {
          callRecord.turnCalls.push({ threadId, text, opts });
          return {
            status: 'complete',
            content: { text: `asp-mock:${text}` },
            usage: { input_tokens: 1, output_tokens: 1 },
            threadId,
            turnId: 'turn_mock_1',
            notifications: [],
          };
        },
        async close() { callRecord.closed = true; },
        get closed() { return callRecord.closed; },
      };
    },
    MAX_LINE_BYTES: 16 * 1024 * 1024,
  };

  // Inject into require.cache so the adapter picks them up.
  const acpCacheEntry = new Module(ACP_CLIENT_PATH, module);
  acpCacheEntry.exports = fakeAcpClient;
  acpCacheEntry.filename = ACP_CLIENT_PATH;
  acpCacheEntry.loaded = true;
  require.cache[ACP_CLIENT_PATH] = acpCacheEntry;

  const aspCacheEntry = new Module(ASP_CLIENT_PATH, module);
  aspCacheEntry.exports = fakeAspClient;
  aspCacheEntry.filename = ASP_CLIENT_PATH;
  aspCacheEntry.loaded = true;
  require.cache[ASP_CLIENT_PATH] = aspCacheEntry;

  // Load the adapter (will resolve the mocked clients).
  const adapterPath = path.join(ADAPTER_DIR, `${adapterName}.cjs`);
  const adapter = require(adapterPath);

  function reset() {
    delete require.cache[ACP_CLIENT_PATH];
    delete require.cache[ASP_CLIENT_PATH];
    delete require.cache[adapterPath];
  }

  return { adapter, acpRecorder, aspRecorder, reset };
}

// ───────────────────────────────────────────────────────────────────────
// Per-adapter declarative spec — single source of truth for the table-
// driven tests below.
// ───────────────────────────────────────────────────────────────────────

const SPEC = [
  {
    name: 'codex',
    protocol: 'asp',
    rolesClaimed: ['execute'],
    rolePrefix: { execute: '/execute ' },
    foreignRole: 'research',
  },
  {
    name: 'gemini',
    protocol: 'acp',
    rolesClaimed: ['research', 'exploration'],
    rolePrefix: {
      research: 'Deep research mode. Investigate the following thoroughly: ',
      exploration: 'Exploratory mode. Survey options and trade-offs for: ',
    },
    foreignRole: 'execute',
  },
  {
    name: 'cursor',
    protocol: 'acp',
    rolesClaimed: ['debug', 'plan'],
    rolePrefix: { debug: '/debug ', plan: '/plan ' },
    foreignRole: 'write',
  },
  {
    name: 'copilot',
    protocol: 'acp',
    rolesClaimed: ['review', 'research'],
    rolePrefix: { review: '/review ', research: '/research ' },
    foreignRole: 'execute',
  },
  {
    name: 'qwen',
    protocol: 'acp',
    rolesClaimed: ['write'],
    rolePrefix: { write: '/write ' },
    foreignRole: 'debug',
  },
];

// ───────────────────────────────────────────────────────────────────────
// Static-surface tests — assert the documented module shape.
// ───────────────────────────────────────────────────────────────────────

for (const spec of SPEC) {
  test(`${spec.name}: module exports the documented adapter shape`, () => {
    // Use loadAdapterWithMocks to ensure a fresh require with mocked
    // clients, then inspect the export shape.
    const { adapter, reset } = loadAdapterWithMocks(spec.name);
    try {
      assert.equal(adapter.name, spec.name);
      assert.equal(adapter.protocol, spec.protocol);
      assert.deepEqual([...adapter.ROLES_CLAIMED], spec.rolesClaimed);
      // ROLE_PREFIX must have an entry for every claimed role and
      // nothing extra.
      assert.deepEqual(
        Object.keys(adapter.ROLE_PREFIX).sort(),
        spec.rolesClaimed.slice().sort(),
      );
      for (const role of spec.rolesClaimed) {
        assert.equal(adapter.ROLE_PREFIX[role], spec.rolePrefix[role]);
      }
      assert.equal(typeof adapter.claims, 'function');
      assert.equal(typeof adapter.dispatch, 'function');
    } finally {
      reset();
    }
  });

  test(`${spec.name}: claims() — true for claimed roles, false for foreign role + nonsense`, () => {
    const { adapter, reset } = loadAdapterWithMocks(spec.name);
    try {
      for (const role of spec.rolesClaimed) {
        assert.equal(adapter.claims(role), true, `${spec.name}.claims('${role}') must be true`);
      }
      assert.equal(
        adapter.claims(spec.foreignRole),
        false,
        `${spec.name}.claims('${spec.foreignRole}') must be false`,
      );
      assert.equal(adapter.claims('totally-made-up-role-xyz'), false);
      assert.equal(adapter.claims(undefined), false);
    } finally {
      reset();
    }
  });
}

// ───────────────────────────────────────────────────────────────────────
// Dispatch tests with mocked clients — verify role-validation,
// prefix application, and underlying client routing.
// ───────────────────────────────────────────────────────────────────────

for (const spec of SPEC) {
  test(`${spec.name}: dispatch() rejects roles the adapter does not claim`, async () => {
    const { adapter, reset } = loadAdapterWithMocks(spec.name);
    try {
      await assert.rejects(
        () => adapter.dispatch(
          { command: 'never-spawned', args: [] },
          spec.foreignRole,
          'irrelevant text',
        ),
        (err) => {
          assert.ok(err instanceof Error, 'expected Error');
          assert.match(
            err.message,
            new RegExp(`${spec.name}.+does not claim role.*${spec.foreignRole}`),
            `unexpected error message: ${err.message}`,
          );
          return true;
        },
      );
    } finally {
      reset();
    }
  });

  test(`${spec.name}: dispatch() rejects non-string text with TypeError`, async () => {
    const { adapter, reset } = loadAdapterWithMocks(spec.name);
    try {
      const claimedRole = spec.rolesClaimed[0];
      await assert.rejects(
        () => adapter.dispatch(
          { command: 'never-spawned', args: [] },
          claimedRole,
          /* @ts-expect-error intentional bad input */ 42,
        ),
        (err) => {
          assert.ok(err instanceof TypeError, 'expected TypeError');
          assert.match(err.message, /text must be a string/);
          return true;
        },
      );
    } finally {
      reset();
    }
  });

  test(`${spec.name}: dispatch() prepends ROLE_PREFIX[role] to user text and routes to client`, async () => {
    const { adapter, acpRecorder, aspRecorder, reset } = loadAdapterWithMocks(spec.name);
    try {
      // For every claimed role, dispatch with a known body and verify
      // the underlying client received the prefixed prompt.
      for (const role of spec.rolesClaimed) {
        const body = `body-for-${role}-${Math.random().toString(36).slice(2, 8)}`;
        const expectedPrompt = spec.rolePrefix[role] + body;

        if (spec.protocol === 'asp') {
          const before = aspRecorder.calls.length;
          const res = await adapter.dispatch(
            { command: 'codex-mock', args: [], cwd: '/tmp/wd', env: { K: 'V' } },
            role,
            body,
          );
          assert.equal(aspRecorder.calls.length, before + 1, 'one new asp client per dispatch');
          const call = aspRecorder.calls[before];
          // Spawn opts forwarded verbatim.
          assert.equal(call.spawnOpts.command, 'codex-mock');
          assert.equal(call.spawnOpts.cwd, '/tmp/wd');
          assert.deepEqual(call.spawnOpts.env, { K: 'V' });
          // threadStart called once with the gdd service_name marker.
          assert.equal(call.threadStartCalls.length, 1);
          assert.equal(call.threadStartCalls[0].service_name, 'gdd_peer_delegation');
          // turn called once with the prefixed prompt.
          assert.equal(call.turnCalls.length, 1);
          assert.equal(call.turnCalls[0].threadId, 'thr_mock_1');
          assert.equal(call.turnCalls[0].text, expectedPrompt);
          // close() invoked.
          assert.equal(call.closed, true, 'asp client should be closed after dispatch');
          // Result is passed through unchanged.
          assert.equal(res.status, 'complete');
          assert.equal(res.content.text, `asp-mock:${expectedPrompt}`);
        } else {
          const before = acpRecorder.calls.length;
          const res = await adapter.dispatch(
            { command: `${spec.name}-mock`, args: ['acp'], cwd: '/tmp/wd', env: { K: 'V' } },
            role,
            body,
          );
          assert.equal(acpRecorder.calls.length, before + 1, 'one new acp client per dispatch');
          const call = acpRecorder.calls[before];
          // Spawn opts forwarded verbatim.
          assert.equal(call.spawnOpts.command, `${spec.name}-mock`);
          assert.deepEqual(call.spawnOpts.args, ['acp']);
          assert.equal(call.spawnOpts.cwd, '/tmp/wd');
          // initialize called once with protocolVersion.
          assert.equal(call.initializeCalls.length, 1);
          assert.equal(call.initializeCalls[0].protocolVersion, '2025-06-18');
          // prompt called once with the prefixed prompt.
          assert.equal(call.promptCalls.length, 1);
          assert.equal(call.promptCalls[0].text, expectedPrompt);
          // close() invoked.
          assert.equal(call.closed, true, 'acp client should be closed after dispatch');
          // Result is passed through unchanged.
          assert.equal(res.content, `acp-mock:${expectedPrompt}`);
        }
      }
    } finally {
      reset();
    }
  });

  test(`${spec.name}: dispatch() forwards onNotification to the underlying client`, async () => {
    const { adapter, acpRecorder, aspRecorder, reset } = loadAdapterWithMocks(spec.name);
    try {
      const role = spec.rolesClaimed[0];
      const onNotification = function noop() {};
      await adapter.dispatch(
        { command: 'mock-cmd' },
        role,
        'hi',
        { onNotification },
      );
      if (spec.protocol === 'asp') {
        const last = aspRecorder.calls[aspRecorder.calls.length - 1];
        assert.equal(
          last.turnCalls[0].opts && last.turnCalls[0].opts.onNotification,
          onNotification,
          'asp turn opts should include onNotification reference',
        );
      } else {
        const last = acpRecorder.calls[acpRecorder.calls.length - 1];
        assert.equal(
          last.promptCalls[0].opts && last.promptCalls[0].opts.onNotification,
          onNotification,
          'acp prompt opts should include onNotification reference',
        );
      }
    } finally {
      reset();
    }
  });

  test(`${spec.name}: dispatch() closes the client even when the underlying call rejects`, async () => {
    // Special-case loader: this test wants the client to throw on
    // prompt/turn so we can verify close() still runs. We can't reuse
    // loadAdapterWithMocks's stable mocks for this; we re-do the
    // injection inline with a "rejecting" client.
    delete require.cache[ACP_CLIENT_PATH];
    delete require.cache[ASP_CLIENT_PATH];
    delete require.cache[path.join(ADAPTER_DIR, `${spec.name}.cjs`)];

    let closedCount = 0;
    const rejectingAcp = {
      createAcpClient() {
        return {
          async initialize() { return {}; },
          async prompt() { throw new Error('peer-side failure'); },
          async close() { closedCount += 1; },
        };
      },
      MAX_LINE_BYTES: 1, DEFAULT_PROTOCOL_VERSION: '2025-06-18',
    };
    const rejectingAsp = {
      createAspClient() {
        return {
          async threadStart() { return { threadId: 'thr_x' }; },
          async turn() { throw new Error('peer-side failure'); },
          async close() { closedCount += 1; },
          get closed() { return closedCount > 0; },
        };
      },
      MAX_LINE_BYTES: 1,
    };
    const acpEntry = new Module(ACP_CLIENT_PATH, module);
    acpEntry.exports = rejectingAcp; acpEntry.filename = ACP_CLIENT_PATH; acpEntry.loaded = true;
    require.cache[ACP_CLIENT_PATH] = acpEntry;
    const aspEntry = new Module(ASP_CLIENT_PATH, module);
    aspEntry.exports = rejectingAsp; aspEntry.filename = ASP_CLIENT_PATH; aspEntry.loaded = true;
    require.cache[ASP_CLIENT_PATH] = aspEntry;

    const adapter = require(path.join(ADAPTER_DIR, `${spec.name}.cjs`));
    try {
      const role = spec.rolesClaimed[0];
      await assert.rejects(
        () => adapter.dispatch({ command: 'mock-cmd' }, role, 'will fail'),
        /peer-side failure/,
      );
      assert.equal(closedCount, 1, 'client.close() must run even on rejection');
    } finally {
      delete require.cache[ACP_CLIENT_PATH];
      delete require.cache[ASP_CLIENT_PATH];
      delete require.cache[path.join(ADAPTER_DIR, `${spec.name}.cjs`)];
    }
  });
}

// ───────────────────────────────────────────────────────────────────────
// Cross-peer disjointness — guarantees the per-peer matrix is not
// accidentally identical, which would defeat D-05's "registry refuses
// dispatch to non-claiming peer" rule.
// ───────────────────────────────────────────────────────────────────────

test('per-peer claim sets honor CONTEXT.md D-05 (research is the only role two peers share)', () => {
  const peers = SPEC.map(({ name, rolesClaimed }) => ({ name, rolesClaimed }));
  // Build a role → claimers map.
  /** @type {Map<string, string[]>} */
  const byRole = new Map();
  for (const { name, rolesClaimed } of peers) {
    for (const role of rolesClaimed) {
      if (!byRole.has(role)) byRole.set(role, []);
      byRole.get(role).push(name);
    }
  }
  // D-05: research is shared between gemini and copilot. Every other
  // role is single-claimer.
  for (const [role, claimers] of byRole) {
    if (role === 'research') {
      assert.deepEqual(claimers.sort(), ['copilot', 'gemini']);
    } else {
      assert.equal(
        claimers.length,
        1,
        `role '${role}' should be claimed by exactly one peer (got: ${claimers.join(', ')})`,
      );
    }
  }
});

// ───────────────────────────────────────────────────────────────────────
// Integration tests against the real mock servers (no client mocking).
// These are the smoke checks that prove the adapter wires correctly to
// acp-client / asp-client without hand-rolled stubs.
// ───────────────────────────────────────────────────────────────────────

test('integration: gemini.dispatch() drives the ACP mock through initialize→prompt', async () => {
  // Clear any cached mocks from earlier table-driven tests.
  delete require.cache[ACP_CLIENT_PATH];
  delete require.cache[ASP_CLIENT_PATH];
  delete require.cache[path.join(ADAPTER_DIR, 'gemini.cjs')];

  const adapter = require(path.join(ADAPTER_DIR, 'gemini.cjs'));
  const result = await adapter.dispatch(
    {
      command: process.execPath,
      args: [MOCK_ACP_SERVER],
      env: { ...process.env, MOCK_ACP_MODE: 'normal' },
    },
    'research',
    'what is line-delimited JSON-RPC',
  );
  // Mock returns content "hello world" on prompt regardless of input;
  // we just need to confirm the round-trip succeeded.
  assert.equal(result.content, 'hello world');
  assert.equal(result.finish_reason, 'stop');
});

test('integration: codex.dispatch() drives the ASP mock through threadStart→turn', async () => {
  delete require.cache[ACP_CLIENT_PATH];
  delete require.cache[ASP_CLIENT_PATH];
  delete require.cache[path.join(ADAPTER_DIR, 'codex.cjs')];

  const adapter = require(path.join(ADAPTER_DIR, 'codex.cjs'));
  const result = await adapter.dispatch(
    {
      command: process.execPath,
      args: [MOCK_ASP_SERVER],
      env: { ...process.env, MOCK_ASP_MODE: 'happy' },
    },
    'execute',
    'add a file at src/x.ts',
  );
  // The mock echoes "echo: <text>" — text here is the prefixed prompt
  // so this also doubles as proof the prefix made it onto the wire.
  assert.equal(result.status, 'complete');
  assert.equal(result.content.text, 'echo: /execute add a file at src/x.ts');
  assert.equal(typeof result.threadId, 'string');
  assert.equal(typeof result.turnId, 'string');
});

test('integration: codex.dispatch() surfaces ASP error-turn as {status: error} (no throw)', async () => {
  delete require.cache[ACP_CLIENT_PATH];
  delete require.cache[ASP_CLIENT_PATH];
  delete require.cache[path.join(ADAPTER_DIR, 'codex.cjs')];

  const adapter = require(path.join(ADAPTER_DIR, 'codex.cjs'));
  const result = await adapter.dispatch(
    {
      command: process.execPath,
      args: [MOCK_ASP_SERVER],
      env: { ...process.env, MOCK_ASP_MODE: 'error_turn' },
    },
    'execute',
    'this turn will error',
  );
  assert.equal(result.status, 'error');
  assert.equal(result.error.code, 'rate_limited');
});
