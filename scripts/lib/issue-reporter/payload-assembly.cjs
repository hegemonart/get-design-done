/**
 * payload-assembly.cjs — Phase 30 Plan 30-02 issue payload assembler.
 *
 * Single source of truth for what a reported issue payload looks like
 * BEFORE it ever hits disk (D-04) or a clipboard. Pure module: no I/O,
 * no globals consumed, no env reads, no clock reads. Deterministic for
 * fixed inputs (this is what enables the golden snapshot test).
 *
 * Two-layer scrub pipeline (order is non-negotiable):
 *   Step 1: Phase 22 redact.cjs    → strips secrets to `[REDACTED:type]`
 *   Step 2: Phase 30 pseudonymize  → rewrites identity (user/path/host)
 *
 * The order matters: if pseudonymize ran first, the username PORTION of
 * a token like `sk-ant-aliceUser-…` would be rewritten before the
 * redact pattern got a chance to match the whole token, leaving a
 * half-mangled secret hint in the payload. Case 9 of the test suite
 * locks this order with a negative test (see threat T-30-02-01).
 *
 * Pseudonymize (Plan 30-01) is late-bound INSIDE assemble() — NOT at
 * module-scope. This makes 30-02 parallel-safe with 30-01 at planning
 * time. If 30-01 hasn't shipped yet when assemble() is first called,
 * a clear remediation error is thrown.
 *
 * D-01: Disclaimer text is hardcoded as module constants. No template
 *       files, no i18n indirection, no env override.
 * D-04: Returns a STRING. Persistence is a separate concern (Plan 30-04).
 * D-14: capability_gap inclusion iterates EXACTLY the 7 Phase 29 D-02
 *       fields by name; extra keys on the input object are silently
 *       dropped. This is the enforcement mechanism for D-14.
 *
 * hostOsClass contract: the caller (30-03 collector) is responsible for
 * narrowing the OS string to one of "linux" | "darwin" | "windows".
 * Full uname / kernel version is OUT OF SCOPE and must not be passed in
 * (threat T-30-02-03).
 */

'use strict';

const crypto = require('node:crypto');
const { redact } = require('../redact.cjs');

/**
 * D-01 disclaimer constants. Hardcoded, verbatim, bilingual.
 * Tests Cases 2 + 3 assert these exact substrings appear in the output;
 * any change to the prose must update the tests in lockstep.
 */
const DISCLAIMER_RU =
  'Это псевдонимизация, не анонимизация. Содержимое промптов и кода может косвенно идентифицировать. Финальный ревью — на тебе.';
const DISCLAIMER_EN =
  'This is pseudonymization, not anonymization. Prompt and code contents can still indirectly identify. Final review is on you.';

/**
 * The seven Phase 29 D-02 capability_gap fields, in fixed render order.
 * D-14: iteration is BY THIS LIST. Extra keys on the input event object
 * are intentionally dropped — never rendered. Adding fields here would
 * leak fields that don't exist in the Phase 29 source contract.
 */
const CAPABILITY_GAP_FIELDS = [
  'event_type',
  'command_name',
  'capability_id',
  'expected_outcome',
  'observed_outcome',
  'runtime',
  'timestamp',
];

/**
 * Normalize a stack-trace string for stable fingerprinting.
 *
 * Strips:
 *   - line:col offsets (`:42:18` → '')
 *   - absolute path prefixes (POSIX `/.../` and Windows `\...\\` → '')
 *
 * Keeps:
 *   - frame leading text (`at Object.<anonymous> (`)
 *   - basename of the file
 *   - trailing characters after the location (e.g., closing paren)
 *
 * This is what makes fingerprints stable across machines and across
 * runs from different working directories. Two users hitting the same
 * bug from different cwd's get the same fingerprint → dedup works.
 *
 * @param {string} stack
 * @returns {string}
 */
function normalizeStack(stack) {
  if (typeof stack !== 'string' || stack.length === 0) return '';
  const lines = stack.split('\n');
  const normalized = lines.map((rawLine) => {
    let line = rawLine;
    // Strip :line:col offsets (handle one or both; line:col is the common
    // Node format; line-only also appears for some runtimes).
    line = line.replace(/:\d+:\d+/g, '');
    line = line.replace(/:\d+(?=\)|\s|$)/g, '');
    // Strip absolute path prefixes — keep basename only. Match both
    // POSIX (`/`) and Windows (`\\`) separators. The regex is greedy:
    // remove everything up through the last path separator.
    line = line.replace(/[A-Za-z]?:?[/\\][^()\s]*[/\\]/g, '');
    return line.trim();
  });
  return normalized.join('\n');
}

/**
 * Compute a deterministic fingerprint for dedup grouping.
 *
 * Formula: sha256(normalize(stack) + '|' + command_name + '|' + runtime + '|' + plugin_version)
 *
 * Locked by Cases 5 (determinism), 6 (cross-cwd stability), 7+8 (changes
 * when the inputs change). See threat T-30-02-05.
 *
 * @param {object}  args
 * @param {string}  [args.stack]          — error stack trace string
 * @param {string}  [args.commandName]    — e.g., "gsd:plan-phase"
 * @param {string}  [args.runtime]        — e.g., "claude-code"
 * @param {string}  [args.pluginVersion]  — e.g., "1.30.0"
 * @returns {string}                       — 64-char hex digest
 */
