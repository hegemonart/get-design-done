'use strict';
/**
 * test/suite/phase-54-registry-scaffold.test.cjs — Phase 54 (Composable Reference
 * Addendums), REG-01 (executor F). Tagged '54-09:'.
 *
 * Proves the integration deliverables that wire the round-1 pieces (executors
 * A-E) into the shipped surface:
 *
 *   1. registry.schema.json accepts a type:"stack-addendum" entry carrying a
 *      composes_into array + a kind field (the additive schema change is
 *      Draft-07-valid and additionalProperties:false still holds).
 *   2. All 18 addendums (8 systems / 6 frameworks / 4 motion) are registered in
 *      reference/registry.json, the round-trip (validateRegistry) is clean, and
 *      each entry resolves to its on-disk file with a frontmatter-matching
 *      composes_into.
 *   3. The /hone:new-addendum scaffolder (scripts/lib/new-addendum.cjs) rejects
 *      bad names ('../x', 'A', '') + bad kinds, accepts a good one ('my-lib'),
 *      and the rendered skeleton carries the 4 mandatory sections.
 *   4. scripts/skill-templates/new-addendum/SKILL.md exists with the contract frontmatter.
 *   5. The gsd-health stack_addendums coverage row is present + graceful-absent.
 *   6. SC#9 backward-compat: at the wiring layer, an absent / null detected
 *      stack leaves spec.prompt byte-for-byte unchanged (re-asserting B's
 *      invariant through applyAddendums, the exact call the runner makes).
 *
 * Hermetic where it matters: schema validation compiles a tiny ad-hoc checker
 * (no ajv runtime — mirrors reference-registry.test.cjs), and the scaffolder /
 * compose assertions use in-memory inputs. The registry round-trip reads the
 * real reference/ tree on purpose (that is the contract under test).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { REPO_ROOT } = require('./helpers.ts');

const REG_PATH = path.join(REPO_ROOT, 'reference', 'registry.json');
const SCHEMA_PATH = path.join(REPO_ROOT, 'reference', 'registry.schema.json');

const { validateRegistry, list } = require('../../scripts/lib/reference-registry.cjs');
const newAddendum = require('../../scripts/lib/new-addendum.cjs');
const { applyAddendums, composeAddendums, classifyEntry } = require('../../scripts/lib/mapper-spawn.cjs');
const { getHealthChecks } = require('../../scripts/lib/health-mirror/index.cjs');

// The canonical 18 addendums (executors C/D/E). basename -> {dir, kind}.
const EXPECTED_ADDENDUMS = {
  // 8 design systems
  tailwind: { dir: 'systems', kind: 'system' },
  shadcn: { dir: 'systems', kind: 'system' },
  'radix-themes': { dir: 'systems', kind: 'system' },
  mui: { dir: 'systems', kind: 'system' },
  chakra: { dir: 'systems', kind: 'system' },
  'vanilla-extract': { dir: 'systems', kind: 'system' },
  'styled-components': { dir: 'systems', kind: 'system' },
  'css-modules': { dir: 'systems', kind: 'system' },
  // 6 frameworks
  nextjs: { dir: 'frameworks', kind: 'framework' },
  remix: { dir: 'frameworks', kind: 'framework' },
  'vite-react': { dir: 'frameworks', kind: 'framework' },
  astro: { dir: 'frameworks', kind: 'framework' },
  sveltekit: { dir: 'frameworks', kind: 'framework' },
  storybook: { dir: 'frameworks', kind: 'framework' },
  // 4 motion
  'framer-motion': { dir: 'motion', kind: 'motion' },
  gsap: { dir: 'motion', kind: 'motion' },
  'motion-one': { dir: 'motion', kind: 'motion' },
  'react-spring': { dir: 'motion', kind: 'motion' },
};

/** Parse a minimal frontmatter `composes_into: [a, b]` from an addendum file. */
function readComposesInto(absPath) {
  const text = fs.readFileSync(absPath, 'utf8');
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const line = m[1].split('\n').find((l) => /^composes_into:/.test(l));
  if (!line) return null;
  const arr = line.slice(line.indexOf(':') + 1).trim().replace(/^\[|\]$/g, '');
  return arr.split(',').map((s) => s.trim()).filter(Boolean);
}

