'use strict';
/**
 * sdk/fingerprint/classify.cjs — Phase 53 (Semantic Mapper Engine), FP-02.
 *
 * The incremental-update CLASSIFIER. Given a pre-computed array of per-node
 * fingerprint-compare results (see `compareFingerprints` in
 * `sdk/fingerprint/index.ts`, which yields NONE | COSMETIC | STRUCTURAL) and a
 * project-shape snapshot, decide HOW MUCH of the design context must be re-mapped
 * on this cycle:
 *
 *   SKIP                — nothing structural changed; reuse the prior context.
 *   PARTIAL_UPDATE      — a few nodes changed; re-map only the affected batches.
 *   ARCHITECTURE_UPDATE — a modest, dir-reshaping change; re-map + re-batch.
 *   FULL_UPDATE         — a large or restructuring change (or a bootstrap with no
 *                         prior baseline); re-map everything.
 *
 * This module is the one `.cjs` exception the ROADMAP names so that a `.cjs` CLI
 * or skill can `require()` it directly. It is DEP-FREE and PURE: it consumes a
 * `compareResults` array (NOT fingerprint internals) and never calls the
 * fingerprint engine, so it is fully independent of `sdk/fingerprint/index.ts`.
 * It performs NO filesystem access — directory shape is derived from node-id
 * provenance carried in `projectStats`, never from an FS re-walk.
 *
 * Determinism is a hard contract (D6): no `Math.random`, no `Date.now`, sorted
 * accumulation of `affectedBatchHints`. Identical inputs → identical output on
 * win32 / Linux / macOS.
 *
 * ---------------------------------------------------------------------------
 * INPUT / OUTPUT CONTRACT (for executor E's wiring at the discover/explore boundary)
 * ---------------------------------------------------------------------------
 *
 * classify(compareResults, projectStats) → result
 *
 *   compareResults: Array<{ id: string, type?: string, change: 'NONE'|'COSMETIC'|'STRUCTURAL' }>
 *     One entry per fingerprinted node that exists in BOTH the prior and the
 *     current context, plus add/remove which `compareFingerprints` already maps
 *     to STRUCTURAL. `change` is the authoritative signal; `type` (component |
 *     token | motion | ...) is carried through for downstream batching but does
 *     not affect the action decision. An EMPTY array means "no prior baseline
 *     signal" (bootstrap / first run) → FULL_UPDATE (documented below).
 *
 *   projectStats: {
 *     totalFiles: number,            // count of file-nodes in the CURRENT context
 *     prevDirShape?: DirShape|null,  // null/absent ⇒ bootstrap (no prior baseline)
 *     currDirShape?: DirShape|null,
 *     thresholds?: Partial<Thresholds>  // inline override (lower precedence than config)
 *   }
 *
 *   DirShape = {
 *     dirs: string[],                       // top-level design dirs (derived from node-id provenance)
 *     counts: Record<string, number>,       // file-node count per top-level dir
 *     layerHist: Record<string, number>     // Atomic-layer histogram (atom/molecule/organism/…)
 *   }
 *
 *   result: {
 *     action: 'SKIP'|'PARTIAL_UPDATE'|'ARCHITECTURE_UPDATE'|'FULL_UPDATE',
 *     structuralCount: number,        // # of STRUCTURAL entries
 *     pct: number,                    // structuralCount / totalFiles (0 when totalFiles===0)
 *     dirChanged: boolean,            // any top-level dir added/removed/renamed, or per-dir count delta
 *     majorRestructure: boolean,      // see DECISION MATRIX below
 *     affectedBatchHints: string[],   // sorted ids of STRUCTURAL-changed inputs
 *     reason: string,                 // human-readable trigger (advisory; stable text)
 *     thresholds: Thresholds          // the effective thresholds actually used
 *   }
 *
 * ---------------------------------------------------------------------------
 * DECISION MATRIX (top-down, FIRST match wins)
 * ---------------------------------------------------------------------------
 *   (0) totalFiles === 0                                   → SKIP   (guard: no divide-by-zero, nothing to map)
 *   (B) prevDirShape == null  (no prior baseline)          → FULL_UPDATE  (bootstrap; empty compareResults lands here)
 *   (1) structuralCount === 0                              → SKIP   (cosmetic-only / no-op vs a KNOWN baseline)
 *   (2) structuralCount > fullFileCount
 *         || pct > fullPct
 *         || majorRestructure                              → FULL_UPDATE
 *   (3) 0 < pct <= archPctMax  &&  dirChanged              → ARCHITECTURE_UPDATE
 *   (4) else                                               → PARTIAL_UPDATE
 *
 * BOOTSTRAP rule (no prior baseline): when `prevDirShape` is null/absent (a
 * first run has no baseline to diff against) and there ARE files to map, we
 * cannot trust `pct` or `dirChanged` to be meaningful, so we classify
 * FULL_UPDATE. An EMPTY `compareResults` is the canonical bootstrap signal and
 * likewise yields FULL_UPDATE (the caller treats the whole context as new). The
 * bootstrap check (B) therefore sits ABOVE the structuralCount===0 SKIP (1) —
 * otherwise an empty compare array would be misread as "nothing changed". Only
 * the totalFiles===0 guard (0) wins over bootstrap: a project with zero
 * file-nodes has nothing to map even on its first run.
 *
 * majorRestructure is TRUE when ANY of:
 *   (a) a top-level design dir was added, removed, or renamed
 *       (set difference of prevDirShape.dirs vs currDirShape.dirs is non-empty);
 *   (b) the Atomic-layer histogram shifts > 30% (relative) in ANY bucket;
 *   (c) > 25% of the file-nodes changed their owning top-level dir, approximated
 *       deterministically by the net per-dir count churn over total files.
 */

