'use strict';

// Phase 31 — Figma Off-Context Extractor regression baseline.
//
// Locks the union of Wave A + B + C + D deliverables as a single release artifact
// so future drift cannot silently regress the v1.31.0 contract. Asserts:
//   - 4-manifest version lockstep (package + .claude-plugin/plugin + .cursor-plugin/
//     plugin + .codex-plugin/plugin), VERSION-AGNOSTIC (reads package.json#version,
//     asserts the other three equal it) — per the D-08 lesson (Phases 25/26/27/30.6).
//   - 2 Tier-2 marketplace lockstep (metadata.version + plugins[0].version).
//   - DESIGN.md ordered section-header fingerprint vs design-md.txt (offline e2e).
//   - components.json variant-rollup count + COMPONENT_SET marker vs components-json.txt (D-02).
//   - tokens.json non-empty + FILL marker vs tokens-json.txt (Path B fix).
//   - figma_extract health 'ready (token set)' line vs health-line.txt (31-09).
//   - figma-plugin manifest allowedDomains == localhost pair vs manifest-network-scope.txt (D-06).
//   - token-isolation static scan == 0 violations vs token-isolation-static.txt (D-10).
//   - CHANGELOG has a ## [1.31.0] block.
//   - skills/figma-extract/SKILL.md exists with name: hone-figma-extract.
//
// Tagged `31-10:`. >= 9 tests.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '../..');
const BASELINE_DIR = path.join(REPO_ROOT, 'test/fixtures/baselines/phase-31');
const FIXTURE_DIR = path.join(REPO_ROOT, 'test/fixtures/figma');
const EXTRACT_LIB_DIR = path.join(REPO_ROOT, 'scripts/lib/figma-extract');

function read(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}
function readBaseline(name) {
  return fs.readFileSync(path.join(BASELINE_DIR, name), 'utf8');
}
function readJsonRel(rel) {
  return JSON.parse(read(rel));
}
// Robust line splitter (baselines may be checked out CRLF on Windows).
function lines(text) {
  return text.split(/\r?\n/).map((l) => l.replace(/\s+$/, ''));
}
function parseKv(text) {
  const out = {};
  for (const l of lines(text)) {
    if (!l || l.startsWith('#')) continue;
    const eq = l.indexOf('=');
    if (eq > 0) out[l.slice(0, eq).trim()] = l.slice(eq + 1).trim();
  }
  return out;
}

// ── shared offline e2e (mirrors phase-31-end-to-end.test.cjs) ─────────────────
const { pull } = require('../../scripts/lib/figma-extract/pull.cjs');
const { digest } = require('../../scripts/lib/figma-extract/digest.cjs');
const { buildStylesResolver } = require('../../scripts/lib/figma-extract/styles-resolver.cjs');

const FILE_KEY = 'SAMPLEKEY';
const FETCHED_AT = '2026-05-29T00:00:00Z';

function fixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, `${name}.json`), 'utf8'));
}
function jsonRes(b) {
  return { ok: true, status: 200, async json() { return b; }, async text() { return JSON.stringify(b); } };
}
function errRes(s) {
  return { ok: false, status: s, async json() { return {}; }, async text() { return `e${s}`; } };
}
function fetchStub() {
  const files = fixture('files-response');
  const styles = fixture('styles-response');
  const nodes = fixture('nodes-response');
  return async (url) => {
    if (url.includes('/variables/local')) return errRes(403);
    if (url.includes('/nodes?ids=')) return jsonRes(nodes);
    if (url.includes('/styles')) return jsonRes(styles);
    if (url.includes('/components')) return jsonRes({ meta: { components: {} } });
    if (url.includes('/component_sets')) return jsonRes({ meta: { component_sets: {} } });
    if (/\/files\/[^/?]+(\?depth=1)?$/.test(url)) return jsonRes(files);
    return errRes(404);
  };
}

// Generate the e2e digest into a temp dir; return { outDir, cleanup }.
async function generateDigest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fx-base-'));
  const rawDir = path.join(tmp, 'raw');
  const outDir = path.join(tmp, 'digest');
  const fetchImpl = fetchStub();
  await pull({ input: FILE_KEY, outDir: rawDir, token: 'figd_BASELINE_TEST', fetchImpl });
  const stylesResolver = buildStylesResolver({ fileKey: FILE_KEY, token: 'figd_BASELINE_TEST', fetchImpl });
  await digest({ rawDir, outDir, stylesResolver, fetchedAtOverride: FETCHED_AT });
  return { outDir, cleanup: () => fs.rmSync(tmp, { recursive: true, force: true }) };
}

