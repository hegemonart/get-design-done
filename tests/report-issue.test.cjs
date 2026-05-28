'use strict';
/**
 * Plan 30-04 — behavioral test suite for the /gdd:report-issue flow.
 *
 * 16+ cases tagged with the load-bearing decision they enforce:
 *
 *   C1..C5  — Consent gating (D-03)
 *   D1..D3  — Draft persistence (D-04)
 *   E1..E2  — Edit-before-submit
 *   T1..T2  — Triage-match path
 *   B1..B2  — Bypass rejection (D-03 hardening)
 *   H1..H2  — Hardcoded destination (D-02 runtime)
 *   W1..W2  — --report flag whitelist (D-11)
 *
 * Synthetic and hermetic: each test gets its own tmp .design/issue-drafts/
 * via fs.mkdtempSync(); all gh / prompt / matcher / assemble calls are
 * injected via the options bag in runReportFlow. No live gh, no real
 * .design/ writes. Per D-13.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PassThrough } = require('node:stream');

const REPO_ROOT = path.resolve(__dirname, '..');
const ISSUE_REPORTER_DIR = path.join(REPO_ROOT, 'scripts', 'lib', 'issue-reporter');

const { runReportFlow } = require(path.join(ISSUE_REPORTER_DIR, 'report-flow.cjs'));
const {
  promptConsent,
  rejectBypassEnv,
  isAffirmative,
} = require(path.join(ISSUE_REPORTER_DIR, 'consent-prompt.cjs'));
const {
  writeDraft,
  readDraft,
  draftPath,
  DRAFTS_SUBDIR,
} = require(path.join(ISSUE_REPORTER_DIR, 'draft-writer.cjs'));
const destination = require(path.join(ISSUE_REPORTER_DIR, 'destination.cjs'));
const {
  isReportFlagWhitelisted,
  installReportFlagOn,
  parseReportFlag,
} = require(path.join(ISSUE_REPORTER_DIR, 'cli-flag-report.cjs'));

// -------------------------------------------------------------------------
// Test helpers
// -------------------------------------------------------------------------

/** Make a hermetic root + return cleanup. */
function freshRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-report-issue-test-'));
  return dir;
}

/** Build a TTY-like input stream that returns a single line then EOFs. */
function ttyAnswer(answer) {
  const s = new PassThrough();
  // @ts-expect-error force the TTY flag for the runtime gate.
  s.isTTY = true;
  // Defer writing so the readline question prints first.
  process.nextTick(() => {
    s.write((answer == null ? '' : String(answer)) + '\n');
    s.end();
  });
  return s;
}

/** Build a non-TTY stream — used to assert C5. */
function nonTty() {
  const s = new PassThrough();
  // No isTTY set → falsy → consent-prompt throws.
  return s;
}

/** Sink stdout. */
function sinkStdout() {
  return new PassThrough();
}

/** Minimal valid errorContext shape. */
function ctx(overrides) {
  return Object.assign({
    command: 'gdd:plan-phase',
    commandName: 'gdd:plan-phase',
    message: 'Something exploded',
    stack: 'Error: Something exploded\n    at fn (file.js:1:1)',
    runtime: 'claude-code',
    pluginVersion: '1.30.0',
    nodeVersion: 'v22.0.0',
    hostOsClass: 'linux',
  }, overrides || {});
}

/** Fake assemble — returns deterministic markdown body. */
function fakeAssemble(commandName, errorContext) {
  return `## Command\n\`${commandName}\`\n\n## Error\n\`\`\`\n${errorContext.message}\n\`\`\`\n`;
}

/** Default fakes for the injection bag. */
function defaults(overrides) {
  return Object.assign({
    matchFn: () => ({ matched: false }),
    assembleFn: fakeAssemble,
    submitFn: (args) => {
      // Default: record args + return a fake URL.
      defaults._lastSubmit = args;
      return { url: 'https://github.com/hegemonart/get-design-done/issues/123', repo: destination.DESTINATION_REPO };
    },
    stdout: sinkStdout(),
  }, overrides || {});
}
defaults._lastSubmit = null;

// -------------------------------------------------------------------------
// C1..C5 — Consent gating (D-03)
// -------------------------------------------------------------------------