// ---------------------------------------------------------------------------
// Thresholds — defaults overridable from `.design/config.json#incremental`
//   (config is read by the CALLER and threaded in via projectStats.thresholds,
//    or merged here when a caller hands us the raw config object). We keep the
//    merge logic here so every consumer agrees on precedence + clamping.
// ---------------------------------------------------------------------------

const DEFAULT_THRESHOLDS = Object.freeze({
  fullFileCount: 30, // > this many STRUCTURAL file changes ⇒ FULL_UPDATE
  fullPct: 0.5, // structural fraction > this ⇒ FULL_UPDATE
  archPctMax: 0.3, // structural fraction at-or-below this (with dirChanged) ⇒ ARCHITECTURE
});

/** Relative-shift fraction for an Atomic-layer bucket that counts as "major". */
const LAYER_SHIFT_MAJOR = 0.3;
/** Fraction of file-nodes that must change owning dir to count as "major". */
const DIR_REOWN_MAJOR = 0.25;

/**
 * Coerce + clamp a thresholds object. Unknown keys are ignored; non-finite or
 * out-of-range values fall back to the default for that key. `fullFileCount` is
 * a non-negative integer; the two pcts are clamped to [0, 1].
 *
 * @param {Partial<typeof DEFAULT_THRESHOLDS>|null|undefined} raw
 * @returns {typeof DEFAULT_THRESHOLDS}
 */
function normalizeThresholds(raw) {
  const t = { ...DEFAULT_THRESHOLDS };
  if (!raw || typeof raw !== 'object') return t;

  if (Number.isFinite(raw.fullFileCount) && raw.fullFileCount >= 0) {
    t.fullFileCount = Math.floor(raw.fullFileCount);
  }
  if (Number.isFinite(raw.fullPct) && raw.fullPct >= 0) {
    t.fullPct = Math.min(1, raw.fullPct);
  }
  if (Number.isFinite(raw.archPctMax) && raw.archPctMax >= 0) {
    t.archPctMax = Math.min(1, raw.archPctMax);
  }
  return t;
}

/**
 * Resolve the effective thresholds. Precedence (highest first):
 *   1. `projectStats.thresholds`     — explicit inline override
 *   2. `projectStats.config.incremental` — a raw `.design/config.json` object,
 *      if a caller hands the whole config through instead of pre-extracting it
 *   3. DEFAULT_THRESHOLDS
 *
 * @param {object} projectStats
 * @returns {typeof DEFAULT_THRESHOLDS}
 */
function resolveThresholds(projectStats) {
  const ps = projectStats && typeof projectStats === 'object' ? projectStats : {};
  if (ps.thresholds && typeof ps.thresholds === 'object') {
    return normalizeThresholds(ps.thresholds);
  }
  if (ps.config && typeof ps.config === 'object' && ps.config.incremental) {
    return normalizeThresholds(ps.config.incremental);
  }
  return { ...DEFAULT_THRESHOLDS };
}

// ---------------------------------------------------------------------------
// Dir-shape diffing — all derived from node-id provenance carried in
//   projectStats; NO filesystem walk. A "DirShape" is { dirs, counts, layerHist }.
// ---------------------------------------------------------------------------

/** Safe array of strings from an arbitrary value. */
function strList(v) {
  return Array.isArray(v) ? v.filter((s) => typeof s === 'string') : [];
}

/** Safe Record<string, number> from an arbitrary value. */
function numMap(v) {
  const out = {};
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    for (const k of Object.keys(v)) {
      if (Number.isFinite(v[k])) out[k] = v[k];
    }
  }
  return out;
}

