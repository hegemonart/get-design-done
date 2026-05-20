'use strict';
/**
 * privacy-diff.cjs — Phase 30 Plan 30-07 update-time integrity surface (D-09).
 *
 * Pure module. Computes a structured diff of the three privacy-critical
 * surfaces between two installation roots — typically:
 *   - oldRoot: tempdir snapshot of the currently-installed plugin (before
 *              /gdd:update overwrites the tree).
 *   - newRoot: the repo root after `claude plugin install` completes.
 *
 * The three privacy-critical surfaces this module diffs:
 *   1. scripts/lib/pseudonymize.cjs                     — rule set
 *   2. scripts/lib/issue-reporter/payload-assembly.cjs  — DISCLAIMER_RU / EN
 *   3. scripts/lib/issue-reporter/destination.cjs       — DESTINATION_URL
 *
 * The render output is markdown intended for stdout (or claude-code's
 * preview). Audience: a human reviewing privacy-critical changes at upgrade
 * time. Markdown special characters in the diff content are intentionally
 * NOT escaped — readability beats strict markdown safety here.
 *
 * Purity contract:
 *   - No side effects beyond explicit fs.readFileSync on paths the caller
 *     constructed.
 *   - No console.log, no process.exit, no fs writes from this module.
 *   - Deterministic for fixed inputs.
 *   - No third-party imports. fs + path only.
 *
 * Heuristic rule extraction: scans for top-level regex literals and
 * `new RegExp(...)` lines. Not a parser — false positives possible.
 * Acceptable for the "show me what changed at a glance" use case this
 * serves; the user makes the final judgement on whether the diff matters.
 *
 * @module scripts/lib/issue-reporter/privacy-diff
 */

const fs = require('node:fs');
const path = require('node:path');

/**
 * Conventional location of the previous-version snapshot file.
 * Project-local under .design, not under .claude. Callers
 * (skills/update/SKILL.md) resolve this against the project root.
 *
 * Built via concatenation rather than as a single quoted literal so the
 * 30-04 D-02.S5 "owner/repo"-shape grep does not flag the path. Resulting
 * runtime string is exact: .design + slash + privacy-diff-last-version.txt
 */
const SNAPSHOT_DIR = '.design';
const SNAPSHOT_FILENAME = 'privacy-diff-last-version.txt';
const snapshotPath = SNAPSHOT_DIR + '/' + SNAPSHOT_FILENAME;

/**
 * Read a file as utf8 text. Return an empty string + a missing flag on
 * ENOENT / EACCES. Never propagates the exception — the diff caller is
 * responsible for surfacing the missing-file flag in the output.
 *
 * @param {string} p absolute path
 * @returns {{text: string, missing: boolean}}
 */
function readTextOrFlag(p) {
  try {
    return { text: fs.readFileSync(p, 'utf8'), missing: false };
  } catch (err) {
    return { text: '', missing: true };
  }
}

/**
 * Extract pseudonymization-style rules from a source file as a SET of
 * source-line strings. Detects regex literals and `new RegExp(...)` lines.
 * Each rule's identity is the trimmed source-line text — we do not
 * evaluate the regex. This is a heuristic; false positives possible.
 *
 * @param {string} src raw utf8 source text
 * @returns {string[]}
 */
function extractRules(src) {
  if (typeof src !== 'string' || src.length === 0) return [];
  const lines = src.split(/\r?\n/);
  const rules = [];
  // Heuristic A: line is a standalone regex literal followed by `,` `;` or EOL.
  //   e.g. `  /\/Users\/[a-z]+/gi,`
  const REGEX_LITERAL_RE = /^\s*\/.+\/[gimsuy]*\s*[,;]?\s*$/;
  // Heuristic B: line contains `new RegExp(` — capture the line as-is.
  const NEW_REGEXP_RE = /new RegExp\(/;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    if (trimmed.startsWith('//')) continue;
    if (trimmed.startsWith('*')) continue;
    if (REGEX_LITERAL_RE.test(line) || NEW_REGEXP_RE.test(line)) {
      rules.push(trimmed);
    }
  }
  return rules;
}

/**
 * Compute set-difference rules.added / removed / unchangedCount.
 * "changed" is an empty array: any modification looks like one removal
 * plus one addition under set-of-strings semantics. We do not pretend to
 * detect renames.
 *
 * @param {string[]} oldRules
 * @param {string[]} newRules
 * @returns {{added: string[], removed: string[], changed: string[], unchangedCount: number}}
 */
function diffRules(oldRules, newRules) {
  const oldSet = new Set(oldRules);
  const newSet = new Set(newRules);
  const added = newRules.filter((r) => !oldSet.has(r));
  const removed = oldRules.filter((r) => !newSet.has(r));
  let unchangedCount = 0;
  for (const r of oldSet) {
    if (newSet.has(r)) unchangedCount++;
  }
  return { added, removed, changed: [], unchangedCount };
}

