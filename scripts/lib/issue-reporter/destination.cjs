'use strict';
/**
 * destination.cjs — Phase 30 Plans 30-04 + 30-07 hardcoded destination (D-02).
 *
 * Single source of truth for the GitHub repo that /hone:report-issue
 * submits to. No env-var lookup, no config override, no flag override.
 *
 * Frozen module export -> runtime immutability. Static tests in
 * tests/report-issue-destination-static.test.cjs assert that this is
 * the ONLY file under scripts/lib/issue-reporter/ that contains the
 * literal repo string and that no env-var bypass code exists anywhere
 * under the report-issue tree (D-03 belt + suspenders).
 *
 * SOLE FILE allowed to contain the destination URL literal under the
 * scanned tree. CI gate (tests/issue-reporter-network-isolation.test.cjs,
 * Plan 30-07) whitelists this exact path. Any other file under
 * skills/report-issue/, scripts/lib/pseudonymize.cjs, or
 * scripts/lib/issue-reporter/ that contains the URL literal fails
 * the build. The carrier-comment above MUST NOT be removed from this
 * file: it tells future maintainers why the static-analysis exemption
 * exists.
 *
 * If you are tempted to add an env var here, read CONTEXT.md D-02 +
 * D-03 first — the static enforcement test will fail your build.
 */

const DESTINATION_OWNER = 'hegemonart';
const DESTINATION_REPO  = 'hegemonart/hone';
const DESTINATION_URL   = 'https://github.com/hegemonart/hone';
const ISSUE_TEMPLATE_URL = 'https://github.com/hegemonart/hone/issues/new?template=bug_report.md';

module.exports = Object.freeze({
  DESTINATION_OWNER,
  DESTINATION_REPO,
  DESTINATION_URL,
  ISSUE_TEMPLATE_URL,
});