test('30-04 [D-03] C1: TTY answers "n" → no submission, returns declined', async () => {
  const rootDir = freshRoot();
  let submitCalls = 0;
  const result = await runReportFlow({
    errorContext: ctx(),
    options: {
      ...defaults({
        submitFn: () => { submitCalls += 1; return { url: '', repo: destination.DESTINATION_REPO }; },
      }),
      rootDir,
      stdin: ttyAnswer('n'),
      openEditor: false,
    },
  });
  assert.equal(result.submitted, false);
  assert.equal(result.reason, 'declined');
  assert.equal(submitCalls, 0);
});

test('30-04 [D-03] C2: TTY answers "cancel" → no submission (anything not y/yes)', async () => {
  const rootDir = freshRoot();
  let submitCalls = 0;
  const result = await runReportFlow({
    errorContext: ctx(),
    options: {
      ...defaults({
        submitFn: () => { submitCalls += 1; return { url: '', repo: destination.DESTINATION_REPO }; },
      }),
      rootDir,
      stdin: ttyAnswer('cancel'),
      openEditor: false,
    },
  });
  assert.equal(result.submitted, false);
  assert.equal(result.reason, 'declined');
  assert.equal(submitCalls, 0);
});

test('30-04 [D-03] C3: TTY answers empty/EOF → declined, no submission', async () => {
  const rootDir = freshRoot();
  let submitCalls = 0;
  const result = await runReportFlow({
    errorContext: ctx(),
    options: {
      ...defaults({
        submitFn: () => { submitCalls += 1; return { url: '', repo: destination.DESTINATION_REPO }; },
      }),
      rootDir,
      stdin: ttyAnswer(''),
      openEditor: false,
    },
  });
  assert.equal(result.submitted, false);
  assert.equal(result.reason, 'declined');
  assert.equal(submitCalls, 0);
});

test('30-04 [D-03] C4: TTY answers "y" → mocked gh issue create invoked exactly once', async () => {
  const rootDir = freshRoot();
  let submitCalls = 0;
  /** @type {object | null} */
  let captured = null;
  const result = await runReportFlow({
    errorContext: ctx(),
    options: {
      ...defaults({
        submitFn: (args) => {
          submitCalls += 1;
          captured = args;
          return { url: 'https://github.com/hegemonart/get-design-done/issues/42', repo: destination.DESTINATION_REPO };
        },
      }),
      rootDir,
      stdin: ttyAnswer('y'),
      openEditor: false,
    },
  });
  assert.equal(result.submitted, true);
  assert.equal(submitCalls, 1);
  assert.match(result.url, /github\.com\/hegemonart\/get-design-done\/issues/);
  assert.ok(captured && typeof captured.title === 'string' && captured.title.length > 0);
});

test('30-04 [D-03] C5: non-TTY stdin → throws, never submits', async () => {
  const rootDir = freshRoot();
  let submitCalls = 0;
  await assert.rejects(
    async () => runReportFlow({
      errorContext: ctx(),
      options: {
        ...defaults({
          submitFn: () => { submitCalls += 1; return { url: '', repo: destination.DESTINATION_REPO }; },
        }),
        rootDir,
        stdin: nonTty(),
        openEditor: false,
      },
    }),
    /requires an interactive TTY|no auto-mode/i
  );
  assert.equal(submitCalls, 0);
});

// -------------------------------------------------------------------------
// D1..D3 — Draft persistence (D-04)
// -------------------------------------------------------------------------

test('30-04 [D-04] D1: draft file is written before consent prompt is shown', async () => {
  const rootDir = freshRoot();
  let draftExistedAtPromptTime = false;
  let observedDraftPath = null;
  const result = await runReportFlow({
    errorContext: ctx(),
    options: {
      ...defaults({
        // Custom promptFn that checks the draft exists ON DISK when called.
        promptFn: async (opts) => {
          observedDraftPath = opts.draftPath;
          draftExistedAtPromptTime = fs.existsSync(opts.draftPath);
          return { consented: false, finalTitle: '', finalBody: '' };
        },
      }),
      rootDir,
      openEditor: false,
    },
  });
  assert.equal(result.submitted, false);
  assert.equal(draftExistedAtPromptTime, true, 'draft must exist on disk before promptConsent is called');
  assert.ok(typeof observedDraftPath === 'string' && observedDraftPath.includes('issue-drafts'));
});

