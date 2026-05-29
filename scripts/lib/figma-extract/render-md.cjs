'use strict';
/**
 * Plan 31-02 — productionized from spike 001 digest.mjs buildDesignMd().
 *
 * Deterministic DESIGN.md renderer with a STABLE section order:
 *   header (provenance) →
 *   ## Tokens         (### Color, ### Typography, ### Other — only when non-empty) →
 *   ## Components      (Total line; sets first, then ### Singleton components) →
 *   ## Widgets / Pages
 *
 * Determinism guarantee: identical {tokens, components, widgets, fileMeta} input
 * produces BYTE-IDENTICAL output. The ONLY nondeterministic value is the
 * provenance line's `fetched_at`, which the caller injects (tests pass a fixed
 * value). This module NEVER calls new Date()/Date.now() — required for 31-10's
 * golden-snapshot baseline.
 *
 * Pure CommonJS, no external deps, no I/O.
 */

// Size-bounding slice caps (carried over verbatim from the spike for parity).
const CAP_COLOR = 200;
const CAP_TYPOGRAPHY = 100;
const CAP_OTHER = 100;
const CAP_VARIANTS = 20;
const CAP_SINGLETONS = 100;
const CAP_WIDGETS = 50;

/**
 * @param {object} input
 * @param {Array} input.tokens       assembled tokens [{name,type,collection?,modes?,value?,description?}]
 * @param {Array} input.components   from walk.cjs collectComponents().components
 * @param {Array} input.widgets      from walk.cjs collectComponents().widgets
 * @param {object} input.fileMeta    { file_key, fetched_at, name } — fetched_at is the only injected nondeterminism
 * @returns {string} DESIGN.md body
 */
function renderDesignMd({ tokens, components, widgets, fileMeta }) {
  const toks = Array.isArray(tokens) ? tokens : [];
  const comps = Array.isArray(components) ? components : [];
  const wids = Array.isArray(widgets) ? widgets : [];
  const meta = fileMeta || {};

  const colorTokens = toks.filter((t) => t.type === 'COLOR' || t.type === 'FILL');
  const textTokens = toks.filter((t) => t.type === 'TEXT');
  const otherTokens = toks.filter(
    (t) => !['COLOR', 'FILL', 'TEXT'].includes(t.type)
  );

  const lines = [];
  lines.push(`# DESIGN.md`);
  lines.push(``);
  lines.push(
    `> Auto-generated from Figma file \`${meta.file_key}\` at ${meta.fetched_at}`
  );
  lines.push(`> Source: ${meta.name || 'Design system'}`);
  lines.push(``);

  // ── ## Tokens ──────────────────────────────────────────────────────────────
  lines.push(`## Tokens`);
  lines.push(``);

  if (colorTokens.length) {
    lines.push(`### Color`);
    lines.push(``);
    for (const t of colorTokens.slice(0, CAP_COLOR)) {
      const modes = t.modes
        ? Object.entries(t.modes)
            .map(([m, v]) => `${m}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
            .join(' | ')
        : JSON.stringify(t.value);
      lines.push(`- \`${t.name}\` — ${modes}`);
    }
    lines.push(``);
  }

  if (textTokens.length) {
    lines.push(`### Typography`);
    lines.push(``);
    for (const t of textTokens.slice(0, CAP_TYPOGRAPHY)) {
      const v = t.value || Object.values(t.modes || {})[0];
      lines.push(`- \`${t.name}\` — ${typeof v === 'object' ? JSON.stringify(v) : v}`);
    }
    lines.push(``);
  }

  if (otherTokens.length) {
    lines.push(`### Other`);
    lines.push(``);
    for (const t of otherTokens.slice(0, CAP_OTHER)) {
      lines.push(`- \`${t.name}\` (${t.type})`);
    }
    lines.push(``);
  }

  // ── ## Components ───────────────────────────────────────────────────────────
  lines.push(`## Components`);
  lines.push(``);
  const sets = comps.filter((c) => c.type === 'COMPONENT_SET');
  const singles = comps.filter((c) => c.type === 'COMPONENT');
  lines.push(
    `Total: ${sets.length} component sets + ${singles.length} singleton components`
  );
  lines.push(``);

  for (const c of sets) {
    lines.push(`### ${c.name}`);
    if (c.description) lines.push(`> ${c.description}`);
    if (c.variants && c.variants.length) {
      lines.push(`Variants (${c.variants.length}):`);
      for (const v of c.variants.slice(0, CAP_VARIANTS)) lines.push(`- ${v}`);
      if (c.variants.length > CAP_VARIANTS) {
        lines.push(`- … +${c.variants.length - CAP_VARIANTS} more`);
      }
    }
    if (c.props && c.props.length) {
      lines.push(`Props:`);
      for (const p of c.props) {
        const opts = p.options ? ` [${p.options.join(', ')}]` : '';
        lines.push(`- \`${p.name}\` (${p.type})${opts} — default: \`${p.default}\``);
      }
    }
    lines.push(``);
  }

  if (singles.length) {
    lines.push(`### Singleton components`);
    lines.push(``);
    for (const c of singles.slice(0, CAP_SINGLETONS)) {
      lines.push(`- \`${c.name}\``);
    }
    lines.push(``);
  }

  // ── ## Widgets / Pages ──────────────────────────────────────────────────────
  lines.push(`## Widgets / Pages`);
  lines.push(``);
  for (const w of wids.slice(0, CAP_WIDGETS)) {
    lines.push(`- ${w.name} (\`${w.id}\`)`);
  }

  return lines.join('\n');
}

module.exports = { renderDesignMd };
