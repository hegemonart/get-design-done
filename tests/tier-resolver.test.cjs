'use strict';
// tests/tier-resolver.test.cjs — Plan 26-02 Task 1.
//
// Covers `scripts/lib/tier-resolver.cjs`:
//   (a) all 4 canonical runtimes resolve correctly for all 3 tiers
//   (b) missing-tier returns null + emits `tier_resolution_failed`
//   (c) missing-runtime returns null + emits event
//   (d) fallback to runtime-default works + emits `tier_resolution_fallback`
//   (e) never throws on garbage input
//
// Fixture shape mirrors 26-01's `parseRuntimeModels()` output:
//   { schema_version: 1, runtimes: [{id, tier_to_model: {opus: {model}, …}}, …] }
//
// Per D-04 the resolver falls back to the `claude` row when a runtime
// isn't in the map (or is in the map but missing a tier). 26-01 inlines
// Anthropic-default models on every placeholder runtime, so the
// "fallback because runtime is in the map but tier is missing" branch
// is exercised by fixtures we author here, not by the live parser
// output. The live integration smoke at the bottom asserts canonical
// runtimes resolve through the real on-disk parser.

const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, readFileSync, existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const {
  resolve,
  reset,
  VALID_TIERS,
  DEFAULT_RUNTIME_ID,
} = require('../scripts/lib/tier-resolver.cjs');

/**
 * Pre-parsed fixture mirroring 26-01's `parseRuntimeModels()` output
 * shape (array of runtime rows with nested `{model: '…'}` values).
 * Editorial picks (D-02) for the 4 canonical runtimes; `cursor` has
 * a partial tier-map on purpose to exercise the
 * tier_missing_for_runtime fallback branch.
 */
const FIXTURE = Object.freeze({
  schema_version: 1,
  runtimes: [
    {
      id: 'claude',
      tier_to_model: {
        opus: { model: 'claude-opus-4-7' },
        sonnet: { model: 'claude-sonnet-4-6' },
        haiku: { model: 'claude-haiku-4-5' },
      },
    },
    {
      id: 'codex',
      tier_to_model: {
        opus: { model: 'gpt-5' },
        sonnet: { model: 'gpt-5-mini' },
        haiku: { model: 'gpt-5-nano' },
      },
    },
    {
      id: 'gemini',
      tier_to_model: {
        opus: { model: 'gemini-2.5-pro' },
        sonnet: { model: 'gemini-2.5-flash' },
        haiku: { model: 'gemini-2.5-flash-lite' },
      },
    },
    {
      id: 'qwen',
      tier_to_model: {
        opus: { model: 'qwen3-max' },
        sonnet: { model: 'qwen3-plus' },
        haiku: { model: 'qwen3-flash' },
      },
    },
    {
      // Runtime listed but tier-map is partial → exercises the
      // tier_missing_for_runtime fallback branch.
      id: 'cursor',
      tier_to_model: {
        opus: { model: 'cursor-opus-equivalent' },
        // sonnet + haiku missing on purpose
      },
    },
  ],
});

/** Map id → expected models for assertion convenience. */
const EXPECTED = {
  claude: { opus: 'claude-opus-4-7', sonnet: 'claude-sonnet-4-6', haiku: 'claude-haiku-4-5' },
  codex: { opus: 'gpt-5', sonnet: 'gpt-5-mini', haiku: 'gpt-5-nano' },
  gemini: { opus: 'gemini-2.5-pro', sonnet: 'gemini-2.5-flash', haiku: 'gemini-2.5-flash-lite' },
  qwen: { opus: 'qwen3-max', sonnet: 'qwen3-plus', haiku: 'qwen3-flash' },
};

/**
 * Run a function with GDD_EVENTS_PATH pointed at a temp events.jsonl.
 * Returns the parsed event lines emitted during fn execution.
 */
function withEventsCapture(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'gdd-tier-resolver-'));
  const eventsPath = join(dir, 'events.jsonl');
  const savedPath = process.env.GDD_EVENTS_PATH;
  const savedSession = process.env.GDD_SESSION_ID;
  process.env.GDD_EVENTS_PATH = eventsPath;
  process.env.GDD_SESSION_ID = 'test-session';
  try {
    fn();
    if (!existsSync(eventsPath)) return { events: [], dir };
    const events = readFileSync(eventsPath, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
    return { events, dir };
  } finally {
    if (savedPath === undefined) delete process.env.GDD_EVENTS_PATH;
    else process.env.GDD_EVENTS_PATH = savedPath;
    if (savedSession === undefined) delete process.env.GDD_SESSION_ID;
    else process.env.GDD_SESSION_ID = savedSession;
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* swallow */ }
    reset();
  }
}

