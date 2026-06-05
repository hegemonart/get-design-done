'use strict';

/**
 * scripts/lib/install/doctor-cursor-marketplace.cjs — Phase 28.8 (Plan B2).
 *
 * Cursor Marketplace doctor-mode reporter. Pure, read-only function that
 * surfaces the maintainer's local Cursor Marketplace publish state to
 * `scripts/install.cjs --doctor`.
 *
 * Phase 28.8 D-16: Cursor Marketplace is multi-step publish (submit →
 * review → publish). This reporter reads `.cursor-plugin/plugin.json`
 * (shipped artifact, B1) and the maintainer-local
 * `.cursor-plugin/marketplace-state.json` (gitignored — local-only,
 * never committed) and emits a structured status. Read-only; no writes,
 * no network. Tmpdir-safe per D-10.
 *
 * Design pattern (for Plan 28-8-C2 + 28-8-X2 to mirror): each Tier-2
 * channel ships its own pure reporter; the aggregator in install.cjs
 * (Plan B2 today, X2 in the final wave) composes them. B2's reporter
 * has no dependencies on other channels' state — the aggregator is the
 * only knowledge boundary that needs C2 + B2 awareness.
 *
 * Exports:
 *   - `reportCursorMarketplace({ projectRoot })` — structured status.
 *   - `MARKETPLACE_STATES` — frozen enum of the 4 D-16 status values.
 *   - `formatCursorMarketplaceReport(report)` — text formatter (also used
 *     by install.cjs --doctor; kept here so all rendering logic stays
 *     adjacent to the data shape).
 *   - `validateManifest(parsedManifest)` — light shape validator for the
 *     parsed manifest. Mirrors B1's `buildManifest` defensive throws but
 *     in inverse direction (validate parsed → not assemble from sources).
 *     Separate from B1's converter because that one constructs manifests
 *     from canonical sources; the doctor receives a possibly-stale or
 *     hand-edited manifest from disk.
 */

const fs = require('node:fs');
const path = require('node:path');

const MARKETPLACE_STATES = Object.freeze({
  NOT_SUBMITTED: 'not-submitted',
  SUBMITTED_PENDING: 'submitted-pending',
  APPROVED_PUBLISHED: 'approved-published',
  REJECTED: 'rejected',
});

const KNOWN_STATUS_VALUES = new Set([
  MARKETPLACE_STATES.NOT_SUBMITTED,
  MARKETPLACE_STATES.SUBMITTED_PENDING,
  MARKETPLACE_STATES.APPROVED_PUBLISHED,
  MARKETPLACE_STATES.REJECTED,
]);

/**
 * Validate a parsed `.cursor-plugin/plugin.json` object against the
 * 8-field shape B1 emits. Returns `{valid, errors}` — never throws.
 *
 * @param {*} parsed                                  Parsed JSON object.
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateManifest(parsed) {
  const errors = [];
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { valid: false, errors: ['manifest is not a JSON object'] };
  }

  if (typeof parsed.name !== 'string' || parsed.name.length === 0) {
    errors.push('name must be a non-empty string');
  }
  if (typeof parsed.description !== 'string' || parsed.description.length === 0) {
    errors.push('description must be a non-empty string');
  }
  if (typeof parsed.version !== 'string' || !/^\d+\.\d+\.\d+/.test(parsed.version)) {
    errors.push('version must be semver-shaped (x.y.z)');
  }
  if (
    !parsed.author
    || typeof parsed.author !== 'object'
    || Array.isArray(parsed.author)
    || typeof parsed.author.name !== 'string'
    || parsed.author.name.length === 0
  ) {
    errors.push('author.name must be a non-empty string');
  }
  if (!Array.isArray(parsed.keywords) || parsed.keywords.length === 0) {
    errors.push('keywords must be a non-empty array');
  } else {
    for (const k of parsed.keywords) {
      if (typeof k !== 'string' || k.length === 0) {
        errors.push('keywords must contain only non-empty strings');
        break;
      }
    }
  }

  // Optional fields, but if present must match shape.
  if (parsed.homepage !== undefined && typeof parsed.homepage !== 'string') {
    errors.push('homepage must be a string if present');
  }
  if (parsed.repository !== undefined && typeof parsed.repository !== 'string') {
    errors.push('repository must be a string if present');
  }
  if (parsed.license !== undefined && typeof parsed.license !== 'string') {
    errors.push('license must be a string if present');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Safely read + parse a JSON file. Returns `{exists, parsed, error}`.
 * @param {string} filePath
 * @returns {{ exists: boolean, parsed: *, error: string|null }}
 */
