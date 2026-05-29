// figma-plugin/src/payload-schema.ts — Plan 31-05 (Wave B.2)
//
// The single plugin-side definition of the GDD Sync payload. This is the TS
// mirror of scripts/lib/figma-extract/payload-schema.json (31-06) — the shared
// Path C contract (D-04, D-13). code.ts and export-variables.ts import the
// payload type from here; the builder below is the PURE, network-free core that
// the offline test (tests/figma-plugin-export.test.cjs) drives against a
// figma.variables mock.
//
// Two consumers, one payload (the make-or-break interop requirement):
//   1. The receiver (31-06) validates `source` + `collections[]` + `variables[]`
//      against payload-schema.json before writing variables.json to the raw cache.
//   2. The digest's normalizePluginPayload (31-02) reads a FLAT `tokens[]` array
//      (preferred) or `payload.meta.{...}` — it does NOT read the top-level
//      `variables[]`. So this payload ALSO carries `tokens[]` (rendered: colors
//      to hex, aliases to `{name}`, modes keyed by mode NAME) so the plugin's
//      variables actually surface in DESIGN.md. additionalProperties:true on the
//      JSON Schema permits the extra `tokens[]` while `collections`/`variables`
//      keep the receiver happy. One object satisfies both ends.
//
// D-13: ALL local variables are emitted — there is no published-only filter here.
// Filtering is the digest's job.

// ── Raw Figma value shapes (mirror @figma/plugin-typings VariableValue) ───────
// Kept dependency-free so this module compiles standalone and the test can run
// the emitted JS without the Figma runtime.

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
  /** Looked-up target name when resolvable (digest renders `{name}`). */
  name?: string;
}

/** A single per-mode value in the receiver-facing `variables[]` (raw, unrendered). */
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
// Shape matches digest.cjs extractTokensFromVariables() output so DESIGN.md is
// byte-identical regardless of which path produced the token:
//   { name, type, collection, modes: { <modeName>: <renderedValue> } }
// where renderedValue is a hex string for colours, `{targetName}` for aliases,
// and the primitive passthrough otherwise.

export interface GddSyncToken {
  name: string;
  /** Same enum as the variable resolvedType (COLOR|FLOAT|STRING|BOOLEAN). */
  type: string;
  /** Collection NAME (not id) — matches digest Path A. */
  collection?: string;
  /** Keyed by mode NAME → rendered value (hex / `{alias}` / primitive). */
  modes: Record<string, unknown>;
}

// ── The payload itself ────────────────────────────────────────────────────────

export interface GddSyncPayload {
  /** Path C marker the digest/receiver key on. Literal — never anything else. */
  source: 'gdd-plugin';
  /** Optional provenance: the Figma file key the variables were read from. */
  fileKey?: string;
  /** Optional ISO-8601 export timestamp. */
  exportedAt?: string;
  /** Local variable collections + their modes (receiver schema). */
  collections: GddSyncCollection[];
  /** ALL local variables, raw values (receiver schema, D-13). */
  variables: GddSyncVariable[];
  /**
   * Flat, rendered tokens for the digest consumer (normalizePluginPayload).
   * Extra property permitted by additionalProperties:true. THIS is what makes
   * plugin variables appear in DESIGN.md — the digest ignores `variables[]`.
   */
  tokens: GddSyncToken[];
}

// ── Pure value rendering (shared by the flat tokens[] builder) ────────────────

/** Is this value a Figma colour object ({r,g,b[,a]})? */
function isRgba(v: unknown): v is GddRgba {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as GddRgba).r === 'number' &&
    typeof (v as GddRgba).g === 'number' &&
    typeof (v as GddRgba).b === 'number'
  );
}

/** Is this value an alias marker? */
function isAlias(v: unknown): v is GddVariableAlias {
  return (
    typeof v === 'object' &&
    v !== null &&
    (v as GddVariableAlias).type === 'VARIABLE_ALIAS' &&
    typeof (v as GddVariableAlias).id === 'string'
  );
}