// ---------------------------------------------------------------------
// Scenario (a) — all 4 canonical runtimes × all 3 tiers
// ---------------------------------------------------------------------

const CANONICAL = ['claude', 'codex', 'gemini', 'qwen'];

for (const runtime of CANONICAL) {
  for (const tier of VALID_TIERS) {
    test(`(a) resolve('${runtime}', '${tier}') → expected canonical model`, () => {
      const expected = EXPECTED[runtime][tier];
      const got = resolve(runtime, tier, { models: FIXTURE, silent: true });
      assert.equal(got, expected);
    });
  }
}

test('(a) canonical resolutions emit no events on the happy path', () => {
  const { events } = withEventsCapture(() => {
    for (const runtime of CANONICAL) {
      for (const tier of VALID_TIERS) {
        resolve(runtime, tier, { models: FIXTURE });
      }
    }
  });
  assert.equal(events.length, 0, `unexpected events: ${JSON.stringify(events)}`);
});

// ---------------------------------------------------------------------
// Scenario (b) — missing-tier on the default-runtime row → branch 3
// ---------------------------------------------------------------------

test('(b) missing-tier on claude itself (no fallback possible) → tier_resolution_failed', () => {
  // Build a minimal fixture where the claude row only has opus — the
  // resolver can't fall back to itself, so this is a true failure.
  const partial = {
    schema_version: 1,
    runtimes: [{ id: 'claude', tier_to_model: { opus: { model: 'claude-opus-4-7' } } }],
  };
  const { events } = withEventsCapture(() => {
    const got = resolve('claude', 'sonnet', { models: partial });
    assert.equal(got, null);
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'tier_resolution_failed');
  assert.equal(events[0].payload.runtime, 'claude');
  assert.equal(events[0].payload.tier, 'sonnet');
  assert.equal(events[0].payload.reason, 'tier_missing_on_default_runtime');
});

// ---------------------------------------------------------------------
// Scenario (c) — missing-runtime with no usable default → branch 3
// ---------------------------------------------------------------------

test('(c) missing-runtime AND no default row in map → tier_resolution_failed', () => {
  // Drop the claude row entirely; the resolver has nothing to fall back to.
  const noDefault = {
    schema_version: 1,
    runtimes: [
      { id: 'codex', tier_to_model: { opus: { model: 'gpt-5' } } },
    ],
  };
  const { events } = withEventsCapture(() => {
    const got = resolve('does-not-exist', 'opus', { models: noDefault });
    assert.equal(got, null);
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'tier_resolution_failed');
  assert.equal(events[0].payload.runtime, 'does-not-exist');
  assert.equal(events[0].payload.reason, 'runtime_not_in_map');
});

// ---------------------------------------------------------------------
// Scenario (d) — fallback to runtime-default (claude row)
// ---------------------------------------------------------------------

test('(d) missing-runtime WITH claude default → returns claude model + tier_resolution_fallback', () => {
  const { events } = withEventsCapture(() => {
    const got = resolve('windsurf', 'sonnet', { models: FIXTURE });
    assert.equal(got, 'claude-sonnet-4-6');
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'tier_resolution_fallback');
  assert.equal(events[0].payload.runtime, 'windsurf');
  assert.equal(events[0].payload.tier, 'sonnet');
  assert.equal(events[0].payload.model, 'claude-sonnet-4-6');
  assert.equal(events[0].payload.reason, 'runtime_not_in_map');
  assert.equal(events[0].payload.fallback_runtime, DEFAULT_RUNTIME_ID);
});

test('(d) runtime present but tier missing WITH claude default → fallback', () => {
  // cursor in FIXTURE has only opus; sonnet/haiku missing → fallback fires
  const { events } = withEventsCapture(() => {
    const got = resolve('cursor', 'haiku', { models: FIXTURE });
    assert.equal(got, 'claude-haiku-4-5');
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'tier_resolution_fallback');
  assert.equal(events[0].payload.reason, 'tier_missing_for_runtime');
  assert.equal(events[0].payload.fallback_runtime, DEFAULT_RUNTIME_ID);
});

test('(d) runtime present, tier present → no fallback, no event', () => {
  const { events } = withEventsCapture(() => {
    // cursor.opus IS defined ('cursor-opus-equivalent') — no fallback
    const got = resolve('cursor', 'opus', { models: FIXTURE });
    assert.equal(got, 'cursor-opus-equivalent');
  });
  assert.equal(events.length, 0);
});

test('(d) accepts flat-string tier_to_model shape (test-fixture convenience)', () => {
  const flat = {
    schema_version: 1,
    runtimes: [
      { id: 'claude', tier_to_model: { opus: 'flat-claude-opus' } },
    ],
  };
  const got = resolve('claude', 'opus', { models: flat, silent: true });
  assert.equal(got, 'flat-claude-opus');
});

test('(d) accepts object-keyed runtimes shape (legacy-fixture compat)', () => {
  const objShape = {
    runtimes: {
      claude: { tier_to_model: { opus: 'obj-claude-opus' } },
    },
  };
  const got = resolve('claude', 'opus', { models: objShape, silent: true });
  assert.equal(got, 'obj-claude-opus');
});

// ---------------------------------------------------------------------
// Scenario (e) — never throws on garbage input
// ---------------------------------------------------------------------

test('(e) garbage runtime: undefined → null + failed event', () => {
  const { events } = withEventsCapture(() => {
    assert.doesNotThrow(() => {
      const got = resolve(undefined, 'opus', { models: FIXTURE });
      assert.equal(got, null);
    });
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'tier_resolution_failed');
  assert.equal(events[0].payload.reason, 'invalid_runtime');
});

test('(e) garbage tier: not in enum → null + failed event', () => {
  const { events } = withEventsCapture(() => {
    const got = resolve('claude', 'megaopus', { models: FIXTURE });
    assert.equal(got, null);
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].payload.reason, 'invalid_tier');
});

test('(e) garbage models: null → no throw (falls through to lazy on-disk lookup)', () => {
  // When `opts.models` is null/undefined the resolver lazy-loads the
  // on-disk parser. Either it finds the 26-01 source and returns a
  // model string, or the parser is absent and it returns null. Both
  // are acceptable — the contract the test pins is "no throw".
  assert.doesNotThrow(() => {
    const got = resolve('claude', 'opus', { models: null, silent: true });
    assert.ok(got === null || typeof got === 'string',
      `expected null or string, got ${typeof got}`);
  });
});

test('(e) garbage everything: numeric runtime, object tier, string models → null no throw', () => {
  assert.doesNotThrow(() => {
    const got = resolve(42, { foo: 'bar' }, { models: 'not-an-object', silent: true });
    assert.equal(got, null);
  });
});

test('(e) empty string runtime → invalid_runtime', () => {
  const { events } = withEventsCapture(() => {
    const got = resolve('', 'opus', { models: FIXTURE });
    assert.equal(got, null);
  });
  assert.equal(events[0].payload.reason, 'invalid_runtime');
});

test('(e) empty runtimes array → tier_resolution_failed runtime_not_in_map', () => {
  const { events } = withEventsCapture(() => {
    const got = resolve('claude', 'opus', { models: { runtimes: [] } });
    assert.equal(got, null);
  });
  assert.equal(events[0].type, 'tier_resolution_failed');
});

test('(e) silent=true suppresses all events', () => {
  const { events } = withEventsCapture(() => {
    resolve('does-not-exist', 'megaopus', { models: FIXTURE, silent: true });
    resolve('windsurf', 'sonnet', { models: FIXTURE, silent: true });
    resolve('claude', 'opus', { models: FIXTURE, silent: true });
  });
  assert.equal(events.length, 0);
});

test('(e) malformed row (missing tier_to_model) → fallback or null, no throw', () => {
  const malformed = {
    runtimes: [
      { id: 'claude', tier_to_model: { opus: { model: 'claude-opus-4-7' } } },
      { id: 'broken' /* no tier_to_model */ },
    ],
  };
  const got = resolve('broken', 'opus', { models: malformed, silent: true });
  assert.equal(got, 'claude-opus-4-7'); // falls back to claude row
});

// ---------------------------------------------------------------------
// Bonus — exports + live-parser integration smoke
// ---------------------------------------------------------------------

test('VALID_TIERS exports the canonical opus/sonnet/haiku trio', () => {
  assert.deepEqual([...VALID_TIERS].sort(), ['haiku', 'opus', 'sonnet']);
});

test('DEFAULT_RUNTIME_ID is "claude" (Anthropic-default convention from 26-01)', () => {
  assert.equal(DEFAULT_RUNTIME_ID, 'claude');
});

test('integration: resolves canonical runtimes via the live 26-01 parser on disk', () => {
  // No opts.models — exercise the lazy on-disk lookup path. If 26-01
  // hasn't landed in this checkout, the parser file is absent and the
  // resolver returns null + emits failed; we accept either the happy
  // path (parser present, real models returned) or the
  // models_unavailable path (parser absent) so this test is robust to
  // wave-A landing order.
  reset();
  const got = resolve('claude', 'opus', { silent: true });
  if (got !== null) {
    // Parser landed → assert real model name comes through.
    assert.equal(typeof got, 'string');
    assert.ok(got.length > 0, 'expected non-empty model string');
  }
  // If got === null, the parser isn't on disk yet — soft-import path
  // proven by the rest of the test suite.
});
