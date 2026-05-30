// scripts/lib/iteration-budget.d.cts — types for iteration-budget.cjs.

export interface BudgetState {
  budget: number;
  remaining: number;
  consumed: number;
  refunded: number;
  updatedAt: string; // ISO-8601
}

/** Error thrown by {@link consume} when remaining would drop below 0. */
export class IterationBudgetExhaustedError extends Error {
  readonly name: 'IterationBudgetExhaustedError';
  readonly amount: number;
  readonly state: BudgetState;
  constructor(amount: number, state: BudgetState);
}

/**
 * Consume N units from the remaining budget. Throws
 * {@link IterationBudgetExhaustedError} when N would send remaining below zero.
 */
export function consume(amount?: number): Promise<BudgetState>;

/** Refund N units, capped at `budget`. */
export function refund(amount?: number): Promise<BudgetState>;

/** Current snapshot; non-locking read. */
export function remaining(): BudgetState;

/** Initialize or restart the budget. Default 50. */
export function reset(budget?: number): Promise<BudgetState>;
