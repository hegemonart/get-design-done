// tests/apply-reflections-incubator.test.cjs — Plan 29-05
//
// Test coverage for /gdd:apply-reflections incubator-proposal class:
//
//   * Task 1: scripts/validate-incubator-scope.cjs (validateScope() + CLI)
//   * Task 2: scripts/lib/apply-reflections/incubator-proposals.cjs
//       (discoverIncubatorDrafts / renderProposal / applyAccept / applyReject /
//        applyEdit / checkStage1Gate / recordOptIn)
//   * Task 3: skills/apply-reflections/SKILL.md + apply-reflections-procedure.md
//       structural assertions ([INCUBATOR] marker, ≤110 LoC, references to
//       validateScope and helper module path).
//
// Style follows tests/incubator-author.test.cjs + tests/capability-gap-events.test.cjs:
//   * node:test + node:assert/strict (zero external deps)
//   * os.tmpdir() sandbox for filesystem fixtures (per-test before/after hooks)
//   * No writes outside the sandbox; no live event-chain or registry writes.

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '../..');
const VALIDATE_SCRIPT = path.resolve(REPO_ROOT, 'scripts', 'validate-incubator-scope.cjs');
const HELPER_MODULE = path.resolve(REPO_ROOT, 'scripts', 'lib', 'apply-reflections', 'incubator-proposals.cjs');
const SKILL_PATH = path.resolve(REPO_ROOT, 'skills', 'apply-reflections', 'SKILL.md');
const PROCEDURE_PATH = path.resolve(REPO_ROOT, 'skills', 'apply-reflections', 'apply-reflections-procedure.md');
const REGISTRY_PATH = path.resolve(REPO_ROOT, 'reference', 'registry.json');
const STAGE_GATE_PATH = path.resolve(REPO_ROOT, 'reference', 'capability-gap-stage-gate.md');

// ---------------------------------------------------------------------------
// Section 1: validateScope() unit tests
// ---------------------------------------------------------------------------

function loadValidator() {
  // Fresh require each call so module-state from one test never leaks to another.
  delete require.cache[VALIDATE_SCRIPT];
  return require(VALIDATE_SCRIPT);
}

test('29-05 T1: validateScope accepts agents/<slug>.md', () => {
  const { validateScope } = loadValidator();
  const out = validateScope('agents/foo.md', { repoRoot: REPO_ROOT });
  assert.deepEqual(out, { ok: true });
});

test('29-05 T1: validateScope accepts skills/<slug>/SKILL.md', () => {
  const { validateScope } = loadValidator();
  const out = validateScope('skills/bar/SKILL.md', { repoRoot: REPO_ROOT });
  assert.deepEqual(out, { ok: true });
});

test('29-05 T1: validateScope rejects path traversal (agents/../../etc/passwd)', () => {
  const { validateScope } = loadValidator();
  assert.throws(
    () => validateScope('agents/../../etc/passwd', { repoRoot: REPO_ROOT }),
    (err) => /scope|escape|outside/i.test(err.message)
  );
});

test('29-05 T1: validateScope rejects absolute path outside repo', () => {
  const { validateScope } = loadValidator();
  // Use an absolute path guaranteed to be outside REPO_ROOT
  const outside = process.platform === 'win32' ? 'C:\\Windows\\System32\\evil.md' : '/etc/passwd';
  assert.throws(
    () => validateScope(outside, { repoRoot: REPO_ROOT }),
    (err) => /scope|escape|outside/i.test(err.message)
  );
});

test('29-05 T1: validateScope rejects scripts/evil.cjs (not under agents/ or skills/)', () => {
  const { validateScope } = loadValidator();
  assert.throws(
    () => validateScope('scripts/evil.cjs', { repoRoot: REPO_ROOT }),
    (err) => /scope|allowed|agents|skills/i.test(err.message)
  );
});

