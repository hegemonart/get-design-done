// sdk/fingerprint/index.ts — Phase 53 (Semantic Mapper Engine), FP-01.
//
// Per-type structural fingerprints over DesignContext entities, used by the
// incremental discover/explore engine (Phase 53) to decide — cosmetic vs
// structural vs add/remove — which mapper batches must be re-mapped on a
// cycle. Zero new dependency: hashing is `node:crypto` sha256 only.
//
// Two hashes per entity:
//   * `full`        — over ALL fingerprint-relevant fields (cosmetic + structural).
//   * `structural`  — over the STRUCTURE-ONLY projection (cosmetic fields omitted).
//
// compareFingerprints(a, b) collapses the two-hash pair into a ChangeType:
//   * NONE        full hashes equal                       (nothing changed)
//   * COSMETIC    structural equal, full differs          (e.g. token VALUE edit)
//   * STRUCTURAL  structural differs, OR add/remove (null) (shape changed)
//
// Determinism is a HARD contract (CONTEXT D6): the canonicalizer sorts object
// keys lexicographically, sorts+dedupes set-arrays, collapses whitespace, and
// formats scalars stably, then serializes as a `type:`-prefixed `key=value`
// line list (NOT JSON.stringify of the raw input). The type prefix prevents a
// token and a component (or motion) with coincidentally-identical field values
// from colliding to the same hash. Summaries are NEVER part of either hash —
// an LLM re-paraphrasing a summary must not invalidate a fingerprint.
//
// Cross-OS reproducibility: no Math.random, no Date.now, no locale-dependent
// sort (lexicographic on UTF-16 code units via String#localeCompare-free
// Array#sort default ordering). Identical inputs hash identically on win32,
// Linux, and macOS.

import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// Public types — entity inputs + ChangeType.
// ---------------------------------------------------------------------------

/** The three fingerprintable entity kinds. */
export type FingerprintType = 'component' | 'token' | 'motion';

/** The classification a single before/after fingerprint pair collapses to. */
export type ChangeType = 'NONE' | 'COSMETIC' | 'STRUCTURAL';

/**
 * A component entity's fingerprint-relevant projection.
 *
 * `component_signature` carries the entity name plus its member/method names
 * (the structural identity of the component). `props_shape` is the public prop
 * contract. `used_tokens` is the set of token ids the component consumes
 * (COSMETIC: a token-value change does not alter component structure, but
 * gaining/losing a token reference does — `used_tokens` is therefore part of
 * `full` but omitted from `structural`). `exported_variants` is the set of
 * variant names the component exports (STRUCTURAL).
 */
export interface ComponentFingerprintInput {
  readonly component_signature: ComponentSignature;
  readonly props_shape: readonly PropShapeEntry[];
  readonly used_tokens?: readonly string[];
  readonly exported_variants?: readonly string[];
}

/** Structural identity of a component: its name + member/method names. */
export interface ComponentSignature {
  readonly name: string;
  /** Member/method names (fields, methods, hooks…). Order-insensitive set. */
  readonly members?: readonly string[];
}

/** A single entry in a component's public prop contract. */
export interface PropShapeEntry {
  readonly name: string;
  /**
   * The prop's type. Normalized verbatim by the caller (e.g. "string",
   * "() => void"); the fingerprinter does not re-parse it, only whitespace-
   * normalizes it.
   */
  readonly type: string;
  /** Whether the prop is optional (rendered as a trailing `?` in the sig). */
  readonly optional?: boolean;
}

/** A token entity's fingerprint-relevant projection. */
export interface TokenFingerprintInput {
  readonly token_name: string;
  /** The resolved token value (COSMETIC — omitted from `structural`). */
  readonly token_value: string | number | boolean | null;
  /** The token type (e.g. "color") and optional finer subtype. */
  readonly token_type: string;
  readonly subtype?: string;
  /** Theme scope the token belongs to (e.g. "light"/"dark"/"global"). */
  readonly theme_scope?: string;
}

/** A motion-fragment entity's fingerprint-relevant projection. */
export interface MotionFingerprintInput {
  readonly animation_target: string;
  /**
   * Duration in milliseconds. Bucketed (fast/base/slow/xslow) so a 198ms vs
   * 200ms tweak stays in-bucket and reads COSMETIC, not STRUCTURAL. COSMETIC —
   * the bucket is omitted from `structural`.
   */
  readonly duration_ms?: number | null;
  /** Easing function descriptor, classified into a coarse easing_class. */
  readonly easing?: string;
}

/** Discriminated union of all fingerprint inputs (by `type` argument). */
export type FingerprintInput =
  | ComponentFingerprintInput
  | TokenFingerprintInput
  | MotionFingerprintInput;

/** The output of `fingerprint()`: a full + structural sha256 hex pair. */
export interface Fingerprint {
  readonly full: string;
  readonly structural: string;
}

