'use strict';
// Phase 35.2 — privacy guard (SC#5): every outbound notify module routes its body through
// scripts/lib/redact.cjs. Static analysis; no module is allowed to build an outbound payload
// without redact. Hermetic (file reads only). Tagged `35.2-02:`.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const NOTIFY_DIR = path.resolve(__dirname, '../../scripts/lib/notify');

test('35.2-02: every scripts/lib/notify/*.cjs references redact (no outbound bypass)', () => {
  assert.ok(fs.existsSync(NOTIFY_DIR), 'scripts/lib/notify/ must exist');
  const files = fs.readdirSync(NOTIFY_DIR).filter((f) => f.endsWith('.cjs'));
  assert.ok(files.length >= 1, 'at least one notify module');
  for (const f of files) {
    const body = fs.readFileSync(path.join(NOTIFY_DIR, f), 'utf8');
    assert.match(body, /redact/, `scripts/lib/notify/${f} must route outbound bodies through redact (SC#5)`);
    assert.match(body, /redact\.cjs/, `scripts/lib/notify/${f} must require scripts/lib/redact.cjs`);
  }
});

test('35.2-02: notify dispatcher has no GitHub/Slack/Discord SDK dependency (gh/webhook only, D-02)', () => {
  const body = fs.readFileSync(path.join(NOTIFY_DIR, 'dispatch.cjs'), 'utf8');
  assert.doesNotMatch(body, /require\(\s*['"]@slack|require\(\s*['"]discord\.js|from\s+['"]@slack/, 'no @slack/discord.js SDK import');
  assert.match(body, /fetchImpl/, 'uses an injectable fetchImpl (hermetic)');
});
