'use strict';
// Plan 31-03 — Path B of D-04 (three-path token extraction).
//
// Fixes spike 001's 0-tokens bug. The spike's digest.mjs extractTokensFromStyles
// (lines 96-132) looked up each /styles entry's `node_id` inside `file.document`
// and found nothing — because published-style SOURCE nodes are NOT serialized into
// the main document tree. They live in canvas frames that require a SEPARATE
// `/files/:key/nodes?ids=...` fetch. This module implements that missing second pass:
//
//   step 1: read the /styles list (node_id + style_type + name)        <- caller supplies
//   step 2: GET /files/:key/nodes?ids=<comma-joined> to read real values <- injected fetcher
//
// Resolution priority within D-04: Variables > plugin sync > styles. Styles (this
// module) is the last-resort fallback for non-Enterprise, legacy-styles DSs.
//
// No direct network call lives here except inside the buildStylesResolver-bound
// fetcher; tests drive resolveStyleTokens fully offline via an injected fetchNodes.

// Chunk cap for /nodes?ids= requests. Figma limits URL length, so large style sets
// are split into batches of this size and the results merged.
const MAX_IDS_PER_REQUEST = 100;

const DEFAULT_API_BASE = 'https://api.figma.com/v1';

// rgb(0..1) channels → 2-hex; appends an alpha hex byte only when a < 1.
// Ported from spike 001 digest.mjs rgbToHex (lines 13-17) — keep value shape identical.
function rgbToHex({ r, g, b, a }) {
  const to = (v) => Math.round((v || 0) * 255).toString(16).padStart(2, '0');
  const hex = `#${to(r)}${to(g)}${to(b)}`;
  return a !== undefined && a < 1 ? `${hex}${to(a)}` : hex;
}

// Split an array into contiguous chunks of at most `size`.
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Figma's /nodes response wraps each node under `.document`. Tolerate both the
// wrapped shape ({ document: <node> }) and a bare node, so the resolver is robust
// to either the live API or a flattened fixture.
function unwrapNode(entry) {
  if (!entry) return undefined;
  return entry.document !== undefined ? entry.document : entry;
}

// Resolve a single style's value from its source node, by style_type.
// Returns undefined when the node lacks the data for that type (style is then skipped).
function resolveValue(styleType, node) {
  if (!node) return undefined;
  if (styleType === 'FILL') {
    const fill = node.fills && node.fills[0];
    if (fill && fill.color) return rgbToHex({ ...fill.color, a: fill.opacity });
    return undefined;
  }
  if (styleType === 'TEXT') {
    const st = node.style;
    if (!st) return undefined;
    return {
      family: st.fontFamily,
      weight: st.fontWeight,
      size: st.fontSize,
      lineHeight: st.lineHeightPx,
      letterSpacing: st.letterSpacing,
    };
  }
  if (styleType === 'EFFECT') {
    const eff = node.effects && node.effects[0];
    return eff !== undefined ? eff : undefined;
  }
  return undefined;
}

// Core two-step resolver (Path B). Pure transform over injected data — no network.
//   stylesList: the /styles response body
//               ({ meta: { styles: [{ node_id, style_type, name, description }] } })
//   fetchNodes: async (ids: string[]) => /nodes response body
//               ({ nodes: { <id>: { document: <node> } | <node> } })
// Returns Array<{ name, type:'FILL'|'TEXT'|'EFFECT', value, description }>.
//   FILL   → value = hex string (rgb→hex, alpha-aware)
//   TEXT   → value = { family, weight, size, lineHeight, letterSpacing }
//   EFFECT → value = the first effect object
// Returns [] when stylesList has no styles (fetchNodes is NOT called), or when every
// node lookup misses. A style whose node_id is absent from /nodes is skipped (graceful).
async function resolveStyleTokens({ stylesList, fetchNodes }) {
  const styles = (stylesList && stylesList.meta && stylesList.meta.styles) || [];
  if (styles.length === 0) return [];
  if (typeof fetchNodes !== 'function') {
    throw new TypeError('resolveStyleTokens: fetchNodes must be a function');
  }

  // Step 2: batch the node_ids and fetch their real source nodes, merging into one map.
  const ids = styles.map((s) => s.node_id).filter((id) => id != null);
  const nodeMap = {};
  for (const idChunk of chunk(ids, MAX_IDS_PER_REQUEST)) {
    const body = await fetchNodes(idChunk);
    const nodes = (body && body.nodes) || {};
    for (const id of idChunk) {
      const node = unwrapNode(nodes[id]);
      if (node !== undefined) nodeMap[id] = node;
    }
  }

  // Map each style onto its resolved value. Skip styles whose node missed or whose
  // node lacked the data for its type.
  const out = [];
  for (const s of styles) {
    const node = nodeMap[s.node_id];
    if (!node) continue;
    const value = resolveValue(s.style_type, node);
    if (value !== undefined) {
      out.push({
        name: s.name,
        type: s.style_type,
        value,
        description: s.description || '',
      });
    }
  }
  return out;
}

// Bind a resolver to a live (fileKey, token, fetchImpl, apiBase) so digest.cjs can
// inject Path B. Returns an async fn(file, styles) — exactly the `stylesResolver(file, styles)`
// seam shape digest.cjs (31-02) calls. It ignores `file` (the document tree never holds
// the source nodes — that is the spike bug) and resolves `styles` via a /nodes fetcher.
// 31-07's SKILL wires this for live runs. The token is sent ONLY as the X-Figma-Token
// header and is NEVER logged or persisted (D-10).
function buildStylesResolver({ fileKey, token, fetchImpl, apiBase } = {}) {
  const base = apiBase || DEFAULT_API_BASE;
  const doFetch = fetchImpl || (typeof fetch !== 'undefined' ? fetch : undefined);
  return async function stylesResolver(_file, styles) {
    const fetchNodes = async (ids) => {
      if (typeof doFetch !== 'function') {
        throw new Error('buildStylesResolver: no fetch implementation available');
      }
      const url = `${base}/files/${fileKey}/nodes?ids=${ids.join(',')}`;
      const res = await doFetch(url, { headers: { 'X-Figma-Token': token } });
      if (!res.ok) throw new Error(`/nodes ${res.status}`);
      return res.json();
    };
    return resolveStyleTokens({ stylesList: styles, fetchNodes });
  };
}

module.exports = { resolveStyleTokens, buildStylesResolver, MAX_IDS_PER_REQUEST, rgbToHex };