// Token-isolation scanner (same regex pair as figma-extract-token-isolation.test.cjs).
const TOKEN_VARS = '(?:FIGMA_TOKEN|FIGMA_PERSONAL_ACCESS_TOKEN)';
const PERSIST_RE = new RegExp(`(?:writeFile|writeFileSync|appendFile|appendFileSync)\\s*\\([^)]*${TOKEN_VARS}`);
const LOG_RE = new RegExp(`(?:console\\.(?:log|warn|error|info|debug)|logger\\.\\w+|process\\.std(?:out|err)\\.write)\\s*\\([^)]*${TOKEN_VARS}`);
function countViolations() {
  let total = 0;
  for (const e of fs.readdirSync(EXTRACT_LIB_DIR, { withFileTypes: true })) {
    if (!e.isFile() || !e.name.endsWith('.cjs')) continue;
    const body = fs.readFileSync(path.join(EXTRACT_LIB_DIR, e.name), 'utf8');
    for (const l of body.split(/\r?\n/)) {
      if (PERSIST_RE.test(l)) total++;
      if (LOG_RE.test(l)) total++;
    }
  }
  return total;
}

// ── manifest lockstep (version-agnostic) ──────────────────────────────────────

test('31-10: 4-manifest version lockstep (package + claude plugin + cursor plugin + codex plugin equal)', () => {
  const pkgVersion = readJsonRel('package.json').version;
  assert.match(pkgVersion, /^\d+\.\d+\.\d+$/, 'package.json version looks like semver');
  for (const f of ['.claude-plugin/plugin.json', '.cursor-plugin/plugin.json', '.codex-plugin/plugin.json']) {
    assert.equal(readJsonRel(f).version, pkgVersion, `${f} version != package.json version`);
  }
});

test('31-10: marketplace.json Tier-2 lockstep (metadata.version + plugins[0].version equal package version)', () => {
  const pkgVersion = readJsonRel('package.json').version;
  const mp = readJsonRel('.claude-plugin/marketplace.json');
  assert.equal(mp.metadata.version, pkgVersion, 'marketplace metadata.version != package version');
  assert.ok(mp.plugins && mp.plugins[0], 'marketplace plugins[0] exists');
  assert.equal(mp.plugins[0].version, pkgVersion, 'marketplace plugins[0].version != package version');
});

// ── baselines ──────────────────────────────────────────────────────────────────

test('31-10: DESIGN.md baseline — e2e digest has the section headers in order', async () => {
  const expectedHeaders = lines(readBaseline('design-md.txt')).filter(Boolean);
  assert.deepEqual(
    expectedHeaders,
    ['# DESIGN.md', '## Tokens', '## Components', '## Widgets / Pages'],
    'baseline records the 4 ordered section headers'
  );
  const { outDir, cleanup } = await generateDigest();
  try {
    const md = fs.readFileSync(path.join(outDir, 'DESIGN.md'), 'utf8');
    // Assert each header appears, in order, in the generated digest.
    let cursor = 0;
    for (const h of expectedHeaders) {
      const idx = md.indexOf(`\n${h}`, cursor) >= 0 ? md.indexOf(`\n${h}`, cursor) : (md.startsWith(h) ? 0 : -1);
      assert.ok(idx >= 0, `header "${h}" present at/after offset ${cursor}`);
      cursor = idx + h.length;
    }
  } finally {
    cleanup();
  }
});

test('31-10: components.json baseline — variant rollup count + COMPONENT_SET present (D-02)', async () => {
  const kv = parseKv(readBaseline('components-json.txt'));
  assert.equal(kv.count, '2', 'baseline records rolled-up count of 2');
  assert.equal(kv.marker, 'COMPONENT_SET', 'baseline marker is COMPONENT_SET');
  const { outDir, cleanup } = await generateDigest();
  try {
    const raw = fs.readFileSync(path.join(outDir, 'components.json'), 'utf8');
    const comps = JSON.parse(raw);
    assert.equal(comps.length, Number(kv.count), 'e2e components.json count matches baseline');
    assert.ok(raw.includes(kv.marker), 'components.json contains COMPONENT_SET');
    assert.equal(comps.filter((c) => c.type === 'COMPONENT_SET').length, 1, 'exactly 1 set');
    assert.equal(comps.filter((c) => c.type === 'COMPONENT').length, 1, 'exactly 1 singleton');
  } finally {
    cleanup();
  }
});

