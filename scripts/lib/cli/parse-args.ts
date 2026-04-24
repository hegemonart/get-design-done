// scripts/lib/cli/parse-args.ts — Plan 21-09 Task 1 (SDK-21).
//
// Hand-rolled argv parser used by the `gdd-sdk` CLI. No external
// dependency (no yargs / commander / minimist). Supports the exact
// subset documented in PLAN.md:
//
//   * Long flags:      `--name value`  or `--name=value`
//   * Short flags:     `-h`, `-v` only (help / version)
//   * Boolean toggles: `--headless` (no value — present == true)
//   * End-of-flags:    `--` (everything after goes into `passthrough`)
//
// The parser itself does NOT validate that the first positional is a
// known subcommand — routing lives in `index.ts`. `coerceFlags()` is
// where type conversion + spec-driven validation happens.
//
// Contract:
//   * Pure + deterministic. No I/O, no process reads. Safe to unit-test.
//   * Never throws from `parseArgs()` — all failure surfaces land on the
//     returned shape (unknown flags are captured as strings, not rejected).
//   * `coerceFlags()` DOES throw `ValidationError` for malformed specs
//     (e.g., non-numeric input for a numeric flag). Callers ideally catch
//     and route to exit code 3.

import { ValidationError } from '../gdd-errors/index.ts';

// ---------------------------------------------------------------------------
// Public types.
// ---------------------------------------------------------------------------

/**
 * Result of `parseArgs()`. All fields are frozen so downstream code
 * cannot accidentally mutate the parser output.
 *
 *   * `subcommand` — the first non-flag token. `null` when argv is empty
 *     or starts with a flag.
 *   * `positionals` — every non-flag token AFTER the subcommand (but
 *     before `--`).
 *   * `flags` — every `--name[=value]` / `-h` token keyed by name with
 *     value `true` (boolean toggle) or string (explicit value). No type
 *     coercion happens here.
 *   * `passthrough` — everything after the sentinel `--`, in order.
 */
export interface ParsedArgs {
  readonly subcommand: string | null;
  readonly positionals: readonly string[];
  readonly flags: Readonly<Record<string, string | boolean>>;
  readonly passthrough: readonly string[];
}

/** Flag type a spec can declare. */
export type FlagType = 'string' | 'number' | 'boolean';

/**
 * Declarative spec for one flag. Aliases let short names map to a
 * canonical long name (e.g., `-h` → `help`). `default` is returned from
 * `coerceFlags()` when the flag is absent.
 */
export interface FlagSpec {
  readonly name: string;
  readonly type: FlagType;
  readonly default?: unknown;
  readonly aliases?: readonly string[];
}

// ---------------------------------------------------------------------------
// parseArgs — pure tokenization pass.
// ---------------------------------------------------------------------------

/**
 * Parse `argv` into typed `ParsedArgs`. See module header for grammar.
 *
 * The function is tolerant by design: unknown flags still appear in
 * `flags` (caller may warn or error as desired via `coerceFlags`). Bad
 * token order (e.g., two consecutive `--` sentinels) simply folds into
 * passthrough.
 *
 * @param argv    Argument tokens, e.g., `process.argv.slice(2)`.
 * @param _specs  Optional (reserved for parity with `coerceFlags`). Not
 *                used today — kept to match PLAN.md signature.
 */
