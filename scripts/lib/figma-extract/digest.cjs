'use strict';
/**
 * Plan 31-02 — productionized from spike 001 digest.mjs (orchestration + token extraction).
 *
 * DIGEST stage of the two-stage pipeline (decision D-01: extract → digest stay
 * separated). This module reads ONLY the raw/ cache that pull.cjs (31-01) wrote;
 * it performs ZERO network calls, so it can re-run against an existing cache
 * without re-pulling (idempotent / off-line).
 *
 * Three-path token assembly (decision D-04):
 *   Path A — Variables API body (rawDir/variables.json without the plugin marker)
 *   Path B — styles resolver (rawDir/styles.json) — pluggable seam; 31-03 ships
 *            the real two-step /styles + /nodes?ids= resolver
 *   Path C — plugin sync (rawDir/variables.json WITH the receiver marker, written
 *            by 31-06's localhost receiver)
 *   Resolution priority on name collision: Variables > plugin sync > styles.
 *   The --prefer-styles escape inverts the chain to prefer styles.
 *
 * Pure CommonJS, no external deps, no network.
 *
 * Per-component slicing (decision D-08):
 *   digest({..., component})    — when `component` is a name or glob (e.g.
 *            'Sample/Button', 'Sample/*', 'Form/Butt?'), the digest renders ONLY
 *            the matching component(s) — a ~500-token slice instead of the full
 *            ~16K digest. The filter is strictly ADDITIVE: omitting `component`
 *            reproduces 31-02's full-digest behavior unchanged. Glob support is a
 *            few lines of in-file string work (no external glob dependency).
 *
 * Exports:
 *   digest(opts)                — async orchestrator (reads raw/, writes digest/)
 *   assembleTokens(opts)        — pure three-path merge by priority
 *   DEFAULT_TOKEN_PRIORITY      — ['variables','plugin','styles'] (D-04)
 *   globToRegExp(pattern)       — minimal glob→RegExp (D-08 component filter)
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const { collectComponents } = require('./walk.cjs');
const { renderDesignMd } = require('./render-md.cjs');

// D-04: Variables > plugin sync > styles.
const DEFAULT_TOKEN_PRIORITY = ['variables', 'plugin', 'styles'];

// Receiver-written payload marker (31-06 contract). A rawDir/variables.json that
// carries this top-level field is the plugin's Path-C payload, NOT the Figma
// Variables API body.
const PLUGIN_PAYLOAD_MARKER = 'hone-plugin';

// ── component filter (D-08) ────────────────────────────────────────────────────

/**
 * Translate a minimal glob pattern into an anchored, case-sensitive RegExp.
 *
 * Supported wildcards (the only two the acceptance criterion needs):
 *   `*` → `.*`  (zero or more of any char)
 *   `?` → `.`   (exactly one char)
 * Every other character — including regex metacharacters like `.`/`/`/`(`/`+`
 * and the Figma `Sample/Path/Name` separators — is treated LITERALLY. We escape
 * the whole pattern first, then re-activate the escaped `\*`/`\?` placeholders,
 * so e.g. the `.` in 'Sample.Icon' is literal and does NOT over-match 'Sample/Icon'.
 *
 * Matching is exact (anchored `^...$`) and case-sensitive — Figma component
 * names are case-significant, and an exact name with no wildcard must match only
 * that one component.
 *
 * @param {string} pattern  a component name or glob (e.g. 'Button*', 'Form/*')
 * @returns {RegExp}
 */
function globToRegExp(pattern) {
  // Escape ALL regex metacharacters (incl. * and ? for now).
  const escaped = String(pattern).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Re-activate the wildcards: escaped '\*' → '.*', escaped '\?' → '.'.
  const body = escaped.replace(/\\\*/g, '.*').replace(/\\\?/g, '.');
  return new RegExp(`^${body}$`);
}

/**
 * Collect the set of token names that are RELEVANT to a set of components, so a
 * slice can carry just those tokens instead of the full ~hundreds-of-tokens
 * catalog (which would blow past the ~500-token budget). Relevance = a token
 * whose name is referenced by a component's prop default/options, variant name,
 * or the component name itself. When nothing is determinable we return an empty
 * set and the slice renders component shape only — keeping the slice bounded
 * regardless of catalog size (D-08 size guarantee).
 *
 * @param {Array} matched      matched component entries (from collectComponents)
 * @param {Array} tokens       the full assembled token list
 * @returns {Array} the subset of `tokens` referenced by the matched components
 */
