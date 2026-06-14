'use strict';

/**
 * tests/build-distribution-bundles.test.cjs — Phase 28.8 (Plan 28-8-X1).
 *
 * Tests for scripts/build-distribution-bundles.cjs. Per CONTEXT D-10, every
 * test uses tmpdir simulation — no test writes to production dist/, skills/,
 * or scripts/lib/install/converters/. The two integration tests against the
 * real Wave-B converters use the real production converter paths but with
 * tmpdir sourceRoot + outRoot — the converters are read-only consumers of
 * those tmpdir inputs.
 *
 * Test framework: node:test + node:assert/strict (matches Phase 28.5+ idiom).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { PassThrough } = require('node:stream');

const bundler = require('../../scripts/build-distribution-bundles.cjs');

// ----------------------------------------------------------------------
// Fixture helpers
// ----------------------------------------------------------------------

function mkTmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix || 'hone-bundler-test-'));
}

function writeFixtureSkill(sourceRoot, skillName, files) {
  const skillDir = path.join(sourceRoot, 'skills', skillName);
  fs.mkdirSync(skillDir, { recursive: true });
  for (const [relPath, content] of Object.entries(files)) {
    const dest = path.join(skillDir, relPath);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, content);
  }
}

/**
 * Build a minimal source-root fixture: skills/alpha + skills/beta.
 * Returns the temp directory path.
 */
function buildFixtureSourceRoot() {
  const root = mkTmp('hone-bundler-src-');
  writeFixtureSkill(root, 'alpha', {
    'SKILL.md': '---\nname: alpha\ndescription: alpha skill\n---\n\n# alpha body\n',
    'extra.md': 'alpha extra\n',
  });
  writeFixtureSkill(root, 'beta', {
    'SKILL.md': '---\nname: beta\ndescription: beta skill\n---\n\n# beta body\n',
  });
  return root;
}

function fakeRuntimesModule(entries) {
  return { listRuntimes: () => entries.slice() };
}

/**
 * Recursively list (relPath, sha256(content)) tuples under `root`. Used for
 * determinism checks — two snapshots are deeply equal iff every file under
 * `root` is byte-identical and the file set is identical.
 */
function snapshotDir(root) {
  const out = [];
  function walk(dir, prefix) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true })
      .slice().sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      const p = path.join(dir, e.name);
      const rel = prefix ? prefix + '/' + e.name : e.name;
      if (e.isDirectory()) walk(p, rel);
      else if (e.isFile()) {
        const buf = fs.readFileSync(p);
        const h = crypto.createHash('sha256').update(buf).digest('hex');
        out.push([rel, h]);
      }
    }
  }
  walk(root, '');
  return out;
}

// Resolve real Wave-B converter paths once — used by integration tests to
// detect whether the converters exist (they DO post-Wave-B, but the skip
// guard keeps the suite green if someone runs it in isolation).
const REAL_CURSOR_CONVERTER = path.join(
  __dirname, '../..', 'scripts', 'lib', 'install', 'converters', 'cursor-marketplace.cjs'
);
const REAL_CODEX_CONVERTER = path.join(
  __dirname, '../..', 'scripts', 'lib', 'install', 'converters', 'codex-plugin.cjs'
);

// ----------------------------------------------------------------------
// Tests
// ----------------------------------------------------------------------

test('discoverTier2Channels filters by kind + always includes agentskills-io passthrough', () => {
  const rtm = fakeRuntimesModule([
    { id: 'claude', kind: 'claude-marketplace' },
    { id: 'cursor', kind: 'multi-artifact' },
    { id: 'cursor-mp', kind: 'cursor-marketplace' },
    { id: 'codex-mp', kind: 'codex-plugin' },
    { id: 'gemini', kind: 'multi-artifact' },
  ]);
  const channels = bundler.discoverTier2Channels(rtm);
  const ids = channels.map((c) => c.id).sort();
  assert.deepEqual(ids, ['agentskills-io', 'codex-mp', 'cursor-mp']);
  const passthrough = channels.find((c) => c.id === 'agentskills-io');
  assert.equal(passthrough.kind, 'passthrough');
  assert.equal(passthrough.converterPath, null);
  // Tier-1 entries (claude-marketplace, multi-artifact) MUST NOT be included.
  assert.equal(channels.find((c) => c.id === 'claude'), undefined);
  assert.equal(channels.find((c) => c.id === 'cursor'), undefined);
  assert.equal(channels.find((c) => c.id === 'gemini'), undefined);
});

