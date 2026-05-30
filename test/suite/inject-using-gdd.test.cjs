// test/suite/inject-using-gdd.test.cjs — Plan 32-02
// Per-harness SessionStart JSON emitter (hooks/inject-using-gdd.sh) shape +
// escape round-trip tests, plus the D-06 NO-CASCADE structural assertion on
// hooks/hooks.json (inject-using-gdd is wired ONLY under SessionStart).
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = join(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'hooks', 'inject-using-gdd.sh');
const HOOKS_JSON = join(REPO_ROOT, 'hooks', 'hooks.json');
const SKILL = join(REPO_ROOT, 'skills', 'using-gdd', 'SKILL.md');

// The 1%-rule marker the round-trip proves the escaped payload decodes to.
const MARKER = '1% chance';

// Bash-spawn skip: the emitter is a .sh invoked via bash. On Windows, bash may
// be absent or unreliable to spawn from node:test (msys/git-bash path quirks).
// Mirror cli-events.test.cjs's SKIP_PLATFORM pattern: skip the bash-spawn tests
// with a reason when bash cannot be invoked, but keep the hooks.json no-cascade
// + schema-shape (on captured output) assertions platform-independent.
const BASH = (() => {
  // Honor an explicit override first (CI / local shells set this).
  const fromEnv = process.env.GDD_BASH || process.env.BASH;
  const candidates = [fromEnv, 'bash'].filter(Boolean);
  for (const cand of candidates) {
    try {
      const r = spawnSync(cand, ['--version'], { encoding: 'utf8', timeout: 5000, windowsHide: true });
      if (r.status === 0) return cand;
    } catch { /* try next */ }
  }
  return null;
})();
const SKIP_BASH = BASH ? false : 'bash not spawnable on this platform';

// Spawn the emitter under a controlled env. We DELETE both plugin-root vars from
// the inherited env first, then set only the one(s) the branch needs, so a stray
// CLAUDE_PLUGIN_ROOT in the parent env can't leak into the SDK/Cursor cases.
function runEmitter(envOverrides) {
  const env = { ...process.env };
  delete env.CURSOR_PLUGIN_ROOT;
  delete env.CLAUDE_PLUGIN_ROOT;
  delete env.COPILOT_CLI;
  Object.assign(env, envOverrides);
  const r = spawnSync(BASH, [SCRIPT], {
    encoding: 'utf8',
    timeout: 10000,
    windowsHide: true,
    env,
  });
  return r;
}

function parseStdout(r) {
  assert.equal(r.status, 0, `emitter exited non-zero: ${r.status} stderr=${r.stderr}`);
  const out = (r.stdout || '').trim();
  assert.ok(out.length > 0, 'emitter produced no stdout');
  let parsed;
  assert.doesNotThrow(() => { parsed = JSON.parse(out); }, `stdout is not valid JSON: ${out.slice(0, 200)}`);
  return parsed;
}

test('32-02: Cursor branch emits {additional_context: string} round-tripping the 1%-rule marker', { skip: SKIP_BASH }, () => {
  const out = parseStdout(runEmitter({ CURSOR_PLUGIN_ROOT: REPO_ROOT }));
  assert.equal(typeof out.additional_context, 'string', 'additional_context must be a string');
  assert.ok(out.additional_context.includes(MARKER), 'decoded Cursor context must contain the 1%-rule marker');
  // Cursor branch must NOT carry the CC envelope.
  assert.equal(out.hookSpecificOutput, undefined, 'Cursor branch must not emit hookSpecificOutput');
});

test('32-02: CC branch emits hookSpecificOutput.additionalContext + hookEventName SessionStart', { skip: SKIP_BASH }, () => {
  const out = parseStdout(runEmitter({ CLAUDE_PLUGIN_ROOT: REPO_ROOT }));
  assert.ok(out.hookSpecificOutput && typeof out.hookSpecificOutput === 'object', 'must emit hookSpecificOutput object');
  assert.equal(out.hookSpecificOutput.hookEventName, 'SessionStart', 'hookEventName must be SessionStart');
  assert.equal(typeof out.hookSpecificOutput.additionalContext, 'string', 'additionalContext must be a string');
  assert.ok(out.hookSpecificOutput.additionalContext.includes(MARKER), 'decoded CC context must contain the 1%-rule marker');
});

test('32-02: SDK branch (neither var) emits {additionalContext: string}', { skip: SKIP_BASH }, () => {
  const out = parseStdout(runEmitter({}));
  assert.equal(typeof out.additionalContext, 'string', 'additionalContext must be a string');
  assert.ok(out.additionalContext.includes(MARKER), 'decoded SDK context must contain the 1%-rule marker');
  // SDK branch must NOT carry the CC envelope or Cursor key.
  assert.equal(out.hookSpecificOutput, undefined, 'SDK branch must not emit hookSpecificOutput');
  assert.equal(out.additional_context, undefined, 'SDK branch must not emit the Cursor additional_context key');
});