/**
 * True when the set of top-level dirs differs between prev and curr (any add,
 * remove, or rename surfaces as a set difference in at least one direction).
 *
 * @param {string[]} prevDirs
 * @param {string[]} currDirs
 * @returns {boolean}
 */
function topLevelDirsChanged(prevDirs, currDirs) {
  const a = new Set(prevDirs);
  const b = new Set(currDirs);
  if (a.size !== b.size) return true;
  for (const d of a) if (!b.has(d)) return true;
  return false;
}

/**
 * True when ANY per-dir file-count delta is non-zero. This catches files moving
 * between existing dirs (which leaves `dirs` identical but shifts `counts`).
 *
 * @param {Record<string, number>} prevCounts
 * @param {Record<string, number>} currCounts
 * @returns {boolean}
 */
function perDirCountsChanged(prevCounts, currCounts) {
  const keys = new Set([...Object.keys(prevCounts), ...Object.keys(currCounts)]);
  for (const k of keys) {
    if ((prevCounts[k] || 0) !== (currCounts[k] || 0)) return true;
  }
  return false;
}

/**
 * True when the Atomic-layer histogram shifts more than LAYER_SHIFT_MAJOR
 * (relative) in ANY bucket. Relative shift for a bucket is
 * |curr - prev| / max(prev, 1) so a bucket going 0→N is a full (>=100%) shift,
 * and we also treat any bucket appearing/disappearing as a major shift.
 *
 * @param {Record<string, number>} prevHist
 * @param {Record<string, number>} currHist
 * @returns {boolean}
 */
function layerHistMajorShift(prevHist, currHist) {
  const keys = new Set([...Object.keys(prevHist), ...Object.keys(currHist)]);
  for (const k of keys) {
    const p = prevHist[k] || 0;
    const c = currHist[k] || 0;
    if (p === 0 && c === 0) continue;
    const rel = Math.abs(c - p) / Math.max(p, 1);
    if (rel > LAYER_SHIFT_MAJOR) return true;
  }
  return false;
}

/**
 * Deterministic approximation of "> DIR_REOWN_MAJOR of file-nodes changed their
 * owning top-level dir". We do not have per-node before/after dir membership in
 * `compareResults`, so we approximate the re-owning churn from the per-dir count
 * deltas: half the summed absolute count delta is the minimum number of files
 * that must have moved across the dir boundary (each move decrements one dir and
 * increments another, so the summed |delta| double-counts a pure move). We
 * divide by totalFiles to get a fraction. This is monotone in churn and
 * deterministic.
 *
 * @param {Record<string, number>} prevCounts
 * @param {Record<string, number>} currCounts
 * @param {number} totalFiles
 * @returns {boolean}
 */
function dirReownMajor(prevCounts, currCounts, totalFiles) {
  if (!(totalFiles > 0)) return false;
  const keys = new Set([...Object.keys(prevCounts), ...Object.keys(currCounts)]);
  let absDelta = 0;
  for (const k of keys) {
    absDelta += Math.abs((currCounts[k] || 0) - (prevCounts[k] || 0));
  }
  const movedApprox = absDelta / 2;
  return movedApprox / totalFiles > DIR_REOWN_MAJOR;
}

/**
 * Compute { dirChanged, majorRestructure } from the two dir shapes. When there
 * is no prior shape (bootstrap), there is nothing to diff: dirChanged=false and
 * majorRestructure=false (the bootstrap → FULL decision is made separately, on
 * the absence of a baseline, not on a fabricated "everything changed").
 *
 * @param {object|null} prevDirShape
 * @param {object|null} currDirShape
 * @param {number} totalFiles
 * @returns {{ dirChanged: boolean, majorRestructure: boolean }}
 */
function diffDirShapes(prevDirShape, currDirShape, totalFiles) {
  if (!prevDirShape || typeof prevDirShape !== 'object') {
    return { dirChanged: false, majorRestructure: false };
  }
  const prevDirs = strList(prevDirShape.dirs);
  const currDirs = strList(currDirShape && currDirShape.dirs);
  const prevCounts = numMap(prevDirShape.counts);
  const currCounts = numMap(currDirShape && currDirShape.counts);
  const prevHist = numMap(prevDirShape.layerHist);
  const currHist = numMap(currDirShape && currDirShape.layerHist);

  const dirsChanged = topLevelDirsChanged(prevDirs, currDirs);
  const countsChanged = perDirCountsChanged(prevCounts, currCounts);
  const dirChanged = dirsChanged || countsChanged;

  const majorRestructure =
    dirsChanged ||
    layerHistMajorShift(prevHist, currHist) ||
    dirReownMajor(prevCounts, currCounts, totalFiles);

  return { dirChanged, majorRestructure };
}