// ---------------------------------------------------------------------------
// 1. Schema: stack-addendum type + composes_into field
// ---------------------------------------------------------------------------

test('54-09: registry.schema.json adds stack-addendum type + composes_into/kind (Draft-07, additive)', () => {
  assert.ok(fs.existsSync(SCHEMA_PATH), 'registry.schema.json must exist');
  const s = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  assert.equal(s.$schema, 'http://json-schema.org/draft-07/schema#');

  const itemProps = s.properties.entries.items.properties;
  // type enum gained 'stack-addendum' (additive — old values still present).
  assert.ok(itemProps.type.enum.includes('stack-addendum'), 'type enum includes stack-addendum');
  assert.ok(itemProps.type.enum.includes('heuristic'), 'pre-existing enum values retained');
  assert.ok(itemProps.type.enum.includes('domain-index'), 'pre-existing enum values retained');

  // composes_into is a declared optional array-of-strings field (required
  // because additionalProperties:false would otherwise reject it).
  assert.ok(itemProps.composes_into, 'composes_into field declared');
  assert.equal(itemProps.composes_into.type, 'array');
  assert.equal(itemProps.composes_into.items.type, 'string');

  // kind is declared (system|framework|motion) so an explicit category passes.
  assert.ok(itemProps.kind, 'kind field declared');
  assert.deepEqual(itemProps.kind.enum.slice().sort(), ['framework', 'motion', 'system']);

  // additionalProperties:false invariant preserved (the contract that forced
  // the field declarations in the first place).
  assert.equal(s.properties.entries.items.additionalProperties, false);
});

test('54-09: a sample stack-addendum entry validates against the schema (compiled checker)', () => {
  const s = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  const itemSchema = s.properties.entries.items;
  const validTypes = new Set(itemSchema.properties.type.enum);
  const namePattern = new RegExp(itemSchema.properties.name.pattern);
  const allowedKeys = new Set(Object.keys(itemSchema.properties));

  const sample = {
    name: 'addendum-system-sample',
    path: 'reference/systems/sample.md',
    type: 'stack-addendum',
    phase: 54,
    kind: 'system',
    composes_into: ['token-mapper', 'component-taxonomy-mapper'],
    description: 'a sample stack addendum entry',
  };

  // Required fields present.
  for (const req of itemSchema.required) {
    assert.ok(req in sample, `required field ${req} present`);
  }
  // Type in enum, name matches pattern, no additional (unknown) keys.
  assert.ok(validTypes.has(sample.type), 'type in enum');
  assert.ok(namePattern.test(sample.name), 'name matches schema pattern');
  for (const k of Object.keys(sample)) {
    assert.ok(allowedKeys.has(k), `key ${k} is declared (additionalProperties:false)`);
  }
  // composes_into is a string array.
  assert.ok(Array.isArray(sample.composes_into));
  assert.ok(sample.composes_into.every((m) => typeof m === 'string'));
});

// ---------------------------------------------------------------------------
// 2. Registry: all 18 addendums registered + round-trip clean
// ---------------------------------------------------------------------------

test('54-09: registry round-trip (validateRegistry) is clean with the addendum subdirs', () => {
  const v = validateRegistry({ cwd: REPO_ROOT });
  assert.ok(
    v.ok,
    `registry round-trip failed: ${JSON.stringify({
      missing: v.missingInRegistry,
      dangling: v.danglingInRegistry,
      duplicates: v.duplicates,
    })}`,
  );
});

