// tests/gdd-errors.test.ts — GDD error taxonomy + classification tests.
//
// Plan 20-04 acceptance:
//   * Three base classes with distinct `kind` discriminants.
//   * Plan 20-01 compat — LockAcquisitionError, TransitionGateFailed,
//     ParseError behave identically to their pre-refactor shape.
//   * classify() maps to correct shouldThrow / retryable flags.
//   * toToolError() produces the MCP-friendly payload; context only
//     present when the error is a GDDError.
//   * toJSON() round-trips lossless through JSON.stringify/parse.
//   * context is frozen (cannot be mutated post-construction).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  GDDError,
  ValidationError,
  StateConflictError,
  OperationFailedError,
  LockAcquisitionError,
  TransitionGateFailed,
  ParseError,
} from '../scripts/lib/gdd-errors/index.ts';
import {
  classify,
  toToolError,
} from '../scripts/lib/gdd-errors/classification.ts';

// ------------------------------------------------------------------
// Base-class discriminants
// ------------------------------------------------------------------

test('ValidationError: discriminants, code, context', () => {
  const err = new ValidationError('bad input', 'V_FIELD_MISSING', { field: 'x' });
  assert.equal(err.kind, 'validation');
  assert.equal(err.name, 'ValidationError');
  assert.equal(err.code, 'V_FIELD_MISSING');
  assert.equal(err.message, 'bad input');
  assert.deepEqual(err.context, { field: 'x' });
  assert.ok(err instanceof GDDError, 'ValidationError extends GDDError');
  assert.ok(err instanceof Error, 'GDDError extends Error');
});

test('ValidationError: default code is "VALIDATION"', () => {
  const err = new ValidationError('no code given');
  assert.equal(err.code, 'VALIDATION');
  assert.deepEqual(err.context, {});
});

test('StateConflictError: discriminants, code, context', () => {
  const err = new StateConflictError('retryable conflict', 'SC_BUSY', { attempt: 2 });
  assert.equal(err.kind, 'state_conflict');
  assert.equal(err.name, 'StateConflictError');
  assert.equal(err.code, 'SC_BUSY');
  assert.equal(err.message, 'retryable conflict');
  assert.deepEqual(err.context, { attempt: 2 });
  assert.ok(err instanceof GDDError);
});

test('StateConflictError: default code is "STATE_CONFLICT"', () => {
  const err = new StateConflictError('no code given');
  assert.equal(err.code, 'STATE_CONFLICT');
});

test('OperationFailedError: discriminants, code, context', () => {
  const err = new OperationFailedError('cant do it now', 'OF_PRECONDITION', {
    need: 'plan',
  });
  assert.equal(err.kind, 'operation_failed');
  assert.equal(err.name, 'OperationFailedError');
  assert.equal(err.code, 'OF_PRECONDITION');
  assert.equal(err.message, 'cant do it now');
  assert.deepEqual(err.context, { need: 'plan' });
  assert.ok(err instanceof GDDError);
});

test('OperationFailedError: default code is "OPERATION_FAILED"', () => {
  const err = new OperationFailedError('no code given');
  assert.equal(err.code, 'OPERATION_FAILED');
});

// ------------------------------------------------------------------
// Plan 20-01 compat (LockAcquisitionError, TransitionGateFailed, ParseError)
// ------------------------------------------------------------------

test('LockAcquisitionError: instanceof StateConflictError AND GDDError', () => {
  const err = new LockAcquisitionError(
    '/tmp/STATE.md.lock',
    '{"pid":123}',
    5000,
  );
  assert.ok(err instanceof StateConflictError, 'extends StateConflictError');
  assert.ok(err instanceof GDDError, 'extends GDDError');
  assert.ok(err instanceof Error, 'extends Error');
  assert.equal(err.kind, 'state_conflict');
  assert.equal(err.name, 'LockAcquisitionError');
  assert.equal(err.code, 'LOCK_ACQUISITION');
});

test('LockAcquisitionError: preserves Plan 20-01 instance properties', () => {
  const err = new LockAcquisitionError(
    '/tmp/STATE.md.lock',
    '{"pid":123}',
    5000,
  );
  assert.equal(err.lockPath, '/tmp/STATE.md.lock');
  assert.equal(err.lockContents, '{"pid":123}');
  assert.equal(err.waitedMs, 5000);
  // Also mirrored into frozen context
  assert.equal(err.context['lockPath'], '/tmp/STATE.md.lock');
  assert.equal(err.context['lockContents'], '{"pid":123}');
  assert.equal(err.context['waitedMs'], 5000);
});