// ---------------------------------------------------------------------------
// classify — the 4-action top-down matrix.
// ---------------------------------------------------------------------------

/**
 * Classify a cycle's change set into an update action. See the module header
 * for the full input/output contract and decision matrix.
 *
 * @param {Array<{id: string, type?: string, change: string}>} compareResults
 * @param {object} projectStats
 * @returns {{
 *   action: string, structuralCount: number, pct: number,
 *   dirChanged: boolean, majorRestructure: boolean,
 *   affectedBatchHints: string[], reason: string,
 *   thresholds: typeof DEFAULT_THRESHOLDS
 * }}
 */
function classify(compareResults, projectStats) {
  const results = Array.isArray(compareResults) ? compareResults : [];
  const ps = projectStats && typeof projectStats === 'object' ? projectStats : {};
  const thresholds = resolveThresholds(ps);

  const totalFiles = Number.isFinite(ps.totalFiles) && ps.totalFiles >= 0 ? ps.totalFiles : 0;
  const hasPriorBaseline = ps.prevDirShape != null && typeof ps.prevDirShape === 'object';

  // Gather STRUCTURAL ids deterministically (sorted, deduped). Only STRUCTURAL
  // entries become batch hints; NONE/COSMETIC do not trigger a re-map.
  const structuralIds = [];
  const seen = new Set();
  for (const r of results) {
    if (!r || typeof r !== 'object') continue;
    if (r.change === 'STRUCTURAL' && typeof r.id === 'string' && r.id.length) {
      if (!seen.has(r.id)) {
        seen.add(r.id);
        structuralIds.push(r.id);
      }
    }
  }
  structuralIds.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const structuralCount = structuralIds.length;

  const pct = totalFiles > 0 ? structuralCount / totalFiles : 0;

  const { dirChanged, majorRestructure } = diffDirShapes(
    ps.prevDirShape || null,
    ps.currDirShape || null,
    totalFiles,
  );

  const base = {
    structuralCount,
    pct,
    dirChanged,
    majorRestructure,
    affectedBatchHints: structuralIds,
    thresholds,
  };

  // (0) Empty project guard — nothing to map, no divide-by-zero. This wins over
  // everything: a project with zero file-nodes has nothing to re-map even on a
  // first run, so a bootstrap with no files still SKIPs.
  if (totalFiles === 0) {
    return { ...base, action: 'SKIP', reason: 'no-files' };
  }

  // Bootstrap: there is no prior baseline to diff against (first run / no
  // fingerprint store). We cannot trust `pct` or `dirChanged` to be meaningful,
  // so the whole current context is treated as new ⇒ FULL_UPDATE. This is
  // ALSO the canonical empty-`compareResults` path: a caller with files but no
  // prior fingerprints passes `[]` + no `prevDirShape`, and we map everything.
  // The bootstrap decision is made on the ABSENCE OF A BASELINE, not on the
  // structural count — so it must be checked BEFORE the structuralCount===0 SKIP
  // (an empty compare array would otherwise be misread as "nothing changed").
  if (!hasPriorBaseline) {
    return { ...base, action: 'FULL_UPDATE', reason: 'bootstrap-no-baseline' };
  }

  // (1) No structural change against a KNOWN baseline — skip the cycle
  // (cosmetic-only edits or a genuine no-op).
  if (structuralCount === 0) {
    return { ...base, action: 'SKIP', reason: 'no-structural-change' };
  }

  // (2) Large or restructuring change ⇒ FULL.
  if (structuralCount > thresholds.fullFileCount) {
    return { ...base, action: 'FULL_UPDATE', reason: 'structural-count-over-threshold' };
  }
  if (pct > thresholds.fullPct) {
    return { ...base, action: 'FULL_UPDATE', reason: 'structural-pct-over-threshold' };
  }
  if (majorRestructure) {
    return { ...base, action: 'FULL_UPDATE', reason: 'major-restructure' };
  }

  // (3) Modest, dir-reshaping change ⇒ ARCHITECTURE.
  if (pct > 0 && pct <= thresholds.archPctMax && dirChanged) {
    return { ...base, action: 'ARCHITECTURE_UPDATE', reason: 'dir-reshape-modest' };
  }

  // (4) Default — a handful of in-place changes ⇒ PARTIAL.
  return { ...base, action: 'PARTIAL_UPDATE', reason: 'partial-in-place' };
}

module.exports = {
  classify,
  // exported for callers that want to pre-validate or display the effective
  // thresholds, and for the test suite.
  normalizeThresholds,
  resolveThresholds,
  DEFAULT_THRESHOLDS,
  LAYER_SHIFT_MAJOR,
  DIR_REOWN_MAJOR,
};