function readJsonFileSafe(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    if (e && e.code === 'ENOENT') {
      return { exists: false, parsed: null, error: null };
    }
    return { exists: false, parsed: null, error: 'read failed: ' + e.message };
  }
  try {
    return { exists: true, parsed: JSON.parse(raw), error: null };
  } catch (e) {
    return { exists: true, parsed: null, error: 'JSON parse failed: ' + e.message };
  }
}

/**
 * Build a one-line guidance string per state.
 * @param {{ state: string, marketplaceUrl: string|null, rejectionReason: string|null }} r
 * @returns {string}
 */
function buildGuidance(r) {
  switch (r.state) {
    case MARKETPLACE_STATES.NOT_SUBMITTED:
      return 'submit publisher application at cursor.com/marketplace/publish';
    case MARKETPLACE_STATES.SUBMITTED_PENDING:
      return 'await Cursor team review approval; no published SLA per D-16';
    case MARKETPLACE_STATES.APPROVED_PUBLISHED:
      return 'plugin is live at ' + (r.marketplaceUrl || '<marketplace-url>');
    case MARKETPLACE_STATES.REJECTED:
      return 'address rejection reason: ' + (r.rejectionReason || '<unspecified>')
        + '; re-submit at cursor.com/marketplace/publish';
    default:
      return '';
  }
}

/**
 * Read-only Cursor Marketplace status reporter. Reads
 * `.cursor-plugin/plugin.json` and `.cursor-plugin/marketplace-state.json`
 * under `projectRoot` (no writes, no network).
 *
 * @param {{ projectRoot: string }} opts
 * @returns {{
 *   state: 'not-submitted'|'submitted-pending'|'approved-published'|'rejected',
 *   manifestPresent: boolean,
 *   manifestVersion: string|null,
 *   packageVersion: string|null,
 *   versionMatch: boolean,
 *   manifestSchemaValid: boolean,
 *   manifestSchemaErrors: string[],
 *   marketplaceUrl: string|null,
 *   submittedAt: string|null,
 *   approvedAt: string|null,
 *   rejectionReason: string|null,
 *   guidance: string,
 * }}
 */
function reportCursorMarketplace(opts) {
  if (!opts || typeof opts !== 'object' || typeof opts.projectRoot !== 'string') {
    throw new Error('reportCursorMarketplace: opts.projectRoot is required');
  }
  const projectRoot = opts.projectRoot;

  const manifestPath = path.join(projectRoot, '.cursor-plugin', 'plugin.json');
  const statePath = path.join(projectRoot, '.cursor-plugin', 'marketplace-state.json');
  const pkgPath = path.join(projectRoot, 'package.json');

  // 1) Manifest read
  const manifestRead = readJsonFileSafe(manifestPath);
  let manifestPresent = false;
  let manifestVersion = null;
  let manifestSchemaValid = false;
  let manifestSchemaErrors = [];
  if (!manifestRead.exists) {
    manifestSchemaErrors = ['manifest absent'];
  } else if (manifestRead.error) {
    manifestPresent = true;
    manifestSchemaErrors = [manifestRead.error];
  } else {
    manifestPresent = true;
    const validation = validateManifest(manifestRead.parsed);
    manifestSchemaValid = validation.valid;
    manifestSchemaErrors = validation.errors;
    if (typeof manifestRead.parsed.version === 'string') {
      manifestVersion = manifestRead.parsed.version;
    }
  }

  // 2) Package version read (tolerate missing).
  let packageVersion = null;
  const pkgRead = readJsonFileSafe(pkgPath);
  if (pkgRead.exists && !pkgRead.error
      && pkgRead.parsed && typeof pkgRead.parsed.version === 'string') {
    packageVersion = pkgRead.parsed.version;
  }

  // 3) Version match (only true when both present and equal).
  const versionMatch = Boolean(
    manifestVersion && packageVersion && manifestVersion === packageVersion
  );

  // 4) State read. Maintainer-typo safety: unknown status THROWS.
  const stateRead = readJsonFileSafe(statePath);
  let state = MARKETPLACE_STATES.NOT_SUBMITTED;
  let marketplaceUrl = null;
  let submittedAt = null;
  let approvedAt = null;
  let rejectionReason = null;

  if (stateRead.exists && stateRead.error) {
    // Malformed JSON — surface loudly per T-04 in threat register.
    throw new Error(
      'cursor-marketplace doctor: marketplace-state.json malformed: '
        + stateRead.error
    );
  }
  if (stateRead.exists && stateRead.parsed && typeof stateRead.parsed === 'object') {
    const s = stateRead.parsed.status;
    if (typeof s !== 'string') {
      throw new Error(
        'cursor-marketplace doctor: marketplace-state.json is missing "status" field'
      );
    }
    if (!KNOWN_STATUS_VALUES.has(s)) {
      throw new Error(
        'cursor-marketplace doctor: unknown marketplace-state.json status: ' + s
          + ' (expected one of: not-submitted, submitted-pending, approved-published, rejected)'
      );
    }
    state = s;
    if (typeof stateRead.parsed['submitted-at'] === 'string') {
      submittedAt = stateRead.parsed['submitted-at'];
    }
    if (typeof stateRead.parsed['approved-at'] === 'string') {
      approvedAt = stateRead.parsed['approved-at'];
    }
    if (typeof stateRead.parsed['marketplace-url'] === 'string') {
      marketplaceUrl = stateRead.parsed['marketplace-url'];
    }
    if (typeof stateRead.parsed.reason === 'string') {
      rejectionReason = stateRead.parsed.reason;
    }
  }

  const result = {
    state,
    manifestPresent,
    manifestVersion,
    packageVersion,
    versionMatch,
    manifestSchemaValid,
    manifestSchemaErrors,
    marketplaceUrl,
    submittedAt,
    approvedAt,
    rejectionReason,
    guidance: '',
  };
  result.guidance = buildGuidance(result);
  return result;
}