test('29-05 T1: validateScope rejects skills/baz/extra.md (skill artifact must be SKILL.md)', () => {
  const { validateScope } = loadValidator();
  assert.throws(
    () => validateScope('skills/baz/extra.md', { repoRoot: REPO_ROOT }),
    (err) => /SKILL\.md|allowed/i.test(err.message)
  );
});

test('29-05 T1: validateScope rejects nested traversal under skills/', () => {
  const { validateScope } = loadValidator();
  assert.throws(
    () => validateScope('skills/foo/../../etc/passwd', { repoRoot: REPO_ROOT }),
    (err) => /scope|escape|outside|allowed/i.test(err.message)
  );
});

test('29-05 T1: validateScope rejects agents/ without filename', () => {
  const { validateScope } = loadValidator();
  assert.throws(
    () => validateScope('agents/', { repoRoot: REPO_ROOT }),
    (err) => /allowed|invalid/i.test(err.message)
  );
});

test('29-05 T1: validateScope defaults repoRoot to process.cwd()', () => {
  const { validateScope } = loadValidator();
  // Run from REPO_ROOT-equivalent (we're already there in test runner)
  const prevCwd = process.cwd();
  process.chdir(REPO_ROOT);
  try {
    const out = validateScope('agents/foo.md');
    assert.deepEqual(out, { ok: true });
  } finally {
    process.chdir(prevCwd);
  }
});