function computeFingerprint(args) {
  const stack = args && args.stack != null ? args.stack : '';
  const commandName = args && args.commandName != null ? args.commandName : '';
  const runtime = args && args.runtime != null ? args.runtime : '';
  const pluginVersion = args && args.pluginVersion != null ? args.pluginVersion : '';
  const material =
    normalizeStack(String(stack)) +
    '|' +
    String(commandName) +
    '|' +
    String(runtime) +
    '|' +
    String(pluginVersion);
  return crypto.createHash('sha256').update(material).digest('hex');
}

/**
 * Late-bound require of Plan 30-01's pseudonymize. Called INSIDE
 * assemble() rather than at module scope so that 30-02 can be planned
 * and reviewed before 30-01 has landed. If 30-01 hasn't shipped, the
 * call throws a clear remediation error instead of crashing at require.
 *
 * The real 30-01 API is `pseudonymize(payload, opts) -> { payload, replacements }`
 * (see scripts/lib/pseudonymize.cjs). Caller supplies identity/hostname/
 * repoOrigin via opts; this module unwraps `.payload` from the return.
 *
 * @returns {(payload: unknown, opts?: object) => { payload: unknown, replacements: Array<object> }}
 */
function loadPseudonymize() {
  try {
    // eslint-disable-next-line global-require
    const mod = require('../pseudonymize.cjs');
    if (!mod || typeof mod.pseudonymize !== 'function') {
      throw new Error(
        'pseudonymize.cjs loaded but does not export a `pseudonymize` function.'
      );
    }
    return mod.pseudonymize;
  } catch (err) {
    throw new Error(
      'Phase 30 payload assembly requires scripts/lib/pseudonymize.cjs ' +
        '(Plan 30-01). Run Plan 30-01 first. Underlying error: ' +
        (err && err.message ? err.message : String(err))
    );
  }
}

/**
 * Build the `opts` object passed to Plan 30-01's pseudonymize() from the
 * fields the caller stuffed onto errorContext. All fields are optional —
 * pseudonymize handles missing inputs gracefully (rule helpers no-op on
 * empty identity/hostname).
 *
 * @param {object} errorContext
 * @returns {object} opts compatible with scripts/lib/pseudonymize.cjs
 */
function buildPseudonymizeOpts(errorContext) {
  const ctx = errorContext || {};
  return {
    identity: ctx.identity && typeof ctx.identity === 'object' ? ctx.identity : {},
    hostname: typeof ctx.hostname === 'string' ? ctx.hostname : '',
    repoOrigin: typeof ctx.repoOrigin === 'string' ? ctx.repoOrigin : '',
    repoVisibility: ctx.repoVisibility,
    envSnapshot:
      ctx.envSnapshot && typeof ctx.envSnapshot === 'object' ? ctx.envSnapshot : {},
  };
}

/**
 * Render the bilingual disclaimer block. RU above EN, both inside a
 * single GitHub-flavored markdown blockquote with an [!IMPORTANT] alert.
 * D-01 mandates this block be the FIRST thing in the payload, before any
 * technical content. Locked by Cases 2, 3, 4.
 *
 * @returns {string}
 */
function renderDisclaimer() {
  return (
    '> [!IMPORTANT] Disclaimer / Дисклеймер\n' +
    '> ' +
    DISCLAIMER_RU +
    '\n' +
    '>\n' +
    '> ' +
    DISCLAIMER_EN
  );
}

/**
 * Render the optional capability_gap section. D-14: iterate the 7 D-02
 * fields explicitly by name. Extra keys on `event` are dropped — this
 * is the leak prevention. Returns null when event is null/undefined so
 * the caller can omit the section header entirely.
 *
 * @param {object|null|undefined} event
 * @returns {string|null}
 */
function renderCapabilityGap(event) {
  if (event == null) return null;
  const lines = ['## Capability Gap'];
  // D-14: only the 7 D-02 fields are rendered; extra keys on the event
  // are intentionally dropped.
  for (const field of CAPABILITY_GAP_FIELDS) {
    const raw = event[field];
    const value = raw == null ? '' : String(raw);
    lines.push('- ' + field + ': ' + value);
  }
  return lines.join('\n');
}

/**
 * Render trajectory reference. When provided, prints verbatim (the path
 * is NOT dereferenced — that's the caller's concern). When omitted,
 * renders the italic placeholder `_not provided_`.
 *
 * @param {string|null|undefined} ref
 * @returns {string}
 */
function renderTrajectoryRef(ref) {
  if (ref == null || ref === '') return '_not provided_';
  return String(ref);
}

