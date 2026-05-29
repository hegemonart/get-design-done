// figma-plugin/src/payload-schema.ts — Plan 31-05 (Wave B.2)
//
// Single plugin-side definition of the GDD Sync payload: the TS mirror of
// scripts/lib/figma-extract/payload-schema.json (31-06), the shared Path C
// contract (D-04, D-13). code.ts + export-variables.ts import the payload type
// from here; buildPayload below is the PURE, network-free core the offline test
// drives against a figma.variables mock.
//
// Two consumers, one payload (the make-or-break interop requirement):
//   1. Receiver (31-06) validates source + collections[] + variables[] against
//      payload-schema.json before writing variables.json.
//   2. The digest's normalizePluginPayload (31-02) reads a FLAT tokens[] array
//      (preferred) or payload.meta.* — it does NOT read top-level variables[].
//      So the payload ALSO carries tokens[] (colors->hex, aliases->{name}, modes
//      keyed by mode NAME) so plugin variables surface in DESIGN.md.
//      additionalProperties:true permits the extra tokens[]. One object, both ends.
//
// D-13: ALL local variables are emitted — no published-only filter here; the
// digest filters.

/** Figma colour: 0..1 floats. `a` optional (RGB vs RGBA). */
export interface GddRgba {
  r: number;
  g: number;
  b: number;
  a?: number;
}

/** Alias marker — kept resolvable: target id always, target name when looked up. */
export interface GddVariableAlias {
  type: 'VARIABLE_ALIAS';
  id: string;
  name?: string;
}

/** A per-mode value in the receiver-facing variables[] (raw, unrendered). */
export type GddVariableValue =
  | number
  | string
  | boolean
  | GddRgba
  | GddVariableAlias;

// ── Receiver-facing shapes (validated against payload-schema.json) ────────────

export interface GddSyncMode {
  modeId: string;
  name: string;
}

export interface GddSyncCollection {
  id: string;
  name: string;
  modes: GddSyncMode[];
}

export interface GddSyncVariable {
  id: string;
  name: string;
  /** COLOR | FLOAT | STRING | BOOLEAN (schema enum). */
  resolvedType: string;
  collectionId: string;
  /** Keyed by modeId. Raw value or alias marker (digest renders later). */
  valuesByMode: Record<string, GddVariableValue>;
}

// ── Digest-interop shape: the FLAT tokens[] normalizePluginPayload reads ───────
// Matches digest.cjs extractTokensFromVariables() output so DESIGN.md is
// identical across paths: { name, type, collection, modes:{ <modeName>: rendered } }
// where rendered = hex for colours, `{targetName}` for aliases, primitive otherwise.

export interface GddSyncToken {
  name: string;
  type: string;
  /** Collection NAME (not id) — matches digest Path A. */
  collection?: string;
  /** Keyed by mode NAME → rendered value. */
  modes: Record<string, unknown>;
}

export interface GddSyncPayload {
  /** Path C marker the digest/receiver key on. Literal — never anything else. */
  source: 'gdd-plugin';
  fileKey?: string;
  exportedAt?: string;
  collections: GddSyncCollection[];
  /** ALL local variables, raw values (D-13). */
  variables: GddSyncVariable[];
  /** Flat rendered tokens the digest consumes (variables[] is ignored there). */
  tokens: GddSyncToken[];
}

// ── Pure value rendering (shared by the flat tokens[] builder) ────────────────

function isRgba(v: unknown): v is GddRgba {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as GddRgba).r === 'number' &&
    typeof (v as GddRgba).g === 'number' &&
    typeof (v as GddRgba).b === 'number'
  );
}

function isAlias(v: unknown): v is GddVariableAlias {
  return (
    typeof v === 'object' &&
    v !== null &&
    (v as GddVariableAlias).type === 'VARIABLE_ALIAS' &&
    typeof (v as GddVariableAlias).id === 'string'
  );
}

/** Render Figma {r,g,b,a?} (0..1) to hex — mirrors digest.cjs rgbToHex. */
export function rgbToHex({ r, g, b, a }: GddRgba): string {
  const to = (v: number): string =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, '0');
  const hex = `#${to(r)}${to(g)}${to(b)}`;
  return a !== undefined && a < 1 ? `${hex}${to(a)}` : hex;
}