test('54-09: all 18 addendums are registered as type:"stack-addendum" entries', () => {
  const entries = list({ type: 'stack-addendum', cwd: REPO_ROOT });
  assert.equal(entries.length, 18, 'exactly 18 stack-addendum entries');

  // Every expected addendum file resolves to exactly one entry whose path,
  // kind, and composes_into agree with the on-disk frontmatter.
  const byBasename = new Map();
  for (const e of entries) {
    const base = path.basename(e.path).replace(/\.md$/i, '');
    byBasename.set(base, e);
  }

  for (const [base, meta] of Object.entries(EXPECTED_ADDENDUMS)) {
    const e = byBasename.get(base);
    assert.ok(e, `addendum "${base}" is registered`);
    assert.equal(e.type, 'stack-addendum', `${base} is a stack-addendum`);
    assert.equal(e.phase, 54, `${base} is phase 54`);
    assert.equal(e.path, `reference/${meta.dir}/${base}.md`, `${base} path is repo-root-relative`);
    assert.equal(e.kind, meta.kind, `${base} kind matches`);
    assert.ok(Array.isArray(e.composes_into) && e.composes_into.length > 0, `${base} has composes_into`);

    // The file exists, and the registry composes_into matches the frontmatter.
    const abs = path.join(REPO_ROOT, e.path);
    assert.ok(fs.existsSync(abs), `${base} file exists on disk`);
    const fmComposes = readComposesInto(abs);
    assert.deepEqual(
      e.composes_into.slice().sort(),
      (fmComposes || []).slice().sort(),
      `${base} registry composes_into matches its frontmatter`,
    );

    // classifyEntry (B's matcher) classifies the entry into the right category
    // + the basename key (this is what the runner matches detectStack against).
    const { category, key } = classifyEntry(e);
    assert.equal(category, meta.kind, `${base} classifies into ${meta.kind}`);
    assert.equal(key, base, `${base} matcher key is the basename`);
  }
});

test('54-09: registry entry names are unique + schema-valid slugs', () => {
  const entries = list({ type: 'stack-addendum', cwd: REPO_ROOT });
  const NAME_RE = /^[a-z0-9][a-z0-9-._]*$/;
  const names = entries.map((e) => e.name);
  assert.equal(new Set(names).size, names.length, 'addendum entry names are unique');
  for (const n of names) {
    assert.ok(NAME_RE.test(n), `name "${n}" matches the registry slug pattern`);
  }
});

// ---------------------------------------------------------------------------
// 3. Scaffolder: NAME_RE + kind validation + 4-section skeleton
// ---------------------------------------------------------------------------

test('54-09: scaffolder NAME_RE rejects bad names and accepts a good one', () => {
  // Bad names must throw.
  for (const bad of ['../x', 'A', '', 'a b', 'UPPER', '.hidden', '-leading']) {
    assert.throws(
      () => newAddendum.buildAddendumRecord({ kind: 'system', name: bad }),
      /new-addendum:/,
      `name ${JSON.stringify(bad)} must be rejected`,
    );
  }
  // Good name passes.
  const rec = newAddendum.buildAddendumRecord({ kind: 'system', name: 'my-lib' });
  assert.equal(rec.name, 'my-lib');
  assert.equal(rec.kind, 'system');
  assert.equal(rec.phase, 54);
  assert.equal(rec.path, 'reference/systems/my-lib.md');
  // Dotted/underscored slugs are valid per NAME_RE.
  assert.doesNotThrow(() => newAddendum.buildAddendumRecord({ kind: 'motion', name: 'motion-one' }));
});

test('54-09: scaffolder rejects an invalid kind, defaults composes_into per kind', () => {
  for (const bad of ['plugin', 'design', '', undefined, 'systems', 'sys']) {
    assert.throws(
      () => newAddendum.buildAddendumRecord({ kind: bad, name: 'x' }),
      /new-addendum:/,
      `kind ${JSON.stringify(bad)} must be rejected`,
    );
  }
  // Kind is normalized (trim + lower-case): "  System " resolves to "system".
  assert.equal(newAddendum.buildAddendumRecord({ kind: '  System ', name: 'x' }).kind, 'system');
  // Per-kind composes_into defaults mirror the round-1 addendum frontmatter.
  assert.deepEqual(
    newAddendum.buildAddendumRecord({ kind: 'system', name: 'x' }).composes_into,
    ['token-mapper', 'component-taxonomy-mapper'],
  );
  assert.deepEqual(
    newAddendum.buildAddendumRecord({ kind: 'framework', name: 'x' }).composes_into,
    ['component-taxonomy-mapper', 'visual-hierarchy-mapper'],
  );
  assert.deepEqual(
    newAddendum.buildAddendumRecord({ kind: 'motion', name: 'x' }).composes_into,
    ['motion-mapper'],
  );
  // An explicit composes_into override wins.
  assert.deepEqual(
    newAddendum.buildAddendumRecord({ kind: 'system', name: 'x', composesInto: 'token-mapper' }).composes_into,
    ['token-mapper'],
  );
});