function tokensForComponents(matched, tokens) {
  if (!Array.isArray(tokens) || tokens.length === 0) return [];
  // Build a haystack of strings drawn from the matched components.
  const haystack = [];
  for (const c of matched) {
    if (c.name) haystack.push(c.name);
    for (const v of c.variants || []) haystack.push(v);
    for (const p of c.props || []) {
      if (p.name) haystack.push(p.name);
      if (p.default !== undefined) haystack.push(String(p.default));
      for (const o of p.options || []) haystack.push(String(o));
    }
  }
  const blob = haystack.join('\n');
  return tokens.filter((t) => t && t.name !== undefined && blob.includes(t.name));
}

// ── helpers (Path A) ─────────────────────────────────────────────────────────

/** Convert a Figma {r,g,b,a?} (0..1 floats) colour to a hex string. */
function rgbToHex({ r, g, b, a }) {
  const to = (v) => Math.round(v * 255).toString(16).padStart(2, '0');
  const hex = `#${to(r)}${to(g)}${to(b)}`;
  return a !== undefined && a < 1 ? `${hex}${to(a)}` : hex;
}

/**
 * Path A — extract tokens from a Figma Variables API body
 * (`/v1/files/:key/variables/local`). Mirrors the spike's extractTokensFromVariables.
 * @param {object|null} vars  the Variables API response (has .meta.{variables,variableCollections})
 * @returns {Array<{name,type,collection?,modes?}>}
 */
function extractTokensFromVariables(vars) {
  if (!vars || !vars.meta) return [];
  const collections = vars.meta.variableCollections || {};
  const variables = vars.meta.variables || {};
  const tokens = [];
  for (const v of Object.values(variables)) {
    const collection = collections[v.variableCollectionId];
    const modes = collection?.modes || [];
    const valuesByMode = {};
    for (const mode of modes) {
      const raw = v.valuesByMode?.[mode.modeId];
      if (raw && typeof raw === 'object' && 'r' in raw) {
        valuesByMode[mode.name] = rgbToHex(raw);
      } else if (raw && raw.type === 'VARIABLE_ALIAS') {
        valuesByMode[mode.name] = `{${variables[raw.id]?.name || raw.id}}`;
      } else {
        valuesByMode[mode.name] = raw;
      }
    }
    tokens.push({
      name: v.name,
      type: v.resolvedType,
      collection: collection?.name,
      modes: valuesByMode,
    });
  }
  return tokens;
}

/**
 * Path C — normalize a receiver-written plugin payload into the common token
 * shape. The plugin (D-13) emits ALL local variables; we accept either a
 * pre-shaped `tokens[]` array or the raw `variables`/`meta` form and pass it
 * through extractTokensFromVariables when needed.
 * @param {object|null} payload  variables.json carrying source:'hone-plugin'
 * @returns {Array}
 */
function normalizePluginPayload(payload) {
  if (!payload) return [];
  // Preferred shape: the plugin already emits a flat tokens[] array.
  if (Array.isArray(payload.tokens)) return payload.tokens;
  // Fallback: it carries a Variables-API-like body — reuse Path A extraction.
  if (payload.meta) return extractTokensFromVariables(payload);
  return [];
}

// ── three-path merge (D-04) ──────────────────────────────────────────────────

/**
 * Merge the three token sources by priority. On a NAME collision the
 * higher-priority source wins.
 *
 * Implementation note: we iterate the priority chain HIGHEST-first and only set
 * a name the first time we see it (skip-if-present), so the highest-priority
 * source's entry is the one that survives.
 *
 * @param {object} opts
 * @param {Array} [opts.variables]        Path A tokens
 * @param {Array} [opts.pluginVariables]  Path C tokens
 * @param {Array} [opts.styleTokens]      Path B tokens
 * @param {boolean} [opts.preferStyles]   D-04 escape — move styles to the front
 * @returns {Array} merged tokens (insertion order follows the priority chain)
 */
function assembleTokens({ variables, pluginVariables, styleTokens, preferStyles } = {}) {
  const bySource = {
    variables: Array.isArray(variables) ? variables : [],
    plugin: Array.isArray(pluginVariables) ? pluginVariables : [],
    styles: Array.isArray(styleTokens) ? styleTokens : [],
  };
  const priority = preferStyles
    ? ['styles', 'variables', 'plugin']
    : DEFAULT_TOKEN_PRIORITY;

  const merged = new Map();
  for (const source of priority) {
    for (const tok of bySource[source]) {
      if (!tok || tok.name === undefined) continue;
      if (!merged.has(tok.name)) merged.set(tok.name, tok);
    }
  }
  return [...merged.values()];
}

