// Phase 44 - harness freshness (shippable pure module). Read by health-mirror + check-harness-freshness.cjs.
'use strict';

const { readHarnesses } = require('./manifest/index.cjs');

const WARN_DAYS = 60;
const FAIL_DAYS = 180;
const MS_PER_DAY = 86400000;

/**
 * Returns the age of a last_verified timestamp in fractional days.
 * Returns Infinity when the timestamp is absent or unparseable.
 * @param {string|null|undefined} last_verified
 * @param {number} nowMs
 * @returns {number}
 */
function ageInDays(last_verified, nowMs) {
  if (!last_verified) return Infinity;
  const t = Date.parse(last_verified);
  if (!Number.isFinite(t)) return Infinity;
  return (nowMs - t) / MS_PER_DAY;
}

/**
 * Evaluate freshness for every harness in the manifest (or a supplied list).
 *
 * STATUS-AWARE (D-04): only `tested` harnesses can warn/fail on a stale
 * last_verified date.  experimental / untested / known-broken harnesses
 * make no freshness promise — their freshness is always 'n/a'.
 *
 * @param {{ nowMs?: number, harnesses?: object[] }} [opts]
 * @returns {{ id: string, status: string, last_verified: string|null, age_days: number|null, freshness: string }[]}
 */
function checkFreshness({ nowMs, harnesses } = {}) {
  const list = harnesses || readHarnesses().harnesses || [];
  const now = typeof nowMs === 'number' ? nowMs : Date.now();

  return list.map((h) => {
    const status = (h.capability_matrix && h.capability_matrix.status) || 'untested';
    const age = ageInDays(h.last_verified, now);

    // Only `tested` harnesses carry a freshness obligation.
    // All other statuses → 'n/a' (never a build failure).
    let freshness = 'n/a';
    if (status === 'tested') {
      freshness = age >= FAIL_DAYS ? 'fail' : age >= WARN_DAYS ? 'warn' : 'ok';
    }

    return {
      id: h.id,
      status,
      last_verified: h.last_verified || null,
      age_days: Number.isFinite(age) ? Math.floor(age) : null,
      freshness,
    };
  });
}

module.exports = { checkFreshness, ageInDays, WARN_DAYS, FAIL_DAYS };