test('31-10: tokens.json baseline — non-empty + FILL token (Path B fix)', async () => {
  const kv = parseKv(readBaseline('tokens-json.txt'));
  assert.equal(kv.marker, 'FILL', 'baseline marker is FILL');
  const { outDir, cleanup } = await generateDigest();
  try {
    const raw = fs.readFileSync(path.join(outDir, 'tokens.json'), 'utf8');
    const tokens = JSON.parse(raw);
    assert.ok(tokens.length >= 1, 'tokens.json non-empty');
    assert.equal(tokens.length, Number(kv.count), 'tokens count matches baseline');
    assert.ok(tokens.some((t) => t.type === kv.marker), 'a FILL token is present (Path B)');
  } finally {
    cleanup();
  }
});

test("31-10: health-line baseline — 'figma extract: ready (token set)' with token set + no Free-tier marker", async () => {
  const baselineLines = lines(readBaseline('health-line.txt')).filter(Boolean);
  assert.equal(baselineLines[0], 'figma extract: ready (token set)', 'baseline line 1 is the ready string');
  assert.equal(baselineLines.length, 3, 'baseline records all 3 health detail strings');

  const { getHealthChecks } = require('../../scripts/lib/health-mirror/index.cjs');
  // Token present, fresh project dir (no prior pull → no Free-tier marker) → ready.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fx-health-'));
  const prevTok = process.env.FIGMA_TOKEN;
  const prevPat = process.env.FIGMA_PERSONAL_ACCESS_TOKEN;
  try {
    process.env.FIGMA_TOKEN = 'figd_BASELINE_TEST';
    delete process.env.FIGMA_PERSONAL_ACCESS_TOKEN;
    const { checks } = await getHealthChecks(tmp);
    const fx = checks.find((c) => c.name === 'figma_extract');
    assert.ok(fx, 'figma_extract check present');
    assert.equal(fx.detail, baselineLines[0], 'health detail equals the baseline ready string');
    assert.equal(fx.status, 'ok', 'ready state is ok');
  } finally {
    if (prevTok === undefined) delete process.env.FIGMA_TOKEN; else process.env.FIGMA_TOKEN = prevTok;
    if (prevPat === undefined) delete process.env.FIGMA_PERSONAL_ACCESS_TOKEN; else process.env.FIGMA_PERSONAL_ACCESS_TOKEN = prevPat;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('31-10: manifest-network-scope baseline — allowedDomains deepEquals the localhost pair (D-06)', () => {
  const expected = lines(readBaseline('manifest-network-scope.txt')).filter(Boolean);
  assert.deepEqual(expected, ['http://localhost:5179', 'http://127.0.0.1:5179'], 'baseline records the localhost pair');
  const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'figma-plugin/manifest.json'), 'utf8'));
  assert.deepEqual(
    manifest.networkAccess.allowedDomains,
    expected,
    'figma-plugin manifest allowedDomains must be exactly the localhost pair (no widening)'
  );
});

test('31-10: token-isolation baseline — scan of scripts/lib/figma-extract/ yields 0 violations (D-10)', () => {
  const expected = Number(lines(readBaseline('token-isolation-static.txt')).filter(Boolean)[0]);
  assert.equal(expected, 0, 'baseline expects 0 violations');
  assert.equal(countViolations(), expected, 'live scan matches the baselined 0 violations');
});

test('31-10: CHANGELOG has a [1.31.0] block', () => {
  const cl = read('CHANGELOG.md');
  assert.match(cl, /## \[1\.31\.0\]/, 'CHANGELOG must carry a ## [1.31.0] entry');
});

test('31-10: skills/figma-extract/SKILL.md exists with name: hone-figma-extract', () => {
  const skillPath = 'skills/figma-extract/SKILL.md';
  assert.ok(fs.existsSync(path.join(REPO_ROOT, skillPath)), `${skillPath} must exist`);
  const body = read(skillPath);
  assert.match(body, /^name:\s*hone-figma-extract\s*$/m, 'SKILL.md frontmatter declares name: hone-figma-extract');
});
