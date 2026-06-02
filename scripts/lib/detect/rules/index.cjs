'use strict';
// Phase 41 — rule registry. Loads every scripts/lib/detect/rules/ban-NN.cjs and exposes the
// matcher-exempt set (subjective BAN rules with no static matcher: BAN-04 behavior, BAN-10 DOM-depth).

const r0 = require('./ban-01.cjs');
const r1 = require('./ban-02.cjs');
const r2 = require('./ban-03.cjs');
const r3 = require('./ban-05.cjs');
const r4 = require('./ban-06.cjs');
const r5 = require('./ban-07.cjs');
const r6 = require('./ban-08.cjs');
const r7 = require('./ban-09.cjs');
const r8 = require('./ban-11.cjs');
const r9 = require('./ban-12.cjs');
const r10 = require('./ban-13.cjs');

const RULES = [r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10];
// Subjective BAN rules documented in reference/anti-patterns.md but NOT statically detectable.
const EXEMPT = Object.freeze(['BAN-04', 'BAN-10']);

module.exports = { RULES, EXEMPT };