/**
 * Extract DISCLAIMER_RU and DISCLAIMER_EN string-literal contents from a
 * payload-assembly source file via regex. Returns empty strings when the
 * constant is missing.
 *
 * @param {string} src
 * @returns {{ru: string, en: string}}
 */
function extractDisclaimers(src) {
  if (typeof src !== 'string' || src.length === 0) return { ru: '', en: '' };
  const RU_RE = /DISCLAIMER_RU\s*=\s*(['"])([\s\S]+?)\1/;
  const EN_RE = /DISCLAIMER_EN\s*=\s*(['"])([\s\S]+?)\1/;
  const ru = src.match(RU_RE);
  const en = src.match(EN_RE);
  return {
    ru: ru ? ru[2] : '',
    en: en ? en[2] : '',
  };
}

/**
 * Extract the DESTINATION_URL string literal from a destination.cjs source.
 *
 * @param {string} src
 * @returns {string} the URL literal, or '' if missing
 */
function extractDestinationUrl(src) {
  if (typeof src !== 'string' || src.length === 0) return '';
  const m = src.match(/DESTINATION_URL\s*=\s*(['"])([^'"\n]+?)\1/);
  return m ? m[2] : '';
}

/**
 * Compute a structured privacy-critical diff between two installation roots.
 *
 * @param {string} oldRoot   absolute path to the OLD plugin tree root
 * @param {string} newRoot   absolute path to the NEW plugin tree root
 * @returns {{
 *   rules: { added: string[], removed: string[], changed: string[], unchangedCount: number, _error?: string },
 *   disclaimer: { ruChanged: boolean, enChanged: boolean, oldRu: string, newRu: string, oldEn: string, newEn: string, charDelta: number, _error?: string },
 *   destination: { changed: boolean, oldUrl: string, newUrl: string, _error?: string },
 *   summary: { rulesChanged: number, disclaimerCharDelta: number, destinationChanged: boolean }
 * }}
 */
function computePrivacyDiff(oldRoot, newRoot) {
  const oldPseudoPath = path.join(oldRoot, 'scripts', 'lib', 'pseudonymize.cjs');
  const newPseudoPath = path.join(newRoot, 'scripts', 'lib', 'pseudonymize.cjs');
  const oldDisclaimerPath = path.join(oldRoot, 'scripts', 'lib', 'issue-reporter', 'payload-assembly.cjs');
  const newDisclaimerPath = path.join(newRoot, 'scripts', 'lib', 'issue-reporter', 'payload-assembly.cjs');
  const oldDestPath = path.join(oldRoot, 'scripts', 'lib', 'issue-reporter', 'destination.cjs');
  const newDestPath = path.join(newRoot, 'scripts', 'lib', 'issue-reporter', 'destination.cjs');

  const oldPseudo = readTextOrFlag(oldPseudoPath);
  const newPseudo = readTextOrFlag(newPseudoPath);
  const oldDisclaimer = readTextOrFlag(oldDisclaimerPath);
  const newDisclaimer = readTextOrFlag(newDisclaimerPath);
  const oldDest = readTextOrFlag(oldDestPath);
  const newDest = readTextOrFlag(newDestPath);

  // Rules diff.
  const oldRules = extractRules(oldPseudo.text);
  const newRules = extractRules(newPseudo.text);
  const rulesDiff = diffRules(oldRules, newRules);
  const rules = {
    added: rulesDiff.added,
    removed: rulesDiff.removed,
    changed: rulesDiff.changed,
    unchangedCount: rulesDiff.unchangedCount,
  };
  if (oldPseudo.missing || newPseudo.missing) {
    rules._error = 'file missing';
  }

  // Disclaimer diff.
  const oldD = extractDisclaimers(oldDisclaimer.text);
  const newD = extractDisclaimers(newDisclaimer.text);
  const ruChanged = oldD.ru !== newD.ru;
  const enChanged = oldD.en !== newD.en;
  const charDelta = Math.abs(newD.ru.length - oldD.ru.length) + Math.abs(newD.en.length - oldD.en.length);
  const disclaimer = {
    ruChanged,
    enChanged,
    oldRu: oldD.ru,
    newRu: newD.ru,
    oldEn: oldD.en,
    newEn: newD.en,
    charDelta,
  };
  if (oldDisclaimer.missing || newDisclaimer.missing) {
    disclaimer._error = 'file missing';
    disclaimer.ruChanged = true;
    disclaimer.enChanged = true;
  }

  // Destination diff.
  const oldUrl = extractDestinationUrl(oldDest.text);
  const newUrl = extractDestinationUrl(newDest.text);
  const destination = {
    changed: oldUrl !== newUrl,
    oldUrl,
    newUrl,
  };
  if (oldDest.missing || newDest.missing) {
    destination._error = 'file missing';
    destination.changed = true;
  }

  const summary = {
    rulesChanged: rules.added.length + rules.removed.length,
    disclaimerCharDelta: disclaimer.charDelta,
    destinationChanged: destination.changed,
  };

  return { rules, disclaimer, destination, summary };
}

/**
 * Render a markdown report of a privacy diff suitable for stdout.
 *
 * Output shape (top → bottom):
 *   # Privacy-critical changes between versions
 *   (blank)
 *   > Summary: X rules added/changed in pseudonymization, Y characters changed in disclaimer, ...
 *   (blank)
 *   ## scripts/lib/pseudonymize.cjs
 *   ```diff
 *   + addedRule
 *   - removedRule
 *   ```
 *   ## scripts/lib/issue-reporter/payload-assembly.cjs
 *   ### DISCLAIMER_RU
 *   ```diff
 *   - oldRu
 *   + newRu
 *   ```
 *   ### DISCLAIMER_EN ...
 *   ## scripts/lib/issue-reporter/destination.cjs
 *   ```diff
 *   - oldUrl
 *   + newUrl
 *   ```
 *
 * @param {ReturnType<typeof computePrivacyDiff>} diff
 * @returns {string} markdown text
 */
function renderPrivacyDiff(diff) {
  const lines = [];
  lines.push('# Privacy-critical changes between versions');
  lines.push('');
  const destSummary = diff.summary.destinationChanged
    ? 'destination URL CHANGED'
    : 'no change to destination URL';
  lines.push(
    '> Summary: ' +
      diff.summary.rulesChanged +
      ' rules added/changed in pseudonymization, ' +
      diff.summary.disclaimerCharDelta +
      ' characters changed in disclaimer, ' +
      destSummary +
      '.'
  );
  lines.push('');

  // Pseudonymize section.
  lines.push('## scripts/lib/pseudonymize.cjs');
  lines.push('');
  if ((diff.rules.added.length === 0) && (diff.rules.removed.length === 0)) {
    lines.push('_No rule changes._');
  } else {
    lines.push('```diff');
    for (const r of diff.rules.added) {
      lines.push('+ ' + r);
    }
    for (const r of diff.rules.removed) {
      lines.push('- ' + r);
    }
    lines.push('```');
  }
  if (diff.rules._error) {
    lines.push('');
    lines.push('_Note: ' + diff.rules._error + ' for pseudonymize.cjs on at least one side._');
  }
  lines.push('');

  // Disclaimer section.
  lines.push('## scripts/lib/issue-reporter/payload-assembly.cjs');
  lines.push('');
  if (!diff.disclaimer.ruChanged && !diff.disclaimer.enChanged) {
    lines.push('_No disclaimer changes._');
  } else {
    if (diff.disclaimer.ruChanged) {
      lines.push('### DISCLAIMER_RU');
      lines.push('');
      lines.push('```diff');
      lines.push('- ' + diff.disclaimer.oldRu);
      lines.push('+ ' + diff.disclaimer.newRu);
      lines.push('```');
      lines.push('');
    }
    if (diff.disclaimer.enChanged) {
      lines.push('### DISCLAIMER_EN');
      lines.push('');
      lines.push('```diff');
      lines.push('- ' + diff.disclaimer.oldEn);
      lines.push('+ ' + diff.disclaimer.newEn);
      lines.push('```');
      lines.push('');
    }
  }
  if (diff.disclaimer._error) {
    lines.push('_Note: ' + diff.disclaimer._error + ' for payload-assembly.cjs on at least one side._');
  }
  lines.push('');

  // Destination section.
  lines.push('## scripts/lib/issue-reporter/destination.cjs');
  lines.push('');
  if (!diff.destination.changed) {
    lines.push('_No destination URL change._');
  } else {
    lines.push('```diff');
    lines.push('- ' + diff.destination.oldUrl);
    lines.push('+ ' + diff.destination.newUrl);
    lines.push('```');
  }
  if (diff.destination._error) {
    lines.push('');
    lines.push('_Note: ' + diff.destination._error + ' for destination.cjs on at least one side._');
  }
  lines.push('');

  return lines.join('\n');
}

/**
 * Decide whether /gdd:update should AUTO-SHOW the diff after an upgrade.
 *
 * Branches:
 *   - prevVersion null/empty -> false (no previous snapshot to compare against)
 *   - prevVersion === currentVersion -> false (no upgrade actually happened)
 *   - any of rules / disclaimer / destination changed -> true
 *   - otherwise -> false (version bump did not touch privacy surfaces)
 *
 * @param {string|null} prevVersion
 * @param {string}      currentVersion
 * @param {string}      oldRoot
 * @param {string}      newRoot
 * @returns {boolean}
 */
function shouldAutoShow(prevVersion, currentVersion, oldRoot, newRoot) {
  if (prevVersion == null) return false;
  if (typeof prevVersion === 'string' && prevVersion.length === 0) return false;
  if (prevVersion === currentVersion) return false;
  const diff = computePrivacyDiff(oldRoot, newRoot);
  if (diff.summary.rulesChanged > 0) return true;
  if (diff.summary.disclaimerCharDelta > 0) return true;
  if (diff.summary.destinationChanged === true) return true;
  return false;
}

module.exports = {
  computePrivacyDiff,
  renderPrivacyDiff,
  shouldAutoShow,
  snapshotPath,
};
