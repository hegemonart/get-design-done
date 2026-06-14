/**
 * scripts/lib/reflector-kfm-proposer.cjs — Plan 30.5-03 Task 1.
 *
 * Reflector KFM proposer: when a capability_gap cluster recurs ≥3 times
 * with NO matching entry in `reference/known-failure-modes.md`, this
 * module drops a draft catalogue entry into
 * `.design/reflections/incubator/kfm-<slug>/CATALOGUE-ENTRY.md`. The
 * draft is STRICTLY proposal-only — promotion to the canonical catalogue
 * is gated through `applyAccept()` (the apply-reflections accept action,
 * Plan 30.5-03 Task 1 step 5).
 *
 * Decisions honored:
 *   * D-05 — Reflector follows Phase 29 incubator-author on-disk pattern
 *     (drafts in `.design/reflections/incubator/<slug>/`). User reviews
 *     via `/hone:apply-reflections`.
 *   * D-06 — Same draft surface consumed by Task 2's authority-watcher
 *     `kfm-candidate` event. One unified review path, not two.
 *   * 30.5 D-07/D-08 — Re-uses `failure-mode-matcher.match()` for
 *     existing-entry detection. Threshold is the matcher's default 0.4
 *     unless overridden via options.matcherThreshold.
 *   * Phase 29 SC-8 — Nothing the reflector authors auto-ships. Drafts
 *     sit in the incubator until the user accepts them.
 *
 * Public API:
 *   proposeKfmDraft(input, options) → Result
 *   shouldPropose(cluster, options) → boolean
 *   applyAccept(draftPath, options) → { action: 'accepted', promotedModeId }
 *   applyReject(draftPath, options) → { action: 'rejected' }
 *   applyDefer(draftPath, options) → { action: 'deferred' }
 *   applyEdit(draftPath, options) → { action: 'edited', path }
 *
 * Input shape (capability_gap cluster shape from Plan 29-03):
 *   { cluster_id, size, intent_summary, symptom?, suggested_kind,
 *     posterior?, parent_event_ids?, sources?, ... }
 *
 * Alternate input shape (kfm-candidate event from Task 2):
 *   { event_type: 'kfm-candidate', event_id, article_url, article_title,
 *     suggested_symptom, suggested_pattern_hint, raw_excerpt, ... }
 *
 * Both shapes are merged into the same `kfm-<slug>/CATALOGUE-ENTRY.md`
 * draft surface (D-06).
 *
 * Pure CommonJS, deps = node:fs + node:path. No npm dependencies.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const matcher = require('./failure-mode-matcher.cjs');

// -------------------------------------------------------------------
// Constants
// -------------------------------------------------------------------

const DEFAULT_STABILITY_K = 3;
const DEFAULT_MATCHER_THRESHOLD = 0.4; // matches failure-mode-matcher default
const INCUBATOR_PREFIX = 'kfm-';

// Phase 30.5 schema v2 fields. The two un-inferable ones (`pattern`,
// `fix`) get `TODO:` placeholders — user fills them via the apply-
// reflections edit action.
const REQUIRED_SCHEMA_FIELDS = Object.freeze([
  'id',
  'pattern',
  'diagnosis',
  'remedy',
  'severity',
  'propose_report',
  'symptom',
  'root_cause',
  'fix',
  'related_phases',
  'first_observed_cycle',
]);

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

function findRepoRoot(startDir) {
  let dir = startDir || __dirname;
  for (let i = 0; i < 12; i++) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(__dirname, '..', '..');
}

/**
 * Kebab-case slug from a free-text symptom (mirrors incubator-author
 * deriveSlug semantics — ASCII-only, dash-collapsed, ≤40 chars).
 */
function deriveSlug(text) {
  const raw = typeof text === 'string' ? text : '';
  let s = raw.toLowerCase();
  s = s.replace(/[^\x20-\x7e]+/g, '');
  s = s.replace(/[^a-z0-9]+/g, '-');
  s = s.replace(/-+/g, '-');
  s = s.replace(/^-+|-+$/g, '');
  if (s.length > 40) s = s.slice(0, 40);
  s = s.replace(/-+$/g, '');
  return s || 'unnamed';
}

/**
 * Quote a YAML scalar — single-quote shape with `''` escape (matches the
 * catalogue's serialization).
 */
