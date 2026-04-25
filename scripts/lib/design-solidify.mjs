/**
 * design-solidify.mjs — solidify-with-rollback gate (Plan 23-02).
 *
 * Code-level gate that runs the validation triplet for a task and, on
 * any failure, rolls the working tree back via git stash (configurable)
 * and appends a `solidify.rollback` event onto the Phase 22 causal chain.
 *
 * Replaces the prompt-encoded "stash if it broke" instruction in today's
 * solidify agents with a typed, testable function.
 *
 * Why .mjs, not .ts:
 *   * Node 24 + Windows + .mjs dynamic-importing .ts triggers
 *     STATUS_STACK_BUFFER_OVERRUN (Phase 22 lesson). Keep this file as
 *     plain .mjs with a CJS test wrapper.
 *
 * Usage:
 *   import { solidify } from './design-solidify.mjs';
 *   const result = await solidify({ taskId: '23-02' });
 *   // result.outcome === 'pass' | 'fail'
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Anchor on the .mjs file's own directory — NOT on the caller's cwd —
// because callers pass in arbitrary `cwd` values (test scaffolds,
// sub-repos) where event-chain.cjs is unreachable. Walk up from
// scripts/lib/ to repo root.
const __filename = fileURLToPath(import.meta.url);
function _findRepoRoot(start) {
  let dir = start;
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}
const PLUGIN_ROOT = _findRepoRoot(dirname(__filename));
const _nodeRequire = createRequire(join(PLUGIN_ROOT, 'package.json'));
const { appendChainEvent } = _nodeRequire(
  resolve(PLUGIN_ROOT, 'scripts/lib/event-chain.cjs'),
);

/**
 * @typedef {Object} SolidifyValidation
 * @property {string} name
 * @property {string} cmd
 * @property {string[]} args
 * @property {number} [timeout_ms]
 */

/**
 * @typedef {Object} SolidifyOptions
 * @property {string} taskId
 * @property {SolidifyValidation[]} [validations]
 * @property {'stash'|'hard'|'none'} [rollback]
 * @property {string} [cwd]
 * @property {string[]} [decisionRefs]
 * @property {string} [parentEventId]
 * @property {(ev: object) => void} [emit]
 * @property {string} [chainPath]
 */

/**
 * @typedef {Object} SolidifyStep
 * @property {string} name
 * @property {'pass'|'fail'} status
 * @property {string} [stdout]
 * @property {string} [stderr]
 * @property {number|null} [code]
 * @property {string|null} [signal]
 */

/**
 * @typedef {Object} SolidifyResult
 * @property {'pass'|'fail'} outcome
 * @property {SolidifyStep[]} steps
 * @property {'stash'|'hard'|'none'|'skipped'} [rolledBackVia]
 * @property {string} eventId
 * @property {string} [stashRef]
 */

/**
 * Build the default validation triplet for a task. Caller may override
 * by supplying `opts.validations` directly.
 *
 * @param {string} taskId
 * @returns {SolidifyValidation[]}
 */
function defaultValidations(taskId) {
  return [
    { name: 'typecheck', cmd: 'npm', args: ['run', 'typecheck'], timeout_ms: 120_000 },
    { name: 'build', cmd: 'npm', args: ['run', 'build'], timeout_ms: 300_000 },
    {
      name: 'targeted-test',
      cmd: 'npm',
      args: ['test', '--', '--testPathPattern', String(taskId)],
      timeout_ms: 120_000,
    },
  ];
}

/**
 * Run one validation step via spawnSync. Always returns a step record;
 * never throws.
 *
 * @param {SolidifyValidation} v
 * @param {string} cwd
 * @returns {SolidifyStep}
 */
function runStep(v, cwd) {
  const r = spawnSync(v.cmd, v.args, {
    cwd,
    encoding: 'utf8',
    shell: false,
    timeout: v.timeout_ms ?? 120_000,
  });
  const status = r.status === 0 && !r.error ? 'pass' : 'fail';
  return {
    name: v.name,
    status,
    stdout: r.stdout,
    stderr: r.stderr || (r.error ? String(r.error.message || r.error) : undefined),
    code: r.status,
    signal: r.signal,
  };
}