test('54-09: scaffolded skeleton has the 4 mandatory sections + matching frontmatter', () => {
  const md = newAddendum.renderAddendumMd(
    newAddendum.buildAddendumRecord({ kind: 'framework', name: 'qwik' }),
  );
  for (const section of ['## Conventions', '## File patterns', '## Gotchas', '## Example output']) {
    assert.ok(md.includes(section), `skeleton has ${section}`);
  }
  // Frontmatter carries name / kind / composes_into / phase.
  assert.match(md, /^---\nname: qwik\nkind: framework\ncomposes_into: \[component-taxonomy-mapper, visual-hierarchy-mapper\]\nphase: 54\n---/);
  // Example output uses the Phase 52 schema_version marker.
  assert.match(md, /"schema_version": "52\.0"/);
  // No em dash in the generated skeleton (lint:prose gate scans reference/).
  assert.doesNotMatch(md, /—/, 'skeleton is em-dash-free');
});

test('54-09: targetPathFor maps each kind to its reference subdir', () => {
  assert.equal(newAddendum.targetPathFor('system', 'foo'), 'reference/systems/foo.md');
  assert.equal(newAddendum.targetPathFor('framework', 'foo'), 'reference/frameworks/foo.md');
  assert.equal(newAddendum.targetPathFor('motion', 'foo'), 'reference/motion/foo.md');
  assert.throws(() => newAddendum.targetPathFor('bogus', 'foo'), /new-addendum:/);
});

// ---------------------------------------------------------------------------
// 4. The /hone:new-addendum SKILL.md exists with the contract frontmatter
// ---------------------------------------------------------------------------

test('54-09: scripts/skill-templates/new-addendum/SKILL.md exists with contract frontmatter', () => {
  const skillPath = path.join(REPO_ROOT, 'scripts', 'skill-templates', 'new-addendum', 'SKILL.md');
  assert.ok(fs.existsSync(skillPath), 'new-addendum SKILL.md exists');
  const text = fs.readFileSync(skillPath, 'utf8');
  const fm = text.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(fm, 'SKILL.md has frontmatter');
  const block = fm[1];
  assert.match(block, /^name: hone-new-addendum$/m, 'name is hone-new-addendum (hone-prefixed, matches dir)');
  assert.match(block, /^argument-hint: "<kind> <name>"$/m, 'argument-hint is "<kind> <name>"');
  assert.match(block, /^user-invocable: true$/m, 'user-invocable: true');
  assert.match(block, /^tools:/m, 'tools declared');
  // v3 description form (single quoted line, within the 20..1024 budget).
  const desc = block.match(/^description: "([\s\S]*?)"$/m);
  assert.ok(desc, 'description present + quoted');
  assert.ok(desc[1].length >= 20 && desc[1].length <= 1024, `description length ${desc[1].length} within budget`);
  assert.match(desc[1], /Use when/, 'v3 "Use when" trigger sentence');
  // Does NOT touch the manifest (contract: orchestrator owns skills.json).
  assert.match(text, /Do not edit `reference\/registry\.json`/);
});

// ---------------------------------------------------------------------------
// 5. gsd-health coverage row present + graceful-absent
// ---------------------------------------------------------------------------

test('54-09: gsd-health stack_addendums row is present + graceful when no stack', async () => {
  const os = require('node:os');
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'hone-p54-health-'));
  try {
    const { checks } = await getHealthChecks(bare);
    const row = checks.find((c) => c.name === 'stack_addendums');
    assert.ok(row, 'stack_addendums check is present');
    assert.ok(['ok', 'warn', 'fail'].includes(row.status), 'status is a valid enum');
    // No package.json -> no detected stack -> graceful "no stacks detected", ok.
    assert.equal(row.status, 'ok');
    assert.match(row.detail, /no stacks detected/);
  } finally {
    fs.rmSync(bare, { recursive: true, force: true });
  }
});

