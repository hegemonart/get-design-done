// tests/pseudonymize.test.cjs — Plan 30-01 pseudonymize module
//
// D-13 discipline: synthetic fixtures only. No live network primitives,
// no shell-out, no real os.userInfo() reads asserted against. Identity
// values are always literal fixtures passed via opts (deterministic +
// reproducible in any CI runner).
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  pseudonymize,
  replaceGitIdentity,
  replacePaths,
  replaceHostname,
  replaceRepoOrigin,
  dropEnvVars,
  replaceEmails,
  replaceIPs,
  stablePseudonym,
  RULES,
} = require('../scripts/lib/pseudonymize.cjs');

// ---------------------------------------------------------------------------
// Sanity test — RULES manifest.
// ---------------------------------------------------------------------------

test('30-01: RULES manifest has 8 entries R1..R8 in order', () => {
  assert.equal(RULES.length, 8);
  RULES.forEach((r, i) => assert.equal(r.id, `R${i + 1}`));
  assert.ok(Object.isFrozen(RULES));
});

// ---------------------------------------------------------------------------
// R1 — git-identity (3 tests)
// ---------------------------------------------------------------------------

test('30-01 R1: replaceGitIdentity substitutes user.name with <user>', () => {
  const out = replaceGitIdentity('alice committed at 12:34', { name: 'alice' });
  assert.ok(!out.includes('alice'), `expected no 'alice' in: ${out}`);
  assert.ok(out.includes('<user>'));
});

test('30-01 R1: replaceGitIdentity substitutes user.email with <user>@<domain>', () => {
  const out = replaceGitIdentity('alice@example.com sent it', { email: 'alice@example.com' });
  assert.ok(!out.includes('alice@example.com'), `expected no original email in: ${out}`);
  assert.ok(out.includes('<user>@<domain>'));
});

test('30-01 R1: word-boundary guard preserves substring match', () => {
  // 'alicewonderland' should NOT be stripped when name is 'alice' — word-boundary.
  const out = replaceGitIdentity('alicewonderland is fine', { name: 'alice' });
  assert.ok(out.includes('alicewonderland'), `expected 'alicewonderland' preserved in: ${out}`);
});

// ---------------------------------------------------------------------------
// R2 — absolute-paths (3 tests, one per OS shape)
// ---------------------------------------------------------------------------

test('30-01 R2: Linux /home/<user>/ → <home>/', () => {
  const out = replacePaths('/home/alice/code/proj/x.ts:42', { name: 'alice' });
  assert.equal(out, '<home>/code/proj/x.ts:42');
});

test('30-01 R2: macOS /Users/<user>/ → <home>/', () => {
  const out = replacePaths('/Users/alice/code/proj/x.ts:42', { name: 'alice' });
  assert.equal(out, '<home>/code/proj/x.ts:42');
});

test('30-01 R2: Windows C:\\Users\\<user>\\ → <home>\\ (and generic D:\\Users\\bob\\)', () => {
  const winPath = String.raw`C:\Users\alice\code\proj\x.ts:42`;
  const out = replacePaths(winPath, { name: 'alice' });
  assert.equal(out, String.raw`<home>\code\proj\x.ts:42`);
  // Generic sweep: no identity name, different drive, different user.
  const generic = replacePaths(String.raw`D:\Users\bob\repo\file.ts`, undefined);
  assert.ok(generic.startsWith('<home>\\'), `expected generic Windows sweep, got: ${generic}`);
  assert.ok(!generic.includes('bob'), `expected 'bob' scrubbed, got: ${generic}`);
});

// ---------------------------------------------------------------------------
// R3 — hostname (1 test)
// ---------------------------------------------------------------------------

test('30-01 R3: replaceHostname substitutes all occurrences with <host>', () => {
  const out = replaceHostname(
    'Connected to alices-laptop.local from alices-laptop',
    'alices-laptop',
  );
  assert.ok(!out.includes('alices-laptop'), `expected no hostname in: ${out}`);
  assert.ok(out.includes('<host>'));
});

// ---------------------------------------------------------------------------
// R4 — repo-origin categorization (3 tests)
// ---------------------------------------------------------------------------

