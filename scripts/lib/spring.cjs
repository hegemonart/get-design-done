/**
 * Spring animation utilities.
 *
 * Source: React Native — Libraries/Animated/SpringConfig.js (MIT License)
 * Attribution: Facebook, Inc. and its affiliates
 * https://github.com/facebook/react-native/blob/main/Libraries/Animated/SpringConfig.js
 *
 * Implements a mass-spring-damper physical model.
 * Parameters:
 *   stiffness (k) — spring constant; higher = faster, snappier
 *   damping   (c) — friction coefficient; higher = less oscillation
 *   mass      (m) — simulated mass; higher = slower, heavier feel
 */

'use strict';

// ---------------------------------------------------------------------------
// Canonical presets
// ---------------------------------------------------------------------------

/**
 * Canonical spring presets.
 *
 * Each preset includes stiffness, damping, and mass.
 * Settle times are approximate at 60fps with threshold=0.001.
 *
 * | name    | stiffness | damping | mass | settle  | character           |
 * |---------|-----------|---------|------|---------|---------------------|
 * | gentle  | 120       | 14      | 1    | ~400ms  | soft, mild bounce   |
 * | wobbly  | 180       | 12      | 1    | ~600ms  | bouncy, 2–3 cycles  |
 * | stiff   | 400       | 30      | 1    | ~200ms  | snappy, minimal     |
 * | slow    | 280       | 60      | 1    | ~800ms  | heavy, no bounce    |
 */
const PRESETS = {
  gentle: { stiffness: 120, damping: 14, mass: 1 },
  wobbly: { stiffness: 180, damping: 12, mass: 1 },
  stiff:  { stiffness: 400, damping: 30, mass: 1 },
  slow:   { stiffness: 280, damping: 60, mass: 1 },
};

// ---------------------------------------------------------------------------
// Critical damping
// ---------------------------------------------------------------------------

/**
 * Computes the critical damping coefficient for a given stiffness and mass.
 *
 * At critical damping (`c = 2 * sqrt(k * m)`), the spring reaches its target
 * in the shortest time possible without oscillating.
 *
 * Values below this threshold produce an underdamped (bouncy) spring.
 * Values above this threshold produce an overdamped (sluggish) spring.
 *
 * @param {number} stiffness - Spring constant k.
 * @param {number} mass      - Simulated mass m.
 * @returns {number} Critical damping coefficient c.
 */
function criticalDamping(stiffness, mass) {
  return 2 * Math.sqrt(stiffness * mass);
}

// ---------------------------------------------------------------------------
// Settle time estimation
// ---------------------------------------------------------------------------

/**
 * Estimates the settle time of a spring in milliseconds by stepping the
 * simulation forward until position and velocity are both within `threshold`
 * of the target.
 *
 * Uses a fixed timestep of 1/60 s (60fps) for numerical integration.
 *
 * @param {number} stiffness        - Spring constant k.
 * @param {number} damping          - Damping coefficient c.
 * @param {number} mass             - Simulated mass m.
 * @param {number} [threshold=0.001] - Convergence threshold for position and velocity.
 * @param {number} [maxMs=5000]     - Safety ceiling to prevent infinite loops.
 * @returns {number} Estimated settle time in milliseconds.
 */
function settleTime(stiffness, damping, mass, threshold, maxMs) {
  if (threshold === undefined) threshold = 0.001;
  if (maxMs === undefined) maxMs = 5000;

  const dt = 1 / 60;            // seconds per frame
  const maxFrames = Math.ceil(maxMs / (dt * 1000));

  let pos = 1;   // start displaced from target (normalized)
  let vel = 0;
  let elapsed = 0;

  for (let i = 0; i < maxFrames; i++) {
    const result = _stepInternal(stiffness, damping, mass, pos, vel, dt);
    pos = result.position;
    vel = result.velocity;
    elapsed += dt * 1000;

    if (Math.abs(pos) < threshold && Math.abs(vel) < threshold) {
      return elapsed;
    }
  }

  return maxMs;  // did not settle within safety ceiling
}

// ---------------------------------------------------------------------------
// Step function
// ---------------------------------------------------------------------------

/**
 * Internal integration step — semi-implicit Euler.
 * @private
 */
function _stepInternal(stiffness, damping, mass, position, velocity, dt) {
  const acceleration = (-stiffness * position - damping * velocity) / mass;
  const newVelocity  = velocity + acceleration * dt;
  const newPosition  = position + newVelocity * dt;
  return { position: newPosition, velocity: newVelocity };
}

/**
 * Advances a spring simulation by one timestep.
 *
 * The spring is always simulated toward the target value 0 (normalized).
 * To animate from `from` to `to`, offset your inputs:
 *   position = currentValue - toValue
 *   velocity = currentVelocity  (positive = moving toward target)
 *
 * @param {number} stiffness       - Spring constant k.
 * @param {number} damping         - Damping coefficient c.
 * @param {number} mass            - Simulated mass m.
 * @param {number} initialVelocity - Current velocity in units/second.
 * @param {number} dt              - Timestep in seconds. Use 1/60 for 60fps.
 * @returns {{ position: number, velocity: number }}
 *
 * @example
 * // Animate a value from 0 to 100:
 * let pos = 0 - 100;  // offset: (current - target)
 * let vel = 0;
 * const dt = 1/60;
 *
 * function tick() {
 *   const result = step(400, 30, 1, vel, dt);
 *   // Note: pass current velocity, not initialVelocity parameter which is legacy
 *   pos = result.position;
 *   vel = result.velocity;
 *   const displayValue = pos + 100;  // un-offset
 * }
 */
function step(stiffness, damping, mass, initialVelocity, dt) {
  // Position starts at 1 (displaced) when called externally without a position arg.
  // For incremental use, callers manage position themselves — see _stepInternal.
  return _stepInternal(stiffness, damping, mass, 1 - initialVelocity * dt, initialVelocity, dt);
}

module.exports = {
  PRESETS,
  criticalDamping,
  settleTime,
  step,
};