test('54-09: gsd-health stack_addendums reports N/M coverage when a stack is detected', async () => {
  const os = require('node:os');
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'hone-p54-health-cov-'));
  try {
    // Detected stack: tailwind + nextjs + framer-motion (all have addendums).
    fs.writeFileSync(
      path.join(proj, 'package.json'),
      JSON.stringify({ dependencies: { tailwindcss: '^4', next: '^15', 'framer-motion': '^11' } }),
    );
    // Copy the real registry in so coverage can be computed.
    fs.mkdirSync(path.join(proj, 'reference'), { recursive: true });
    fs.copyFileSync(REG_PATH, path.join(proj, 'reference', 'registry.json'));

    const { checks } = await getHealthChecks(proj);
    const row = checks.find((c) => c.name === 'stack_addendums');
    assert.ok(row, 'stack_addendums check is present');
    assert.equal(row.status, 'ok', 'full coverage is ok');
    assert.match(row.detail, /3\/3 detected stacks have addendums/);
  } finally {
    fs.rmSync(proj, { recursive: true, force: true });
  }
});

test('54-09: gsd-health stack_addendums warns (never throws) when registry is unavailable', async () => {
  const os = require('node:os');
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'hone-p54-health-noreg-'));
  try {
    fs.writeFileSync(
      path.join(proj, 'package.json'),
      JSON.stringify({ dependencies: { tailwindcss: '^4' } }),
    );
    // No reference/registry.json.
    const { checks } = await getHealthChecks(proj);
    const row = checks.find((c) => c.name === 'stack_addendums');
    assert.ok(row);
    assert.equal(row.status, 'warn');
    assert.match(row.detail, /registry unavailable/);
  } finally {
    fs.rmSync(proj, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 6. SC#9 backward-compat at the wiring layer (re-assert B's invariant)
// ---------------------------------------------------------------------------

test('54-09: SC#9 - applyAddendums leaves spec.prompt unchanged with no detected stack', () => {
  // This is the EXACT call the explore runner makes pre-spawn. With a null /
  // empty stack the prompt must be byte-for-byte unchanged (additive invariant).
  const registry = JSON.parse(fs.readFileSync(REG_PATH, 'utf8'));
  const refDir = path.join(REPO_ROOT, 'reference');

  for (const stack of [null, undefined, {}, { ds: null, framework: null, motion_libs: [] }]) {
    const BASE = 'You are token-mapper. Map the tokens.';
    const spec = { name: 'token-mapper', prompt: BASE };
    const res = applyAddendums(spec, stack, { registry, refDir });
    assert.equal(spec.prompt, BASE, `prompt unchanged for stack=${JSON.stringify(stack)}`);
    assert.equal(res.block, '');
    assert.deepEqual(res.used, []);
    assert.deepEqual(res.missing, []);
  }
});

test('54-09: SC#9 - applyAddendums against the REAL registry composes the right addendums per agent', () => {
  const registry = JSON.parse(fs.readFileSync(REG_PATH, 'utf8'));
  const refDir = path.join(REPO_ROOT, 'reference');
  const stack = { ds: 'tailwind', framework: 'nextjs', motion_libs: ['framer-motion'] };

  // token-mapper: only the DS (tailwind) composes into it; nextjs + framer
  // compose into other mappers, so they are flagged missing for THIS mapper.
  const tok = composeAddendums('token-mapper', stack, { registry, refDir });
  assert.deepEqual(tok.used, ['addendum-system-tailwind']);
  assert.deepEqual(tok.missing.slice().sort(), ['framer-motion', 'nextjs']);
  assert.match(tok.block, /## Stack-specific guidance/);

  // component-taxonomy-mapper: DS + framework compose into it.
  const ct = composeAddendums('component-taxonomy-mapper', stack, { registry, refDir });
  assert.deepEqual(ct.used, ['addendum-system-tailwind', 'addendum-framework-nextjs']);
  assert.deepEqual(ct.missing, ['framer-motion']);

  // motion-mapper: only the motion lib composes into it.
  const mo = composeAddendums('motion-mapper', stack, { registry, refDir });
  assert.deepEqual(mo.used, ['addendum-motion-framer-motion']);
  assert.deepEqual(mo.missing.slice().sort(), ['nextjs', 'tailwind']);

  // Cap-3 guard: even a stack with multiple motion libs never exceeds 3 in one
  // mapper that composes all categories (only the leading motion lib is taken).
  const taxonomyAll = composeAddendums('component-taxonomy-mapper', {
    ds: 'tailwind',
    framework: 'nextjs',
    motion_libs: ['framer-motion', 'gsap'],
  }, { registry, refDir });
  assert.ok(taxonomyAll.used.length <= 3, 'cap of 3 respected against the real registry');
});