/** colour→hex, alias→`{targetName}` (or `{id}`), else primitive passthrough. */
export function renderTokenValue(raw: GddVariableValue): unknown {
  if (isRgba(raw)) return rgbToHex(raw);
  if (isAlias(raw)) return `{${raw.name || raw.id}}`;
  return raw;
}

// ── The single pure builder (network-free; the testable core) ─────────────────

/** Minimal collection shape buildPayload needs (mirrors VariableCollection). */
export interface RawCollectionLike {
  id: string;
  name: string;
  modes: ReadonlyArray<{ modeId: string; name: string }>;
}

/** Minimal variable shape buildPayload needs (mirrors Variable). */
export interface RawVariableLike {
  id: string;
  name: string;
  resolvedType: string;
  variableCollectionId: string;
  valuesByMode: Record<string, GddVariableValue>;
}

/** Resolve a variable id → name (Figma's getVariableById(...)?.name). */
export type VariableNameResolver = (id: string) => string | undefined;

export interface BuildPayloadOptions {
  fileKey?: string;
  exportedAt?: string;
  resolveName?: VariableNameResolver;
}

/**
 * Build a GddSyncPayload from raw collections + variables. PURE: no Figma
 * globals, no network. Emits ALL variables passed in (D-13). Produces BOTH the
 * receiver-facing variables[] (raw values, alias markers retained with resolved
 * name) AND the flat rendered tokens[] the digest consumes.
 */
export function buildPayload(
  rawCollections: ReadonlyArray<RawCollectionLike>,
  rawVariables: ReadonlyArray<RawVariableLike>,
  opts: BuildPayloadOptions = {}
): GddSyncPayload {
  const resolveName: VariableNameResolver = opts.resolveName || (() => undefined);

  const collections: GddSyncCollection[] = rawCollections.map((c) => ({
    id: c.id,
    name: c.name,
    modes: c.modes.map((m) => ({ modeId: m.modeId, name: m.name })),
  }));
  const collectionById = new Map<string, GddSyncCollection>(
    collections.map((c) => [c.id, c])
  );

  const variables: GddSyncVariable[] = [];
  const tokens: GddSyncToken[] = [];

  for (const v of rawVariables) {
    // Receiver-facing valuesByMode: raw values, but resolve alias targets to a
    // name (keep id + type) so it stays auditable. Keyed by modeId (schema).
    const rawValuesByMode: Record<string, GddVariableValue> = {};
    for (const modeId of Object.keys(v.valuesByMode)) {
      const value = v.valuesByMode[modeId];
      rawValuesByMode[modeId] = isAlias(value)
        ? { type: 'VARIABLE_ALIAS', id: value.id, name: resolveName(value.id) }
        : value;
    }

    variables.push({
      id: v.id,
      name: v.name,
      resolvedType: v.resolvedType,
      collectionId: v.variableCollectionId,
      valuesByMode: rawValuesByMode,
    });

    // Flat token for the digest: rendered values keyed by mode NAME so a
    // multi-mode (light/dark) variable round-trips.
    const collection = collectionById.get(v.variableCollectionId);
    const modesByName: Record<string, unknown> = {};
    const modeList = collection ? collection.modes : [];
    if (modeList.length > 0) {
      for (const mode of modeList) {
        const raw = rawValuesByMode[mode.modeId];
        if (raw !== undefined) modesByName[mode.name] = renderTokenValue(raw);
      }
    } else {
      // No collection metadata — fall back to modeId so nothing is dropped.
      for (const modeId of Object.keys(rawValuesByMode)) {
        modesByName[modeId] = renderTokenValue(rawValuesByMode[modeId]);
      }
    }

    tokens.push({
      name: v.name,
      type: v.resolvedType,
      collection: collection ? collection.name : undefined,
      modes: modesByName,
    });
  }

  const payload: GddSyncPayload = {
    source: 'gdd-plugin',
    collections,
    variables,
    tokens,
  };
  if (opts.fileKey) payload.fileKey = opts.fileKey;
  if (opts.exportedAt) payload.exportedAt = opts.exportedAt;
  return payload;
}

/**
 * Narrow an unknown to GddSyncPayload: the literal source marker + the two
 * required arrays. Cheap structural check (the receiver validates fully).
 */
export function isGddSyncPayload(x: unknown): x is GddSyncPayload {
  if (typeof x !== 'object' || x === null) return false;
  const p = x as Partial<GddSyncPayload>;
  return (
    p.source === 'gdd-plugin' &&
    Array.isArray(p.collections) &&
    Array.isArray(p.variables)
  );
}