/**
 * Roll the tree back per the configured strategy. Never throws —
 * returns the resolved verb (or 'skipped' if the strategy could not be
 * applied) and an optional stash ref.
 *
 * @param {'stash'|'hard'|'none'} mode
 * @param {string} cwd
 * @param {string} taskId
 * @returns {{via: 'stash'|'hard'|'none'|'skipped', stashRef?: string}}
 */
function rollback(mode, cwd, taskId) {
  if (mode === 'none') return { via: 'none' };
  if (!existsSync(join(cwd, '.git'))) return { via: 'skipped' };
  const ts = new Date().toISOString();

  if (mode === 'stash') {
    const r = spawnSync(
      'git',
      ['stash', 'push', '-u', '-m', `solidify-rollback:${taskId}:${ts}`],
      { cwd, encoding: 'utf8', shell: false, timeout: 30_000 },
    );
    if (r.status !== 0) return { via: 'skipped' };
    const refRes = spawnSync('git', ['stash', 'list', '-1', '--format=%gd'], {
      cwd,
      encoding: 'utf8',
      shell: false,
      timeout: 10_000,
    });
    const stashRef = refRes.status === 0 ? refRes.stdout.trim() : undefined;
    return { via: 'stash', stashRef };
  }

  if (mode === 'hard') {
    const r = spawnSync('git', ['reset', '--hard', 'HEAD'], {
      cwd,
      encoding: 'utf8',
      shell: false,
      timeout: 30_000,
    });
    if (r.status !== 0) return { via: 'skipped' };
    return { via: 'hard' };
  }

  return { via: 'skipped' };
}

/**
 * Run the solidify gate.
 *
 * @param {SolidifyOptions} opts
 * @returns {Promise<SolidifyResult>}
 */
export async function solidify(opts) {
  if (!opts || typeof opts.taskId !== 'string' || opts.taskId.length === 0) {
    throw new TypeError('solidify: opts.taskId is required (non-empty string)');
  }
  const cwd = opts.cwd ? resolve(opts.cwd) : process.cwd();
  const validations =
    Array.isArray(opts.validations) && opts.validations.length > 0
      ? opts.validations
      : defaultValidations(opts.taskId);
  const mode = opts.rollback ?? 'stash';

  /** @type {SolidifyStep[]} */
  const steps = [];
  /** @type {SolidifyStep|null} */
  let failingStep = null;
  for (const v of validations) {
    const step = runStep(v, cwd);
    steps.push(step);
    if (step.status === 'fail') {
      failingStep = step;
      break;
    }
  }

  let rolledBackVia = 'none';
  let stashRef;
  if (failingStep && mode !== 'none') {
    const r = rollback(mode, cwd, opts.taskId);
    rolledBackVia = r.via;
    stashRef = r.stashRef;
  } else if (failingStep && mode === 'none') {
    rolledBackVia = 'none';
  }

  const chainEvent = {
    parent_event_id: opts.parentEventId ?? null,
    agent: 'design-solidify',
    decision_refs: opts.decisionRefs ?? [],
    outcome: failingStep ? 'rolled-back' : 'pass',
    task_id: opts.taskId,
    rolled_back_via: rolledBackVia,
    steps: steps.map((s) => ({ name: s.name, status: s.status, code: s.code })),
  };
  if (failingStep) {
    chainEvent.rollback_reason = `${failingStep.name} failed (code=${failingStep.code})`;
  }
  if (stashRef) chainEvent.stash_ref = stashRef;
  if (opts.chainPath) chainEvent.path = opts.chainPath;
  if (opts.cwd) chainEvent.baseDir = opts.cwd;

  const eventId = appendChainEvent(chainEvent);

  if (typeof opts.emit === 'function') {
    try {
      opts.emit({
        type: 'solidify.rollback',
        timestamp: new Date().toISOString(),
        sessionId: process.env.GDD_SESSION_ID || 'unknown',
        payload: {
          task_id: opts.taskId,
          outcome: chainEvent.outcome,
          rolled_back_via: rolledBackVia,
          failing_step: failingStep ? failingStep.name : null,
        },
      });
    } catch {
      /* swallow — emission must never bubble */
    }
  }

  /** @type {SolidifyResult} */
  const result = {
    outcome: failingStep ? 'fail' : 'pass',
    steps,
    rolledBackVia,
    eventId,
  };
  if (stashRef) result.stashRef = stashRef;
  return result;
}