test('agentskills-io bundle is passthrough copy of skills/ — byte-identical, no manifest', () => {
  const sourceRoot = buildFixtureSourceRoot();
  const outRoot = mkTmp('hone-bundler-out-');
  const rtm = fakeRuntimesModule([]); // no Tier-2 runtimes — only passthrough builds
  const results = bundler.buildAllChannels({
    sourceRoot, outRoot, runtimesModule: rtm,
    packageJson: { name: 'fixture', version: '0.0.0', description: 'fixture' },
  });
  assert.equal(results.length, 1);
  assert.equal(results[0].channel, 'agentskills-io');

  // SKILL.md byte-identical to source
  const srcSkill = fs.readFileSync(path.join(sourceRoot, 'skills', 'alpha', 'SKILL.md'));
  const dstSkill = fs.readFileSync(path.join(outRoot, 'agentskills-io', 'skills', 'alpha', 'SKILL.md'));
  assert.deepEqual(srcSkill, dstSkill);

  // Supporting files in skill dir also passthrough
  const srcExtra = fs.readFileSync(path.join(sourceRoot, 'skills', 'alpha', 'extra.md'));
  const dstExtra = fs.readFileSync(path.join(outRoot, 'agentskills-io', 'skills', 'alpha', 'extra.md'));
  assert.deepEqual(srcExtra, dstExtra);

  // beta is also present
  assert.equal(
    fs.existsSync(path.join(outRoot, 'agentskills-io', 'skills', 'beta', 'SKILL.md')),
    true
  );

  // No manifest at bundle root (D-02 / D-13)
  assert.equal(fs.existsSync(path.join(outRoot, 'agentskills-io', '.cursor-plugin')), false);
  assert.equal(fs.existsSync(path.join(outRoot, 'agentskills-io', '.codex-plugin')), false);
});

test('buildAllChannels — passthrough determinism (two runs byte-identical)', () => {
  const sourceRoot = buildFixtureSourceRoot();
  const outRoot1 = mkTmp('hone-bundler-det1-');
  const outRoot2 = mkTmp('hone-bundler-det2-');
  const rtm = fakeRuntimesModule([]);
  const pkgJson = { name: 'fixture', version: '0.0.0', description: 'fixture' };
  bundler.buildAllChannels({ sourceRoot, outRoot: outRoot1, runtimesModule: rtm, packageJson: pkgJson });
  bundler.buildAllChannels({ sourceRoot, outRoot: outRoot2, runtimesModule: rtm, packageJson: pkgJson });
  const snap1 = snapshotDir(path.join(outRoot1, 'agentskills-io'));
  const snap2 = snapshotDir(path.join(outRoot2, 'agentskills-io'));
  assert.deepEqual(snap1, snap2);
  // Sanity: the snapshot is non-empty
  assert.ok(snap1.length >= 3, 'expected ≥3 files in agentskills-io passthrough');
});

test('--channel agentskills-io filter — only that channel built', () => {
  const sourceRoot = buildFixtureSourceRoot();
  const outRoot = mkTmp('hone-bundler-filter-');
  const rtm = fakeRuntimesModule([
    // Advertise tier-2 channels but only build the passthrough — verifies
    // that the filter scopes the build even when other channels are available.
    { id: 'cursor-marketplace', kind: 'cursor-marketplace' },
    { id: 'codex-plugin', kind: 'codex-plugin' },
  ]);
  bundler.buildAllChannels({
    sourceRoot, outRoot, runtimesModule: rtm,
    packageJson: { name: 'fixture', version: '0.0.0', description: 'fixture' },
    channelFilter: 'agentskills-io',
  });
  assert.equal(fs.existsSync(path.join(outRoot, 'agentskills-io')), true);
  assert.equal(fs.existsSync(path.join(outRoot, 'cursor-marketplace')), false);
  assert.equal(fs.existsSync(path.join(outRoot, 'codex-plugin')), false);
});

test('main(--help) returns 0 and prints usage to stdout', () => {
  const out = new PassThrough();
  const err = new PassThrough();
  let stdoutBuf = '';
  out.on('data', (chunk) => { stdoutBuf += chunk.toString(); });
  const code = bundler.main(['--help'], { stdout: out, stderr: err });
  assert.equal(code, 0);
  assert.match(stdoutBuf, /Usage:/);
  assert.match(stdoutBuf, /--channel/);
});

test('main(unknown arg) returns 2 with error + usage on stderr', () => {
  const out = new PassThrough();
  const err = new PassThrough();
  let stderrBuf = '';
  err.on('data', (chunk) => { stderrBuf += chunk.toString(); });
  const code = bundler.main(['--nonsense'], { stdout: out, stderr: err });
  assert.equal(code, 2);
  assert.match(stderrBuf, /Unknown argument/);
});