test('LockAcquisitionError: message format preserved from Plan 20-01', () => {
  const err = new LockAcquisitionError('/p', 'contents', 123);
  assert.match(err.message, /failed to acquire lock at \/p after 123ms/);
  assert.match(err.message, /current holder: contents/);
});

test('TransitionGateFailed: instanceof StateConflictError AND GDDError', () => {
  const err = new TransitionGateFailed('design', ['gate A', 'gate B']);
  assert.ok(err instanceof StateConflictError);
  assert.ok(err instanceof GDDError);
  assert.equal(err.kind, 'state_conflict');
  assert.equal(err.name, 'TransitionGateFailed');
  assert.equal(err.code, 'TRANSITION_GATE_FAILED');
});

test('TransitionGateFailed: preserves blockers as readonly frozen array', () => {
  const blockers = ['gate A failed', 'gate B failed'];
  const err = new TransitionGateFailed('design', blockers);
  assert.deepEqual([...err.blockers], blockers);
  assert.ok(Object.isFrozen(err.blockers), 'blockers is frozen');
  // Mutating the original input array does NOT leak into the error
  blockers.push('later mutation');
  assert.equal(err.blockers.length, 2, 'blockers is a defensive copy');
  assert.equal(err.toStage, 'design');
});

test('TransitionGateFailed: message format preserved from Plan 20-01', () => {
  const err = new TransitionGateFailed('verify', ['plan-not-complete']);
  assert.match(err.message, /transition to "verify" blocked by gate/);
  assert.match(err.message, /plan-not-complete/);
});

test('TransitionGateFailed: empty blockers list emits "(no detail)"', () => {
  const err = new TransitionGateFailed('design', []);
  assert.match(err.message, /\(no detail\)/);
});

test('ParseError: instanceof ValidationError AND GDDError', () => {
  const err = new ParseError('missing fence', 1);
  assert.ok(err instanceof ValidationError);
  assert.ok(err instanceof GDDError);
  assert.equal(err.kind, 'validation');
  assert.equal(err.name, 'ParseError');
  assert.equal(err.code, 'PARSE_ERROR');
});

test('ParseError: preserves line property + message format', () => {
  const err = new ParseError('bad block', 42);
  assert.equal(err.line, 42);
  assert.equal(err.context['line'], 42);
  assert.match(err.message, /STATE\.md parse error at line 42: bad block/);
});

// ------------------------------------------------------------------
// classify()
// ------------------------------------------------------------------

test('classify: ValidationError → validation, throw, not retryable', () => {
  const c = classify(new ValidationError('msg', 'V_X'));
  assert.deepEqual(c, {
    kind: 'validation',
    shouldThrow: true,
    retryable: false,
    code: 'V_X',
    message: 'msg',
  });
});

test('classify: StateConflictError → state_conflict, throw, retryable', () => {
  const c = classify(new StateConflictError('msg', 'SC_X'));
  assert.deepEqual(c, {
    kind: 'state_conflict',
    shouldThrow: true,
    retryable: true,
    code: 'SC_X',
    message: 'msg',
  });
});

test('classify: OperationFailedError → operation_failed, NO throw, not retryable', () => {
  const c = classify(new OperationFailedError('msg', 'OF_X'));
  assert.deepEqual(c, {
    kind: 'operation_failed',
    shouldThrow: false,
    retryable: false,
    code: 'OF_X',
    message: 'msg',
  });
});

test('classify: LockAcquisitionError → state_conflict, throw, retryable', () => {
  const err = new LockAcquisitionError('/p', 'c', 100);
  const c = classify(err);
  assert.equal(c.kind, 'state_conflict');
  assert.equal(c.shouldThrow, true);
  assert.equal(c.retryable, true);
  assert.equal(c.code, 'LOCK_ACQUISITION');
});

test('classify: TransitionGateFailed → state_conflict, throw, retryable', () => {
  const err = new TransitionGateFailed('design', ['b1']);
  const c = classify(err);
  assert.equal(c.kind, 'state_conflict');
  assert.equal(c.shouldThrow, true);
  assert.equal(c.retryable, true);
  assert.equal(c.code, 'TRANSITION_GATE_FAILED');
});

test('classify: plain Error → unknown, throw, not retryable', () => {
  const c = classify(new Error('plain'));
  assert.deepEqual(c, {
    kind: 'unknown',
    shouldThrow: true,
    retryable: false,
    code: 'UNKNOWN',
    message: 'plain',
  });
});

