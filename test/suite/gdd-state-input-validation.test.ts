// test/suite/gdd-state-input-validation.test.ts — Plan 33.5-03 (SC#3, D-08/D-12/D-10).
//
// Proves the gdd-state MCP input path is hardened per D-08:
//   (a) resolveStatePath() rejects a GDD_STATE_PATH that escapes the project
//       boundary (../../etc/passwd + a Windows ..\..\ variant);
//   (b) it ACCEPTS a legitimate in-boundary absolute path (cwd/.design/STATE.md);
//   (c) assertInputWithinLimits() caps payload size/depth/string length — an
//       oversized string field is rejected, a normal input passes;
//   (d) a representative TIGHTENED schema (add_blocker) rejects an unknown
//       extra property (additionalProperties:false) and an over-maxLength
//       string, while a valid input passes.
//
// Hermetic (D-10): no network, no child process. The env override is set +
// restored in a finally so the suite stays order-independent.
//
// Authored .test.ts to match the house gdd-state suite norm (run via
// --experimental-strip-types); imports from shared.ts directly.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import Ajv from 'ajv';

import {
  resolveStatePath,
  assertInputWithinLimits,
} from '../../sdk/mcp/gdd-state/tools/shared.ts';

const REPO_ROOT: string = resolve(process.cwd());
const ADD_BLOCKER_SCHEMA: string = join(
  REPO_ROOT,
  'sdk',
  'mcp',
  'gdd-state',
  'schemas',
  'add_blocker.schema.json',
);

/** Run a function with GDD_STATE_PATH set, restoring the prior value after. */
function withStatePath<T>(value: string | undefined, fn: () => T): T {
  const prior = process.env['GDD_STATE_PATH'];
  if (value === undefined) {
    delete process.env['GDD_STATE_PATH'];
  } else {
    process.env['GDD_STATE_PATH'] = value;
  }
  try {
    return fn();
  } finally {
    if (prior === undefined) {
      delete process.env['GDD_STATE_PATH'];
    } else {
      process.env['GDD_STATE_PATH'] = prior;
    }
  }
}

test('33.5-03: rejects ..-escape GDD_STATE_PATH', () => {
  // POSIX-style escape.
  withStatePath('../../etc/passwd', () => {
    assert.throws(
      () => resolveStatePath(),
      (err: unknown) =>
        err instanceof Error && /escape|traversal|STATE_PATH/i.test(err.message),
      'POSIX ../../etc/passwd must be rejected',
    );
  });
  // Windows-style escape.
  withStatePath('..\\..\\windows\\system32\\config\\sam', () => {
    assert.throws(
      () => resolveStatePath(),
      (err: unknown) =>
        err instanceof Error && /escape|traversal|STATE_PATH/i.test(err.message),
      'Windows ..\\..\\ escape must be rejected',
    );
  });
});

test('33.5-03: accepts a legit in-boundary path', () => {
  const legit = join(process.cwd(), '.design', 'STATE.md');
  withStatePath(legit, () => {
    let resolved: string | undefined;
    assert.doesNotThrow(() => {
      resolved = resolveStatePath();
    }, 'an absolute path under cwd/.design must be accepted');
    assert.ok(
      typeof resolved === 'string' && resolved.length > 0,
      'returns a non-empty resolved path',
    );
  });
  // The default (no override) also resolves without throwing.
  withStatePath(undefined, () => {
    assert.doesNotThrow(() => resolveStatePath(), 'default .design/STATE.md is accepted');
  });
});

test('33.5-03: payload cap rejects oversized input', () => {
  // The error code (VALIDATION_INPUT_*) carries the machine-readable reason;
  // the message is human prose, so match against the code.
  const codeOf = (err: unknown): string => {
    if (err instanceof Error) {
      const code = (err as Error & { code?: unknown }).code;
      if (typeof code === 'string') return code;
    }
    return '';
  };

  // Oversized single string field → rejected.
  assert.throws(
    () => assertInputWithinLimits({ text: 'A'.repeat(100000) }),
    (err: unknown) => /INPUT_(FIELD_TOO_LARGE|TOO_LARGE)/.test(codeOf(err)),
    'an over-long string field must be rejected',
  );
  // Pathologically deep object → rejected.
  let deep: Record<string, unknown> = { v: 1 };
  for (let i = 0; i < 200; i++) deep = { nested: deep };
  assert.throws(
    () => assertInputWithinLimits(deep),
    (err: unknown) => /INPUT_(TOO_DEEP|TOO_LARGE)/.test(codeOf(err)),
    'an excessively deep object must be rejected',
  );
  // A normal small input passes.
  assert.doesNotThrow(
    () => assertInputWithinLimits({ text: 'a reasonable blocker description', stage: 'design' }),
    'a normal small input must pass',
  );
});

test('33.5-03: tightened schema rejects unknown prop + over-maxLength string', () => {
  const raw = JSON.parse(readFileSync(ADD_BLOCKER_SCHEMA, 'utf8')) as Record<
    string,
    unknown
  >;
  const properties = raw['properties'] as Record<string, unknown>;
  const inputSchema = properties['input'] as Record<string, unknown>;
  const inputProps = inputSchema['properties'] as Record<string, unknown>;
  const textField = inputProps['text'] as { maxLength?: number };

  // The input sub-schema must declare a maxLength on the free-form text field.
  const maxLen = textField.maxLength;
  assert.ok(
    typeof maxLen === 'number' && maxLen > 0,
    'add_blocker.input.text must carry a maxLength bound',
  );
  const bound: number = typeof maxLen === 'number' ? maxLen : 0;

  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(inputSchema);

  // Valid input passes.
  assert.equal(validate({ text: 'a normal blocker' }), true, 'valid input passes');

  // Unknown extra property rejected (additionalProperties:false).
  assert.equal(
    validate({ text: 'ok', bogus: 'nope' }),
    false,
    'unknown property must be rejected',
  );

  // Over-maxLength string rejected.
  assert.equal(
    validate({ text: 'A'.repeat(bound + 1) }),
    false,
    'over-maxLength text must be rejected',
  );
});
