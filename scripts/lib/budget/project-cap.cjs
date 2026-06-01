'use strict';
// Phase 39.2 — project-cap.cjs — PURE, dep-free project-budget classifier.
//
// The Phase 25 budget-enforcer hook (hooks/budget-enforcer.ts) reads the running project spend and
// the configured project cap, and calls this classifier to decide whether to warn (50% / 80%) or
// hard-halt (100%). Keeping the decision math here (out of the .ts hook) mirrors how the hook already
// delegates cost computation to scripts/lib/budget-enforcer.cjs, and makes the thresholds unit-testable.
//
// project_cap is DISABLED by default (D-04): a cap of 0 / negative / non-finite means "no project cap"
// and always returns level 'ok' — so existing users (who have no project_cap_usd in budget.json) see
// zero behavior change. The halt is graceful: the hook fires on PreToolUse:Agent, so a 'halt' blocks
// the NEXT agent spawn, letting the current stage finish.
//
// Zero require(). Deterministic.

const WARN_50 = 50;
const WARN_80 = 80;
const HALT_100 = 100;

/**
 * @param {number} spendUsd  running project spend (USD)
 * @param {number} capUsd    configured project cap (USD); <= 0 / non-finite ⇒ disabled
 * @returns {{enabled:boolean, pct:number, level:'ok'|'warn-50'|'warn-80'|'halt', cap:number, spend:number}}
 */
function classifyProjectBudget(spendUsd, capUsd) {
  const spend = Number(spendUsd);
  const cap = Number(capUsd);
  const enabled = Number.isFinite(cap) && cap > 0 && Number.isFinite(spend) && spend >= 0;
  if (!enabled) {
    return { enabled: false, pct: 0, level: 'ok', cap: Number.isFinite(cap) ? cap : 0, spend: Number.isFinite(spend) ? spend : 0 };
  }
  const pct = (spend / cap) * 100;
  let level = 'ok';
  if (pct >= HALT_100) level = 'halt';
  else if (pct >= WARN_80) level = 'warn-80';
  else if (pct >= WARN_50) level = 'warn-50';
  return { enabled: true, pct, level, cap, spend };
}

/** True when a classification should hard-block the next spawn (enforce mode + level 'halt'). */
function shouldHalt(classification, enforcementMode) {
  return !!classification && classification.level === 'halt' && enforcementMode === 'enforce';
}

/** A one-line human message for a non-'ok' level (null when ok). */
function capMessage(c) {
  if (!c || !c.enabled || c.level === 'ok') return null;
  const pct = c.pct.toFixed(0);
  if (c.level === 'halt') {
    return `project budget cap reached: $${c.spend.toFixed(2)} / $${c.cap.toFixed(2)} (${pct}%) — halting before the next agent spawn`;
  }
  return `project budget at ${pct}%: $${c.spend.toFixed(2)} / $${c.cap.toFixed(2)}`;
}

module.exports = { classifyProjectBudget, shouldHalt, capMessage, WARN_50, WARN_80, HALT_100 };