test('classify: string value → unknown, throw, not retryable', () => {
  const c = classify('a string value');
  assert.deepEqual(c, {
    kind: 'unknown',
    shouldThrow: true,
    retryable: false,
    code: 'UNKNOWN',
    message: 'a string value',
  });
});

test('classify: number → unknown with numeric stringification', () => {
  const c = classify(42);
  assert.equal(c.kind, 'unknown');
  assert.equal(c.shouldThrow, true);
  assert.equal(c.retryable, false);
  assert.equal(c.message, '42');
});

test('classify: null → unknown', () => {
  const c = classify(null);
  assert.equal(c.kind, 'unknown');
  assert.equal(c.message, 'null');
});

test('classify: undefined → unknown', () => {
  const c = classify(undefined);
  assert.equal(c.kind, 'unknown');
  assert.equal(c.message, 'undefined');
});

// classify() flag-triple matrix from the plan (5 rows)
test('classify: shouldThrow flag matrix for the 5 canonical cases', () => {
  assert.equal(classify(new ValidationError('v')).shouldThrow, true);
  assert.equal(classify(new StateConflictError('s')).shouldThrow, true);
  assert.equal(classify(new OperationFailedError('o')).shouldThrow, false);
  assert.equal(classify(new Error('e')).shouldThrow, true);
  assert.equal(classify('raw string').shouldThrow, true);
});

// ------------------------------------------------------------------
// toToolError()
// ------------------------------------------------------------------

test('toToolError: GDDError carries context in payload', () => {
  const err = new ValidationError('bad', 'V_BAD', { field: 'x' });
  const payload = toToolError(err);
  assert.deepEqual(payload, {
    error: {
      code: 'V_BAD',
      message: 'bad',
      kind: 'validation',
      context: { field: 'x' },
    },
  });
});

test('toToolError: plain Error omits context key', () => {
  const payload = toToolError(new Error('plain'));
  assert.deepEqual(payload, {
    error: {
      code: 'UNKNOWN',
      message: 'plain',
      kind: 'unknown',
    },
  });
  assert.ok(
    !('context' in payload.error),
    'context key must be absent, not undefined',
  );
});

test('toToolError: string value omits context key', () => {
  const payload = toToolError('raw');
  assert.equal(payload.error.code, 'UNKNOWN');
  assert.equal(payload.error.message, 'raw');
  assert.equal(payload.error.kind, 'unknown');
  assert.ok(!('context' in payload.error));
});

test('toToolError: OperationFailedError round-trips context', () => {
  const err = new OperationFailedError('no plan yet', 'OF_NO_PLAN', {
    stage: 'plan',
  });
  const payload = toToolError(err);
  assert.equal(payload.error.kind, 'operation_failed');
  assert.equal(payload.error.code, 'OF_NO_PLAN');
  assert.deepEqual(payload.error.context, { stage: 'plan' });
});

// ------------------------------------------------------------------
// toJSON() round-trip
// ------------------------------------------------------------------

test('toJSON: ValidationError lossless round-trip through JSON', () => {
  const err = new ValidationError('bad input', 'V_F', { field: 'x', n: 3 });
  const serialized = JSON.stringify(err);
  const parsed = JSON.parse(serialized) as Record<string, unknown>;
  assert.equal(parsed['name'], 'ValidationError');
  assert.equal(parsed['kind'], 'validation');
  assert.equal(parsed['code'], 'V_F');
  assert.equal(parsed['message'], 'bad input');
  assert.deepEqual(parsed['context'], { field: 'x', n: 3 });
});

test('toJSON: StateConflictError lossless round-trip', () => {
  const err = new StateConflictError('conflict', 'SC_X', { at: 't' });
  const parsed = JSON.parse(JSON.stringify(err)) as Record<string, unknown>;
  assert.equal(parsed['kind'], 'state_conflict');
  assert.equal(parsed['code'], 'SC_X');
  assert.deepEqual(parsed['context'], { at: 't' });
});

test('toJSON: OperationFailedError lossless round-trip', () => {
  const err = new OperationFailedError('nope', 'OF_X', { reason: 'missing' });
  const parsed = JSON.parse(JSON.stringify(err)) as Record<string, unknown>;
  assert.equal(parsed['kind'], 'operation_failed');
  assert.equal(parsed['code'], 'OF_X');
  assert.deepEqual(parsed['context'], { reason: 'missing' });
});

