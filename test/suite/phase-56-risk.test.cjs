// test/suite/phase-56-risk.test.cjs — Phase 56 (Risk-Scoring + Fact-Forcing Gate)
//
// Proves the dep-free, PURE risk primitives (executor A):
//   - scripts/lib/risk/compute-risk.cjs  computeRisk(tool,input,thresholds)
//   - scripts/lib/risk/route.cjs         route(confidence, action)
//   - scripts/lib/risk/tables.cjs        frozen BASE_TOOL_RISK / FILE_SENSITIVITY /
//                                        INPUT_PATTERN_RISK / THRESHOLDS
//
// Table-driven coverage of the shared contract:
//   * Edit STATE.md + a 300-line diff   -> block        (score clamps to ~1.0)
//   * small STATE.md edit               -> require_confirmation (~0.81)
//   * README Write (5 lines)            -> allow        (~0.15)
//   * `rm -rf /` Bash                   -> block
//   * secret-shaped content             -> high addend  (require_confirmation)
//   * determinism (same input twice -> identical result)
//   * route() full matrix incl. block short-circuit + c<0.5 skip + the 4 named cells
//   * config threshold override changes the suggested_action
//
// PURE: no Date.now / Math.random in the modules under test; the determinism
// test asserts byte-identical output across two calls.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const computeMod = require('../../scripts/lib/risk/compute-risk.cjs');
const { computeRisk, loadRiskConfig, pickMaxFileSensitivity, actionFor } = computeMod;
const { route, AUTO_FLOOR, SKIP_FLOOR } = require('../../scripts/lib/risk/route.cjs');
const tables = require('../../scripts/lib/risk/tables.cjs');
const { BASE_TOOL_RISK, FILE_SENSITIVITY, INPUT_PATTERN_RISK, THRESHOLDS, SECRET_SHAPED_RE } = tables;

const bigDiff = (n) => Array.from({ length: n }, (_, i) => `line ${i}`).join('\n');

// ── Frozen-table invariants ─────────────────────────────────────────────────

test('56-01: tables are frozen (cannot be mutated by a consumer)', () => {
  assert.equal(Object.isFrozen(BASE_TOOL_RISK), true);
  assert.equal(Object.isFrozen(FILE_SENSITIVITY), true);
  assert.equal(Object.isFrozen(INPUT_PATTERN_RISK), true);
  assert.equal(Object.isFrozen(THRESHOLDS), true);
  assert.throws(() => { 'use strict'; BASE_TOOL_RISK.Bash = 9; }, TypeError);
});

test('56-01: BASE_TOOL_RISK ordering Bash > MultiEdit > Edit/NotebookEdit > Write > Read > Glob/Grep', () => {
  assert.equal(BASE_TOOL_RISK.Bash, 0.55);
  assert.equal(BASE_TOOL_RISK.MultiEdit, 0.40);
  assert.equal(BASE_TOOL_RISK.Edit, 0.35);
  assert.equal(BASE_TOOL_RISK.NotebookEdit, 0.35);
  assert.equal(BASE_TOOL_RISK.Write, 0.30);
  assert.equal(BASE_TOOL_RISK.Read, 0.02);
  assert.equal(BASE_TOOL_RISK.Glob, 0);
  assert.equal(BASE_TOOL_RISK.Grep, 0);
  assert.equal(BASE_TOOL_RISK.__default, 0.20);
  assert.ok(BASE_TOOL_RISK.Bash > BASE_TOOL_RISK.MultiEdit);
  assert.ok(BASE_TOOL_RISK.MultiEdit > BASE_TOOL_RISK.Edit);
  assert.ok(BASE_TOOL_RISK.Edit > BASE_TOOL_RISK.Write);
  assert.ok(BASE_TOOL_RISK.Write > BASE_TOOL_RISK.Read);
});

test('56-01: THRESHOLDS are review<require_confirmation<block', () => {
  assert.deepEqual(THRESHOLDS, { review: 0.30, require_confirmation: 0.60, block: 0.85 });
  assert.ok(THRESHOLDS.review < THRESHOLDS.require_confirmation);
  assert.ok(THRESHOLDS.require_confirmation < THRESHOLDS.block);
});