// ---------------------------------------------------------------------------
// Canonicalization.
// ---------------------------------------------------------------------------

/**
 * Stable scalar formatting. Numbers via `String(Number(x))` (canonical numeric
 * form — `1.0` → "1", `0.50` → "0.5"); booleans as "true"/"false"; null and
 * undefined collapse to the empty string. Strings have whitespace runs
 * collapsed to a single space and are trimmed.
 */
function formatScalar(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    // NaN/Infinity are not legal token values; normalize defensively to ''.
    return Number.isFinite(value) ? String(Number(value)) : '';
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return collapseWhitespace(value);
  // Fallback for any other primitive (bigint, symbol → string form).
  return collapseWhitespace(String(value));
}

/** Collapse internal whitespace runs to a single space and trim. */
function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Recursively canonicalize an arbitrary value into a deterministic, hashable
 * form:
 *   * objects        → key-sorted (lexicographic) plain object, values recursed
 *   * arrays         → element-wise canonicalized, order PRESERVED by default
 *   * set-arrays     → sorted + deduped when `setKey` marks the field a set
 *   * scalars        → stable scalar string form
 *
 * Set semantics apply to the fields named in `SET_FIELDS` (used_tokens,
 * exported_variants, members) wherever they appear — those are order- and
 * duplicate-insensitive collections.
 */
const SET_FIELDS: ReadonlySet<string> = new Set([
  'used_tokens',
  'exported_variants',
  'members',
]);

function canonicalize(value: unknown, fieldName?: string): unknown {
  if (Array.isArray(value)) {
    const mapped = value.map((el) => canonicalize(el));
    if (fieldName !== undefined && SET_FIELDS.has(fieldName)) {
      // Set-array: stringify each element, sort + dedupe lexicographically.
      const asStrings = mapped.map((el) =>
        typeof el === 'string' ? el : JSON.stringify(el),
      );
      const deduped = Array.from(new Set(asStrings));
      deduped.sort();
      return deduped;
    }
    return mapped;
  }
  if (value !== null && typeof value === 'object') {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(src).sort()) {
      out[key] = canonicalize(src[key], key);
    }
    return out;
  }
  return formatScalar(value);
}

/**
 * Serialize a canonicalized object into a flat `key=value` line list, joined by
 * '\n', with a leading `type:`-prefix line. Nested objects/arrays are rendered
 * via a stable dotted-path flattening so the result is a single deterministic
 * string. This is intentionally NOT `JSON.stringify` — the explicit `type:`
 * prefix is what guarantees a token and a component with identical field values
 * hash to DIFFERENT digests.
 */
function serializeCanonical(type: string, canonical: unknown): string {
  const lines: string[] = [`type:${type}`];
  flatten('', canonical, lines);
  return lines.join('\n');
}

function flatten(prefix: string, value: unknown, lines: string[]): void {
  if (Array.isArray(value)) {
    // Index-keyed so [a,b] and [b,a] differ where order is significant, and
    // set-arrays (already sorted+deduped upstream) are stable.
    value.forEach((el, i) => flatten(`${prefix}[${i}]`, el, lines));
    return;
  }
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj); // already key-sorted by canonicalize()
    for (const key of keys) {
      const next = prefix === '' ? key : `${prefix}.${key}`;
      flatten(next, obj[key], lines);
    }
    return;
  }
  // Scalar (already a normalized string from canonicalize()).
  lines.push(`${prefix}=${String(value)}`);
}