test('30-01 R4: private-org categorization produces private-org-hash:<sha8>', () => {
  const out = replaceRepoOrigin(
    'Remote: git@github.com:acme/internal.git',
    'git@github.com:acme/internal.git',
    'private-org',
  );
  assert.match(out, /private-org-hash:[0-9a-f]{8}/);
  assert.ok(!out.includes('acme/internal'), `expected origin scrubbed, got: ${out}`);
});

test('30-01 R4: public-personal categorization produces public-personal-hash:<sha8>', () => {
  const out = replaceRepoOrigin(
    'Remote: https://github.com/alice/personal',
    'https://github.com/alice/personal',
    'public-personal',
  );
  assert.match(out, /public-personal-hash:[0-9a-f]{8}/);
});

test('30-01 R4: same logical origin across protocols hashes identically (normalization)', () => {
  const a = replaceRepoOrigin(
    'a: git@github.com:foo/bar.git',
    'git@github.com:foo/bar.git',
    'private-org',
  );
  const b = replaceRepoOrigin(
    'b: https://github.com/foo/bar',
    'https://github.com/foo/bar',
    'private-org',
  );
  const hashA = a.match(/[0-9a-f]{8}/)[0];
  const hashB = b.match(/[0-9a-f]{8}/)[0];
  assert.equal(hashA, hashB, `cross-protocol hashes diverged: ${hashA} vs ${hashB}`);
});

// ---------------------------------------------------------------------------
// R5 — env-vars (2 tests)
// ---------------------------------------------------------------------------

test('30-01 R5: dropEnvVars substitutes value in deep structure', () => {
  const env = { GITHUB_TOKEN: 'ghp_secretvalue123' };
  const payload = {
    error: 'TOKEN=ghp_secretvalue123 leaked',
    nested: { v: 'ghp_secretvalue123' },
  };
  const out = dropEnvVars(payload, env);
  const json = JSON.stringify(out);
  assert.ok(!json.includes('ghp_secretvalue123'), `value leaked in: ${json}`);
  assert.ok(json.includes('<env:GITHUB_TOKEN>'));
});

test('30-01 R5: short-value guard — 2-char env value does not corrupt unrelated text', () => {
  const env = { SHORT_KEY: 'ab' };
  const payload = { msg: 'short=ab is benign' };
  const out = dropEnvVars(payload, env);
  const json = JSON.stringify(out);
  assert.ok(json.includes('ab'), `expected 'ab' preserved (short-value skip) in: ${json}`);
});

// ---------------------------------------------------------------------------
// R6 — email-in-logs false-positive guard (1 test)
// ---------------------------------------------------------------------------

test('30-01 R6: replaceEmails substitutes real email + leaves non-email text alone', () => {
  assert.equal(
    replaceEmails('contact admin@example.org for support'),
    'contact <email> for support',
  );
  // No email shape — should be untouched.
  const benign = 'version 1.0 @ 2026-05-20';
  assert.equal(replaceEmails(benign), benign);
});

// ---------------------------------------------------------------------------
// R7 — IP addresses (3 tests)
// ---------------------------------------------------------------------------

test('30-01 R7: replaceIPs zeroes last IPv4 octet', () => {
  assert.equal(
    replaceIPs('Server at 203.0.113.42 unreachable'),
    'Server at <ipv4:203.0.113.0> unreachable',
  );
});

test('30-01 R7: false-positive guards — semver/date/path-context survive', () => {
  const input = 'v1.28.6 release; 2026-05-20 date; 4.0.0.0 in path';
  assert.equal(replaceIPs(input), input, `expected no substitution, got: ${replaceIPs(input)}`);
});

test('30-01 R7: replaceIPs drops last IPv6 segment', () => {
  const out = replaceIPs('IPv6 fe80::1ff:fe23:4567:890a in logs');
  // Original full IPv6 should not appear; an <ipv6:...::> placeholder should.
  assert.ok(out.includes('<ipv6:'), `expected ipv6 placeholder, got: ${out}`);
  assert.ok(!out.includes('fe80::1ff:fe23:4567:890a'), `original IPv6 not dropped, got: ${out}`);
});

