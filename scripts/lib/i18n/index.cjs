'use strict';
// Phase 40.5 — i18n/index.cjs — GDD CLI localization resolver.
//
// Resolves a locale (config override > env LANG > English), a fallback chain (locale → base → en),
// and translates a message key against per-locale flat-JSON tables. The pure functions (baseLocale,
// fallbackChain, resolveLocale, translate, descriptionFor) take their data as arguments and touch
// neither fs nor env directly — so they are trivially unit-testable. `loadTable` is the only fs reader.
//
// Contract: reference/cli-localization.md. Fallback is always to `en` (the complete source table).

const fs = require('node:fs');
const path = require('node:path');

const KNOWN_LOCALES = Object.freeze(['en', 'ru', 'uk', 'de', 'fr', 'zh', 'ja']);
const DEFAULT_LOCALE = 'en';
const MESSAGES_DIR = path.join(__dirname, 'messages');

/** Normalize a raw locale token: lowercase, `_`→`-`, strip an encoding suffix (`ru_RU.UTF-8` → `ru-ru`). */
function normalizeLocale(code) {
  if (!code) return '';
  return String(code).split('.')[0].split(':')[0].trim().toLowerCase().replace(/_/g, '-');
}

/** The base of a locale (`de-de` → `de`; `en` → `en`). */
function baseLocale(code) {
  return normalizeLocale(code).split('-')[0];
}

/** Resolution chain: [normalized, base, 'en'] with duplicates removed. */
function fallbackChain(code) {
  const norm = normalizeLocale(code);
  const chain = [];
  for (const c of [norm, baseLocale(norm), DEFAULT_LOCALE]) {
    if (c && !chain.includes(c)) chain.push(c);
  }
  return chain.length ? chain : [DEFAULT_LOCALE];
}

/**
 * Resolve the active locale. Precedence: explicit config.locale > env.LANG/LC_ALL > 'en'.
 * @param {{env?: object, configLocale?: string}} [opts]
 */
function resolveLocale(opts) {
  const o = opts || {};
  const fromConfig = normalizeLocale(o.configLocale);
  if (fromConfig) return fromConfig;
  const env = o.env || {};
  const fromEnv = normalizeLocale(env.LC_ALL || env.LC_MESSAGES || env.LANG || env.LANGUAGE);
  if (fromEnv && fromEnv !== 'c' && fromEnv !== 'posix') return fromEnv;
  return DEFAULT_LOCALE;
}

/**
 * Translate `key` for `locale` against the supplied `tables` map ({ <locale>: {<key>: <string>} }).
 * Walks the fallback chain; returns the first hit, else the key itself (so a missing key is visible,
 * never throws).
 */
function translate(tables, key, locale) {
  const map = tables || {};
  for (const loc of fallbackChain(locale)) {
    const t = map[loc];
    if (t && Object.prototype.hasOwnProperty.call(t, key) && typeof t[key] === 'string') return t[key];
  }
  return key;
}

/**
 * Resolve a skill/agent description for `locale`: frontmatter.description_i18n[<chain>] || .description.
 * Opt-in + backward-compatible — absent description_i18n falls straight back to the English description.
 */
function descriptionFor(frontmatter, locale) {
  const fm = frontmatter || {};
  const i18n = fm.description_i18n;
  if (i18n && typeof i18n === 'object') {
    for (const loc of fallbackChain(locale)) {
      if (typeof i18n[loc] === 'string' && i18n[loc].trim()) return i18n[loc];
    }
  }
  return fm.description || '';
}

/** Read a locale's flat-JSON table from disk. Returns {} on missing/parse error (fail-safe → fallback). */
function loadTable(locale, dir) {
  const file = path.join(dir || MESSAGES_DIR, `${normalizeLocale(locale) || DEFAULT_LOCALE}.json`);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

module.exports = {
  KNOWN_LOCALES, DEFAULT_LOCALE, MESSAGES_DIR,
  normalizeLocale, baseLocale, fallbackChain, resolveLocale, translate, descriptionFor, loadTable,
};
