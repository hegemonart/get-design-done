'use strict';
/**
 * tests/privacy-diff.test.cjs — Plan 30-07 D-09 update integrity surface.
 *
 * Covers scripts/lib/issue-reporter/privacy-diff.cjs:
 *   - computePrivacyDiff(oldRoot, newRoot) — structured diff
 *   - renderPrivacyDiff(diff)              — markdown render
 *   - shouldAutoShow(prev, curr, ...)      — auto-show predicate
 *   - snapshotPath                         — constant contract
 *
 * Fixtures live under tests/fixtures/privacy-diff/{old,new}/scripts/lib/...
 * They are STUB modules — only their textual contents matter; privacy-diff
 * reads them as strings via fs.readFileSync and never executes them.
 *
 * The fixture tree lives OUTSIDE the network-isolation scanner's bounded
 * tree (skills/report-issue/, scripts/lib/pseudonymize.cjs,
 * scripts/lib/issue-reporter/) so the fixture destination.cjs files may
 * legitimately contain `https` URL literals.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const pd = require('../../scripts/lib/issue-reporter/privacy-diff.cjs');

const OLD_ROOT = path.join(__dirname, 'fixtures', 'privacy-diff', 'old');
const NEW_ROOT = path.join(__dirname, 'fixtures', 'privacy-diff', 'new');

test('30-07: rendering — summary line is present and structured', () => {
  const diff = pd.computePrivacyDiff(OLD_ROOT, NEW_ROOT);
  const out = pd.renderPrivacyDiff(diff);
  assert.ok(out.includes('rules added/changed in pseudonymization'), 'summary mentions rules');
  assert.ok(out.includes('characters changed in disclaimer'), 'summary mentions disclaimer');
  assert.ok(
    out.includes('destination URL CHANGED') || out.includes('no change to destination URL'),
    'summary mentions destination URL'
  );
});

test('30-07: rendering — per-file sections are present', () => {
  const diff = pd.computePrivacyDiff(OLD_ROOT, NEW_ROOT);
  const out = pd.renderPrivacyDiff(diff);
  assert.ok(out.includes('## scripts/lib/pseudonymize.cjs'), 'pseudonymize section header missing');
  assert.ok(
    out.includes('## scripts/lib/issue-reporter/payload-assembly.cjs'),
    'payload-assembly section header missing'
  );
  assert.ok(
    out.includes('## scripts/lib/issue-reporter/destination.cjs'),
    'destination section header missing'
  );
});

test('30-07: rendering — added/removed rules appear as +/- lines', () => {
  const diff = pd.computePrivacyDiff(OLD_ROOT, NEW_ROOT);
  const out = pd.renderPrivacyDiff(diff);
  // Locate the pseudonymize section + the next ## header (start of next section).
  const pseudoHeader = '## scripts/lib/pseudonymize.cjs';
  const nextHeader = '## scripts/lib/issue-reporter/payload-assembly.cjs';
  const pseudoIdx = out.indexOf(pseudoHeader);
  const nextIdx = out.indexOf(nextHeader);
  assert.ok(pseudoIdx >= 0 && nextIdx > pseudoIdx, 'sections must be ordered');
  const pseudoSection = out.slice(pseudoIdx, nextIdx);
  // The OLD fixture has /\/home\/[a-z]+/gi which is removed in NEW → `- ` line.
  // The NEW fixture adds /\\\\Users.../ which appears as `+ ` line.
  assert.ok(/\n\+ /.test(pseudoSection), 'expected at least one added (+) rule line');
  assert.ok(/\n- /.test(pseudoSection), 'expected at least one removed (-) rule line');
});

test('30-07: rendering — disclaimer diff shows old and new strings', () => {
  const diff = pd.computePrivacyDiff(OLD_ROOT, NEW_ROOT);
  const out = pd.renderPrivacyDiff(diff);
  assert.ok(out.includes('OLD: Это псевдонимизация.'), 'old RU disclaimer text missing');
  assert.ok(out.includes('NEW: Это псевдонимизация'), 'new RU disclaimer text missing');
  assert.ok(out.includes('OLD: This is pseudonymization.'), 'old EN disclaimer text missing');
  assert.ok(out.includes('NEW: This is pseudonymization'), 'new EN disclaimer text missing');
});

test('30-07: rendering — destination diff shows old and new URLs', () => {
  const diff = pd.computePrivacyDiff(OLD_ROOT, NEW_ROOT);
  const out = pd.renderPrivacyDiff(diff);
  assert.ok(out.includes('old-owner/old-repo'), 'old URL substring missing');
  assert.ok(out.includes('hegemonart/hone'), 'new URL substring missing');
});

test('30-07: shouldAutoShow — prevVersion null → false', () => {
  assert.strictEqual(pd.shouldAutoShow(null, '1.30.0', OLD_ROOT, NEW_ROOT), false);
});

test('30-07: shouldAutoShow — prevVersion empty string → false', () => {
  assert.strictEqual(pd.shouldAutoShow('', '1.30.0', OLD_ROOT, NEW_ROOT), false);
});

test('30-07: shouldAutoShow — prevVersion === currentVersion → false (no upgrade)', () => {
  assert.strictEqual(pd.shouldAutoShow('1.30.0', '1.30.0', OLD_ROOT, NEW_ROOT), false);
});

test('30-07: shouldAutoShow — relevant change detected → true', () => {
  assert.strictEqual(pd.shouldAutoShow('1.29.0', '1.30.0', OLD_ROOT, NEW_ROOT), true);
});

test('30-07: shouldAutoShow — identical roots, different versions → false (no relevant change)', () => {
  // NEW_ROOT on both sides → no file content delta; even though version bumped.
  assert.strictEqual(pd.shouldAutoShow('1.29.0', '1.30.0', NEW_ROOT, NEW_ROOT), false);
});

test('30-07: computePrivacyDiff — summary counts match the actual changes', () => {
  const diff = pd.computePrivacyDiff(OLD_ROOT, NEW_ROOT);
  assert.strictEqual(
    diff.summary.rulesChanged,
    diff.rules.added.length + diff.rules.removed.length,
    'summary.rulesChanged must equal added + removed'
  );
  const expectedCharDelta =
    Math.abs(diff.disclaimer.newRu.length - diff.disclaimer.oldRu.length) +
    Math.abs(diff.disclaimer.newEn.length - diff.disclaimer.oldEn.length);
  assert.strictEqual(diff.summary.disclaimerCharDelta, expectedCharDelta, 'disclaimer charDelta math');
  assert.strictEqual(diff.summary.destinationChanged, true, 'fixtures differ on destination URL');
  assert.ok(diff.rules.added.length >= 2, 'fixtures encode >=2 added rules');
  assert.ok(diff.rules.removed.length >= 1, 'fixtures encode >=1 removed rule');
});

test('30-07: computePrivacyDiff — missing files do not throw and flag the section', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'privacy-diff-test-'));
  t.after(() => {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  });
  // The tmp root has NO scripts/lib/... files. Diff against NEW_ROOT.
  let diff;
  assert.doesNotThrow(() => {
    diff = pd.computePrivacyDiff(tmp, NEW_ROOT);
  });
  assert.ok(diff && typeof diff === 'object');
  assert.strictEqual(diff.rules._error, 'file missing', 'rules should flag file missing');
  assert.strictEqual(diff.disclaimer._error, 'file missing', 'disclaimer should flag file missing');
  assert.strictEqual(diff.destination._error, 'file missing', 'destination should flag file missing');
});

test('30-07: snapshotPath — convention is .design/privacy-diff-last-version.txt', () => {
  assert.strictEqual(pd.snapshotPath, '.design/privacy-diff-last-version.txt');
});

test('30-07: rendering — no rule changes renders "No rule changes."', () => {
  // Construct a minimal diff object with empty rule arrays.
  const empty = {
    rules: { added: [], removed: [], changed: [], unchangedCount: 0 },
    disclaimer: {
      ruChanged: false, enChanged: false,
      oldRu: '', newRu: '', oldEn: '', newEn: '', charDelta: 0,
    },
    destination: { changed: false, oldUrl: '', newUrl: '' },
    summary: { rulesChanged: 0, disclaimerCharDelta: 0, destinationChanged: false },
  };
  const out = pd.renderPrivacyDiff(empty);
  assert.ok(out.includes('_No rule changes._'), 'fallback text for empty rule diff missing');
  assert.ok(out.includes('_No disclaimer changes._'), 'fallback text for empty disclaimer diff missing');
  assert.ok(out.includes('_No destination URL change._'), 'fallback text for empty destination diff missing');
});

test('30-07: shouldAutoShow — no relevant changes between different versions → false (using NEW_ROOT twice)', () => {
  // Sanity restatement of the earlier branch but at a different version pair.
  assert.strictEqual(pd.shouldAutoShow('1.28.0', '1.30.0', NEW_ROOT, NEW_ROOT), false);
});

test('30-07: renderPrivacyDiff is deterministic for fixed input', () => {
  const diff1 = pd.computePrivacyDiff(OLD_ROOT, NEW_ROOT);
  const diff2 = pd.computePrivacyDiff(OLD_ROOT, NEW_ROOT);
  assert.deepStrictEqual(diff1, diff2, 'computePrivacyDiff should be deterministic');
  const out1 = pd.renderPrivacyDiff(diff1);
  const out2 = pd.renderPrivacyDiff(diff2);
  assert.strictEqual(out1, out2, 'renderPrivacyDiff should be deterministic');
});