// ── orchestrator ─────────────────────────────────────────────────────────────

/** Read+parse a JSON file from the raw cache; return null if absent/unreadable. */
async function readJson(rawDir, name) {
  try {
    const body = await fs.readFile(path.join(rawDir, `${name}.json`), 'utf8');
    return JSON.parse(body);
  } catch {
    return null;
  }
}

/**
 * Run the digest: read raw/ cache → walk (variant rollup) → 3-path token
 * assembly → render DESIGN.md + write tokens.json + components.json.
 *
 * @param {object} opts
 * @param {string} opts.rawDir              raw/ cache dir produced by pull.cjs (31-01) — REQUIRED
 * @param {string} opts.outDir              dir to write DESIGN.md/tokens.json/components.json — REQUIRED for writes
 * @param {Function} [opts.stylesResolver]  fn(file, styles) → styleTokens[] (Path B; 31-03 provides real impl)
 * @param {boolean} [opts.preferStyles]     D-04 escape hatch
 * @param {string} [opts.fetchedAtOverride] deterministic provenance header for tests
 * @param {string} [opts.component]         D-08 — name or glob; when set, render a
 *                                          per-component SLICE (~500 tokens) of only
 *                                          the matching component(s). Additive: when
 *                                          absent, the full-digest path is unchanged.
 * @returns {Promise<object>}
 *   full:   { ok:true, counts, bytes, outDir }
 *   sliced: { ok:true, sliced:true, matched:[names], counts:{components,tokens}, bytes, outDir, note? }
 *   error:  { ok:false, error }
 */
async function digest({ rawDir, outDir, stylesResolver, preferStyles, fetchedAtOverride, component } = {}) {
  if (!rawDir) {
    return { ok: false, error: 'rawDir is required — run pull.cjs first' };
  }

  // (1) Required input — graceful guard (mirrors spike). NEVER throws.
  const file = await readJson(rawDir, 'file');
  if (!file) {
    return { ok: false, error: 'raw/file.json not found — run pull.cjs first' };
  }

  // (2) Optional inputs.
  const variablesRaw = await readJson(rawDir, 'variables');
  const styles = await readJson(rawDir, 'styles');
  const meta = await readJson(rawDir, '_meta');

  // Distinguish Path A (Variables API body) from Path C (receiver plugin payload)
  // by the receiver marker. Only one of the two is populated from variables.json.
  let apiVariables = null;
  let pluginPayload = null;
  if (variablesRaw && variablesRaw.source === PLUGIN_PAYLOAD_MARKER) {
    pluginPayload = variablesRaw; // Path C
  } else {
    apiVariables = variablesRaw; // Path A (may be null)
  }

  // (3) Components + widgets — variant rollup is default-on (D-02).
  const { components, widgets } = collectComponents(file.document);

  // (4) Three token paths.
  const pathATokens = extractTokensFromVariables(apiVariables);
  const styleTokens = stylesResolver ? await stylesResolver(file, styles) : [];
  const pluginVariables = normalizePluginPayload(pluginPayload);

  // (5) Merge by priority (D-04).
  const tokens = assembleTokens({
    variables: pathATokens,
    pluginVariables,
    styleTokens,
    preferStyles,
  });

  // (6) Provenance — fetched_at is injectable for deterministic output.
  const fileMeta = {
    file_key: meta?.file_key,
    fetched_at: fetchedAtOverride !== undefined ? fetchedAtOverride : meta?.fetched_at,
    name: file.name,
  };

  // (6b) D-08 — per-component SLICE. When `component` is provided we short-circuit
  // the full digest and render only the matching component(s) + their relevant
  // tokens. This is additive: the block below is skipped entirely when `component`
  // is undefined, so the full-digest path (step 7) stays byte-identical.
  if (component !== undefined && component !== null && component !== '') {
    const rx = globToRegExp(component);
    const matched = components.filter((c) => rx.test(c.name));
    // Only tokens referenced by the matched components — keeps the slice ~500
    // tokens instead of dumping the whole catalog.
    const sliceTokens = tokensForComponents(matched, tokens);
    const sliceMd = renderDesignMd({
      tokens: sliceTokens,
      components: matched,
      widgets: [], // a per-component slice omits page/widget noise
      fileMeta,
    });
    if (outDir) {
      await fs.mkdir(outDir, { recursive: true });
      // Write the slice to DESIGN.md (the SKILL/e2e read whatever digest writes).
      await fs.writeFile(path.join(outDir, 'DESIGN.md'), sliceMd);
    }
    const result = {
      ok: true,
      sliced: true,
      matched: matched.map((c) => c.name),
      counts: { components: matched.length, tokens: sliceTokens.length },
      bytes: { designMd: Buffer.byteLength(sliceMd, 'utf8') },
      outDir,
    };
    if (matched.length === 0) result.note = `no component matched ${component}`;
    return result;
  }

  // (7) Render + write artifacts (D-09: digest/ is commit-able).
  const designMd = renderDesignMd({ tokens, components, widgets, fileMeta });
  const tokensJson = JSON.stringify(tokens, null, 2);
  const componentsJson = JSON.stringify(components, null, 2);

  if (outDir) {
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(path.join(outDir, 'DESIGN.md'), designMd);
    await fs.writeFile(path.join(outDir, 'tokens.json'), tokensJson);
    await fs.writeFile(path.join(outDir, 'components.json'), componentsJson);
  }

  return {
    ok: true,
    counts: {
      tokens: tokens.length,
      components: components.length,
      widgets: widgets.length,
    },
    bytes: {
      designMd: Buffer.byteLength(designMd, 'utf8'),
      tokensJson: Buffer.byteLength(tokensJson, 'utf8'),
      componentsJson: Buffer.byteLength(componentsJson, 'utf8'),
    },
    outDir,
  };
}

