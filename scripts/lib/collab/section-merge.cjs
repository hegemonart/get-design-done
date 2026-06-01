'use strict';
// Phase 40 — section-merge.cjs — PURE, dep-free per-section semantic merge for STATE.md (SC#1).
//
// The chosen multi-writer model (ROADMAP default) is a git-merge-driver with PER-SECTION semantic
// conflict detection — strictly safer than a line-based merge for the append-mostly `<decisions>`
// block. Two developers each adding a new D-NN on parallel branches should merge cleanly (union by
// id); a real conflict is ONLY when the SAME id diverges in text or status. This module is the merge
// core: it takes three decision arrays (base/ours/theirs, already parsed by attribution.cjs) and
// returns the merged set plus any genuine conflicts for the conflict-resolver agent to resolve.
//
// No `require` — pure. Deterministic (stable id-sorted output).

function byId(list) {
  const m = new Map();
  for (const d of list || []) if (d && d.id) m.set(d.id, d);
  return m;
}

function sameDecision(a, b) {
  return a.text === b.text && (a.status || null) === (b.status || null) &&
    (a.author || null) === (b.author || null) && (a.coAuthor || null) === (b.coAuthor || null);
}

/** Numeric sort by the D-NN id (D-2 before D-10). */
function idNum(id) {
  const m = String(id).match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

/**
 * Three-way merge of `<decisions>` (base = common ancestor; ours/theirs = the two branches).
 * @returns {{merged: Decision[], conflicts: [{id, ours, theirs}], added: string[]}}
 *   - id only in one side (vs base) → kept (union).
 *   - id in both sides, equal → kept once.
 *   - id in both sides, divergent → CONFLICT (and `ours` is kept provisionally so the merged set is
 *     still complete; the resolver overwrites after the human picks).
 *   - id removed on one side but unchanged on the other → kept (deletions are never auto-applied —
 *     decisions are durable; an explicit unlock/removal flow handles that).
 */
function mergeDecisions(base, ours, theirs) {
  const B = byId(base);
  const O = byId(ours);
  const T = byId(theirs);
  const ids = new Set([...O.keys(), ...T.keys(), ...B.keys()]);
  const merged = [];
  const conflicts = [];
  const added = [];
  for (const id of ids) {
    const o = O.get(id);
    const t = T.get(id);
    const b = B.get(id);
    if (o && t) {
      if (sameDecision(o, t)) { merged.push(o); }
      else { conflicts.push({ id, ours: o, theirs: t }); merged.push(o); }
    } else if (o && !t) {
      merged.push(o);
      if (!b) added.push(id); // ours added it
    } else if (!o && t) {
      merged.push(t);
      if (!b) added.push(id); // theirs added it
    }
    // (!o && !t) — present only in base, removed on both → drop.
  }
  merged.sort((a, x) => idNum(a.id) - idNum(x.id));
  added.sort((a, x) => idNum(a) - idNum(x));
  return { merged, conflicts, added };
}

/** Scalar merge for a single-value section (e.g. status): equal → value; divergent → conflict marker. */
function mergeStatusScalar(base, ours, theirs) {
  if (ours === theirs) return { value: ours, conflict: false };
  if (ours === base) return { value: theirs, conflict: false }; // only theirs changed
  if (theirs === base) return { value: ours, conflict: false }; // only ours changed
  return { value: ours, conflict: true }; // both changed differently
}

module.exports = { mergeDecisions, mergeStatusScalar, sameDecision };