test('32-02: Cursor beats CC when both vars are set (branch order)', { skip: SKIP_BASH }, () => {
  const out = parseStdout(runEmitter({ CURSOR_PLUGIN_ROOT: REPO_ROOT, CLAUDE_PLUGIN_ROOT: REPO_ROOT }));
  assert.equal(typeof out.additional_context, 'string', 'Cursor must win: top-level additional_context expected');
  assert.equal(out.hookSpecificOutput, undefined, 'Cursor must win: no CC envelope when both vars set');
});

test('32-02: escaped payload is valid JSON with multiline/quote/backslash content', { skip: SKIP_BASH }, () => {
  // Sanity-check the source genuinely contains characters that MUST be escaped,
  // so a passing JSON.parse below is meaningful (not a vacuous pass).
  const raw = fs.readFileSync(SKILL, 'utf8');
  assert.ok(raw.includes('\n'), 'fixture precondition: SKILL.md should contain newlines');
  assert.ok(/[*`]/.test(raw), 'fixture precondition: SKILL.md should contain markdown punctuation');

  for (const env of [{ CURSOR_PLUGIN_ROOT: REPO_ROOT }, { CLAUDE_PLUGIN_ROOT: REPO_ROOT }, {}]) {
    const r = runEmitter(env);
    assert.equal(r.status, 0, `emitter exited non-zero for ${JSON.stringify(env)}: ${r.stderr}`);
    // Must parse without throwing — proves newlines/quotes/backslashes were escaped.
    assert.doesNotThrow(() => JSON.parse((r.stdout || '').trim()), `unescaped content broke JSON for ${JSON.stringify(env)}`);
    // And the decoded context must preserve a multi-line body (a header line + the marker line).
    const out = JSON.parse((r.stdout || '').trim());
    const ctx = out.additional_context || out.additionalContext || (out.hookSpecificOutput && out.hookSpecificOutput.additionalContext);
    assert.ok(/\n/.test(ctx), 'decoded context must retain newlines (multiline round-trip)');
    assert.ok(ctx.includes(MARKER), 'decoded context must contain the 1%-rule marker');
  }
});

// --- D-06 NO-CASCADE structural guarantee (platform-independent) ---

test('32-02: inject-using-gdd is wired ONLY under SessionStart (no-cascade, D-06)', () => {
  const hooks = JSON.parse(fs.readFileSync(HOOKS_JSON, 'utf8'));
  const events = hooks.hooks || {};

  // It must appear under SessionStart...
  const ssCmds = (events.SessionStart || [])
    .flatMap((b) => (b.hooks || []).map((h) => h.command || ''));
  assert.ok(
    ssCmds.some((c) => c.includes('inject-using-gdd')),
    'inject-using-gdd must be wired under SessionStart',
  );

  // ...and in NO other hook-event array. Subagent spawns never fire SessionStart,
  // so by construction the inject cannot cascade into a subagent's context.
  const FORBIDDEN = ['PreToolUse', 'PostToolUse', 'Agent', 'SubagentStart', 'SubagentStop', 'Stop', 'PreCompact', 'UserPromptSubmit'];
  for (const ev of FORBIDDEN) {
    const cmds = (events[ev] || []).flatMap((b) => (b.hooks || []).map((h) => h.command || ''));
    for (const c of cmds) {
      assert.ok(
        !c.includes('inject-using-gdd'),
        `NO-CASCADE violation: inject-using-gdd found under ${ev} — it must live only under SessionStart`,
      );
    }
    // Also guard against a matcher literally named for a subagent surface.
    for (const block of (events[ev] || [])) {
      const matcher = String(block.matcher || '');
      const blockCmds = (block.hooks || []).map((h) => h.command || '').join(' ');
      if (blockCmds.includes('inject-using-gdd')) {
        assert.fail(`NO-CASCADE violation: inject-using-gdd in ${ev} block (matcher="${matcher}")`);
      }
    }
  }
});

test('32-02: the inject SessionStart entry carries matcher startup|clear|compact (SC#2)', () => {
  const hooks = JSON.parse(fs.readFileSync(HOOKS_JSON, 'utf8'));
  const ss = hooks.hooks.SessionStart || [];
  const injBlock = ss.find((b) => (b.hooks || []).some((h) => (h.command || '').includes('inject-using-gdd')));
  assert.ok(injBlock, 'an inject-using-gdd SessionStart block must exist');
  assert.equal(injBlock.matcher, 'startup|clear|compact', 'inject block must carry matcher startup|clear|compact');
});

test('32-02: existing SessionStart entries are preserved alongside the inject entry', () => {
  const hooks = JSON.parse(fs.readFileSync(HOOKS_JSON, 'utf8'));
  const cmds = (hooks.hooks.SessionStart || [])
    .flatMap((b) => (b.hooks || []).map((h) => h.command || ''))
    .join('\n');
  for (const keep of ['bootstrap.sh', 'update-check.sh', 'first-run-nudge.sh', 'gdd-sessionstart-recap.js']) {
    assert.ok(cmds.includes(keep), `existing SessionStart entry lost: ${keep}`);
  }
  assert.ok(cmds.includes('inject-using-gdd.sh'), 'inject-using-gdd.sh entry missing from SessionStart');
});
