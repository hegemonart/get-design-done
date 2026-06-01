'use strict';
// Phase 39.2 — roi.cjs — PURE, dep-free ROI join + table formatter.
//
// The /gdd:roi skill shells `git log` to count, per cycle, commits that SHIPPED (survived >= 14 days
// in main — the ROADMAP "shipped" definition, catching revert-after-bug-discovery) vs commits that
// were REVERTED, and reads per-cycle cost from .design/telemetry/costs.jsonl. It hands the joined rows
// here. This module does ONLY the arithmetic + markdown formatting — no fs, no clock, no git. Pure.
//
// No `require` — pure. Deterministic.

function num(x, label) {
  const n = Number(x);
  if (!Number.isFinite(n)) throw new Error(`roi: ${label} must be a finite number (got ${x})`);
  return n;
}

/**
 * @param {Array<{cycle, costUsd, commitsShipped, commitsReverted}>} cycles
 * @returns {{rows, totals}}
 *   row    — { cycle, costUsd, shipped, reverted, costPerShipped, stickRate }
 *   totals — aggregate across all cycles (same fields, cycle: 'TOTAL')
 *   costPerShipped = costUsd / max(shipped, 1)   (USD per commit that stuck)
 *   stickRate      = shipped / max(shipped + reverted, 1)   (0..1)
 */
function computeRoi(cycles) {
  if (!Array.isArray(cycles)) throw new Error('roi: cycles must be an array');
  const rows = cycles.map((c, i) => {
    if (typeof c !== 'object' || c === null) throw new Error(`roi: cycles[${i}] must be an object`);
    const costUsd = num(c.costUsd, `cycles[${i}].costUsd`);
    const shipped = Math.max(0, Math.trunc(num(c.commitsShipped, `cycles[${i}].commitsShipped`)));
    const reverted = Math.max(0, Math.trunc(num(c.commitsReverted, `cycles[${i}].commitsReverted`)));
    return {
      cycle: String(c.cycle),
      costUsd,
      shipped,
      reverted,
      costPerShipped: costUsd / Math.max(shipped, 1),
      stickRate: shipped / Math.max(shipped + reverted, 1),
    };
  });
  const totCost = rows.reduce((a, r) => a + r.costUsd, 0);
  const totShipped = rows.reduce((a, r) => a + r.shipped, 0);
  const totReverted = rows.reduce((a, r) => a + r.reverted, 0);
  const totals = {
    cycle: 'TOTAL',
    costUsd: totCost,
    shipped: totShipped,
    reverted: totReverted,
    costPerShipped: totCost / Math.max(totShipped, 1),
    stickRate: totShipped / Math.max(totShipped + totReverted, 1),
  };
  return { rows, totals };
}

/** Format a USD value as $X.XX. */
function usd(n) {
  return '$' + num(n, 'usd').toFixed(2);
}

/** Render the ROI result as a GitHub-flavored markdown table. Pure string output. */
function roiTableMarkdown(roi) {
  if (!roi || !Array.isArray(roi.rows)) throw new Error('roi: roiTableMarkdown needs a computeRoi() result');
  const head =
    '| Cycle | Cost | Shipped | Reverted | $/shipped | Stick rate |\n' +
    '|---|---:|---:|---:|---:|---:|';
  const fmt = (r) =>
    `| ${r.cycle} | ${usd(r.costUsd)} | ${r.shipped} | ${r.reverted} | ${usd(r.costPerShipped)} | ${(r.stickRate * 100).toFixed(0)}% |`;
  const body = roi.rows.map(fmt).join('\n');
  const foot = fmt(roi.totals);
  return [head, body, foot].join('\n');
}

module.exports = { computeRoi, roiTableMarkdown, usd };