test('30-04 [D-04] D2: draft filename matches /^\\d{8}T\\d{6}Z-[a-f0-9]{8}\\.md$/', () => {
  const rootDir = freshRoot();
  const fp = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const r = writeDraft({
    title: 'demo',
    body: 'body content',
    fingerprint: fp,
    rootDir,
    now: new Date('2026-05-20T13:14:15.678Z'),
  });
  const base = path.basename(r.path);
  assert.match(base, /^\d{8}T\d{6}Z-[a-f0-9]{8}\.md$/);
  assert.equal(base, '20260520T131415Z-01234567.md');
});

test('30-04 [D-04] D3: draft file is NOT deleted on decline', async () => {
  const rootDir = freshRoot();
  /** @type {string|null} */
  let observedDraftPath = null;
  const result = await runReportFlow({
    errorContext: ctx(),
    options: {
      ...defaults({
        promptFn: async (opts) => {
          observedDraftPath = opts.draftPath;
          return { consented: false, finalTitle: 'demo', finalBody: 'demo' };
        },
      }),
      rootDir,
      openEditor: false,
    },
  });
  assert.equal(result.submitted, false);
  assert.equal(result.reason, 'declined');
  assert.ok(observedDraftPath && fs.existsSync(observedDraftPath), 'draft must survive decline');
});

// -------------------------------------------------------------------------
// E1..E2 — Edit-before-submit
// -------------------------------------------------------------------------

test('30-04 [D-04] E1: mutating the draft on disk between write and consent → submitted body contains the edit', async () => {
  const rootDir = freshRoot();
  /** @type {string|null} */
  let captured = null;
  const result = await runReportFlow({
    errorContext: ctx(),
    options: {
      ...defaults({
        // Pre-prompt hook: mutate the file then run the real promptConsent
        // (via injection in flow), but here we just stub promptConsent to
        // simulate the re-read-from-disk behaviour explicitly.
        promptFn: async (opts) => {
          // Append USER_EDIT to the file BEFORE re-reading.
          fs.appendFileSync(opts.draftPath, '\n\nUSER_EDIT_MARKER\n', 'utf8');
          // Real promptConsent re-reads here. Simulate the same.
          const { title, body } = readDraft(opts.draftPath);
          return { consented: true, finalTitle: title, finalBody: body };
        },
        submitFn: (args) => { captured = args; return { url: 'x', repo: destination.DESTINATION_REPO }; },
      }),
      rootDir,
      openEditor: false,
    },
  });
  assert.equal(result.submitted, true);
  assert.ok(captured && typeof captured.body === 'string');
  assert.match(captured.body, /USER_EDIT_MARKER/);
});

test('30-04 [D-04] E2: pre-edit body is NOT what gets submitted', async () => {
  const rootDir = freshRoot();
  /** @type {string|null} */
  let captured = null;
  const PRE_EDIT_NEEDLE = 'PRE_EDIT_FINGERPRINT';
  const errorContext = ctx({ message: PRE_EDIT_NEEDLE });
  const result = await runReportFlow({
    errorContext,
    options: {
      ...defaults({
        promptFn: async (opts) => {
          // OVERWRITE the file entirely with new content.
          fs.writeFileSync(
            opts.draftPath,
            '<!-- generated by /gdd:report-issue -->\n# replaced\n\nfully replaced body\n',
            'utf8'
          );
          const { title, body } = readDraft(opts.draftPath);
          return { consented: true, finalTitle: title, finalBody: body };
        },
        submitFn: (args) => { captured = args; return { url: 'x', repo: destination.DESTINATION_REPO }; },
      }),
      rootDir,
      openEditor: false,
    },
  });
  assert.equal(result.submitted, true);
  assert.ok(captured && typeof captured.body === 'string');
  assert.ok(!captured.body.includes(PRE_EDIT_NEEDLE), 'pre-edit content must NOT survive into submit');
  assert.match(captured.body, /fully replaced body/);
  assert.equal(captured.title, 'replaced');
});

