'use strict';
/**
 * scripts/lib/motion/validate-motion.cjs — Phase 36.2 motion-export validator.
 *
 * Pure + dep-free (D-01): zero `require`, no Lottie/Rive runtime. Deterministic — same
 * input → same output (hermetic tests, D-06). Every finding is a WARNING, never a hard
 * error (D-02: motion is creative, not contractually broken) — the caller decides whether
 * a `must_have` escalates it.
 *
 * - validateLottie(json, {bytes?, budgetBytes?}) → {ok, warnings:[{rule,detail}], info}
 *     structural + perf sanity on a Lottie JSON (parsed object OR string).
 * - motionBudget(bytes, budgetBytes?) → {rule:'MO-BUDGET', detail} | null  (shared by Lottie + Rive)
 * - riveHeader(headerBytes) → boolean   (cheap .riv magic-byte sanity; the deep state-machine
 *     graph needs the Rive runtime — out of pure-JS reach, D-04)
 *
 * Rules: MO-PARSE, MO-FR, MO-DUR, MO-LAYERS, MO-IMG, MO-BUDGET.
 */

const DEFAULT_BUDGET_BYTES = 200 * 1024; // 200 KB — D-05 fallback when config has no motion_budget_kb

function motionBudget(bytes, budgetBytes = DEFAULT_BUDGET_BYTES) {
  if (typeof bytes !== 'number' || !isFinite(bytes) || bytes < 0) return null;
  if (bytes > budgetBytes) {
    return { rule: 'MO-BUDGET', detail: `motion bundle ${(bytes / 1024).toFixed(1)}KB exceeds budget ${(budgetBytes / 1024).toFixed(0)}KB` };
  }
  return null;
}

function validateLottie(input, opts = {}) {
  let j;
  if (typeof input === 'string') {
    try { j = JSON.parse(input); } catch (e) {
      return { ok: false, warnings: [{ rule: 'MO-PARSE', detail: 'not valid JSON' }], info: {} };
    }
  } else if (input && typeof input === 'object') {
    j = input;
  } else {
    return { ok: false, warnings: [{ rule: 'MO-PARSE', detail: 'no input' }], info: {} };
  }

  // Lottie signature: version `v`, framerate `fr`, in/out points `ip`/`op`, `layers` array.
  const isLottie = j && typeof j === 'object' && 'v' in j && 'fr' in j && Array.isArray(j.layers);
  if (!isLottie) {
    return { ok: false, warnings: [{ rule: 'MO-PARSE', detail: 'not a Lottie document (missing v / fr / layers)' }], info: {} };
  }

  const warnings = [];
  const fr = Number(j.fr);
  const ip = Number(j.ip);
  const op = Number(j.op);
  const layers = j.layers.length;

  if (!(fr > 0) || fr > 120) warnings.push({ rule: 'MO-FR', detail: `frame rate ${j.fr} is outside the sane 1-120 range` });
  if (!(op > ip)) warnings.push({ rule: 'MO-DUR', detail: `non-positive duration (ip=${j.ip}, op=${j.op})` });
  if (layers > 200) warnings.push({ rule: 'MO-LAYERS', detail: `${layers} layers — high; review runtime cost` });

  // Embedded raster assets bloat the bundle — a Lottie asset with an inline data URI in `p`.
  const assets = Array.isArray(j.assets) ? j.assets : [];
  const embedded = assets.filter((a) => a && typeof a.p === 'string' && /^data:/.test(a.p)).length;
  if (embedded > 0) warnings.push({ rule: 'MO-IMG', detail: `${embedded} embedded raster asset(s) — prefer external / optimized images` });

  // Perf budget (only when the caller supplies the on-disk byte size).
  if (typeof opts.bytes === 'number') {
    const b = motionBudget(opts.bytes, opts.budgetBytes);
    if (b) warnings.push(b);
  }

  const durationFrames = op - ip;
  return {
    ok: warnings.length === 0,
    warnings,
    info: {
      fr,
      layers,
      durationFrames,
      durationSeconds: fr > 0 ? Number((durationFrames / fr).toFixed(2)) : null,
      embeddedAssets: embedded,
    },
  };
}

function riveHeader(headerBytes) {
  // .riv files begin with the ASCII magic "RIVE". Accept a string or an array of byte values.
  const s = typeof headerBytes === 'string'
    ? headerBytes.slice(0, 4)
    : Array.isArray(headerBytes)
      ? String.fromCharCode.apply(null, headerBytes.slice(0, 4))
      : '';
  return s === 'RIVE';
}

module.exports = { validateLottie, motionBudget, riveHeader, DEFAULT_BUDGET_BYTES };
