// scripts/lib/iteration-budget.cjs
//
// Plan 20-14 — bounded fix-loop iteration budget.
//
// Stops infinite fix cycles from burning unbounded context. Every fix-
// iteration consumes 1 unit; Layer-B cache hits refund 1 unit so
// cached answers don't count against the ceiling. When the budget
// reaches 0, consume() throws and the caller must surface to user.
//
// State file: `.design/iteration-budget.json`. All mutations go through
// `scripts/lib/lockfile.cjs` with atomic temp+rename writes so
// concurrent callers (hook + fix-loop + verify) don't clobber each
// other. The lock scope is the state file itself, so refund + consume
// from different children serialize correctly.
//
// Shape on disk matches reference/schemas/iteration-budget.schema.json:
//   { budget, remaining, consumed, refunded, updatedAt }

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { acquire, renameWithRetry } = require('./lockfile.cjs');

const STATE_PATH_REL = path.join('.design', 'iteration-budget.json');
const DEFAULT_BUDGET = 50;
const LOCK_MAX_WAIT_MS = 5_000;

/** Error thrown by `consume()` when the remaining budget would go below 0. */
class IterationBudgetExhaustedError extends Error {
  constructor(amount, state) {
    super(
      `IterationBudgetExhausted: cannot consume ${amount} — remaining=${state.remaining}, budget=${state.budget}, consumed=${state.consumed}. Caller must surface to user (fix-loop has stopped converging).`,
    );
    this.name = 'IterationBudgetExhaustedError';
    this.amount = amount;
    this.state = state;
  }
}

function stateAbsPath() {
  return path.join(process.cwd(), STATE_PATH_REL);
}

/** Read and validate the state file. Returns null on missing/corrupt. */
function readStateSync() {
  const p = stateAbsPath();
  if (!fs.existsSync(p)) return null;
  try {
    const raw = fs.readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      Number.isInteger(parsed.budget) && parsed.budget >= 0 &&
      Number.isInteger(parsed.remaining) && parsed.remaining >= 0 &&
      Number.isInteger(parsed.consumed) && parsed.consumed >= 0 &&
      Number.isInteger(parsed.refunded) && parsed.refunded >= 0 &&
      typeof parsed.updatedAt === 'string'
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/** Atomically write state under a file-lock. */
async function writeStateAtomic(state) {
  const p = stateAbsPath();
  const dir = path.dirname(p);
  fs.mkdirSync(dir, { recursive: true });
  const release = await acquire(p, { maxWaitMs: LOCK_MAX_WAIT_MS });
  try {
    // Re-read inside the lock so we merge against the very latest
    // on-disk state, not the value the caller observed pre-lock. This
    // is what makes concurrent consume() from 10 children add up to
    // consumed=10 rather than racing each other.
    const latest = readStateSync();
    const merged = state.mergeFn ? state.mergeFn(latest || state.seed) : state.seed;
    const tmp = `${p}.tmp.${process.pid}.${Date.now()}`;
    fs.writeFileSync(tmp, JSON.stringify(merged, null, 2) + '\n', 'utf8');
    await renameWithRetry(tmp, p);
    return merged;
  } finally {
    await release();
  }
}

/**
 * Initialize or restart the iteration budget.
 *
 * @param {number} [budget] default 50
 * @returns {Promise<{budget, remaining, consumed, refunded, updatedAt}>}
 */
async function reset(budget = DEFAULT_BUDGET) {
  if (!Number.isFinite(budget) || budget < 0) {
    throw new Error(`iteration-budget.reset: budget must be a non-negative finite number, got ${budget}`);
  }
  const b = Math.floor(budget);
  const state = {
    budget: b,
    remaining: b,
    consumed: 0,
    refunded: 0,
    updatedAt: new Date().toISOString(),
  };
  return writeStateAtomic({ seed: state, mergeFn: () => state });
}

/**
 * Consume N units from the remaining budget. Throws
 * IterationBudgetExhaustedError when N would send remaining below zero.
 *
 * @param {number} [amount] default 1
 * @returns {Promise<{budget, remaining, consumed, refunded, updatedAt}>}
 *   the new on-disk state after consumption.
 */
async function consume(amount = 1) {
  const n = normalizeAmount(amount);
  // Seed for the case when no state exists yet: auto-init to default budget.
  const seed = defaultState();
  return writeStateAtomic({
    seed,
    mergeFn: (current) => {
      const base = current || seed;
      const nextRemaining = base.remaining - n;
      if (nextRemaining < 0) {
        // Throw without writing — atomic: either consume fully or not at all.
        throw new IterationBudgetExhaustedError(n, base);
      }
      return {
        budget: base.budget,
        remaining: nextRemaining,
        consumed: base.consumed + n,
        refunded: base.refunded,
        updatedAt: new Date().toISOString(),
      };
    },
  });
}

/**
 * Refund N units to the remaining budget, capped at `budget`.
 *
 * @param {number} [amount] default 1
 * @returns {Promise<{budget, remaining, consumed, refunded, updatedAt}>}
 */
async function refund(amount = 1) {
  const n = normalizeAmount(amount);
  const seed = defaultState();
  return writeStateAtomic({
    seed,
    mergeFn: (current) => {
      const base = current || seed;
      const nextRemaining = Math.min(base.budget, base.remaining + n);
      // Only count the portion that actually landed — if we were already
      // at budget, the refund is a no-op.
      const actuallyRefunded = nextRemaining - base.remaining;
      return {
        budget: base.budget,
        remaining: nextRemaining,
        consumed: base.consumed,
        refunded: base.refunded + actuallyRefunded,
        updatedAt: new Date().toISOString(),
      };
    },
  });
}

/**
 * Return the current on-disk state. Reads without the lock — callers
 * using this for UI display only see a best-effort snapshot; mutating
 * paths (consume/refund) always re-read inside the lock.
 */
function remaining() {
  return readStateSync() || defaultState();
}

function normalizeAmount(amount) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`iteration-budget: amount must be a positive finite number, got ${amount}`);
  }
  return Math.floor(amount);
}

function defaultState() {
  return {
    budget: DEFAULT_BUDGET,
    remaining: DEFAULT_BUDGET,
    consumed: 0,
    refunded: 0,
    updatedAt: new Date().toISOString(),
  };
}

module.exports = {
  consume,
  refund,
  remaining,
  reset,
  IterationBudgetExhaustedError,
};