export function parseArgs(
  argv: readonly string[],
  _specs?: readonly FlagSpec[],
): ParsedArgs {
  const flags: Record<string, string | boolean> = {};
  const positionals: string[] = [];
  const passthrough: string[] = [];
  let subcommand: string | null = null;

  // State: have we crossed the `--` sentinel? Everything after goes to
  // `passthrough` verbatim.
  let afterDoubleDash = false;

  for (let i = 0; i < argv.length; i++) {
    const token: string | undefined = argv[i];
    if (token === undefined) continue;

    if (afterDoubleDash) {
      passthrough.push(token);
      continue;
    }

    if (token === '--') {
      afterDoubleDash = true;
      continue;
    }

    // Long flag: `--name` or `--name=value`.
    if (token.startsWith('--')) {
      const body = token.slice(2);
      if (body.length === 0) {
        // Bare `--` handled above; defensive fallthrough.
        afterDoubleDash = true;
        continue;
      }
      const eq = body.indexOf('=');
      if (eq >= 0) {
        const name = body.slice(0, eq);
        const value = body.slice(eq + 1);
        if (name.length > 0) {
          flags[name] = value;
        }
        continue;
      }
      // No `=`. Peek the next token — if it exists and is NOT another
      // flag, consume as the value. Otherwise treat as boolean toggle.
      const next: string | undefined = argv[i + 1];
      if (
        next !== undefined &&
        !next.startsWith('-') &&
        !isLikelyBoolFlag(body)
      ) {
        flags[body] = next;
        i += 1;
      } else {
        flags[body] = true;
      }
      continue;
    }

    // Short flag: single letter after a single dash.
    if (token.startsWith('-') && token.length >= 2) {
      const rest = token.slice(1);
      // Accept only 1-letter short flags per PLAN.md ("Only 1-letter
      // shorts: `-h`, `-v`"). Anything longer we treat as-is and let the
      // consumer decide — we record it under the first letter.
      if (rest.length === 1) {
        flags[rest] = true;
        continue;
      }
      // Multi-char short (e.g., `-abc`) — treat as an unknown flag
      // literal. Record under the whole body so callers can detect.
      flags[rest] = true;
      continue;
    }

    // Positional. First positional is the subcommand.
    if (subcommand === null) {
      subcommand = token;
    } else {
      positionals.push(token);
    }
  }

  return Object.freeze({
    subcommand,
    positionals: Object.freeze(positionals),
    flags: Object.freeze(flags),
    passthrough: Object.freeze(passthrough),
  });
}

/**
 * Known boolean-toggle flag names. When the parser encounters one of
 * these WITHOUT an `=value` it should NOT consume the next token even
 * if that token looks like a value — the next token is a positional
 * arg. Keeps `gdd-sdk stage discuss --parallel plan` parsing correctly:
 * `--parallel` is a bool, `plan` stays in positionals.
 *
 * The list is conservative (only flags the CLI declares as boolean in
 * its specs); unknown bool flags fall through to the generic peek-value
 * heuristic which is safe for the CLI's other flags because every
 * value-carrying flag is numeric or string (never ambiguous).
 */
const BOOL_FLAG_NAMES: ReadonlySet<string> = new Set([
  'help',
  'h',
  'version',
  'v',
  'headless',
  'interactive',
  'json',
  'text',
  'force',
  'parallel',
  'dry-run',
]);

function isLikelyBoolFlag(name: string): boolean {
  return BOOL_FLAG_NAMES.has(name);
}

// ---------------------------------------------------------------------------
// coerceFlags — spec-driven type conversion + defaults.
// ---------------------------------------------------------------------------

/**
 * Apply type coercion + defaults based on `specs`. Aliases let
 * `-h` (parsed as `flags.h = true`) resolve to the canonical `help`
 * key in the returned map.
 *
 * Throws `ValidationError` when a flag was supplied with a value that
 * cannot coerce to the declared type (e.g., `--budget-usd abc`). Flags
 * not declared in `specs` pass through unchanged (as their raw
 * string|boolean value) so callers can still see them.
 */