module.exports = {
  digest,
  assembleTokens,
  DEFAULT_TOKEN_PRIORITY,
  // exported for unit reuse / downstream (31-08 --component, 31-03 normalization parity)
  extractTokensFromVariables,
  normalizePluginPayload,
  PLUGIN_PAYLOAD_MARKER,
  // D-08 component filter — exported for unit reuse / downstream slicing tools.
  globToRegExp,
  tokensForComponents,
};

// ── CLI entry (31-08) ──────────────────────────────────────────────────────────
//
// Thin argv wrapper invoked by the figma-extract SKILL (31-07) and the e2e test
// (31-10). The callable API (digest/assembleTokens/…) above is the import surface;
// this block runs ONLY when the file is executed directly. Flag → option map
// (contract from 31-02 SUMMARY, extended with --component for D-08):
//
//   --raw <dir>          rawDir   (required)  raw cache dir written by pull.cjs
//   --out <dir>          outDir   (required)  digest artifact output dir
//   --prefer-styles      preferStyles:true    D-04 escape — styles-first priority
//   --component <name>   component            D-08 per-component slice (name or glob)
//
// D-10: this block NEVER reads, logs, or persists FIGMA_TOKEN — digest is offline
// and token-free by construction; the CLI only echoes counts/paths.

/** Minimal flag parser for the four supported options (no external dep). */
function parseArgv(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--raw') opts.rawDir = argv[++i];
    else if (a === '--out') opts.outDir = argv[++i];
    else if (a === '--prefer-styles') opts.preferStyles = true;
    else if (a === '--component') opts.component = argv[++i];
    else if (a === '--help' || a === '-h') opts.help = true;
  }
  return opts;
}

const CLI_USAGE =
  'Usage: node digest.cjs --raw <dir> --out <dir> [--prefer-styles] [--component <name|glob>]';

if (require.main === module) {
  (async () => {
    const opts = parseArgv(process.argv.slice(2));
    if (opts.help) {
      process.stdout.write(`${CLI_USAGE}\n`);
      return;
    }
    if (!opts.rawDir || !opts.outDir) {
      process.stderr.write(`${CLI_USAGE}\n--raw and --out are required.\n`);
      process.exitCode = 2;
      return;
    }
    const res = await digest({
      rawDir: opts.rawDir,
      outDir: opts.outDir,
      preferStyles: opts.preferStyles,
      component: opts.component,
    });
    if (!res.ok) {
      process.stderr.write(`digest failed: ${res.error}\n`);
      process.exitCode = 1;
      return;
    }
    if (res.sliced) {
      const summary =
        res.matched.length > 0
          ? `sliced ${res.counts.components} component(s): ${res.matched.join(', ')} (${res.counts.tokens} tokens) → ${res.outDir}`
          : `${res.note} → ${res.outDir} (empty slice)`;
      process.stdout.write(`${summary}\n`);
    } else {
      process.stdout.write(
        `digest ok: ${res.counts.components} components, ${res.counts.tokens} tokens, ${res.counts.widgets} widgets → ${res.outDir}\n`
      );
    }
  })().catch((err) => {
    // Never leak a token; surface only the message.
    process.stderr.write(`digest error: ${err && err.message ? err.message : err}\n`);
    process.exitCode = 1;
  });
}