/** sha256 hex of a UTF-8 string. */
function sha256Hex(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

// ---------------------------------------------------------------------------
// Per-type projections (full + structural).
// ---------------------------------------------------------------------------

/** ≤100→fast, ≤300→base, ≤600→slow, >600→xslow; absent → "none". */
function durationBucket(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return 'none';
  if (ms <= 100) return 'fast';
  if (ms <= 300) return 'base';
  if (ms <= 600) return 'slow';
  return 'xslow';
}

/** Classify an easing descriptor into a coarse, stable class. */
const KNOWN_EASINGS: ReadonlySet<string> = new Set([
  'linear',
  'ease',
  'ease-in',
  'ease-out',
  'ease-in-out',
  'spring',
]);

function easingClass(easing: string | undefined): string {
  if (easing === undefined) return 'custom';
  const norm = collapseWhitespace(easing).toLowerCase();
  if (norm === '') return 'custom';
  return KNOWN_EASINGS.has(norm) ? norm : 'custom';
}

/** Render the prop contract as sorted `name:type` (optional → `name?:type`). */
function propsShapeKeyed(
  props: readonly PropShapeEntry[],
): { full: string[]; keys: string[] } {
  const full = props
    .map((p) => {
      const opt = p.optional ? '?' : '';
      return `${collapseWhitespace(p.name)}${opt}:${collapseWhitespace(p.type)}`;
    })
    .slice()
    .sort();
  const keys = props
    .map((p) => `${collapseWhitespace(p.name)}${p.optional ? '?' : ''}`)
    .slice()
    .sort();
  return { full, keys };
}

/** Build the FULL projection object for a given type. */
function fullProjection(input: FingerprintInput, type: FingerprintType): unknown {
  switch (type) {
    case 'component': {
      const c = input as ComponentFingerprintInput;
      const { full: propsFull } = propsShapeKeyed(c.props_shape ?? []);
      return {
        component_signature: {
          name: c.component_signature?.name ?? '',
          members: (c.component_signature?.members ?? []) as readonly string[],
        },
        props_shape: propsFull,
        used_tokens: (c.used_tokens ?? []) as readonly string[],
        exported_variants: (c.exported_variants ?? []) as readonly string[],
      };
    }
    case 'token': {
      const t = input as TokenFingerprintInput;
      return {
        token_name: t.token_name,
        token_value: t.token_value,
        token_type: t.token_type,
        subtype: t.subtype ?? '',
        theme_scope: t.theme_scope ?? '',
      };
    }
    case 'motion': {
      const m = input as MotionFingerprintInput;
      return {
        animation_target: m.animation_target,
        duration_bucket: durationBucket(m.duration_ms),
        easing_class: easingClass(m.easing),
      };
    }
    default: {
      // Exhaustiveness guard.
      const never: never = type;
      throw new TypeError(`fingerprint: unknown type "${String(never)}"`);
    }
  }
}

/**
 * Build the STRUCTURE-ONLY projection object (cosmetic fields omitted):
 *   * component → (component_signature, props_shape KEYS, exported_variants) — omits used_tokens
 *   * token     → (token_name, token_type, theme_scope)                       — omits token_value
 *   * motion    → (animation_target, easing_class)                            — omits duration_bucket
 */
function structuralProjection(
  input: FingerprintInput,
  type: FingerprintType,
): unknown {
  switch (type) {
    case 'component': {
      const c = input as ComponentFingerprintInput;
      const { keys: propsKeys } = propsShapeKeyed(c.props_shape ?? []);
      return {
        component_signature: {
          name: c.component_signature?.name ?? '',
          members: (c.component_signature?.members ?? []) as readonly string[],
        },
        props_shape: propsKeys,
        exported_variants: (c.exported_variants ?? []) as readonly string[],
      };
    }
    case 'token': {
      const t = input as TokenFingerprintInput;
      return {
        token_name: t.token_name,
        token_type: t.token_type,
        theme_scope: t.theme_scope ?? '',
      };
    }
    case 'motion': {
      const m = input as MotionFingerprintInput;
      return {
        animation_target: m.animation_target,
        easing_class: easingClass(m.easing),
      };
    }
    default: {
      const never: never = type;
      throw new TypeError(`fingerprint: unknown type "${String(never)}"`);
    }
  }
}

// ---------------------------------------------------------------------------
// Public API.
// ---------------------------------------------------------------------------

/**
 * Compute the `{ full, structural }` sha256 hex fingerprint pair for one
 * entity. Both hashes are over canonicalized, `type:`-prefixed line-joined
 * projections (see module header). Summaries are never hashed.
 *
 * @param input Entity projection matching `type`.
 * @param type  One of 'component' | 'token' | 'motion'.
 */
export function fingerprint(
  input: FingerprintInput,
  type: FingerprintType,
): Fingerprint {
  if (input === null || typeof input !== 'object') {
    throw new TypeError('fingerprint: input must be an object');
  }
  const fullCanonical = canonicalize(fullProjection(input, type));
  const structuralCanonical = canonicalize(structuralProjection(input, type));
  return {
    full: sha256Hex(serializeCanonical(type, fullCanonical)),
    structural: sha256Hex(serializeCanonical(type, structuralCanonical)),
  };
}

/**
 * Classify the change between two fingerprints (before `a`, after `b`):
 *   * a && b && a.full === b.full        → 'NONE'        (identical)
 *   * !a || !b                           → 'STRUCTURAL'  (add when !a, remove when !b)
 *   * a.structural === b.structural      → 'COSMETIC'    (cosmetic-only delta)
 *   * else                               → 'STRUCTURAL'  (shape changed)
 *
 * `null` on either side models add (prior absent) or remove (current absent);
 * both are STRUCTURAL — the batch they belong to must be (re-)mapped.
 */
export function compareFingerprints(
  a: Fingerprint | null,
  b: Fingerprint | null,
): ChangeType {
  if (a && b && a.full === b.full) return 'NONE';
  if (!a || !b) return 'STRUCTURAL';
  return a.structural === b.structural ? 'COSMETIC' : 'STRUCTURAL';
}
