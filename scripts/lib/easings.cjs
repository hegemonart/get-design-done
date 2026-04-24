/**
 * Easing functions for web animation.
 *
 * Source: React Native — Libraries/Animated/Easing.js (MIT License)
 * Attribution: Facebook, Inc. and its affiliates
 * https://github.com/facebook/react-native/blob/main/Libraries/Animated/Easing.js
 *
 * Each function accepts t in [0, 1] and returns a value in [0, 1]
 * (elastic/back/bounce may transiently exceed [0,1] for overshoot).
 */

'use strict';

/**
 * A linear function, `f(t) = t`. Position correlates to elapsed time one to one.
 */
function linear(t) {
  return t;
}

/**
 * A quadratic function, `f(t) = t * t`. Position equals the square of elapsed time.
 */
function quad(t) {
  return t * t;
}

/**
 * A cubic function, `f(t) = t * t * t`. Position equals the cube of elapsed time.
 */
function cubic(t) {
  return t * t * t;
}

/**
 * A power function. Position is equal to the Nth power of elapsed time.
 * @param {number} n - The exponent.
 * @returns {function(number): number}
 */
function poly(n) {
  return function (t) {
    return Math.pow(t, n);
  };
}

/**
 * A sinusoidal function.
 */
function sin(t) {
  return 1 - Math.cos((t * Math.PI) / 2);
}

/**
 * A circular function.
 */
function circle(t) {
  return 1 - Math.sqrt(1 - t * t);
}

/**
 * An exponential function.
 */
function exp(t) {
  return Math.pow(2, 10 * (t - 1));
}

/**
 * A spring-like elastic function that overshoots its target value one or more times.
 *
 * @param {number} bounciness - Amplitude of overshoot. Default 1.
 * @param {number} speed      - Controls oscillation frequency. Default 1.
 * @returns {function(number): number}
 */
function elastic(bounciness, speed) {
  if (bounciness === undefined) bounciness = 1;
  if (speed === undefined) speed = 1;

  const p = (bounciness === 0)
    ? Math.PI / 2
    : Math.asin(1 / (bounciness = Math.max(1, bounciness)));

  const s = (bounciness / 10) * 0.3 * (speed / 10) || 0.3;

  return function (t) {
    if (t === 0) return 0;
    if (t === 1) return 1;
    return (
      bounciness *
      Math.pow(2, -10 * t) *
      Math.sin(((t - s / 4) * (2 * Math.PI)) / s) +
      1
    );
  };
}

/**
 * Use with `Easing.out` for an overshoot effect. Default s = 1.70158.
 * @param {number} s - Overshoot magnitude.
 * @returns {function(number): number}
 */
function back(s) {
  if (s === undefined) s = 1.70158;
  return function (t) {
    return t * t * ((s + 1) * t - s);
  };
}

/**
 * Provides a bouncing effect.
 * @param {number} t
 * @returns {number}
 */
function bounce(t) {
  if (t < 1 / 2.75) {
    return 7.5625 * t * t;
  } else if (t < 2 / 2.75) {
    const t2 = t - 1.5 / 2.75;
    return 7.5625 * t2 * t2 + 0.75;
  } else if (t < 2.5 / 2.75) {
    const t2 = t - 2.25 / 2.75;
    return 7.5625 * t2 * t2 + 0.9375;
  } else {
    const t2 = t - 2.625 / 2.75;
    return 7.5625 * t2 * t2 + 0.984375;
  }
}

/**
 * Provides a raw cubic Bézier easing matching the CSS `cubic-bezier()` primitive.
 *
 * Implements the same algorithm as CSS Transitions spec (De Casteljau + Newton-Raphson solve).
 *
 * @param {number} x1
 * @param {number} y1
 * @param {number} x2
 * @param {number} y2
 * @returns {function(number): number}
 */