/**
 * Render a Figma {r,g,b,a?} (0..1 floats) to a hex string — matches digest.cjs
 * rgbToHex so colours look identical whether they came via the Variables API or
 * the plugin. Appends the alpha pair only when a < 1.
 */
export function rgbToHex({ r, g, b, a }: GddRgba): string {
  const to = (v: number): string =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, '0');
  const hex = `#${to(r)}${to(g)}${to(b)}`;
  return a !== undefined && a < 1 ? `${hex}${to(a)}` : hex;
}

/**
 * Render one raw per-mode value into the digest's token form:
 *   colour  → hex string
 *   alias   → `{targetName}` (or `{id}` when the name is unknown)
 *   else    → primitive passthrough (number / string / boolean)
 */
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

/** Optional resolver: variable id → name (Figma's getVariableById(...)?.name). */
export type VariableNameResolver = (id: string) => string | undefined;

export interface BuildPayloadOptions {
  fileKey?: string;
  exportedAt?: string;
  /** Resolve alias targets to names so the digest can render `{name}`. */
  resolveName?: VariableNameResolver;
}

/**
 * Build a GddSyncPayload from raw collections + variables. PURE: no Figma
 * globals, no network — so the offline test drives it directly. Emits ALL
 * variables passed in (D-13 — no published filter; the caller passes the full
 * getLocalVariables() set). Produces BOTH the receiver-facing `variables[]`
 * (raw values, alias markers retained with resolved name) AND the flat,
 * rendered `tokens[]` the digest consumes.
 */
export function buildPayload(
  rawCollections: ReadonlyArray<RawCollectionLike>,
  rawVariables: ReadonlyArray<RawVariableLike>,
  opts: BuildPayloadOptions = {}
): GddSyncPayload {
  const resolveName: VariableNameResolver = opts.resolveName || (() => undefined);

  // Collections — carry modes so the digest can label valuesByMode (and so the
  // flat tokens[] can key by mode NAME). id → {modes, name} lookup for tokens[].
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
    // Receiver-facing valuesByMode: raw values, but RESOLVE alias targets to a
    // name (keep id + type) so the contract stays auditable and the digest can
    // render the alias chain. Keyed by modeId (matches the schema).
    const rawValuesByMode: Record<string, GddVariableValue> = {};
    for (const modeId of Object.keys(v.valuesByMode)) {
      const value = v.valuesByMode[modeId];
      if (isAlias(value)) {
        rawValuesByMode[modeId] = {
          type: 'VARIABLE_ALIAS',
          id: value.id,
          name: resolveName(value.id),
        };
      } else {
        rawValuesByMode[modeId] = value;
      }
    }

    variables.push({
      id: v.id,
      name: v.name,
      resolvedType: v.resolvedType,
      collectionId: v.variableCollectionId,
      valuesByMode: rawValuesByMode,
    });

    // Flat token for the digest: rendered values keyed by mode NAME.
    const collection = collectionById.get(v.variableCollectionId);
    const modesByName: Record<string, unknown> = {};
    const modeList = collection ? collection.modes : [];
    if (modeList.length > 0) {
      // Key by the collection's mode names so multi-mode (light/dark) round-trips.
      for (const mode of modeList) {
        const raw = rawValuesByMode[mode.modeId];
        if (raw !== undefined) modesByName[mode.name] = renderTokenValue(raw);
      }
    } else {
      // No collection metadata — fall back to keying by raw modeId so the value
      // is not silently dropped.
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

// ── Optional runtime guard (lets the plugin self-check before POST) ───────────

/**
 * Narrow an unknown value to GddSyncPayload: the literal `source` marker plus
 * the two required arrays the receiver schema mandates. Cheap structural check,
 * not full schema validation (the receiver does that authoritatively).
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
