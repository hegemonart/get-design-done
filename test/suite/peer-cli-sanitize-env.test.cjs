'use strict';
// Plan 33.5-04 — peer-CLI env sandbox (SC#4, D-03 allowlist-forward / default-deny).
//
// Proves scripts/lib/peer-cli/sanitize-env.cjs builds the spawned peer's
// environment from an OS-essential baseline + an explicit caller allowlist,
// DROPPING everything else, and NEVER forwarding GDD secrets or secret-shaped
// vars unless they are explicitly allowlisted (explicit allowlist WINS).
//
// Hermetic (D-10): pure function over a FAKE env object — no real child spawn,
// no real .design/config.json read. The default `npm test` runs it.

const test = require('node:test');
const assert = require('node:assert/strict');

const { sanitizeEnv, BASELINE, readPeerCliAllowlist } = require('../../scripts/lib/peer-cli/sanitize-env.cjs');

test('33.5-04: OS-essential vars survive', () => {
  const out = sanitizeEnv({ PATH: '/bin', HOME: '/h', FOO: 'x' }, {});
  assert.equal(out.PATH, '/bin', 'PATH must survive (peer binary needs it to launch)');
  assert.equal(out.HOME, '/h', 'HOME must survive');
  assert.equal(out.FOO, undefined, 'a non-baseline, non-allowlisted var is dropped (default-deny)');
});

test('33.5-04: OS-essential prefixes (LC_*, NODE_*) survive', () => {
  const out = sanitizeEnv(
    { PATH: '/bin', LC_ALL: 'C', NODE_OPTIONS: '--max-old-space-size=512', WEIRD_VAR: 'z' },
    {},
  );
  assert.equal(out.LC_ALL, 'C', 'LC_* prefix is baseline');
  assert.equal(out.NODE_OPTIONS, '--max-old-space-size=512', 'NODE_* prefix is baseline');
  assert.equal(out.WEIRD_VAR, undefined, 'unrelated var still dropped');
});

test('33.5-04: GDD secret stripped by default', () => {
  const out = sanitizeEnv(
    { PATH: '/bin', ANTHROPIC_API_KEY: 'sk-ant-xxx', GH_TOKEN: 'ghp_xxx', GITHUB_TOKEN: 'ghp_yyy', GDD_X: '1' },
    {},
  );
  assert.equal(out.PATH, '/bin', 'PATH still survives alongside secrets being stripped');
  assert.equal(out.ANTHROPIC_API_KEY, undefined, 'ANTHROPIC_API_KEY must never leak by default');
  assert.equal(out.GH_TOKEN, undefined, 'GH_TOKEN must never leak by default');
  assert.equal(out.GITHUB_TOKEN, undefined, 'GITHUB_TOKEN must never leak by default');
  assert.equal(out.GDD_X, undefined, 'any GDD_* var must never leak by default');
});

test('33.5-04: secret-shaped var stripped unless allowlisted', () => {
  const dropped = sanitizeEnv({ PATH: '/bin', FOO_API_KEY: 'v' }, {});
  assert.equal(dropped.FOO_API_KEY, undefined, 'secret-shaped *_API_KEY dropped by default');

  const kept = sanitizeEnv({ PATH: '/bin', FOO_API_KEY: 'v' }, { allowlist: ['FOO_API_KEY'] });
  assert.equal(kept.FOO_API_KEY, 'v', 'explicit allowlist WINS over the secret-shape filter');
  assert.equal(kept.PATH, '/bin', 'baseline still present when allowlisting a secret-shaped var');
});

test('33.5-04: allowlisted plain var forwarded', () => {
  const out = sanitizeEnv({ PATH: '/bin', MY_PEER_FLAG: '1', OTHER: 'no' }, { allowlist: ['MY_PEER_FLAG'] });
  assert.equal(out.MY_PEER_FLAG, '1', 'a plain var named in opts.allowlist passes through');
  assert.equal(out.OTHER, undefined, 'a sibling non-allowlisted var is still dropped');
});

test('33.5-04: even an allowlisted GDD secret is forwarded (explicit wins)', () => {
  // The allowlist is the user is explicit escape hatch — a peer that genuinely
  // needs an inherited provider key is a one-line allowlist entry.
  const out = sanitizeEnv(
    { PATH: '/bin', ANTHROPIC_API_KEY: 'sk-ant-zzz', GDD_FOO: 'bar' },
    { allowlist: ['ANTHROPIC_API_KEY'] },
  );
  assert.equal(out.ANTHROPIC_API_KEY, 'sk-ant-zzz', 'explicit allowlist forwards even a known GDD secret');
  assert.equal(out.GDD_FOO, undefined, 'a non-allowlisted GDD_* sibling is still stripped');
});

test('33.5-04: sanitizeEnv defaults sourceEnv to process.env and is pure', () => {
  const src = { PATH: '/bin', SECRET_TOKEN: 'leak' };
  const out = sanitizeEnv(src, {});
  assert.equal(out.SECRET_TOKEN, undefined, 'secret-shaped *_TOKEN stripped');
  assert.equal(src.SECRET_TOKEN, 'leak', 'input object is not mutated (pure)');
  // Default arg path: with no args, reads process.env without throwing.
  const def = sanitizeEnv();
  assert.equal(typeof def, 'object', 'sanitizeEnv() with no args returns an object from process.env');
});

test('33.5-04: BASELINE + readPeerCliAllowlist exports are inspectable', () => {
  assert.ok(Array.isArray(BASELINE), 'BASELINE is an exported array for reviewer inspection');
  assert.ok(BASELINE.includes('PATH') && BASELINE.includes('HOME'), 'BASELINE contains PATH + HOME');
  assert.equal(typeof readPeerCliAllowlist, 'function', 'readPeerCliAllowlist is exported');
  // Defensive reader: never throws; returns an array even pointed at a bad dir.
  const list = readPeerCliAllowlist('/no/such/dir/at/all');
  assert.ok(Array.isArray(list), 'readPeerCliAllowlist returns [] on a missing config (never throws)');
});