function bezier(x1, y1, x2, y2) {
  const NEWTON_ITERATIONS = 4;
  const NEWTON_MIN_SLOPE = 0.001;
  const SUBDIVISION_PRECISION = 0.0000001;
  const SUBDIVISION_MAX_ITERATIONS = 10;
  const kSplineTableSize = 11;
  const kSampleStepSize = 1.0 / (kSplineTableSize - 1.0);

  function A(a1, a2) { return 1.0 - 3.0 * a2 + 3.0 * a1; }
  function B(a1, a2) { return 3.0 * a2 - 6.0 * a1; }
  function C(a1)     { return 3.0 * a1; }

  function calcBezier(t, a1, a2) {
    return ((A(a1, a2) * t + B(a1, a2)) * t + C(a1)) * t;
  }

  function getSlope(t, a1, a2) {
    return 3.0 * A(a1, a2) * t * t + 2.0 * B(a1, a2) * t + C(a1);
  }

  function binarySubdivide(x, a, b) {
    let currentX, currentT, i = 0;
    do {
      currentT = a + (b - a) / 2.0;
      currentX = calcBezier(currentT, x1, x2) - x;
      if (currentX > 0.0) b = currentT;
      else a = currentT;
    } while (Math.abs(currentX) > SUBDIVISION_PRECISION && ++i < SUBDIVISION_MAX_ITERATIONS);
    return currentT;
  }

  function newtonRaphsonIterate(x, guessT) {
    for (let i = 0; i < NEWTON_ITERATIONS; ++i) {
      const currentSlope = getSlope(guessT, x1, x2);
      if (currentSlope === 0.0) return guessT;
      const currentX = calcBezier(guessT, x1, x2) - x;
      guessT -= currentX / currentSlope;
    }
    return guessT;
  }

  // Precompute sample table
  const sampleValues = new Float32Array(kSplineTableSize);
  if (x1 !== y1 || x2 !== y2) {
    for (let i = 0; i < kSplineTableSize; ++i) {
      sampleValues[i] = calcBezier(i * kSampleStepSize, x1, x2);
    }
  }

  function getTForX(x) {
    let intervalStart = 0.0;
    let currentSample = 1;
    const lastSample = kSplineTableSize - 1;

    for (; currentSample !== lastSample && sampleValues[currentSample] <= x; ++currentSample) {
      intervalStart += kSampleStepSize;
    }
    --currentSample;

    const dist = (x - sampleValues[currentSample]) / (sampleValues[currentSample + 1] - sampleValues[currentSample]);
    const guessForT = intervalStart + dist * kSampleStepSize;
    const initialSlope = getSlope(guessForT, x1, x2);

    if (initialSlope >= NEWTON_MIN_SLOPE) {
      return newtonRaphsonIterate(x, guessForT);
    } else if (initialSlope === 0.0) {
      return guessForT;
    } else {
      return binarySubdivide(x, intervalStart, intervalStart + kSampleStepSize);
    }
  }

  return function (t) {
    if (x1 === y1 && x2 === y2) return t; // linear shortcut
    if (t === 0) return 0;
    if (t === 1) return 1;
    return calcBezier(getTForX(t), y1, y2);
  };
}

// ---------------------------------------------------------------------------
// Higher-order composition wrappers
// ---------------------------------------------------------------------------

/**
 * Runs an easing function forwards (ease-in direction).
 * `in(f)(t) = f(t)`
 *
 * @param {function(number): number} easing
 * @returns {function(number): number}
 */
function _in(easing) {
  return easing;
}

/**
 * Runs an easing function backwards. Useful to apply ease-out variants.
 * `out(f)(t) = 1 - f(1 - t)`
 *
 * @param {function(number): number} easing
 * @returns {function(number): number}
 */
function out(easing) {
  return function (t) {
    return 1 - easing(1 - t);
  };
}

/**
 * Makes any easing function symmetrical. The easing function will run
 * forwards for half of the duration, then backwards for the rest of
 * the duration.
 * `inOut(f)(t) = t < 0.5 ? f(2t)/2 : 1 - f(2(1-t))/2`
 *
 * @param {function(number): number} easing
 * @returns {function(number): number}
 */
function inOut(easing) {
  return function (t) {
    if (t < 0.5) {
      return easing(t * 2) / 2;
    }
    return 1 - easing((1 - t) * 2) / 2;
  };
}

module.exports = {
  linear,
  quad,
  cubic,
  poly,
  sin,
  circle,
  exp,
  elastic,
  back,
  bounce,
  bezier,
  in: _in,
  out,
  inOut,
};