function quoteYaml(s) {
  if (s === undefined || s === null) return "''";
  const str = String(s);
  // Use single quotes with `''` escape if value contains : # or starts/ends with whitespace.
  if (/[:#'"\\\n\r]|^\s|\s$/.test(str) || str === '') {
    return `'${str.replace(/'/g, "''")}'`;
  }
  return str;
}

/**
 * Build a YAML block string from a fields object.
 * Order: REQUIRED_SCHEMA_FIELDS, then any extras alphabetised.
 */
function serializeYaml(fields) {
  const out = [];
  const extras = Object.keys(fields)
    .filter((k) => !REQUIRED_SCHEMA_FIELDS.includes(k))
    .sort();
  for (const k of [...REQUIRED_SCHEMA_FIELDS, ...extras]) {
    if (!(k in fields)) continue;
    const v = fields[k];
    if (Array.isArray(v)) {
      out.push(`${k}: [${v.join(', ')}]`);
    } else if (typeof v === 'boolean') {
      out.push(`${k}: ${v}`);
    } else if (typeof v === 'number') {
      out.push(`${k}: ${v}`);
    } else {
      out.push(`${k}: ${quoteYaml(v)}`);
    }
  }
  return out.join('\n');
}

/**
 * Compute the next available `KFM-NNN` numeric id from the catalogue.
 * Returns the modeId string.
 */
function nextKfmId(cataloguePath) {
  let max = 0;
  try {
    const text = fs.readFileSync(cataloguePath, 'utf8');
    const ids = text.match(/id:\s*KFM-(\d+)/g) || [];
    for (const m of ids) {
      const n = parseInt(m.replace(/[^0-9]/g, ''), 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
  } catch (_e) {
    // Catalogue missing — start from 1.
  }
  return `KFM-${String(max + 1).padStart(3, '0')}`;
}

// -------------------------------------------------------------------
// Input shape normalisation (cluster OR kfm-candidate event)
// -------------------------------------------------------------------

/**
 * Normalise either a capability_gap cluster OR a kfm-candidate event
 * into a uniform `{ symptom, slug, size, sourceLabel, articleUrl?,
 * articleTitle?, suggestedPatternHint?, rawExcerpt? }` shape.
 */
function normaliseInput(input) {
  if (!input || typeof input !== 'object') return null;

  // kfm-candidate event shape (Task 2, D-06).
  if (input.event_type === 'kfm-candidate' ||
      (input.source === 'authority_watcher' && input.suggested_symptom)) {
    const symptom = String(input.suggested_symptom || '').trim();
    if (!symptom) return null;
    return {
      symptom,
      slug: deriveSlug(symptom),
      size: 1, // single-event source; bypasses ≥3 gate (D-06: authority signal is a 1-shot whitelist match).
      sourceLabel: 'authority_watcher',
      articleUrl: input.article_url,
      articleTitle: input.article_title,
      suggestedPatternHint: input.suggested_pattern_hint,
      rawExcerpt: input.raw_excerpt,
      via: 'kfm-candidate',
    };
  }

  // capability_gap cluster shape (Task 1, D-05).
  const symptom = String(
    input.symptom || input.intent_summary || ''
  ).trim();
  if (!symptom) return null;
  return {
    symptom,
    slug: deriveSlug(symptom),
    size: Number(input.size) || 0,
    sourceLabel: 'reflector_capability_gap',
    parentEventIds: Array.isArray(input.parent_event_ids) ? input.parent_event_ids : [],
    suggestedKind: input.suggested_kind,
    posterior: input.posterior,
    sources: input.sources,
    cycles: input.cycles_observed,
    via: 'capability_gap',
    intentSummary: input.intent_summary,
  };
}

// -------------------------------------------------------------------
// Public API
// -------------------------------------------------------------------

/**
 * Decide whether a normalised input qualifies for proposal.
 * Returns { ok: boolean, reason?: string, matchedModeId?: string }.
 */
function shouldPropose(input, options) {
  const opts = options || {};
  const repoRoot = opts.repoRoot || findRepoRoot();
  const cataloguePath = path.join(repoRoot, 'reference', 'known-failure-modes.md');
  const threshold = Number.isFinite(opts.matcherThreshold)
    ? opts.matcherThreshold
    : DEFAULT_MATCHER_THRESHOLD;
  const stabilityK = Number.isFinite(opts.stabilityK)
    ? opts.stabilityK
    : DEFAULT_STABILITY_K;

  const norm = normaliseInput(input);
  if (!norm) return { ok: false, reason: 'invalid_input' };

  // kfm-candidate events bypass ≥K gate (D-06 — authority-watcher is a
  // human-curated whitelist hit, treated as 1-shot signal).
  if (norm.via !== 'kfm-candidate' && norm.size < stabilityK) {
    return { ok: false, reason: 'below_stability_k' };
  }

  // Existing-entry check via failure-mode-matcher.
  const matches = matcher.match(
    { message: norm.symptom, stack: '' },
    { cataloguePath, threshold, topN: 1 }
  );
  if (Array.isArray(matches) && matches.length >= 1 && matches[0].confidence >= threshold) {
    return { ok: false, reason: 'matched_existing', matchedModeId: matches[0].modeId };
  }

  return { ok: true };
}

/**
 * Propose a KFM draft for a capability_gap cluster OR a kfm-candidate
 * event. Returns:
 *   { action: 'drafted', path, slug, proposed_id }
 *   { action: 'skipped', reason, matchedModeId? }
 */
function proposeKfmDraft(input, options) {
  const opts = options || {};
  const repoRoot = opts.repoRoot || findRepoRoot();
  const incubatorRoot = path.join(repoRoot, '.design', 'reflections', 'incubator');
  const cataloguePath = path.join(repoRoot, 'reference', 'known-failure-modes.md');
  const now = opts.now || new Date().toISOString().slice(0, 10);
  const cycleSlug = opts.cycleSlug || `cycle-${now.slice(0, 7)}`; // cycle-YYYY-MM

  const gate = shouldPropose(input, opts);
  if (!gate.ok) {
    return { action: 'skipped', reason: gate.reason, matchedModeId: gate.matchedModeId };
  }

  const norm = normaliseInput(input);
  const slug = norm.slug;
  const proposedId = opts.proposedId || nextKfmId(cataloguePath);

  // Provisional schema fields — `pattern` and `fix` MUST be placeholders
  // per Plan 30.5-03 Task 1 step 3 (reflector can't infer these).
  const fields = {
    id: proposedId,
    pattern: 'TODO: <regex against error.message + error.stack>',
    diagnosis: norm.symptom.length > 0 ? norm.symptom.split('\n')[0].slice(0, 240) : 'TODO: <one-sentence root cause>',
    remedy: 'TODO: <user-runnable one-liner>',
    severity: 'medium',
    propose_report: false,
    symptom: norm.symptom,
    root_cause: norm.suggestedPatternHint || 'TODO: <technical explanation>',
    fix: 'TODO: <step-by-step user-runnable remedy>',
    related_phases: [],
    first_observed_cycle: cycleSlug,
  };

  const draftDir = path.join(incubatorRoot, `${INCUBATOR_PREFIX}${slug}`);
  fs.mkdirSync(draftDir, { recursive: true });
  const draftPath = path.join(draftDir, 'CATALOGUE-ENTRY.md');

  const originHeader = [
    `# KFM proposal — ${proposedId}`,
    '',
    `**Source:** ${norm.sourceLabel}`,
    `**Via:** ${norm.via}`,
    norm.parentEventIds ? `**Parent event ids:** ${norm.parentEventIds.join(', ') || '(none)'}` : null,
    norm.articleUrl ? `**Article URL:** ${norm.articleUrl}` : null,
    norm.articleTitle ? `**Article title:** ${norm.articleTitle}` : null,
    norm.rawExcerpt ? `**Excerpt:** ${norm.rawExcerpt.replace(/\n/g, ' ').slice(0, 500)}` : null,
    '',
    `Drafted ${now}. Review via \`/hone:apply-reflections\` → [KFM-CANDIDATE] proposal class.`,
    '',
    'Fill the `TODO:` placeholders before accepting. The `pattern` regex is matched against',
    '`[error.message, error.stack].filter(Boolean).join("\\n")` — keep it conservative so',
    'first-match-wins (Phase 30 D-13) does not steal traffic from other entries.',
    '',
    '## Proposed YAML',
    '',
    '```yaml',
    serializeYaml(fields),
    '```',
    '',
  ].filter((line) => line !== null).join('\n');

  fs.writeFileSync(draftPath, originHeader);

  return {
    action: 'drafted',
    path: draftPath,
    slug: `${INCUBATOR_PREFIX}${slug}`,
    proposed_id: proposedId,
  };
}

// -------------------------------------------------------------------
// Apply-reflections actions: accept / reject / defer / edit
// -------------------------------------------------------------------

/**
 * Promote a draft → canonical catalogue + registry.json.
 * Returns { action: 'accepted', promotedModeId }.
 */
function applyAccept(draftPath, options) {
  const opts = options || {};
  const repoRoot = opts.repoRoot || findRepoRoot();
  const cataloguePath = path.join(repoRoot, 'reference', 'known-failure-modes.md');
  const registryPath = path.join(repoRoot, 'reference', 'registry.json');

  if (!fs.existsSync(draftPath)) {
    throw new Error(`KFM draft not found: ${draftPath}`);
  }
  const draftText = fs.readFileSync(draftPath, 'utf8');
  const yamlMatch = draftText.match(/```yaml\s*\n([\s\S]*?)\n```/);
  if (!yamlMatch) {
    throw new Error(`KFM draft missing yaml block: ${draftPath}`);
  }
  let yamlBody = yamlMatch[1];

  // Re-stamp id to next available — the proposed id may have collided
  // with intervening promotions on shared incubator surfaces.
  const finalId = opts.finalId || nextKfmId(cataloguePath);
  yamlBody = yamlBody.replace(/^id:\s*KFM-\d+/m, `id: ${finalId}`);

  // Extract the symptom for the catalogue heading.
  const symptomMatch = yamlBody.match(/^symptom:\s*'?(.+?)'?$/m);
  const symptomHeading = symptomMatch ? symptomMatch[1].slice(0, 80) : finalId;

  // Append to catalogue.
  const block = `\n### ${finalId} — ${symptomHeading}\n\nPromoted from incubator KFM proposal.\n\n\`\`\`yaml\n${yamlBody}\n\`\`\`\n`;
  fs.appendFileSync(cataloguePath, block);

  // Register in registry.json.
  let registry;
  try {
    registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  } catch (_e) {
    registry = { version: 1, entries: [] };
  }
  if (!Array.isArray(registry.entries)) registry.entries = [];
  registry.entries.push({
    name: `known-failure-modes/${finalId.toLowerCase()}`,
    path: 'reference/known-failure-modes.md',
    type: 'failure-mode',
    phase: 30.5,
    description: `${finalId} — ${symptomHeading}`,
    origin: 'incubator-kfm',
    added: new Date().toISOString().slice(0, 10),
  });
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));

  // Remove incubator dir LAST (T-29.05-04 — partial failure leaves draft retryable).
  const incubatorDir = path.dirname(draftPath);
  try {
    for (const f of fs.readdirSync(incubatorDir)) {
      fs.unlinkSync(path.join(incubatorDir, f));
    }
    fs.rmdirSync(incubatorDir);
  } catch (_e) {
    // Best-effort; the catalogue + registry promotions already landed.
  }

  return { action: 'accepted', promotedModeId: finalId };
}

/**
 * Remove the incubator draft directory.
 */
function applyReject(draftPath, _options) {
  if (!fs.existsSync(draftPath)) {
    return { action: 'rejected', noop: true };
  }
  const dir = path.dirname(draftPath);
  try {
    for (const f of fs.readdirSync(dir)) {
      fs.unlinkSync(path.join(dir, f));
    }
    fs.rmdirSync(dir);
  } catch (_e) {
    // Best-effort.
  }
  return { action: 'rejected' };
}

/**
 * Stamp `deferred_until` into the draft body. Draft remains in place.
 */
function applyDefer(draftPath, options) {
  const opts = options || {};
  const deferredUntil = opts.deferredUntil || new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  // Read directly and treat ENOENT as "draft not found" — avoids the
  // existsSync→readFileSync TOCTOU race.
  let orig;
  try {
    orig = fs.readFileSync(draftPath, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') throw new Error(`KFM draft not found: ${draftPath}`);
    throw e;
  }
  let updated;
  if (/^deferred_until:/m.test(orig)) {
    updated = orig.replace(/^deferred_until:.*$/m, `deferred_until: ${deferredUntil}`);
  } else {
    updated = `${orig}\ndeferred_until: ${deferredUntil}\n`;
  }
  fs.writeFileSync(draftPath, updated);
  return { action: 'deferred', deferredUntil };
}

/**
 * Edit hook — returns the draft path so the caller can open `$EDITOR`.
 * Caller re-renders the proposal after edit, per Phase 29-05 semantics.
 */
function applyEdit(draftPath, _options) {
  if (!fs.existsSync(draftPath)) {
    throw new Error(`KFM draft not found: ${draftPath}`);
  }
  return { action: 'edited', path: draftPath };
}

module.exports = {
  proposeKfmDraft,
  shouldPropose,
  applyAccept,
  applyReject,
  applyDefer,
  applyEdit,
  // Exposed for tests / higher-level integration.
  _deriveSlug: deriveSlug,
  _nextKfmId: nextKfmId,
  _normaliseInput: normaliseInput,
  _REQUIRED_SCHEMA_FIELDS: REQUIRED_SCHEMA_FIELDS,
  _DEFAULT_STABILITY_K: DEFAULT_STABILITY_K,
  _DEFAULT_MATCHER_THRESHOLD: DEFAULT_MATCHER_THRESHOLD,
};