test('main(--channel bogus) returns 2 with informative error message', () => {
  // This test invokes the PRODUCTION runtimes.cjs + skills/, which is fine:
  // 'bogus' won't match any discovered channel id so we get UNKNOWN_CHANNEL
  // → exit 2 BEFORE any filesystem writes. dist/ is untouched.
  const out = new PassThrough();
  const err = new PassThrough();
  let stderrBuf = '';
  err.on('data', (chunk) => { stderrBuf += chunk.toString(); });
  const code = bundler.main(['--channel', 'bogus'], { stdout: out, stderr: err });
  assert.equal(code, 2);
  assert.match(stderrBuf, /Unknown channel.*bogus/i);
});

test('missing converter file — buildChannel throws MISSING_CONVERTER (→ exit 2 via main)', () => {
  const sourceRoot = buildFixtureSourceRoot();
  const outRoot = mkTmp('hone-bundler-missing-');
  const fakeChannel = {
    id: 'phantom-channel',
    kind: 'phantom-kind',
    converterPath: path.join(outRoot, 'this-converter-does-not-exist.cjs'),
  };
  assert.throws(
    () => bundler.buildChannel(fakeChannel, {
      sourceRoot, outRoot, packageJson: { name: 'fixture', version: '0.0.0', description: 'fx' },
    }),
    (err) => err.code === 'MISSING_CONVERTER'
      && err.channelId === 'phantom-channel'
      && /Missing converter/.test(err.message),
  );
});

test('converter convert() throws — buildChannel surfaces CONVERTER_EXEC_FAILED (→ exit 1)', () => {
  const sourceRoot = buildFixtureSourceRoot();
  const outRoot = mkTmp('hone-bundler-throw-');
  // Write a stub converter to a tmp path. NOT to scripts/lib/install/converters/ —
  // this respects D-10 (no production-path writes from tests).
  const stubDir = mkTmp('hone-bundler-stub-');
  const stubConverterPath = path.join(stubDir, 'throwing-converter.cjs');
  fs.writeFileSync(stubConverterPath, [
    "'use strict';",
    "module.exports = {",
    "  buildManifest() { return { name: 'fx', version: '0.0.0', description: 'fx' }; },",
    "  convert() { throw new Error('boom from converter'); },",
    "};",
  ].join('\n'));
  const fakeChannel = {
    id: 'throwing-channel',
    kind: 'throwing-kind',
    converterPath: stubConverterPath,
  };
  assert.throws(
    () => bundler.buildChannel(fakeChannel, {
      sourceRoot, outRoot, packageJson: { name: 'fixture', version: '0.0.0', description: 'fx' },
    }),
    (err) => err.code === 'CONVERTER_EXEC_FAILED'
      && /boom from converter/.test(err.message)
      // Skill list ('alpha, beta') must appear in error message for debug aid.
      && /alpha/.test(err.message),
  );
});

test('converter buildManifest() throws — buildChannel surfaces MANIFEST_BUILD_FAILED (→ exit 1)', () => {
  const sourceRoot = buildFixtureSourceRoot();
  const outRoot = mkTmp('hone-bundler-mfthrow-');
  const stubDir = mkTmp('hone-bundler-stub-');
  const stubConverterPath = path.join(stubDir, 'mf-throwing-converter.cjs');
  fs.writeFileSync(stubConverterPath, [
    "'use strict';",
    "module.exports = {",
    "  buildManifest() { throw new Error('manifest blew up'); },",
    "  convert() { /* unreachable */ },",
    "};",
  ].join('\n'));
  const fakeChannel = {
    id: 'mf-throwing-channel',
    kind: 'mf-throwing-kind',
    converterPath: stubConverterPath,
  };
  assert.throws(
    () => bundler.buildChannel(fakeChannel, {
      sourceRoot, outRoot, packageJson: { name: 'fixture', version: '0.0.0', description: 'fx' },
    }),
    (err) => err.code === 'MANIFEST_BUILD_FAILED'
      && /manifest blew up/.test(err.message),
  );
});

// ----- Wave-B integration tests -----
// These tests drive the REAL Wave-B converters against tmpdir source/out
// roots. They're gated by t.skip() so the suite stays green if either
// converter is removed.

