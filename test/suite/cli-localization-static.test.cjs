'use strict';
// Phase 40.5 — CLI-localization static contract. Verifies the contract doc (registered), the
// /hone:locale skill, the config.schema locale key, and the description_i18n documentation.
// Hermetic: file reads only. Every test tagged `40.5-03:`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

test('40.5-03: cli-localization.md has the required sections + is registered', () => {
  const body = read('reference/cli-localization.md');
  assert.ok(body.length > 1500, 'substantive contract');
  assert.match(body, /## Resolution/m);
  assert.match(body, /## Message tables/m);
  assert.match(body, /description_i18n/);
  assert.match(body, /contribution path|Adding .* locale/i);
  assert.match(body, /warn-only/i, 'warn-only completeness documented');
  const reg = JSON.parse(read('reference/registry.json'));
  const e = reg.entries.find((x) => x.name === 'cli-localization');
  assert.ok(e, 'cli-localization registered');
  assert.equal(e.path, 'reference/cli-localization.md');
  assert.equal(e.phase, 40.5);
});

test('40.5-03: /hone:locale skill exists with correct frontmatter', () => {
  const s = read('skills/locale/SKILL.md');
  assert.match(s, /^name:\s*hone-locale/m);
  assert.match(s, /^user-invocable:\s*true/m);
  assert.match(s, /scripts\/lib\/i18n\/index\.cjs/, 'uses the resolver');
  assert.match(s, /config\.json/, 'sets config.locale');
});

test('40.5-03: config.schema gains the locale key (enum of 7 known locales)', () => {
  const schema = JSON.parse(read('reference/schemas/config.schema.json'));
  assert.ok(schema.properties.locale, 'locale defined');
  assert.deepEqual(schema.properties.locale.enum, ['en', 'ru', 'uk', 'de', 'fr', 'zh', 'ja']);
});

test('40.5-03: description_i18n is documented for agents (opt-in, English fallback)', () => {
  const readme = read('agents/README.md');
  assert.match(readme, /description_i18n/, 'agents/README documents description_i18n');
  assert.match(readme, /fall ?back|opt-in/i, 'notes the English fallback / opt-in nature');
});