export function coerceFlags(
  parsed: ParsedArgs,
  specs: readonly FlagSpec[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  // Collect every alias → canonical map.
  const canonical = new Map<string, FlagSpec>();
  for (const spec of specs) {
    canonical.set(spec.name, spec);
    for (const alias of spec.aliases ?? []) {
      canonical.set(alias, spec);
    }
  }

  // Build a reverse-lookup of values present on `parsed.flags` keyed by
  // their canonical name (so `-h` and `--help` both land on `help`).
  const resolved: Record<string, string | boolean> = {};
  for (const [key, value] of Object.entries(parsed.flags)) {
    const spec = canonical.get(key);
    const target = spec !== undefined ? spec.name : key;
    // Last-write-wins — operators rarely specify a flag twice; when they
    // do, the final value prevails.
    resolved[target] = value;
  }

  // Apply defaults + coerce.
  for (const spec of specs) {
    const raw = Object.prototype.hasOwnProperty.call(resolved, spec.name)
      ? resolved[spec.name]
      : undefined;
    if (raw === undefined) {
      if (spec.default !== undefined) {
        out[spec.name] = spec.default;
      }
      continue;
    }
    out[spec.name] = coerceValue(spec, raw);
  }

  // Pass-through any flags not declared in specs (so `query get --tail 5`
  // keeps `tail` visible even if `tail` isn't in the common-flag spec list).
  for (const [key, value] of Object.entries(resolved)) {
    if (!Object.prototype.hasOwnProperty.call(out, key)) {
      out[key] = value;
    }
  }

  return out;
}

/**
 * Coerce a single raw value against its spec. Throws `ValidationError`
 * on malformed input so the caller can exit with code 3.
 */
function coerceValue(spec: FlagSpec, raw: string | boolean): unknown {
  if (spec.type === 'boolean') {
    if (raw === true || raw === false) return raw;
    // String values `"true"` / `"false"` (from `--flag=true`) are honored.
    if (raw === 'true' || raw === '1') return true;
    if (raw === 'false' || raw === '0') return false;
    throw new ValidationError(
      `flag --${spec.name} expects a boolean (true/false/1/0), got "${String(raw)}"`,
      'INVALID_FLAG_VALUE',
      { flag: spec.name, value: raw },
    );
  }
  if (spec.type === 'number') {
    if (typeof raw === 'boolean') {
      throw new ValidationError(
        `flag --${spec.name} requires a numeric value`,
        'INVALID_FLAG_VALUE',
        { flag: spec.name },
      );
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      throw new ValidationError(
        `flag --${spec.name} expects a number, got "${raw}"`,
        'INVALID_FLAG_VALUE',
        { flag: spec.name, value: raw },
      );
    }
    return n;
  }
  // string
  if (typeof raw === 'boolean') {
    throw new ValidationError(
      `flag --${spec.name} requires a string value`,
      'INVALID_FLAG_VALUE',
      { flag: spec.name },
    );
  }
  return raw;
}

// ---------------------------------------------------------------------------
// Common-flag specs used by multiple subcommands.
// ---------------------------------------------------------------------------

/**
 * Common flags shared across every subcommand. Individual commands may
 * extend this list with their own flags. `default` values follow
 * PLAN.md's recommendations.
 */
export const COMMON_FLAGS: readonly FlagSpec[] = Object.freeze([
  Object.freeze({ name: 'help', type: 'boolean', default: false, aliases: ['h'] }),
  Object.freeze({ name: 'version', type: 'boolean', default: false, aliases: ['v'] }),
  Object.freeze({ name: 'cwd', type: 'string' }),
  Object.freeze({ name: 'log-level', type: 'string', default: 'info' }),
  Object.freeze({ name: 'headless', type: 'boolean', default: false }),
  Object.freeze({ name: 'interactive', type: 'boolean', default: false }),
  Object.freeze({ name: 'json', type: 'boolean', default: false }),
  Object.freeze({ name: 'text', type: 'boolean', default: false }),
  Object.freeze({ name: 'budget-usd', type: 'number' }),
  Object.freeze({ name: 'budget-input-tokens', type: 'number', default: 200_000 }),
  Object.freeze({ name: 'budget-output-tokens', type: 'number', default: 50_000 }),
  Object.freeze({ name: 'max-turns', type: 'number', default: 40 }),
  Object.freeze({ name: 'concurrency', type: 'number', default: 4 }),
]);