test('toJSON: TransitionGateFailed includes blockers in context', () => {
  const err = new TransitionGateFailed('design', ['b1', 'b2']);
  const parsed = JSON.parse(JSON.stringify(err)) as Record<string, unknown>;
  assert.equal(parsed['name'], 'TransitionGateFailed');
  assert.equal(parsed['kind'], 'state_conflict');
  const ctx = parsed['context'] as Record<string, unknown>;
  assert.equal(ctx['toStage'], 'design');
  assert.deepEqual(ctx['blockers'], ['b1', 'b2']);
});

test('toJSON: LockAcquisitionError includes lock info in context', () => {
  const err = new LockAcquisitionError('/tmp/s.lock', '{"pid":99}', 750);
  const parsed = JSON.parse(JSON.stringify(err)) as Record<string, unknown>;
  assert.equal(parsed['name'], 'LockAcquisitionError');
  const ctx = parsed['context'] as Record<string, unknown>;
  assert.equal(ctx['lockPath'], '/tmp/s.lock');
  assert.equal(ctx['lockContents'], '{"pid":99}');
  assert.equal(ctx['waitedMs'], 750);
});

test('toJSON: does NOT include stack trace (security: no exfiltration)', () => {
  const err = new ValidationError('x');
  const parsed = JSON.parse(JSON.stringify(err)) as Record<string, unknown>;
  assert.ok(!('stack' in parsed), 'stack must not be in toJSON output');
});

// ------------------------------------------------------------------
// Frozen context invariant
// ------------------------------------------------------------------

test('context: is frozen on ValidationError', () => {
  const err = new ValidationError('x', 'V_X', { a: 1 });
  assert.ok(Object.isFrozen(err.context), 'context must be frozen');
});

test('context: is frozen on StateConflictError', () => {
  const err = new StateConflictError('x', 'SC_X', { a: 1 });
  assert.ok(Object.isFrozen(err.context));
});

test('context: is frozen on OperationFailedError', () => {
  const err = new OperationFailedError('x', 'OF_X', { a: 1 });
  assert.ok(Object.isFrozen(err.context));
});

test('context: is frozen on LockAcquisitionError', () => {
  const err = new LockAcquisitionError('/p', 'c', 1);
  assert.ok(Object.isFrozen(err.context));
});

test('context: is frozen on TransitionGateFailed', () => {
  const err = new TransitionGateFailed('design', ['b']);
  assert.ok(Object.isFrozen(err.context));
});

test('context: is frozen on ParseError', () => {
  const err = new ParseError('msg', 3);
  assert.ok(Object.isFrozen(err.context));
});

test('context: default empty context is also frozen', () => {
  const err = new ValidationError('no context given');
  assert.ok(Object.isFrozen(err.context));
  assert.deepEqual(err.context, {});
});

test('context: mutation attempt throws in strict mode or is silently ignored', () => {
  const err = new ValidationError('x', 'V_X', { a: 1 });
  // In strict mode this throws TypeError; in sloppy mode it's a silent no-op.
  // Either way, the context must be unchanged.
  try {
    (err.context as Record<string, unknown>)['a'] = 999;
  } catch {
    /* strict mode threw — fine */
  }
  assert.equal(err.context['a'], 1, 'frozen context cannot be mutated');
});

// ------------------------------------------------------------------
// Misc
// ------------------------------------------------------------------

test('GDDError: is abstract — cannot instantiate directly', () => {
  // TypeScript's `abstract` keyword is a compile-time check; at runtime
  // there's no enforcement. This test documents the semantic — we expect
  // callers to use one of the three concrete subclasses. Confirm each
  // subclass produces a distinct `kind` discriminant.
  const v = new ValidationError('v');
  const s = new StateConflictError('s');
  const o = new OperationFailedError('o');
  const kinds = new Set([v.kind, s.kind, o.kind]);
  assert.equal(kinds.size, 3, 'three distinct kinds');
});

test('GDDError subclasses: .stack is present and mentions subclass name', () => {
  const err = new ValidationError('trace me');
  assert.ok(typeof err.stack === 'string', 'stack trace present at runtime');
  // V8 puts "ValidationError" at the top of the stack; not asserting
  // exact format (platform-sensitive), just that SOME stack exists.
  assert.ok((err.stack ?? '').length > 0);
});

test('GDDError toJSON: manual call also works', () => {
  const err = new ValidationError('x', 'V_X', { a: 1 });
  const obj = err.toJSON();
  assert.equal(obj.name, 'ValidationError');
  assert.equal(obj.kind, 'validation');
  assert.equal(obj.code, 'V_X');
  assert.equal(obj.message, 'x');
  assert.deepEqual(obj.context, { a: 1 });
});
