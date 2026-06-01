'use strict';
// Phase 40 — cycle-mode.cjs — PURE, dep-free sectional-handoff gate (SC#8).
//
// `.design/config.json#gdd_cycle_mode` partitions a cycle by role so a designer can hand a brief to a
// dev (and vice versa) without either overwriting the other's stages:
//   designer → Brief, Explore
//   dev      → Plan, Design, Verify
//   full     → all stages (the default / current single-operator behavior)
// `stagePermitted(mode, stage)` gates a STATE write by the stage that produced it.
//
// No `require` — pure. Deterministic.

const MODES = Object.freeze(['designer', 'dev', 'full']);
const ALL_STAGES = Object.freeze(['brief', 'explore', 'plan', 'design', 'verify']);

const STAGES_BY_MODE = Object.freeze({
  designer: Object.freeze(['brief', 'explore']),
  dev: Object.freeze(['plan', 'design', 'verify']),
  full: ALL_STAGES,
});

/** Normalize a mode value; unknown/missing → 'full' (the safe, backward-compatible default). */
function normalizeMode(mode) {
  const m = String(mode || 'full').toLowerCase().trim();
  return MODES.includes(m) ? m : 'full';
}

/** Resolve the cycle mode from a parsed `.design/config.json` (defaults to 'full'). */
function resolveMode(config) {
  return normalizeMode(config && config.gdd_cycle_mode);
}

/** True when `stage` is writable under `mode`. Unknown stage → false. */
function stagePermitted(mode, stage) {
  const m = normalizeMode(mode);
  const s = String(stage || '').toLowerCase().trim();
  if (!ALL_STAGES.includes(s)) return false;
  return STAGES_BY_MODE[m].includes(s);
}

module.exports = { MODES, ALL_STAGES, STAGES_BY_MODE, normalizeMode, resolveMode, stagePermitted };