test('buildAllChannels with real Wave-B converters — 3 bundles + correct manifest paths', (t) => {
  if (!fs.existsSync(REAL_CURSOR_CONVERTER) || !fs.existsSync(REAL_CODEX_CONVERTER)) {
    t.skip('Wave-B converters (B1/C1) not present — skipping integration test');
    return;
  }

  const sourceRoot = buildFixtureSourceRoot();
  const outRoot = mkTmp('hone-bundler-waveb-');
  const rtm = fakeRuntimesModule([
    { id: 'cursor-marketplace', kind: 'cursor-marketplace' },
    { id: 'codex-plugin', kind: 'codex-plugin' },
  ]);
  bundler.buildAllChannels({
    sourceRoot, outRoot, runtimesModule: rtm,
    packageJson: {
      name: 'fixture-pkg',
      version: '1.28.8',
      description: 'fixture bundle test',
      author: 'Hegemon',
      license: 'MIT',
      keywords: ['design', 'ui'],
    },
  });

  assert.equal(fs.existsSync(path.join(outRoot, 'cursor-marketplace')), true);
  assert.equal(fs.existsSync(path.join(outRoot, 'codex-plugin')), true);
  assert.equal(fs.existsSync(path.join(outRoot, 'agentskills-io')), true);

  // Manifests at expected paths (D-15: .cursor-plugin/plugin.json for Cursor;
  // C1 contract: .codex-plugin/plugin.json for Codex).
  const cursorManifest = path.join(outRoot, 'cursor-marketplace', '.cursor-plugin', 'plugin.json');
  const codexManifest = path.join(outRoot, 'codex-plugin', '.codex-plugin', 'plugin.json');
  assert.equal(fs.existsSync(cursorManifest), true, 'cursor manifest missing at ' + cursorManifest);
  assert.equal(fs.existsSync(codexManifest), true, 'codex manifest missing at ' + codexManifest);

  // Manifest files are valid JSON with required fields.
  const cursorObj = JSON.parse(fs.readFileSync(cursorManifest, 'utf8'));
  assert.ok(cursorObj.name, 'cursor manifest must have name');
  assert.ok(cursorObj.version, 'cursor manifest must have version');
  assert.ok(cursorObj.description, 'cursor manifest must have description');

  const codexObj = JSON.parse(fs.readFileSync(codexManifest, 'utf8'));
  assert.ok(codexObj.name, 'codex manifest must have name');
  assert.ok(codexObj.version, 'codex manifest must have version');
  assert.ok(codexObj.description, 'codex manifest must have description');

  // D-14: No .codex-plugin/marketplace.json produced.
  assert.equal(
    fs.existsSync(path.join(outRoot, 'codex-plugin', '.codex-plugin', 'marketplace.json')),
    false,
    'codex-plugin bundle must NOT contain a marketplace.json (D-14)'
  );

  // Passthrough bundle has no manifests.
  assert.equal(fs.existsSync(path.join(outRoot, 'agentskills-io', '.cursor-plugin')), false);
  assert.equal(fs.existsSync(path.join(outRoot, 'agentskills-io', '.codex-plugin')), false);

  // Each Tier-2 bundle contains the skills/ subtree (verbatim copy).
  for (const channel of ['cursor-marketplace', 'codex-plugin']) {
    assert.equal(
      fs.existsSync(path.join(outRoot, channel, 'skills', 'alpha', 'SKILL.md')),
      true,
      'expected ' + channel + ' to include skills/alpha/SKILL.md'
    );
    assert.equal(
      fs.existsSync(path.join(outRoot, channel, 'skills', 'beta', 'SKILL.md')),
      true,
      'expected ' + channel + ' to include skills/beta/SKILL.md'
    );
  }
});

test('buildAllChannels with real Wave-B converters — full determinism (two runs byte-identical)', (t) => {
  if (!fs.existsSync(REAL_CURSOR_CONVERTER) || !fs.existsSync(REAL_CODEX_CONVERTER)) {
    t.skip('Wave-B converters (B1/C1) not present — skipping determinism check');
    return;
  }
  const sourceRoot = buildFixtureSourceRoot();
  const outRoot1 = mkTmp('hone-bundler-detb1-');
  const outRoot2 = mkTmp('hone-bundler-detb2-');
  const rtm = fakeRuntimesModule([
    { id: 'cursor-marketplace', kind: 'cursor-marketplace' },
    { id: 'codex-plugin', kind: 'codex-plugin' },
  ]);
  const pkg = {
    name: 'fixture-pkg',
    version: '1.28.8',
    description: 'determinism test',
    author: 'Hegemon',
    license: 'MIT',
    keywords: ['design', 'ui'],
  };
  bundler.buildAllChannels({ sourceRoot, outRoot: outRoot1, runtimesModule: rtm, packageJson: pkg });
  bundler.buildAllChannels({ sourceRoot, outRoot: outRoot2, runtimesModule: rtm, packageJson: pkg });
  for (const channel of ['cursor-marketplace', 'codex-plugin', 'agentskills-io']) {
    const a = snapshotDir(path.join(outRoot1, channel));
    const b = snapshotDir(path.join(outRoot2, channel));
    assert.deepEqual(a, b, 'determinism violated in channel: ' + channel);
    assert.ok(a.length > 0, 'snapshot must be non-empty for channel: ' + channel);
  }
});
