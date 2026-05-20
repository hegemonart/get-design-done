'use strict';
/**
 * report-flow.cjs — Plan 30-04 orchestrator.
 *
 * Threads:
 *
 *   triage match (30-03)
 *     → if matched && !forceReport: STOP (no draft, no submission). D-07.
 *
 *   assemble payload (30-02)
 *     → pseudonymize (30-01) + redact (Phase 22) under the hood.
 *
 *   write draft on disk (D-04)
 *     → .design/issue-drafts/<timestamp>-<fp8>.md persisted before any
 *       consent prompt is shown. File survives decline.
 *
 *   pre-submit dedup hook (D-06; wired in 30-05)
 *     → options.dedupCheck({ fingerprint, title }) is the wiring point.
 *       Runs BEFORE the consent prompt: a matching existing issue can
 *       short-circuit to {submitted:false, reason:'duplicate'} so the
 *       `+1` / `me-too` actions NEVER spawn a duplicate (D-06).
 *
 *   prompt consent (D-03)
 *     → editor (if $EDITOR), re-read from disk, y/N. The ONLY submission
 *       gate for the new-issue path. Bypass attempts (env var, --yes flag,
 *       non-TTY) throw.
 *
 *   submit via gh CLI (D-05)
 *     → gh issue create --repo hegemonart/get-design-done ...
 *
 * No env var reads. No HTTPS. No background timers. Single entry point.
 */

const path = require('node:path');

const { DESTINATION_REPO } = require('./destination.cjs');
const { assemble, computeFingerprint } = require('./payload-assembly.cjs');
const { matchKnownFailure } = require('./triage-matcher.cjs');
const { writeDraft } = require('./draft-writer.cjs');
const { promptConsent } = require('./consent-prompt.cjs');
const { submitViaGh } = require('./gh-submit.cjs');
const { isDisabled, getDisableReason } = require('./kill-switch.cjs');
const { detectGh, runFallback } = require('./gh-absent-fallback.cjs');

/**
 * Derive a short, human-readable issue title from the error context.
 * Kept deterministic so tests can assert on it.
 *
 * @param {object} errorContext
 * @returns {string}
 */
function deriveTitle(errorContext) {
  const cmd =
    errorContext && typeof errorContext.command === 'string' && errorContext.command.length > 0
      ? errorContext.command
      : (errorContext && typeof errorContext.commandName === 'string' ? errorContext.commandName : 'unknown');
  const rawMsg =
    errorContext && typeof errorContext.message === 'string'
      ? errorContext.message
      : (errorContext && typeof errorContext.stack === 'string' ? errorContext.stack.split('\n')[0] : '');
  const msg = rawMsg.split('\n')[0].trim().slice(0, 80);
  if (msg.length === 0) return `[${cmd}] failure report`;
  return `[${cmd}] ${msg}`;
}

/**
 * Run the full report flow for a captured errorContext.
 *
 * @param {{
 *   errorContext: object,
 *   options?: {
 *     forceReport?: boolean,
 *     dedupCheck?: (args: {fingerprint: string, title: string}) => Promise<unknown> | unknown,
 *     submitFn?: typeof submitViaGh,
 *     promptFn?: typeof promptConsent,
 *     matchFn?: typeof matchKnownFailure,
 *     assembleFn?: typeof assemble,
 *     writeDraftFn?: typeof writeDraft,
 *     rootDir?: string,
 *     now?: Date,
 *     stdin?: NodeJS.ReadableStream,
 *     stdout?: NodeJS.WritableStream,
 *     env?: NodeJS.ProcessEnv,
 *   }
 * }} args
 * @returns {Promise<
 *   | { submitted: false, reason: 'triage-match', modeId: string, diagnosis: string, remedy: string }
 *   | { submitted: false, reason: 'declined', draftPath: string }
 *   | { submitted: false, reason: 'duplicate', existing: unknown, draftPath: string }
 *   | { submitted: true, url: string, draftPath: string, repo: string, fingerprint: string }
 * >}
 */