// -------------------------------------------------------------------------
// T1..T2 — Triage-match path
// -------------------------------------------------------------------------

test('30-04 [D-07] T1: triage match → no draft written, no consent prompt, no submission', async () => {
  const rootDir = freshRoot();
  let promptCalls = 0;
  let submitCalls = 0;
  const result = await runReportFlow({
    errorContext: ctx(),
    options: {
      ...defaults({
        matchFn: () => ({
          matched: true,
          modeId: 'KFM-FAKE',
          diagnosis: 'fake',
          remedy: 'try X',
          severity: 'low',
          propose_report: false,
        }),
        promptFn: async () => { promptCalls += 1; return { consented: true, finalTitle: '', finalBody: '' }; },
        submitFn: () => { submitCalls += 1; return { url: '', repo: destination.DESTINATION_REPO }; },
      }),
      rootDir,
      openEditor: false,
    },
  });
  assert.equal(result.submitted, false);
  assert.equal(result.reason, 'triage-match');
  assert.equal(result.modeId, 'KFM-FAKE');
  assert.equal(result.remedy, 'try X');
  assert.equal(promptCalls, 0);
  assert.equal(submitCalls, 0);
  // The draft directory should NOT have been created either.
  const draftsDir = path.join(rootDir, DRAFTS_SUBDIR);
  if (fs.existsSync(draftsDir)) {
    const files = fs.readdirSync(draftsDir);
    assert.deepEqual(files, [], 'no drafts must be written on triage-match');
  }
});

test('30-04 [D-11] T2: --force-report overrides triage but still requires consent ("n" → no submission)', async () => {
  const rootDir = freshRoot();
  let submitCalls = 0;
  let promptCalls = 0;
  const result = await runReportFlow({
    errorContext: ctx(),
    options: {
      ...defaults({
        matchFn: () => ({
          matched: true,
          modeId: 'KFM-FAKE',
          diagnosis: 'fake',
          remedy: 'try X',
          severity: 'low',
          propose_report: true,
        }),
        promptFn: async () => {
          promptCalls += 1;
          return { consented: false, finalTitle: 'x', finalBody: 'x' };
        },
        submitFn: () => { submitCalls += 1; return { url: '', repo: destination.DESTINATION_REPO }; },
      }),
      rootDir,
      forceReport: true,
      openEditor: false,
    },
  });
  assert.equal(result.submitted, false);
  assert.equal(result.reason, 'declined');
  assert.equal(promptCalls, 1, 'consent must be requested under --force-report');
  assert.equal(submitCalls, 0, 'still no submission without consent');
});

// -------------------------------------------------------------------------
// B1..B2 — Bypass rejection (D-03 hardening)
// -------------------------------------------------------------------------

test('30-04 [D-03] B1: GDD_AUTO_REPORT=1 set → throws, names the offending env var, no submission', async () => {
  const rootDir = freshRoot();
  let submitCalls = 0;
  const fakeEnv = { ...process.env, GDD_AUTO_REPORT: '1' };
  await assert.rejects(
    async () => runReportFlow({
      errorContext: ctx(),
      options: {
        ...defaults({
          submitFn: () => { submitCalls += 1; return { url: '', repo: destination.DESTINATION_REPO }; },
        }),
        rootDir,
        stdin: ttyAnswer('y'),
        env: fakeEnv,
        openEditor: false,
      },
    }),
    /GDD_AUTO_REPORT|env var.*detected|no auto-mode/i
  );
  assert.equal(submitCalls, 0);
});

test('30-04 [D-03] B2: --yes-style argv has no effect — consent still required, no submission on "n"', async () => {
  // Since the static test forbids the literal string '--yes' anywhere in
  // the report-issue tree, this test demonstrates that even if a caller
  // PASSES `--yes` in argv, the report-flow has no codepath that reads it.
  const rootDir = freshRoot();
  let submitCalls = 0;
  // Pretend the user typed --yes — pass it as a stray option key. The
  // options bag has no such key; nothing reads it. Consent is still asked.
  const result = await runReportFlow({
    errorContext: ctx(),
    options: Object.assign(defaults({
      submitFn: () => { submitCalls += 1; return { url: '', repo: destination.DESTINATION_REPO }; },
    }), {
      rootDir,
      stdin: ttyAnswer('n'),
      openEditor: false,
      // Intentionally include a noise key to prove it's ignored:
      yes: true,
      autoConfirm: true,
      noConfirm: true,
    }),
  });
  assert.equal(result.submitted, false);
  assert.equal(result.reason, 'declined');
  assert.equal(submitCalls, 0);
});

