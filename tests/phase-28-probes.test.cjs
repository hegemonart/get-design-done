// tests/phase-28-probes.test.cjs — Phase 28-06 regression.
//
// Verifies the design-verifier i18n probes (D-03), explore i18n-readiness
// probe (D-04), 5 new registry entries (D-05), 12 cross-link insertions
// across 10 reference files (D-06), and the 2 orthogonal audit-scoring
// lens-tags (D-07).
//
// Tagged '28-06:' per Phase 28 convention. Independent of package.json#version
// (probes + cross-links + registry entries are not version-stamped artifacts;
// closeout 28-07 owns the version-aware tests).

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');

function read(relPath) {
  return fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8');
}

describe('28-06: verifier i18n probes (D-03)', () => {
  const verifier = read('agents/design-verifier.md');

  test('28-06: verifier contains "### i18n probes" exactly once', () => {
    const matches = verifier.match(/^### i18n probes$/gm) || [];
    assert.equal(matches.length, 1, 'expected exactly one "### i18n probes" subsection');
  });

  test('28-06: verifier §i18n probes appears inside Phase 1 (before Phase 2)', () => {
    const phase1Idx = verifier.search(/^## Phase 1 /m);
    const phase2Idx = verifier.search(/^## Phase 2 /m);
    const probesIdx = verifier.search(/^### i18n probes$/m);
    assert.ok(phase1Idx >= 0, 'Phase 1 heading missing');
    assert.ok(phase2Idx >= 0, 'Phase 2 heading missing');
    assert.ok(probesIdx >= 0, 'i18n probes heading missing');
    assert.ok(phase1Idx < probesIdx, 'i18n probes appeared before Phase 1');
    assert.ok(probesIdx < phase2Idx, 'i18n probes appeared after Phase 2 (must be inside Phase 1)');
  });

  test('28-06: verifier §i18n probes contains all 4 D-10 library regex patterns', () => {
    assert.match(verifier, /FormattedMessage/, 'react-intl FormattedMessage pattern missing');
    assert.match(verifier, /next-intl/, 'next-intl pattern missing');
    assert.match(verifier, /i18next/, 'i18next pattern missing');
    assert.match(verifier, /vue-i18n/, 'vue-i18n pattern missing');
  });

  test('28-06: verifier §i18n probes contains D-10 allow-list seed (console, data-testid)', () => {
    assert.match(verifier, /console\\.\(log\|error\|warn\|info\|debug\)/, 'console.* allow-list missing');
    assert.match(verifier, /data-testid/, 'data-testid allow-list missing');
  });

  test('28-06: verifier §i18n probes contains +40% expansion + scrollWidth logic', () => {
    assert.match(verifier, /scrollWidth/, 'scrollWidth check missing');
    assert.match(verifier, /(× 1\.4|\* 1\.4|\+40%|1\.4)/, '+40% expansion factor missing');
  });

  test('28-06: verifier §i18n probes tags findings as i18n_readiness (>= 2 mentions)', () => {
    const count = (verifier.match(/i18n_readiness/g) || []).length;
    assert.ok(count >= 2, `i18n_readiness tag should appear in both probes (got ${count})`);
  });
});

describe('28-06: explore i18n-readiness probe (D-04)', () => {
  // Phase 28.5-04 (Bucket 1 pipeline-stage rework) moved the verbatim
  // i18n-readiness probe detail (3 readiness states, 6-library matrix,
  // native-Intl.* regex literal, informational-only disclaimer) from
  // skills/explore/SKILL.md to reference/explore-procedure.md per the
  // <=100-line authoring contract. The SKILL keeps the probe heading
  // + cross-link summary; the verbatim probe content lives in the
  // reference file. Assertions read SKILL + linked reference together.
  const explore = read('skills/explore/SKILL.md');
  const procedurePath = path.join(REPO_ROOT, 'reference', 'explore-procedure.md');
  const procedure = fs.existsSync(procedurePath) ? fs.readFileSync(procedurePath, 'utf8') : '';
  const surface = explore + '\n\n' + procedure;

  test('28-06: explore contains i18n-readiness probe heading', () => {
    assert.match(surface, /i18n readiness probe|i18n-readiness probe/, 'i18n-readiness probe heading missing from SKILL + reference');
  });

  test('28-06: explore contains all 3 D-11 readiness states (framework-managed, partial, none)', () => {
    assert.match(surface, /framework-managed/, 'framework-managed state missing from SKILL + reference');
    assert.match(surface, /\bpartial\b/, 'partial state missing from SKILL + reference');
    // 'none' as a readiness state appears in the "framework-managed | partial | none" output line
    assert.match(surface, /\| none\b|: none\b|partial \| none/, 'none state missing from SKILL + reference');
  });

  test('28-06: explore contains all 6 D-11 library matrix names', () => {
    for (const lib of ['react-intl', 'next-intl', 'i18next', 'vue-i18n', 'formatjs', 'lingui']) {
      assert.match(surface, new RegExp(lib.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `library "${lib}" missing from SKILL + reference matrix`);
    }
  });

  test('28-06: explore contains D-11 native-Intl.* regex literal', () => {
    assert.match(
      surface,
      /DateTimeFormat\|NumberFormat\|PluralRules\|RelativeTimeFormat\|ListFormat\|Collator\|Segmenter/,
      'native Intl.* regex literal missing from SKILL + reference'
    );
  });

  test('28-06: explore i18n probe is informational only (no gate / no blocking)', () => {
    assert.match(surface, /informational only|NO gate|no gate/i, 'informational-only disclaimer missing from SKILL + reference');
  });
});

describe('28-06: registry — 5 new entries (D-05)', () => {
  const registry = JSON.parse(read('reference/registry.json'));
  const schema = JSON.parse(read('reference/registry.schema.json'));
  const NEW_NAMES = ['color-theory', 'composition', 'contrast-advanced', 'i18n', 'proportion-systems'];

  test('28-06: registry contains all 5 new entries with phase 28', () => {
    for (const name of NEW_NAMES) {
      const entry = registry.entries.find(e => e.name === name);
      assert.ok(entry, `missing registry entry: ${name}`);
      assert.equal(entry.phase, 28, `${name} should have phase 28 (got ${entry.phase})`);
    }
  });

  test('28-06: each new registry entry has a valid type from the schema enum', () => {
    const allowedTypes = schema.properties.entries.items.properties.type.enum;
    for (const name of NEW_NAMES) {
      const entry = registry.entries.find(e => e.name === name);
      assert.ok(allowedTypes.includes(entry.type), `${name}: invalid type "${entry.type}" (not in schema enum)`);
    }
  });

  test('28-06: each new registry entry path resolves to an existing file', () => {
    for (const name of NEW_NAMES) {
      const entry = registry.entries.find(e => e.name === name);
      const abs = path.join(REPO_ROOT, entry.path);
      assert.ok(fs.existsSync(abs), `${name}: declared path ${entry.path} does not exist on disk`);
    }
  });

  test('28-06: each new registry entry has a non-empty description (≥ 20 chars)', () => {
    for (const name of NEW_NAMES) {
      const entry = registry.entries.find(e => e.name === name);
      assert.ok(
        entry.description && entry.description.length >= 20,
        `${name}: description too short (got "${entry.description}")`
      );
    }
  });
});

describe('28-06: cross-link integrity (D-06 — 12 insertions across 10 files)', () => {
  test('28-06: all 12 cross-link insertions are present', () => {
    // 10 files, 12 insertions: typography.md ×2, accessibility.md ×2, visual-hierarchy-layout.md ×2.
    // visual-hierarchy-layout has both §Compositional Grids + §Asymmetry pointers to composition.md.
    assert.match(read('reference/palette-catalog.md'), /color-theory\.md/, 'palette-catalog → color-theory missing');
    assert.match(read('reference/motion-interpolate.md'), /color-theory\.md/, 'motion-interpolate → color-theory missing');
    assert.match(read('reference/visual-hierarchy-layout.md'), /composition\.md/, 'visual-hierarchy-layout → composition missing');
    assert.match(read('reference/design-system-guidance.md'), /proportion-systems\.md/, 'design-system-guidance → proportion-systems missing');
    assert.match(read('reference/typography.md'), /proportion-systems\.md/, 'typography → proportion-systems missing');
    assert.match(read('reference/typography.md'), /i18n\.md/, 'typography → i18n missing');
    assert.match(read('reference/rtl-cjk-cultural.md'), /i18n\.md/, 'rtl-cjk-cultural → i18n missing');
    assert.match(read('reference/form-patterns.md'), /i18n\.md/, 'form-patterns → i18n missing');
    assert.match(read('reference/accessibility.md'), /i18n\.md/, 'accessibility → i18n missing');
    assert.match(read('reference/accessibility.md'), /contrast-advanced\.md/, 'accessibility → contrast-advanced missing');
    assert.match(read('reference/iconography.md'), /composition\.md/, 'iconography → composition missing');
    assert.match(read('reference/style-vocabulary.md'), /proportion-systems\.md/, 'style-vocabulary → proportion-systems missing');
  });

  test('28-06: visual-hierarchy-layout has BOTH composition pointers (§Compositional Grids + §Asymmetry)', () => {
    const file = read('reference/visual-hierarchy-layout.md');
    const matches = (file.match(/composition\.md/g) || []).length;
    assert.ok(matches >= 2, `expected ≥ 2 composition.md mentions (got ${matches})`);
  });

  test('28-06: rtl-cjk-cultural pointer is at the top of file (within first 30 lines)', () => {
    const lines = read('reference/rtl-cjk-cultural.md').split(/\r?\n/);
    const firstThirty = lines.slice(0, 30).join('\n');
    assert.match(firstThirty, /i18n\.md/, 'top-of-file pointer to ./i18n.md missing from first 30 lines');
  });

  test('28-06: rtl-cjk-cultural.md preserves existing cultural-context (D-06 ADDITIVE-ONLY)', () => {
    const file = read('reference/rtl-cjk-cultural.md');
    // Boundary check — file must still contain a substantive body, not be replaced or truncated.
    assert.ok(file.length > 10000, `rtl-cjk-cultural.md unexpectedly short (${file.length} chars) — content may have been removed`);
    assert.match(file, /## 1\. RTL Layout Mirroring/, 'first cultural-context section missing — possible content removal');
  });
});

describe('28-06: audit-scoring lens-tags (D-07 orthogonal)', () => {
  const auditScoring = read('reference/audit-scoring.md');

  test('28-06: audit-scoring contains both new lens-tags', () => {
    assert.match(auditScoring, /composition_alignment/, 'composition_alignment lens-tag missing');
    assert.match(auditScoring, /i18n_readiness/, 'i18n_readiness lens-tag missing');
  });

  test('28-06: audit-scoring lens-tags are orthogonal (NOT a new top-level pillar)', () => {
    // The lens-tags section must be a sub-discipline, not a renumbered pillar.
    assert.match(auditScoring, /Lens-Tags|Lens Tags|lens-tags/, 'Lens-Tags section header missing');
    // No new "### 9." pillar should appear (existing pillars: 1-7 + 8 Micro-polish).
    assert.doesNotMatch(auditScoring, /^### 9\. /m, 'unexpected new pillar #9 — D-07 requires orthogonal tags, not a new pillar');
  });
});