// ---------------------------------------------------------------------------
// R8 — stable-pseudonym (2 tests)
// ---------------------------------------------------------------------------

test('30-01 R8: stablePseudonym normalization-stable across git-at and https url forms', () => {
  const a = stablePseudonym('alice', 'git@github.com:foo/bar.git');
  const b = stablePseudonym('alice', 'https://github.com/foo/bar');
  assert.equal(a, b, `cross-protocol pseudonyms diverged: ${a} vs ${b}`);
  assert.match(a, /^[0-9a-f]{8}$/);
});

test('30-01 R8: different inputs produce different outputs; format is 8-hex', () => {
  const a = stablePseudonym('alice', 'origin');
  const b = stablePseudonym('bob', 'origin');
  const c = stablePseudonym('alice', 'origin2');
  assert.notEqual(a, b, 'different userIds should diverge');
  assert.notEqual(a, c, 'different origins should diverge');
  assert.match(a, /^[0-9a-f]{8}$/);
  // Defensive sentinel on falsy input.
  assert.equal(stablePseudonym('', 'origin'), '00000000');
  assert.equal(stablePseudonym('alice', ''), '00000000');
});

// ---------------------------------------------------------------------------
// Integration / purity (2 tests)
// ---------------------------------------------------------------------------

test('30-01 integration: pseudonymize scrubs identity, path, hostname, repo, email, env-val', () => {
  const payload = {
    msg: 'alice committed from /home/alice/proj on alices-laptop',
    stack: 'at notify(maintainer@example.org) for git@github.com:acme/internal.git',
    nested: { token: 'tok_value_abc' },
  };
  const opts = {
    identity: { name: 'alice', email: 'alice@example.com', userId: 'alice' },
    hostname: 'alices-laptop',
    repoOrigin: 'git@github.com:acme/internal.git',
    repoVisibility: 'private-org',
    envSnapshot: { GITHUB_TOKEN: 'tok_value_abc' },
  };
  const { payload: scrubbed, replacements } = pseudonymize(payload, opts);
  const json = JSON.stringify(scrubbed);
  // None of the original sensitive substrings should survive.
  for (const banned of [
    'alice',
    'alices-laptop',
    'maintainer@example.org',
    'acme/internal',
    'tok_value_abc',
    '/home/alice',
  ]) {
    assert.ok(!json.includes(banned), `expected '${banned}' scrubbed; got: ${json}`);
  }
  // replacements log should contain rule ids drawn from {R1..R7} (R8 is not run by pseudonymize).
  assert.ok(Array.isArray(replacements));
  assert.ok(replacements.length > 0, 'expected non-empty replacements log');
  const validIds = new Set(['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7']);
  for (const r of replacements) {
    assert.ok(validIds.has(r.ruleId), `unexpected ruleId in log: ${r.ruleId}`);
  }
});

test('30-01 purity: same input + opts → same output across calls; input not mutated', () => {
  const payload = {
    msg: 'alice from /home/alice/x',
    items: ['contact admin@example.org', '203.0.113.42'],
  };
  const opts = { identity: { name: 'alice' } };
  const clone = structuredClone(payload);
  const a = pseudonymize(payload, opts);
  const b = pseudonymize(payload, opts);
  assert.deepStrictEqual(a.payload, b.payload, 'output diverged across identical calls');
  assert.deepStrictEqual(payload, clone, 'input was mutated by pseudonymize');
});

// ---------------------------------------------------------------------------
// Edge cases (additional defensive tests).
// ---------------------------------------------------------------------------

test('30-01 edge: pseudonymize handles missing opts gracefully', () => {
  const out = pseudonymize('hello world');
  assert.equal(out.payload, 'hello world');
  assert.deepEqual(out.replacements, []);
});

test('30-01 edge: non-string primitives pass through unchanged', () => {
  const { payload } = pseudonymize({ n: 42, b: true, x: null }, { identity: { name: 'alice' } });
  assert.deepStrictEqual(payload, { n: 42, b: true, x: null });
});
