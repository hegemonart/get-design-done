'use strict';
// Phase 40.5 — i18n message-table coverage. en is the complete source; ru covers every en key; the
// 5 placeholders parse + declare placeholder coverage (warn-only — they are NOT required to be 100%,
// they fall back to en). Every test tagged `40.5-03:`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const i18n = require(path.resolve(__dirname, '../../scripts/lib/i18n/index.cjs'));
const MSG_DIR = path.resolve(__dirname, '../../scripts/lib/i18n/messages');

const KEYS = (t) => Object.keys(t).filter((k) => k !== '_meta');

test('40.5-03: all 7 known-locale tables exist + parse + carry _meta', () => {
  for (const loc of i18n.KNOWN_LOCALES) {
    const p = path.join(MSG_DIR, `${loc}.json`);
    assert.ok(fs.existsSync(p), `${loc}.json exists`);
    const t = JSON.parse(fs.readFileSync(p, 'utf8'));
    assert.ok(t._meta && t._meta.locale === loc, `${loc}.json has _meta.locale`);
  }
});

test('40.5-03: en is the complete source (>= 20 keys; help./error./prompt. namespaces)', () => {
  const en = JSON.parse(fs.readFileSync(path.join(MSG_DIR, 'en.json'), 'utf8'));
  const keys = KEYS(en);
  assert.ok(keys.length >= 20, `en has >=20 keys (got ${keys.length})`);
  assert.ok(keys.some((k) => k.startsWith('help.')), 'help.* present');
  assert.ok(keys.some((k) => k.startsWith('error.')), 'error.* present');
  assert.ok(keys.some((k) => k.startsWith('prompt.')), 'prompt.* present');
  assert.equal(en._meta.coverage, 'complete');
});

test('40.5-03: ru is a full second locale (covers every en key)', () => {
  const en = JSON.parse(fs.readFileSync(path.join(MSG_DIR, 'en.json'), 'utf8'));
  const ru = JSON.parse(fs.readFileSync(path.join(MSG_DIR, 'ru.json'), 'utf8'));
  const ruKeys = new Set(KEYS(ru));
  const missing = KEYS(en).filter((k) => !ruKeys.has(k));
  assert.deepEqual(missing, [], `ru must cover every en key; missing: ${missing.join(', ')}`);
  assert.equal(ru._meta.coverage, 'complete');
});

test('40.5-03: the 5 placeholder locales parse + declare placeholder coverage + fall back to en (warn-only)', () => {
  const en = JSON.parse(fs.readFileSync(path.join(MSG_DIR, 'en.json'), 'utf8'));
  const enKeyCount = KEYS(en).length;
  for (const loc of ['uk', 'de', 'fr', 'zh', 'ja']) {
    const t = JSON.parse(fs.readFileSync(path.join(MSG_DIR, `${loc}.json`), 'utf8'));
    assert.equal(t._meta.coverage, 'placeholder', `${loc} declares placeholder coverage`);
    assert.equal(t._meta.fallback, 'en', `${loc} falls back to en`);
    // Intentionally partial — fewer keys than en. Not a failure (warn-only).
    assert.ok(KEYS(t).length < enKeyCount, `${loc} is a partial placeholder (relies on en fallback)`);
  }
});

test('40.5-03: every placeholder key resolves (own value or en fallback) via translate', () => {
  const tables = {};
  for (const loc of i18n.KNOWN_LOCALES) tables[loc] = i18n.loadTable(loc, MSG_DIR);
  const en = tables.en;
  // For every en key, a placeholder locale must resolve to a non-key string (i.e. fallback works).
  for (const loc of ['de', 'ja']) {
    for (const k of KEYS(en)) {
      assert.notEqual(i18n.translate(tables, k, loc), k, `${loc} resolves ${k} (own or en fallback)`);
    }
  }
});