test('29-05 T1: CLI exits 0 on agents/foo.md', () => {
  const r = spawnSync(process.execPath, [VALIDATE_SCRIPT, 'agents/foo.md'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, `expected exit 0, got ${r.status}, stderr: ${r.stderr}`);
});

test('29-05 T1: CLI exits 1 on ../escape.md with informative stderr', () => {
  const r = spawnSync(process.execPath, [VALIDATE_SCRIPT, '../escape.md'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  assert.equal(r.status, 1, `expected exit 1, got ${r.status}`);
  assert.match(r.stderr + r.stdout, /scope|escape|outside|allowed/i);
});

test('29-05 T1: CLI exits 1 on skills/foo/extra.md', () => {
  const r = spawnSync(process.execPath, [VALIDATE_SCRIPT, 'skills/foo/extra.md'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  assert.equal(r.status, 1, `expected exit 1, got ${r.status}`);
});

test('29-05 T1: scope guard has no bypass flag (D-05 non-bypassable)', () => {
  const src = fs.readFileSync(VALIDATE_SCRIPT, 'utf8');
  // No environment variable or CLI flag should toggle scope enforcement off.
  assert.doesNotMatch(src, /skip[-_]?scope|bypass[-_]?scope|disable[-_]?scope|SCOPE_OK/i);
});

// ---------------------------------------------------------------------------
// Section 2: incubator-proposals helper module — 7 exports
// ---------------------------------------------------------------------------

function loadHelper() {
  delete require.cache[HELPER_MODULE];
  return require(HELPER_MODULE);
}

function mkTmpdir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
}

function rmTmpdir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

/**
 * Create a minimal valid incubator draft layout at <root>/.design/reflections/incubator/<slug>/.
 * Returns { sandbox, incubatorDir, slugDir, manifestPath, draftPath, originPath }.
 */
function makeDraftSandbox({ slug = 'figma-token-sync', kind = 'skill', target_path } = {}) {
  const sandbox = mkTmpdir('ap-incu-sandbox');
  const incubatorDir = path.join(sandbox, '.design', 'reflections', 'incubator');
  const slugDir = path.join(incubatorDir, slug);
  fs.mkdirSync(slugDir, { recursive: true });

  const finalTarget = target_path || (kind === 'agent' ? `agents/${slug}.md` : `skills/${slug}/SKILL.md`);
  const manifest = {
    slug,
    kind,
    target_path: finalTarget,
    created_at: '2026-05-19T20:00:00.000Z',
    signals: ['signal-1', 'signal-2'],
  };
  fs.writeFileSync(path.join(slugDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(
    path.join(slugDir, 'DRAFT.md'),
    `---\nname: ${slug}\ndescription: "Drafted by incubator-author. Use when triggers match."\ntools: Read, Grep, Glob\ndelegate_to: null\n---\n\n# ${slug}\n\nDraft body content for ${slug}.\n`
  );
  fs.writeFileSync(
    path.join(slugDir, 'ORIGIN.md'),
    `# Origin signals\n\n- evidence_ref: ev-1\n- evidence_ref: ev-2\n- cluster_id: c-${slug}\n`
  );
  return { sandbox, incubatorDir, slugDir, manifestPath: path.join(slugDir, 'manifest.json'), draftPath: path.join(slugDir, 'DRAFT.md'), originPath: path.join(slugDir, 'ORIGIN.md'), manifest };
}

// ---- discoverIncubatorDrafts ----

test('29-05 T2: discoverIncubatorDrafts returns [] when incubator dir absent', () => {
  const m = loadHelper();
  const tmp = mkTmpdir('ap-incu-empty');
  try {
    const result = m.discoverIncubatorDrafts({
      incubatorDir: path.join(tmp, '.design', 'reflections', 'incubator'),
    });
    assert.deepEqual(result, []);
  } finally {
    rmTmpdir(tmp);
  }
});

test('29-05 T2: discoverIncubatorDrafts returns one entry per valid draft slug', () => {
  const m = loadHelper();
  const fx = makeDraftSandbox({ slug: 'figma-token-sync', kind: 'skill' });
  try {
    const drafts = m.discoverIncubatorDrafts({ incubatorDir: fx.incubatorDir });
    assert.equal(drafts.length, 1);
    const d = drafts[0];
    assert.equal(d.slug, 'figma-token-sync');
    assert.equal(d.kind, 'skill');
    assert.equal(d.target_path, 'skills/figma-token-sync/SKILL.md');
    assert.equal(typeof d.draft_path, 'string');
    assert.equal(typeof d.origin_path, 'string');
    assert.equal(typeof d.manifest, 'object');
    assert.equal(d.manifest.slug, 'figma-token-sync');
  } finally {
    rmTmpdir(fx.sandbox);
  }
});

test('29-05 T2: discoverIncubatorDrafts skips malformed draft (missing manifest.json) with warning', () => {
  const m = loadHelper();
  const fx = makeDraftSandbox({ slug: 'good-slug' });
  // Add a malformed sibling
  const badSlugDir = path.join(fx.incubatorDir, 'broken-slug');
  fs.mkdirSync(badSlugDir, { recursive: true });
  fs.writeFileSync(path.join(badSlugDir, 'DRAFT.md'), '# broken\n');
  // No manifest.json — should be skipped
  try {
    const drafts = m.discoverIncubatorDrafts({ incubatorDir: fx.incubatorDir });
    // Only the valid one should appear
    assert.equal(drafts.length, 1);
    assert.equal(drafts[0].slug, 'good-slug');
  } finally {
    rmTmpdir(fx.sandbox);
  }
});

test('29-05 T2: discoverIncubatorDrafts skips draft missing DRAFT.md', () => {
  const m = loadHelper();
  const fx = makeDraftSandbox({ slug: 'has-manifest-only' });
  // Delete the DRAFT.md to simulate malformed
  fs.unlinkSync(fx.draftPath);
  try {
    const drafts = m.discoverIncubatorDrafts({ incubatorDir: fx.incubatorDir });
    assert.equal(drafts.length, 0);
  } finally {
    rmTmpdir(fx.sandbox);
  }
});

test('29-05 T2: discoverIncubatorDrafts skips draft with malformed manifest.json (parse error)', () => {
  const m = loadHelper();
  const fx = makeDraftSandbox({ slug: 'bad-json' });
  fs.writeFileSync(fx.manifestPath, '{ not valid json');
  try {
    const drafts = m.discoverIncubatorDrafts({ incubatorDir: fx.incubatorDir });
    assert.equal(drafts.length, 0);
  } finally {
    rmTmpdir(fx.sandbox);
  }
});

// ---- renderProposal ----

test('29-05 T2: renderProposal returns string with origin + body + net-new diff', () => {
  const m = loadHelper();
  const fx = makeDraftSandbox({ slug: 'render-skill' });
  try {
    const [draft] = m.discoverIncubatorDrafts({ incubatorDir: fx.incubatorDir });
    const rendered = m.renderProposal(draft, {
      existingArtifactResolver: () => null, // net-new
    });
    assert.equal(typeof rendered, 'string');
    assert.match(rendered, /render-skill/);
    assert.match(rendered, /Origin/i);
    assert.match(rendered, /net-new|No existing artifact/i);
    assert.match(rendered, /Draft body content/);
  } finally {
    rmTmpdir(fx.sandbox);
  }
});

test('29-05 T2: renderProposal includes diff section when existing artifact resolves', () => {
  const m = loadHelper();
  const fx = makeDraftSandbox({ slug: 'render-with-diff' });
  try {
    const [draft] = m.discoverIncubatorDrafts({ incubatorDir: fx.incubatorDir });
    const rendered = m.renderProposal(draft, {
      existingArtifactResolver: () => '# existing artifact body\n',
    });
    assert.match(rendered, /existing artifact|---|\+\+\+|diff/i);
  } finally {
    rmTmpdir(fx.sandbox);
  }
});

// ---- applyAccept ----

function copyRegistryToSandbox(sandbox) {
  const fakeRefDir = path.join(sandbox, 'reference');
  fs.mkdirSync(fakeRefDir, { recursive: true });
  // Use a minimal valid Phase 14.5 registry shape (agents/skills arrays, additive).
  // Note: production registry has `entries`, but Phase 14.5 self-authoring contract
  // (per plan interfaces block) uses { agents: [...], skills: [...] }. Helper handles both.
  const initial = {
    agents: [],
    skills: [],
  };
  const target = path.join(fakeRefDir, 'registry.json');
  fs.writeFileSync(target, JSON.stringify(initial, null, 2));
  return target;
}

test('29-05 T2: applyAccept calls validateScope FIRST — out-of-scope target_path throws', () => {
  const m = loadHelper();
  const fx = makeDraftSandbox({
    slug: 'evil',
    kind: 'agent',
    target_path: 'scripts/evil.cjs', // out-of-scope
  });
  const registryPath = copyRegistryToSandbox(fx.sandbox);
  try {
    const [draft] = m.discoverIncubatorDrafts({ incubatorDir: fx.incubatorDir });
    assert.throws(
      () => m.applyAccept(draft, { registryPath, repoRoot: fx.sandbox }),
      (err) => /scope|allowed|outside/i.test(err.message)
    );
    // Registry untouched
    const reg = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    assert.equal(Array.isArray(reg.agents) ? reg.agents.length : 0, 0);
    assert.equal(Array.isArray(reg.skills) ? reg.skills.length : 0, 0);
    // Incubator subdir untouched
    assert.equal(fs.existsSync(fx.slugDir), true);
  } finally {
    rmTmpdir(fx.sandbox);
  }
});

test('29-05 T2: applyAccept promotes skill draft and appends registry entry (Phase 14.5 schema)', () => {
  const m = loadHelper();
  const fx = makeDraftSandbox({ slug: 'promote-me', kind: 'skill' });
  const registryPath = copyRegistryToSandbox(fx.sandbox);
  try {
    const [draft] = m.discoverIncubatorDrafts({ incubatorDir: fx.incubatorDir });
    const result = m.applyAccept(draft, { registryPath, repoRoot: fx.sandbox });
    assert.equal(result.accepted, true);

    // File promoted to skills/<slug>/SKILL.md under sandbox
    const promotedPath = path.join(fx.sandbox, 'skills', 'promote-me', 'SKILL.md');
    assert.equal(fs.existsSync(promotedPath), true);
    const promotedContent = fs.readFileSync(promotedPath, 'utf8');
    assert.match(promotedContent, /promote-me/);

    // Registry has the new entry with Phase 14.5 shape
    const reg = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    assert.ok(Array.isArray(reg.skills), 'registry.skills should be an array');
    assert.equal(reg.skills.length, 1);
    const entry = reg.skills[0];
    assert.equal(entry.slug, 'promote-me');
    assert.equal(entry.path, 'skills/promote-me/SKILL.md');
    assert.equal(entry.origin, 'incubator');
    assert.match(entry.added, /^\d{4}-\d{2}-\d{2}T/);

    // Incubator subdir removed
    assert.equal(fs.existsSync(fx.slugDir), false);
  } finally {
    rmTmpdir(fx.sandbox);
  }
});

test('29-05 T2: applyAccept promotes agent draft to agents/<slug>.md', () => {
  const m = loadHelper();
  const fx = makeDraftSandbox({ slug: 'agent-x', kind: 'agent' });
  const registryPath = copyRegistryToSandbox(fx.sandbox);
  try {
    const [draft] = m.discoverIncubatorDrafts({ incubatorDir: fx.incubatorDir });
    m.applyAccept(draft, { registryPath, repoRoot: fx.sandbox });
    const promotedPath = path.join(fx.sandbox, 'agents', 'agent-x.md');
    assert.equal(fs.existsSync(promotedPath), true);
    const reg = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    assert.equal(reg.agents.length, 1);
    assert.equal(reg.agents[0].path, 'agents/agent-x.md');
    assert.equal(reg.agents[0].origin, 'incubator');
  } finally {
    rmTmpdir(fx.sandbox);
  }
});

test('29-05 T2: applyAccept dryRun returns intent without writing files', () => {
  const m = loadHelper();
  const fx = makeDraftSandbox({ slug: 'dry-skill', kind: 'skill' });
  const registryPath = copyRegistryToSandbox(fx.sandbox);
  try {
    const [draft] = m.discoverIncubatorDrafts({ incubatorDir: fx.incubatorDir });
    const result = m.applyAccept(draft, { registryPath, repoRoot: fx.sandbox, dryRun: true });
    assert.equal(result.wouldWrite, 'skills/dry-skill/SKILL.md');
    assert.ok(result.wouldRegister, 'should describe registry entry');
    // No actual filesystem changes
    const promotedPath = path.join(fx.sandbox, 'skills', 'dry-skill', 'SKILL.md');
    assert.equal(fs.existsSync(promotedPath), false);
    assert.equal(fs.existsSync(fx.slugDir), true); // still in incubator
    const reg = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    assert.equal(reg.skills.length, 0);
  } finally {
    rmTmpdir(fx.sandbox);
  }
});

// ---- applyReject ----

test('29-05 T2: applyReject removes incubator subdir; registry untouched', () => {
  const m = loadHelper();
  const fx = makeDraftSandbox({ slug: 'reject-me' });
  const registryPath = copyRegistryToSandbox(fx.sandbox);
  try {
    const [draft] = m.discoverIncubatorDrafts({ incubatorDir: fx.incubatorDir });
    const result = m.applyReject(draft);
    assert.equal(result.rejected, true);
    assert.equal(result.slug, 'reject-me');
    assert.equal(fs.existsSync(fx.slugDir), false);
    // Registry untouched
    const reg = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    assert.equal(reg.skills.length, 0);
    assert.equal(reg.agents.length, 0);
  } finally {
    rmTmpdir(fx.sandbox);
  }
});

// ---- applyEdit ----

test('29-05 T2: applyEdit invokes editor (mocked) and returns edited draft', () => {
  const m = loadHelper();
  const fx = makeDraftSandbox({ slug: 'edit-me' });
  try {
    const [draft] = m.discoverIncubatorDrafts({ incubatorDir: fx.incubatorDir });
    // Mock editor: a node script that appends text to the file passed as arg.
    // Use editorCmd (array form) so paths-with-spaces (Windows execPath) are
    // tokenized correctly without shell quoting.
    const editorScript = path.join(fx.sandbox, 'mock-editor.cjs');
    fs.writeFileSync(
      editorScript,
      `'use strict';\nconst fs = require('fs');\nconst f = process.argv[2];\nconst current = fs.readFileSync(f, 'utf8');\nfs.writeFileSync(f, current + '\\n# edited\\n');\nprocess.exit(0);\n`
    );
    const result = m.applyEdit(draft, { editorCmd: [process.execPath, editorScript] });
    assert.ok(result, 'editResult should not be null');
    // The draft file should now contain the edit
    const updated = fs.readFileSync(fx.draftPath, 'utf8');
    assert.match(updated, /# edited/);
  } finally {
    rmTmpdir(fx.sandbox);
  }
});

test('29-05 T2: applyEdit returns unchanged on editor abort (non-zero exit)', () => {
  const m = loadHelper();
  const fx = makeDraftSandbox({ slug: 'edit-abort' });
  try {
    const [draft] = m.discoverIncubatorDrafts({ incubatorDir: fx.incubatorDir });
    const editorScript = path.join(fx.sandbox, 'mock-aborter.cjs');
    fs.writeFileSync(editorScript, `'use strict';\nprocess.exit(1);\n`);
    const result = m.applyEdit(draft, { editorCmd: [process.execPath, editorScript] });
    assert.equal(result.edited, false);
    assert.match(result.reason, /abort|editor/i);
  } finally {
    rmTmpdir(fx.sandbox);
  }
});

// ---- quoteArg backslash escape (closes Code Scanning #23) ----

test('29-05 T2+: quoteArg escapes backslashes before quotes (Code Scanning #23)', () => {
  // quoteArg is not exported, so we extract the function body from
  // source and eval it locally. Asserts both source-shape (backslash
  // replace chained BEFORE quote replace) AND behavioral correctness
  // (round-trippable double-quote-wrapped strings for paths containing
  // backslashes + quotes).
  const src = fs.readFileSync(HELPER_MODULE, 'utf8');
  const fnMatch = src.match(/function quoteArg\(s\)\s*\{[\s\S]*?\n\}/);
  assert.ok(fnMatch, 'quoteArg function must be defined in incubator-proposals.cjs');

  // Order check: backslash escape must happen BEFORE quote escape.
  const orderMatch = fnMatch[0].match(/\.replace\(\/\\\\\/g[^)]*\)\s*\.replace\(\/"\/g/);
  assert.ok(
    orderMatch,
    `quoteArg must escape backslashes BEFORE quotes (got: ${fnMatch[0]})`
  );

  // Behavioral test via local eval of the same function body.
  // eslint-disable-next-line no-new-func
  const quoteArg = new Function(`${fnMatch[0]}; return quoteArg;`)();

  // Plain string -> wrapped in quotes
  assert.equal(quoteArg('foo'), '"foo"');

  // Embedded quote -> escaped
  assert.equal(quoteArg('a"b'), '"a\\"b"');

  // Embedded backslash -> doubled (new behavior, was unhandled before)
  assert.equal(quoteArg('a\\b'), '"a\\\\b"');

  // Adversarial: backslash-quote sequence — backslash must be doubled
  // FIRST, then quote escaped. Output is unambiguously parseable.
  assert.equal(quoteArg('a\\"b'), '"a\\\\\\"b"');

  // Windows-style path (the original motivating case)
  assert.equal(
    quoteArg('C:\\Users\\hegemon\\node.exe'),
    '"C:\\\\Users\\\\hegemon\\\\node.exe"'
  );
});

// ---- checkStage1Gate (read-only, D-01) ----

function makeGateSandbox({ acceptedCount = 0, optInRecorded = false } = {}) {
  const sandbox = mkTmpdir('ap-incu-gate');
  const refDir = path.join(sandbox, 'reference');
  fs.mkdirSync(refDir, { recursive: true });
  const gatePath = path.join(refDir, 'capability-gap-stage-gate.md');
  fs.writeFileSync(
    gatePath,
    `# Stage-Gate spec\n\n| Knob | Default | Meaning |\n|------|---------|---------|\n| K | 3 | Minimum stable clusters |\n| M | 10 | Min consecutive cycles |\n| stddev_threshold | 0.05 | Posterior cap |\n`
  );
  // Registry with acceptedCount entries marked origin: 'incubator'
  const registryPath = path.join(refDir, 'registry.json');
  const skills = [];
  for (let i = 0; i < acceptedCount; i++) {
    skills.push({ slug: `s-${i}`, path: `skills/s-${i}/SKILL.md`, added: '2026-05-19T00:00:00Z', origin: 'incubator' });
  }
  fs.writeFileSync(registryPath, JSON.stringify({ agents: [], skills }, null, 2));
  // STATE.md may carry the opt-in record
  const stateDir = path.join(sandbox, '.planning');
  fs.mkdirSync(stateDir, { recursive: true });
  const statePath = path.join(stateDir, 'STATE.md');
  const optInBlock = optInRecorded
    ? `\n## Capability-gap Stage-1 opt-in\n\n- recorded_at: 2026-05-19T00:00:00Z\n- confirmed_by: user\n`
    : '';
  fs.writeFileSync(statePath, `# State\n${optInBlock}`);
  return { sandbox, gatePath, registryPath, statePath };
}

test('29-05 T2: checkStage1Gate returns thresholdMet:false when count < K', () => {
  const m = loadHelper();
  const fx = makeGateSandbox({ acceptedCount: 1 });
  try {
    const result = m.checkStage1Gate({
      gateSpecPath: fx.gatePath,
      statePath: fx.statePath,
      registryPath: fx.registryPath,
    });
    assert.equal(result.thresholdMet, false);
    assert.equal(typeof result.summary, 'string');
    assert.equal(result.optInRecorded, false);
  } finally {
    rmTmpdir(fx.sandbox);
  }
});

test('29-05 T2: checkStage1Gate returns thresholdMet:true when count >= K (D-01: prompt only, no auto-flip)', () => {
  const m = loadHelper();
  const fx = makeGateSandbox({ acceptedCount: 3, optInRecorded: false });
  try {
    const stateBefore = fs.readFileSync(fx.statePath, 'utf8');
    const registryBefore = fs.readFileSync(fx.registryPath, 'utf8');
    const result = m.checkStage1Gate({
      gateSpecPath: fx.gatePath,
      statePath: fx.statePath,
      registryPath: fx.registryPath,
    });
    assert.equal(result.thresholdMet, true);
    assert.equal(result.optInRecorded, false);
    // CRITICAL D-01: no file writes during checkStage1Gate
    assert.equal(fs.readFileSync(fx.statePath, 'utf8'), stateBefore, 'STATE.md must not be modified');
    assert.equal(fs.readFileSync(fx.registryPath, 'utf8'), registryBefore, 'registry.json must not be modified');
  } finally {
    rmTmpdir(fx.sandbox);
  }
});

test('29-05 T2: checkStage1Gate detects existing optIn record', () => {
  const m = loadHelper();
  const fx = makeGateSandbox({ acceptedCount: 3, optInRecorded: true });
  try {
    const result = m.checkStage1Gate({
      gateSpecPath: fx.gatePath,
      statePath: fx.statePath,
      registryPath: fx.registryPath,
    });
    assert.equal(result.optInRecorded, true);
  } finally {
    rmTmpdir(fx.sandbox);
  }
});

// ---- recordOptIn (D-01 — only on explicit user confirmation) ----

test('29-05 T2: recordOptIn writes opt-in record to state path', () => {
  const m = loadHelper();
  const fx = makeGateSandbox({ acceptedCount: 3 });
  try {
    const result = m.recordOptIn({ statePath: fx.statePath, confirmedBy: 'user@example' });
    assert.equal(result.optInRecorded, true);
    assert.equal(typeof result.at, 'string');
    const state = fs.readFileSync(fx.statePath, 'utf8');
    assert.match(state, /Stage-1 opt-in|capability.gap.*opt.in|confirmed_by/i);
  } finally {
    rmTmpdir(fx.sandbox);
  }
});

test('29-05 T2: recordOptIn is idempotent (already recorded → alreadyRecorded:true)', () => {
  const m = loadHelper();
  const fx = makeGateSandbox({ acceptedCount: 3, optInRecorded: true });
  try {
    const result = m.recordOptIn({ statePath: fx.statePath, confirmedBy: 'user@example' });
    assert.equal(result.alreadyRecorded, true);
  } finally {
    rmTmpdir(fx.sandbox);
  }
});

// ---- module exports surface ----

test('29-05 T2: helper module exports all 7 required functions', () => {
  const m = loadHelper();
  const required = [
    'discoverIncubatorDrafts',
    'renderProposal',
    'applyAccept',
    'applyReject',
    'applyEdit',
    'checkStage1Gate',
    'recordOptIn',
  ];
  for (const fn of required) {
    assert.equal(typeof m[fn], 'function', `missing export: ${fn}`);
  }
});

// ---------------------------------------------------------------------------
// Section 3: SKILL + procedure structural assertions
// ---------------------------------------------------------------------------

test('29-05 T3: SKILL.md contains [INCUBATOR] section marker', () => {
  const src = fs.readFileSync(SKILL_PATH, 'utf8');
  assert.match(src, /\[INCUBATOR\]/);
});

test('29-05 T3: SKILL.md stays at ≤110 lines after extension', () => {
  const src = fs.readFileSync(SKILL_PATH, 'utf8');
  const lines = src.split('\n').length;
  assert.ok(lines <= 110, `SKILL.md is ${lines} lines, cap is 110`);
});

test('29-05 T3: SKILL.md references helper module path', () => {
  const src = fs.readFileSync(SKILL_PATH, 'utf8');
  assert.match(src, /scripts\/lib\/apply-reflections\/incubator-proposals\.cjs/);
});

test('29-05 T3: procedure.md contains ### [INCUBATOR] section', () => {
  const src = fs.readFileSync(PROCEDURE_PATH, 'utf8');
  assert.match(src, /^### \[INCUBATOR\]/m);
});

test('29-05 T3: procedure.md cites validateScope by name', () => {
  const src = fs.readFileSync(PROCEDURE_PATH, 'utf8');
  assert.match(src, /validateScope/);
});

test('29-05 T3: procedure.md tags include incubator + version bumped to >= 1.1.0', () => {
  const src = fs.readFileSync(PROCEDURE_PATH, 'utf8');
  assert.match(src, /tags:.*incubator/);
  // 29-05 introduced 1.1.0; subsequent plans (e.g. 29-06's bandit-fairness
  // gate wiring) may bump further. Accept any 1.x version >= 1.1.0.
  const m = src.match(/version:\s*(\d+)\.(\d+)\.(\d+)/);
  assert.ok(m, 'version field present');
  const [, maj, min] = m;
  assert.equal(maj, '1', `major version should be 1, got ${maj}`);
  assert.ok(Number(min) >= 1, `minor version should be >= 1, got ${min}`);
});

test('29-05 T3: procedure.md retains all 5 prior proposal-class sections (no regression)', () => {
  // Plain substring check — each tag is a literal hardcoded enum like
  // '[FRONTMATTER]', so we just need to verify the heading exists in the
  // file. Closes Code Scanning #24 + #25 (js/incomplete-sanitization):
  // the prior implementation built a regex by escaping `[` and `]` via
  // single-occurrence .replace() calls, which CodeQL flagged even
  // though each input had exactly one of each. Using includes() avoids
  // the regex entirely and is more obviously correct.
  const src = fs.readFileSync(PROCEDURE_PATH, 'utf8');
  for (const tag of ['[FRONTMATTER]', '[REFERENCE]', '[BUDGET]', '[QUESTION]', '[GLOBAL-SKILL]']) {
    assert.ok(
      src.includes(`### ${tag}`),
      `regression: missing ${tag} section`,
    );
  }
});
