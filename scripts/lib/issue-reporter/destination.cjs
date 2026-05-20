'use strict';
/**
 * destination.cjs — Phase 30 Plan 30-04 hardcoded destination repo (D-02).
 *
 * Single source of truth for the GitHub repo that /gdd:report-issue
 * submits to. No env-var lookup, no config override, no flag override.
 *
 * Frozen module export → runtime immutability. Static tests in
 * tests/report-issue-destination-static.test.cjs assert that this is
 * the ONLY file under scripts/lib/issue-reporter/ that contains the
 * literal repo string and that no env-var bypass code exists anywhere
 * under the report-issue tree (D-03 belt + suspenders).
 *
 * If you are tempted to add an env var here, read CONTEXT.md D-02 +
 * D-03 first — the static enforcement test will fail your build.
 */

const DESTINATION_REPO = 'hegemonart/get-design-done';

module.exports = Object.freeze({ DESTINATION_REPO });
