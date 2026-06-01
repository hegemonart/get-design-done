'use strict';
// Phase 40.5 — i18n resolver unit test. Verifies baseLocale, fallbackChain, resolveLocale precedence,
// translate (hit / fallback / missing→key), and descriptionFor (i18n hit / English fallback). The pure
// functions take their data as arguments (no fs/env). Every test tagged `40.5-03:`.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const MOD = path.resolve(__dirname, '../../scripts/lib/i18n/index.cjs');
const i18n = require(MOD);

test('40.5-03: baseLocale + fallbackChain (locale → base → en)', () => {
  assert.equal(i18n.baseLocale('de-DE'), 'de');
  assert.equal(i18n.baseLocale('EN'), 'en');
  assert.deepEqual(i18n.fallbackChain('de-DE'), ['de-de', 'de', 'en']);
  assert.deepEqual(i18n.fallbackChain('ru'), ['ru', 'en']);
  assert.deepEqual(i18n.fallbackChain('en'), ['en']);
  assert.deepEqual(i18n.fallbackChain(''), ['en']);
});

test('40.5-03: resolveLocale precedence — config > env > en', () => {
  assert.equal(i18n.resolveLocale({ configLocale: 'ru', env: { LANG: 'de_DE.UTF-8' } }), 'ru');
  assert.equal(i18n.resolveLocale({ env: { LANG: 'fr_FR.UTF-8' } }), 'fr-fr');
  assert.equal(i18n.resolveLocale({ env: { LC_ALL: 'ja_JP.UTF-8', LANG: 'en_US' } }), 'ja-jp', 'LC_ALL wins over LANG');
  assert.equal(i18n.resolveLocale({ env: { LANG: 'C' } }), 'en', 'C → en');
  assert.equal(i18n.resolveLocale({}), 'en', 'nothing → en');
});

test('40.5-03: translate — own hit, chain fallback, missing→key', () => {
  const tables = {
    en: { 'a.b': 'EN', 'only.en': 'ONLY' },
    ru: { 'a.b': 'RU' },
    de: { 'a.b': 'DE' },
  };
  assert.equal(i18n.translate(tables, 'a.b', 'ru'), 'RU', 'own table');
  assert.equal(i18n.translate(tables, 'only.en', 'ru'), 'ONLY', 'fallback to en');
  assert.equal(i18n.translate(tables, 'only.en', 'de-DE'), 'ONLY', 'de-DE → de → en');
  assert.equal(i18n.translate(tables, 'no.such.key', 'ru'), 'no.such.key', 'missing → key itself');
  assert.equal(i18n.translate({}, 'x', 'ru'), 'x', 'no tables → key');
});

test('40.5-03: descriptionFor — i18n hit then English fallback', () => {
  const fm = { description: 'EN desc', description_i18n: { ru: 'RU desc', de: 'DE desc' } };
  assert.equal(i18n.descriptionFor(fm, 'ru'), 'RU desc');
  assert.equal(i18n.descriptionFor(fm, 'de-DE'), 'DE desc', 'de-DE → de');
  assert.equal(i18n.descriptionFor(fm, 'fr'), 'EN desc', 'no fr → English');
  assert.equal(i18n.descriptionFor({ description: 'EN only' }, 'ru'), 'EN only', 'no i18n map → English');
  assert.equal(i18n.descriptionFor({}, 'ru'), '', 'nothing → empty');
});

test('40.5-03: the pure functions need no fs/env (data passed in)', () => {
  // These return correct results with purely in-memory arguments — proving the core is testable
  // without touching the filesystem or process.env.
  assert.equal(i18n.translate({ en: { k: 'v' } }, 'k', 'en'), 'v');
  assert.equal(i18n.resolveLocale({ configLocale: 'ja' }), 'ja');
  assert.deepEqual(i18n.KNOWN_LOCALES, ['en', 'ru', 'uk', 'de', 'fr', 'zh', 'ja']);
});