// -------------------------------------------------------------------------
// H1..H2 — Hardcoded destination (D-02 runtime)
// -------------------------------------------------------------------------

test('30-04 [D-02] H1: real gh-submit call receives --repo hegemonart/get-design-done in argv', async () => {
  // Use the real submitViaGh with an injected fake spawn so we can
  // inspect the exact argv passed to the gh CLI.
  const { submitViaGh } = require(path.join(ISSUE_REPORTER_DIR, 'gh-submit.cjs'));
  /** @type {string[]|null} */
  let capturedArgv = null;
  const tmpDir = freshRoot();
  const fakeSpawn = (cmd, args) => {
    capturedArgv = [cmd, ...args];
    return { status: 0, stdout: 'https://github.com/hegemonart/get-design-done/issues/100\n', stderr: '' };
  };
  const out = submitViaGh({
    title: 'demo',
    body: 'demo body',
    spawn: fakeSpawn,
    tmpDir,
  });
  assert.equal(out.url, 'https://github.com/hegemonart/get-design-done/issues/100');
  assert.ok(capturedArgv, 'spawn must have been called');
  // argv must include --repo immediately followed by the hardcoded repo.
  const idx = capturedArgv.indexOf('--repo');
  assert.notEqual(idx, -1, '--repo must appear in argv');
  assert.equal(capturedArgv[idx + 1], 'hegemonart/get-design-done');
});

test('30-04 [D-02] H2: mutating DESTINATION_REPO at runtime throws (frozen export)', () => {
  assert.throws(() => {
    'use strict';
    destination.DESTINATION_REPO = 'attacker/repo';
  }, /Cannot assign to read only property|read only|Cannot redefine/);
  // And the value is unchanged after the failed write.
  assert.equal(destination.DESTINATION_REPO, 'hegemonart/get-design-done');
});

// -------------------------------------------------------------------------
// W1..W2 — --report flag whitelist (D-11)
// -------------------------------------------------------------------------

test('30-04 [D-11] W1: installReportFlagOn(whitelisted command) attaches the flag', () => {
  let installed = null;
  const fakeParser = {
    option(name, cfg) {
      installed = { name, cfg };
      return this;
    },
  };
  const ok = installReportFlagOn(
    fakeParser,
    'gdd:plan-phase',
    { listFn: () => [{ modeId: 'KFM-008', propose_report: true, severity: 'medium' }] }
  );
  assert.equal(ok, true);
  assert.equal(installed && installed.name, 'report');
  assert.equal(installed && installed.cfg && installed.cfg.type, 'boolean');
});

test('30-04 [D-11] W2: non-whitelisted command does NOT get --report (parser untouched + parseReportFlag returns false)', () => {
  let installed = null;
  const fakeParser = {
    option(name, cfg) { installed = { name, cfg }; return this; },
  };
  const ok = installReportFlagOn(
    fakeParser,
    'gdd:some-other-command',
    { listFn: () => [{ modeId: 'KFM-008', propose_report: true, severity: 'medium' }] }
  );
  assert.equal(ok, false);
  assert.equal(installed, null);

  // And: even if user types --report on a non-whitelisted command, the
  // parser reports false.
  const parsed = parseReportFlag(
    'gdd:some-other-command',
    ['--report'],
    { listFn: () => [{ modeId: 'KFM-008', propose_report: true, severity: 'medium' }] }
  );
  assert.equal(parsed.report, false);
});

test('30-04 [D-11] W3: empty propose_report list disables --report everywhere (defensive default)', () => {
  // Even on the whitelisted command, if the catalogue lost its
  // propose_report=true entries, the flag is unavailable.
  const ok = isReportFlagWhitelisted(
    'gdd:plan-phase',
    { listFn: () => [] }
  );
  assert.equal(ok, false);
});