async function runReportFlow(args) {
  if (args == null || typeof args !== 'object') {
    throw new Error('runReportFlow: args object required');
  }
  const errorContext = args.errorContext || {};
  const options = args.options || {};

  const matchFn = options.matchFn || matchKnownFailure;
  const assembleFn = options.assembleFn || assemble;
  const writeFn = options.writeDraftFn || writeDraft;
  const promptFn = options.promptFn || promptConsent;
  const submitFn = options.submitFn || submitViaGh;
  const isDisabledFn = options.isDisabledFn || isDisabled;
  const getDisableReasonFn = options.getDisableReasonFn || getDisableReason;
  const detectGhFn = options.detectGhFn || detectGh;
  const runFallbackFn = options.runFallbackFn || runFallback;

  // STEP 0 — Kill-switch gate (D-08). Either env or config disable makes
  // /gdd:report-issue unavailable. Checked BEFORE any other logic so no
  // draft is written, no triage runs, no payload is assembled.
  // Precedence (when both surfaces trigger): env wins for display.
  if (isDisabledFn({ cwd: options.rootDir, env: options.env })) {
    const reason = getDisableReasonFn({ cwd: options.rootDir, env: options.env });
    const reasonMsg = reason === 'env'
      ? 'env (GDD_DISABLE_ISSUE_REPORTER=1)'
      : '.design/config.json (issue_reporter=false)';
    return {
      submitted: false,
      reason: 'disabled',
      surface: reason, // 'env' | 'config'
      message: `/gdd:report-issue is disabled by ${reasonMsg}. Run \`gsd-health\` to see the active disable surface.`,
    };
  }

  // STEP 1 — Triage gate (D-07). If matched and not forcing, surface the
  // suggestion and exit before any draft writing.
  let triage;
  try {
    triage = matchFn(errorContext);
  } catch {
    // matchFn must never throw; if it does we treat as no-match and proceed.
    triage = { matched: false };
  }
  if (triage && triage.matched && !options.forceReport) {
    return {
      submitted: false,
      reason: 'triage-match',
      modeId: triage.modeId,
      diagnosis: triage.diagnosis,
      remedy: triage.remedy,
      severity: triage.severity,
      propose_report: triage.propose_report === true,
    };
  }

  // STEP 2 — Assemble. Layered redact + pseudonymize. Returns markdown body.
  const commandName = errorContext.commandName || errorContext.command || 'unknown';
  const trajectoryRef = errorContext.trajectoryRef || null;
  const capabilityGapEvent = errorContext.capabilityGapEvent || null;

  let assembledBody;
  try {
    assembledBody = assembleFn(commandName, errorContext, trajectoryRef, capabilityGapEvent);
  } catch (e) {
    // Surface assembly failure with a clear remediation pointer.
    const wrap = new Error(
      `report-flow: payload assembly failed (${e && e.message ? e.message : 'unknown'}); ` +
        `ensure scripts/lib/pseudonymize.cjs is present (Plan 30-01).`
    );
    // @ts-expect-error attach cause
    wrap.cause = e;
    throw wrap;
  }
  const fingerprint = computeFingerprint({
    stack: typeof errorContext.stack === 'string' ? errorContext.stack : '',
    commandName,
    runtime: errorContext.runtime || '',
    pluginVersion: errorContext.pluginVersion || '',
  });

  const title = deriveTitle(errorContext);

  // STEP 3 — Persist draft on disk BEFORE any consent prompt (D-04).
  const { path: draftPath } = writeFn({
    title,
    body: assembledBody,
    fingerprint,
    rootDir: options.rootDir,
    now: options.now,
  });

  // STEP 4 — Pre-submit dedup hook (D-06; wired in 30-05). Runs BEFORE the
  // consent prompt so a matching existing issue can short-circuit the new-
  // issue path entirely. The caller (skills/report-issue/SKILL.md) drives
  // the `+1` / `me-too` / `new` UI by passing a dedupCheck callback that:
  //   • calls dedup.searchByFingerprint(fingerprint, {destination}) read-only;
  //   • if matches exist, prompts the user to pick an action;
  //   • on `+1` or `me-too`, calls dedup.react(...) or commentMeToo(...) and
  //     returns truthy `existing` so runReportFlow short-circuits with
  //     {submitted:false, reason:'duplicate'} — NEVER spawning a duplicate;
  //   • on `new`, returns falsy so we fall through to the consent prompt.
  // No-op for callers that omit dedupCheck.
  if (typeof options.dedupCheck === 'function') {
    const initialTitle = deriveTitle(errorContext);
    const dup = await options.dedupCheck({
      fingerprint,
      title: initialTitle,
    });
    if (dup) {
      return {
        submitted: false,
        reason: 'duplicate',
        existing: dup,
        draftPath,
        fingerprint,
      };
    }
  }

  // STEP 5 — Consent prompt (D-03). re-reads draft → returns final {title, body}.
  const consent = await promptFn({
    draftPath,
    openEditor: options.openEditor,
    stdin: options.stdin,
    stdout: options.stdout,
    env: options.env,
  });

  if (!consent.consented) {
    return {
      submitted: false,
      reason: 'declined',
      draftPath,
      fingerprint,
    };
  }

  // STEP 5b — gh-absent fallback (D-10). If the user consented but `gh`
  // is not available on PATH, copy the (potentially-edited) payload to
  // the clipboard and print the issue-template URL with an explicit
  // "gh CLI not found..." message. The user can then paste manually.
  // The draft is still preserved on disk for audit / re-submit later.
  if (!detectGhFn()) {
    const fallback = await runFallbackFn(consent.finalBody, {
      stdout: options.stdout,
    });
    return {
      submitted: false,
      reason: 'gh-absent',
      copied: fallback.copied,
      url: fallback.url,
      draftPath,
      fingerprint,
    };
  }

  // STEP 6 — Submit via gh CLI to the hardcoded repo (D-02 + D-05).
  const result = await Promise.resolve(
    submitFn({
      title: consent.finalTitle,
      body: consent.finalBody,
    })
  );

  return {
    submitted: true,
    url: result && result.url ? result.url : '',
    repo: DESTINATION_REPO,
    draftPath,
    fingerprint,
  };
}

module.exports = {
  runReportFlow,
  deriveTitle,
};
