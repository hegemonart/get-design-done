// scripts/lib/error-classifier.d.cts — types for error-classifier.cjs.

/** Recovery-action categories. Values are stable strings — safe to log. */
export type FailoverReasonValue =
  | 'rate_limited'
  | 'context_overflow'
  | 'auth_error'
  | 'network_transient'
  | 'network_permanent'
  | 'tool_not_found'
  | 'validation'
  | 'unknown';

/** String-constant map of FailoverReason names to values. */
export const FailoverReason: {
  readonly RATE_LIMITED: 'rate_limited';
  readonly CONTEXT_OVERFLOW: 'context_overflow';
  readonly AUTH_ERROR: 'auth_error';
  readonly NETWORK_TRANSIENT: 'network_transient';
  readonly NETWORK_PERMANENT: 'network_permanent';
  readonly TOOL_NOT_FOUND: 'tool_not_found';
  readonly VALIDATION: 'validation';
  readonly UNKNOWN: 'unknown';
};

/** Result of {@link classify}. */
export interface ClassifiedError {
  reason: FailoverReasonValue;
  retryable: boolean;
  suggestedAction: string;
  raw: unknown;
}

/**
 * Map a raw error value onto a stable recovery-action category.
 * Tolerant of null/undefined/non-Error inputs.
 */
export function classify(err: unknown): ClassifiedError;

/** Keyed suggested-action strings (read-only). */
export const SUGGESTED_ACTIONS: Readonly<Record<FailoverReasonValue, string>>;

/** Which reasons are considered safe to retry by policy. */
export const RETRYABLE: Readonly<Record<FailoverReasonValue, boolean>>;