// -------------------------------------------------------------------------
// Extra D-03 hardening: direct unit tests on rejectBypassEnv + isAffirmative
// -------------------------------------------------------------------------

test('30-04 [D-03] U1: rejectBypassEnv throws on any /REPORT|ISSUE|AUTO_REPORT/i truthy var', () => {
  assert.throws(() => rejectBypassEnv({ GDD_AUTO_REPORT: 'yes' }), /env var.*detected/i);
  assert.throws(() => rejectBypassEnv({ FOO_ISSUE_BAR: '1' }), /env var.*detected/i);
  assert.throws(() => rejectBypassEnv({ XYZ_REPORT: 'true' }), /env var.*detected/i);
});

test('30-04 [D-03] U2: rejectBypassEnv accepts unset, "0", "false", "" as non-triggers', () => {
  assert.doesNotThrow(() => rejectBypassEnv({ GDD_AUTO_REPORT: '' }));
  assert.doesNotThrow(() => rejectBypassEnv({ GDD_AUTO_REPORT: '0' }));
  assert.doesNotThrow(() => rejectBypassEnv({ GDD_AUTO_REPORT: 'false' }));
  assert.doesNotThrow(() => rejectBypassEnv({}));
});

test('30-04 [D-03] U3: isAffirmative — only literal y/yes (case-insensitive) is accepted', () => {
  assert.equal(isAffirmative('y'), true);
  assert.equal(isAffirmative('Y'), true);
  assert.equal(isAffirmative('yes'), true);
  assert.equal(isAffirmative('YES'), true);
  assert.equal(isAffirmative(' y '), true);
  assert.equal(isAffirmative(''), false);
  assert.equal(isAffirmative('cancel'), false);
  assert.equal(isAffirmative('yeah'), false);
  assert.equal(isAffirmative('yep'), false);
  assert.equal(isAffirmative('n'), false);
});

test('30-04 [D-04] U4: writeDraft + readDraft round-trip preserves title + body', () => {
  const rootDir = freshRoot();
  const fp = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
  const { path: p } = writeDraft({
    title: 'My Title',
    body: 'Body line 1\nBody line 2',
    fingerprint: fp,
    rootDir,
    now: new Date('2026-01-02T03:04:05.000Z'),
  });
  assert.match(path.basename(p), /^20260102T030405Z-abcdef01\.md$/);
  const round = readDraft(p);
  assert.equal(round.title, 'My Title');
  assert.equal(round.body, 'Body line 1\nBody line 2');
});

test('30-04 [D-02] U5: draftPath bakes destination repo into the file header', () => {
  const rootDir = freshRoot();
  const fp = 'cafebabe0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
  const { path: p } = writeDraft({
    title: 'demo',
    body: 'demo body',
    fingerprint: fp,
    rootDir,
    now: new Date('2026-01-02T03:04:05.000Z'),
  });
  const raw = fs.readFileSync(p, 'utf8');
  assert.match(raw, /destination: hegemonart\/get-design-done/);
  assert.match(raw, /fingerprint: cafebabe/);
});

test('30-04 [D-11] U6: parseReportFlag honors --force-report on /gdd:report-issue itself', () => {
  const r = parseReportFlag(
    'gdd:report-issue',
    ['--force-report'],
    { listFn: () => [{ modeId: 'KFM-008', propose_report: true, severity: 'medium' }] }
  );
  assert.equal(r.forceReport, true);
});

test('30-04 [D-04] U7: runReportFlow exposes options.dedupCheck hook (deferred to 30-05)', async () => {
  const rootDir = freshRoot();
  let dedupCalled = false;
  const result = await runReportFlow({
    errorContext: ctx(),
    options: {
      ...defaults({}),
      rootDir,
      stdin: ttyAnswer('y'),
      openEditor: false,
      dedupCheck: ({ fingerprint, title }) => {
        dedupCalled = true;
        assert.equal(typeof fingerprint, 'string');
        assert.equal(typeof title, 'string');
        return { number: 1, url: 'https://github.com/hegemonart/get-design-done/issues/1' };
      },
    },
  });
  assert.equal(dedupCalled, true);
  assert.equal(result.submitted, false);
  assert.equal(result.reason, 'duplicate');
  assert.ok(result.existing && typeof result.existing === 'object');
});