/**
 * Format the doctor report as multi-line text for stdout. Pure — no IO.
 *
 * Output shape (per plan <interfaces>):
 *
 *   === Cursor Marketplace status ===
 *     Manifest:         .cursor-plugin/plugin.json (v1.28.8)  ✓ matches package.json
 *     Schema validity:  valid
 *     Application:      submitted-pending (submitted 2026-05-22)
 *     Next step:        await Cursor team review approval; no published SLA per D-16
 *
 * @param {ReturnType<typeof reportCursorMarketplace>} r
 * @returns {string}
 */
function formatCursorMarketplaceReport(r) {
  const lines = ['=== Cursor Marketplace status ==='];

  // Manifest line
  let manifestLine;
  if (!r.manifestPresent) {
    manifestLine = '  Manifest:         absent (-)  ✗ create .cursor-plugin/plugin.json (B1)';
  } else {
    const ver = r.manifestVersion ? 'v' + r.manifestVersion : 'unknown';
    let matchGlyph;
    let matchText;
    if (r.packageVersion === null) {
      matchGlyph = '-';
      matchText = 'package.json missing (no compare)';
    } else if (r.versionMatch) {
      matchGlyph = '✓';
      matchText = 'matches package.json';
    } else {
      matchGlyph = '✗';
      matchText = 'mismatch — package.json is v' + r.packageVersion;
    }
    manifestLine = '  Manifest:         .cursor-plugin/plugin.json (' + ver + ')  '
      + matchGlyph + ' ' + matchText;
  }
  lines.push(manifestLine);

  // Schema validity line
  let schemaLine;
  if (!r.manifestPresent) {
    schemaLine = '  Schema validity:  -';
  } else if (r.manifestSchemaValid) {
    schemaLine = '  Schema validity:  valid';
  } else {
    const errs = (r.manifestSchemaErrors || []).join('; ') || 'invalid';
    schemaLine = '  Schema validity:  invalid: ' + errs;
  }
  lines.push(schemaLine);

  // Application line — state + context fragment
  let appContext;
  switch (r.state) {
    case MARKETPLACE_STATES.NOT_SUBMITTED:
      appContext = '-';
      break;
    case MARKETPLACE_STATES.SUBMITTED_PENDING:
      appContext = r.submittedAt
        ? 'submitted ' + r.submittedAt.slice(0, 10)
        : 'submitted-at unrecorded';
      break;
    case MARKETPLACE_STATES.APPROVED_PUBLISHED:
      appContext = r.marketplaceUrl
        ? 'live at ' + r.marketplaceUrl
        : 'live (url unrecorded)';
      break;
    case MARKETPLACE_STATES.REJECTED:
      appContext = r.rejectionReason || 'reason unrecorded';
      break;
    default:
      appContext = '-';
  }
  lines.push('  Application:      ' + r.state + ' (' + appContext + ')');

  // Next step / guidance
  lines.push('  Next step:        ' + (r.guidance || '-'));

  return lines.join('\n');
}

module.exports = {
  reportCursorMarketplace,
  formatCursorMarketplaceReport,
  validateManifest,
  MARKETPLACE_STATES,
};