/**
 * Assemble a deterministic, scrubbed, bilingual-disclaimer issue payload.
 *
 * Pure: no I/O, no globals consumed, deterministic for fixed inputs.
 *
 * errorContext.identity / .hostname / .repoOrigin / .repoVisibility /
 * .envSnapshot are passed to 30-01 pseudonymize() via opts. Any of those
 * may be omitted — pseudonymize no-ops on empty inputs.
 *
 * @param {string} commandName            e.g., "gsd:plan-phase"
 * @param {object} errorContext           { message, stack, runtime, pluginVersion, nodeVersion, hostOsClass, identity?, hostname?, repoOrigin?, repoVisibility?, envSnapshot? }
 * @param {string} [trajectoryRef]        relative path or ID; printed verbatim
 * @param {object} [capabilityGapEvent]   full D-02 event; only its 7 fields rendered
 * @returns {string}                      markdown payload
 */
function assemble(commandName, errorContext, trajectoryRef, capabilityGapEvent) {
  // Late-bind 30-01's pseudonymize at call-time. Keeps 30-02 parallel-
  // safe with 30-01 at planning time. If 30-01 hasn't shipped, this
  // throws an informative error instead of crashing at module load.
  const pseudonymize = loadPseudonymize();

  // Step 1: redact secrets (Phase 22). MUST run BEFORE pseudonymize.
  // See header comment + threat T-30-02-01 + Case 9 negative test.
  const ctxRedacted = redact(errorContext == null ? {} : errorContext);
  const gapRedacted =
    capabilityGapEvent == null ? null : redact(capabilityGapEvent);

  // Step 2: pseudonymize identity (Phase 30 Plan 30-01).
  // 30-01 API: pseudonymize(payload, opts) -> { payload, replacements }
  const pseudoOpts = buildPseudonymizeOpts(ctxRedacted);
  const ctxResult = pseudonymize(ctxRedacted, pseudoOpts);
  const ctxScrubbed = ctxResult && ctxResult.payload != null ? ctxResult.payload : ctxRedacted;

  let gapScrubbed = null;
  if (gapRedacted != null) {
    const gapResult = pseudonymize(gapRedacted, pseudoOpts);
    gapScrubbed = gapResult && gapResult.payload != null ? gapResult.payload : gapRedacted;
  }

  // Pull scrubbed fields out for rendering. Default to '' so the markdown
  // shape remains stable even when the caller passes a sparse object.
  const scrubbedMessage =
    ctxScrubbed && ctxScrubbed.message != null ? String(ctxScrubbed.message) : '';
  const scrubbedStack =
    ctxScrubbed && ctxScrubbed.stack != null ? String(ctxScrubbed.stack) : '';
  const runtime =
    ctxScrubbed && ctxScrubbed.runtime != null ? String(ctxScrubbed.runtime) : '';
  const pluginVersion =
    ctxScrubbed && ctxScrubbed.pluginVersion != null
      ? String(ctxScrubbed.pluginVersion)
      : '';
  const nodeVersion =
    ctxScrubbed && ctxScrubbed.nodeVersion != null
      ? String(ctxScrubbed.nodeVersion)
      : '';
  const hostOsClass =
    ctxScrubbed && ctxScrubbed.hostOsClass != null
      ? String(ctxScrubbed.hostOsClass)
      : '';

  // Step 3: fingerprint. Use SCRUBBED stack so pseudonymized identifiers
  // are baked into the fingerprint — same bug from two different users
  // still hashes the same after Plan 30-01's identity rewrite.
  const fingerprint = computeFingerprint({
    stack: scrubbedStack,
    commandName: String(commandName == null ? '' : commandName),
    runtime,
    pluginVersion,
  });

  // Step 4: render markdown. Disclaimer FIRST (D-01), then command,
  // then fingerprint, then runtime metadata, then error + stack, then
  // trajectory, then optional capability_gap.
  const sections = [];

  sections.push(renderDisclaimer());

  sections.push('## Command\n`' + String(commandName == null ? '' : commandName) + '`');

  sections.push(
    '## Fingerprint\n`' +
      fingerprint +
      '` — derived from normalized stack + command + runtime + version'
  );

  sections.push(
    '## Runtime\n' +
      '- Node: ' +
      nodeVersion +
      '\n' +
      '- Plugin: ' +
      pluginVersion +
      '\n' +
      '- OS class: ' +
      hostOsClass
  );

  sections.push('## Error\n```\n' + scrubbedMessage + '\n```');

  sections.push('### Stack (normalized)\n```\n' + scrubbedStack + '\n```');

  sections.push('## Trajectory\n' + renderTrajectoryRef(trajectoryRef));

  const capGapSection = renderCapabilityGap(gapScrubbed);
  if (capGapSection !== null) {
    sections.push(capGapSection);
  }

  // Join with blank lines between sections. Trailing newline keeps the
  // file POSIX-friendly and makes `cat`/`git diff` happy.
  return sections.join('\n\n') + '\n';
}

module.exports = {
  assemble,
  computeFingerprint,
  DISCLAIMER_RU,
  DISCLAIMER_EN,
  // Internal helpers — exported only because tests want stable hooks.
  // Treat as private API; downstream plans must not import these.
  _internal: {
    normalizeStack,
    CAPABILITY_GAP_FIELDS,
  },
};