test('56-01: secret-shaped regex is anchored on fixed prefixes (ReDoS-safe shape)', () => {
  assert.equal(SECRET_SHAPED_RE.test('AKIA1234567890ABCDEF'), true);
  assert.equal(SECRET_SHAPED_RE.test('-----BEGIN RSA PRIVATE KEY-----'), true);
  assert.equal(SECRET_SHAPED_RE.test('sk-abcdefghijklmnopqrstuvwx'), true);
  assert.equal(SECRET_SHAPED_RE.test('ghp_' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8'), true); // ghp_ + 36 chars
  assert.equal(SECRET_SHAPED_RE.test('xoxb-foo'), true);
  assert.equal(SECRET_SHAPED_RE.test('just a normal string with no secret'), false);
  // The regex source must not contain a nested quantifier (CodeQL js/redos).
  assert.equal(/\([^)]*[+*]\)[+*]/.test(SECRET_SHAPED_RE.source), false);
});

// ── computeRisk: the canonical scoring table ────────────────────────────────

const CASES = [
  {
    name: 'Edit STATE.md + 300-line diff -> block (clamps ~1.0)',
    tool: 'Edit',
    input: { file_path: '.planning/STATE.md', new_string: bigDiff(300) },
    action: 'block',
    scoreAtLeast: 0.99,
  },
  {
    name: 'small STATE.md edit -> require_confirmation (~0.81)',
    tool: 'Edit',
    input: { file_path: '.planning/STATE.md', new_string: 'one small line' },
    action: 'require_confirmation',
    scoreNear: [0.81, 0.02],
  },
  {
    name: 'README Write 5 lines -> allow (~0.15)',
    tool: 'Write',
    input: { file_path: 'README.md', content: 'a\nb\nc\nd\ne' },
    action: 'allow',
    scoreNear: [0.15, 0.03],
  },
  {
    name: 'rm -rf / Bash -> block',
    tool: 'Bash',
    input: { command: 'rm -rf /' },
    action: 'block',
    scoreAtLeast: 0.99,
    expectReason: 'input:dangerous-bash',
  },
  {
    name: 'secret-shaped content (AKIA) -> require_confirmation, high addend',
    tool: 'Write',
    input: { file_path: 'src/conf.ts', content: 'const key = "AKIA1234567890ABCDEF";' },
    action: 'require_confirmation',
    scoreAtLeast: 0.79,
    expectReason: 'input:secret-shaped',
  },
  {
    name: 'MultiEdit on package.json (schema/dep-mutation) is elevated',
    tool: 'MultiEdit',
    input: { file_path: 'package.json', edits: [{ old_string: 'a', new_string: 'b' }] },
    actionOneOf: ['require_confirmation', 'block', 'review'],
    scoreAtLeast: 0.6,
  },
  {
    name: 'Read of STATE.md is near-zero -> allow',
    tool: 'Read',
    input: { file_path: '.planning/STATE.md' },
    action: 'allow',
    scoreAtMost: 0.30,
  },
];

for (const c of CASES) {
  test(`56-01: computeRisk — ${c.name}`, () => {
    const r = computeRisk(c.tool, c.input);
    assert.ok(r.score >= 0 && r.score <= 1, `score in [0,1] got ${r.score}`);
    if (c.action) assert.equal(r.suggested_action, c.action, `action: got ${r.suggested_action} @ score ${r.score}`);
    if (c.actionOneOf) assert.ok(c.actionOneOf.includes(r.suggested_action), `action ${r.suggested_action} not in ${c.actionOneOf}`);
    if (typeof c.scoreAtLeast === 'number') assert.ok(r.score >= c.scoreAtLeast, `score ${r.score} >= ${c.scoreAtLeast}`);
    if (typeof c.scoreAtMost === 'number') assert.ok(r.score <= c.scoreAtMost, `score ${r.score} <= ${c.scoreAtMost}`);
    if (c.scoreNear) {
      const [mid, tol] = c.scoreNear;
      assert.ok(Math.abs(r.score - mid) <= tol, `score ${r.score} within ${tol} of ${mid}`);
    }
    if (c.expectReason) assert.ok(r.reasons.some((x) => x.startsWith(c.expectReason)), `reasons include ${c.expectReason}: ${JSON.stringify(r.reasons)}`);
    // breakdown is always present and structurally sound
    assert.equal(typeof r.breakdown, 'object');
    assert.equal(typeof r.breakdown.base, 'number');
    assert.ok(Array.isArray(r.reasons) && r.reasons.length >= 1);
  });
}

test('56-01: computeRisk — reasons accumulate in fixed table order (dangerous-bash before large-diff)', () => {
  // A destructive command that also carries many "lines" (long heredoc-ish text):
  const r = computeRisk('Bash', { command: 'rm -rf / && ' + bigDiff(50) });
  const danIdx = r.reasons.findIndex((x) => x.startsWith('input:dangerous-bash'));
  assert.ok(danIdx >= 0, 'dangerous-bash present');
  // base is always first
  assert.ok(r.reasons[0].startsWith('base:'));
});

test('56-01: computeRisk — unknown tool falls back to __default base', () => {
  const r = computeRisk('TotallyUnknownTool', { file_path: 'x.txt' });
  assert.ok(r.reasons[0].startsWith('base:TotallyUnknownTool='));
  assert.ok(r.breakdown.base === BASE_TOOL_RISK.__default);
});

test('56-01: computeRisk — MultiEdit large diff (sum of edits[]) lifts score over require_confirmation', () => {
  const edits = Array.from({ length: 8 }, (_, i) => ({ old_string: `o${i}`, new_string: bigDiff(60) }));
  const r = computeRisk('MultiEdit', { file_path: 'src/big.ts', edits });
  assert.ok(r.reasons.some((x) => x.startsWith('input:large-diff')), 'large-diff reason present');
  assert.ok(r.score > THRESHOLDS.review, `score ${r.score} above review floor`);
});

// ── Determinism (PURE) ───────────────────────────────────────────────────────

test('56-01: computeRisk is deterministic — identical output for identical input', () => {
  const input = { file_path: '.planning/STATE.md', new_string: bigDiff(120) };
  const a = computeRisk('Edit', input);
  const b = computeRisk('Edit', input);
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test('56-01: computeRisk does not mutate its input', () => {
  const input = { file_path: 'src/x.ts', content: 'hello' };
  const snapshot = JSON.stringify(input);
  computeRisk('Write', input);
  assert.equal(JSON.stringify(input), snapshot);
});

// ── pickMaxFileSensitivity: highest-weight wins ──────────────────────────────

test('56-01: pickMaxFileSensitivity picks the highest-weight matching entry', () => {
  // A file under hooks/ should resolve to the hook entry (x1.5) not docs/test.
  const hook = pickMaxFileSensitivity(['hooks/hone-foo.js'], FILE_SENSITIVITY);
  assert.equal(hook.label, 'hook');
  // A plain doc resolves to the de-risking docs entry (<1 mult).
  const doc = pickMaxFileSensitivity(['docs/guide.md'], FILE_SENSITIVITY);
  assert.equal(doc.label, 'docs');
  assert.ok(doc.mult < 1);
  // No match -> neutral { mult:1, add:0, label:null }.
  const none = pickMaxFileSensitivity(['src/plain.ts'], FILE_SENSITIVITY);
  assert.deepEqual(none, { mult: 1, add: 0, label: null });
});

test('56-01: actionFor maps scores to the four tiers at the threshold boundaries', () => {
  assert.equal(actionFor(0.0, THRESHOLDS), 'allow');
  assert.equal(actionFor(0.29, THRESHOLDS), 'allow');
  assert.equal(actionFor(0.30, THRESHOLDS), 'review');
  assert.equal(actionFor(0.59, THRESHOLDS), 'review');
  assert.equal(actionFor(0.60, THRESHOLDS), 'require_confirmation');
  assert.equal(actionFor(0.84, THRESHOLDS), 'require_confirmation');
  assert.equal(actionFor(0.85, THRESHOLDS), 'block');
  assert.equal(actionFor(1.0, THRESHOLDS), 'block');
});

// ── route(): the full confidence×action matrix ───────────────────────────────

test('56-01: route — block short-circuits to override at ANY confidence', () => {
  for (const c of [0, 0.1, 0.49, 0.5, 0.79, 0.8, 1.0]) {
    assert.equal(route(c, 'block'), 'override', `c=${c} block -> override`);
  }
});

test('56-01: route — confidence < 0.5 (non-block) -> skip', () => {
  for (const a of ['allow', 'review', 'require_confirmation']) {
    assert.equal(route(0.49, a), 'skip', `c=0.49 ${a} -> skip`);
    assert.equal(route(0.0, a), 'skip', `c=0 ${a} -> skip`);
  }
});

test('56-01: route — the 4 named high/mid cells', () => {
  // c>=0.8 && allow|review -> auto
  assert.equal(route(0.8, 'allow'), 'auto');
  assert.equal(route(0.95, 'review'), 'auto');
  // c>=0.8 && require_confirmation -> confirm
  assert.equal(route(0.8, 'require_confirmation'), 'confirm');
  // 0.5 <= c < 0.8 (non-block) -> confirm
  assert.equal(route(0.5, 'review'), 'confirm');
  assert.equal(route(0.65, 'allow'), 'confirm');
  assert.equal(route(0.79, 'require_confirmation'), 'confirm');
});

test('56-01: route — full 5x4 matrix snapshot', () => {
  const confs = [0.3, 0.5, 0.65, 0.8, 0.95];
  const actions = ['allow', 'review', 'require_confirmation', 'block'];
  const matrix = confs.map((c) => actions.map((a) => route(c, a)));
  assert.deepEqual(matrix, [
    /* 0.30 */ ['skip', 'skip', 'skip', 'override'],
    /* 0.50 */ ['confirm', 'confirm', 'confirm', 'override'],
    /* 0.65 */ ['confirm', 'confirm', 'confirm', 'override'],
    /* 0.80 */ ['auto', 'auto', 'confirm', 'override'],
    /* 0.95 */ ['auto', 'auto', 'confirm', 'override'],
  ]);
});

test('56-01: route — non-numeric confidence is treated as lowest tier (skip / override)', () => {
  assert.equal(route(undefined, 'review'), 'skip');
  assert.equal(route(NaN, 'allow'), 'skip');
  assert.equal(route(undefined, 'block'), 'override');
  assert.equal(route('high', 'require_confirmation'), 'skip');
});

test('56-01: route — exported floors match the contract', () => {
  assert.equal(AUTO_FLOOR, 0.8);
  assert.equal(SKIP_FLOOR, 0.5);
});

// ── Config-override (extend-only) changes the action ────────────────────────

function scaffoldRiskConfig(riskCfg) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hone-risk56-'));
  fs.mkdirSync(path.join(dir, '.design'), { recursive: true });
  if (riskCfg !== undefined) {
    fs.writeFileSync(path.join(dir, '.design', 'config.json'), JSON.stringify(riskCfg), 'utf8');
  }
  return { dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test('56-01: loadRiskConfig — lowering block threshold flips small STATE.md edit to block', () => {
  const { dir, cleanup } = scaffoldRiskConfig({ risk: { thresholds: { block: 0.50 } } });
  try {
    const cfg = loadRiskConfig(dir);
    assert.equal(cfg.thresholds.block, 0.50);
    // default review/require_confirmation preserved (extend-only)
    assert.equal(cfg.thresholds.review, THRESHOLDS.review);
    assert.equal(cfg.thresholds.require_confirmation, THRESHOLDS.require_confirmation);

    const input = { file_path: '.planning/STATE.md', new_string: 'one small line' };
    assert.equal(computeRisk('Edit', input).suggested_action, 'require_confirmation', 'default');
    assert.equal(computeRisk('Edit', input, cfg.thresholds).suggested_action, 'block', 'override');
  } finally {
    cleanup();
  }
});

test('56-01: loadRiskConfig — absent config returns frozen defaults', () => {
  const { dir, cleanup } = scaffoldRiskConfig(undefined);
  try {
    const cfg = loadRiskConfig(dir);
    assert.deepEqual(cfg.thresholds, { ...THRESHOLDS });
    assert.deepEqual(cfg.base_tool_extra, {});
    assert.deepEqual(cfg.file_sensitivity_extra, []);
    assert.deepEqual(cfg.input_pattern_extra, []);
  } finally {
    cleanup();
  }
});

test('56-01: loadRiskConfig — out-of-range threshold values are ignored (clamped to default)', () => {
  const { dir, cleanup } = scaffoldRiskConfig({ risk: { thresholds: { block: 2.5, review: -1 } } });
  try {
    const cfg = loadRiskConfig(dir);
    assert.equal(cfg.thresholds.block, THRESHOLDS.block, 'block 2.5 rejected');
    assert.equal(cfg.thresholds.review, THRESHOLDS.review, 'review -1 rejected');
  } finally {
    cleanup();
  }
});
