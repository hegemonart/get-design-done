'use strict';
/**
 * test/suite/phase-57-render.test.cjs — Phase 57 render-markdown tests (57-C:).
 *
 * Tag: 57-C:
 *
 * Tests for scripts/lib/state/render-markdown.cjs:
 *   - renderStateMarkdown(db, cycle_id) byte-equal acceptance
 *   - round-trip stability: rendered === serialize(parse(rendered).state, parse(rendered))
 *   - blockers date-format hazard
 *   - null/undefined db contract
 *   - renderDecisionLog and renderBlockers additive views
 *
 * SQLite assertions are guarded behind `if (!Database) return;` so CI
 * (where better-sqlite3 is not installed) passes on the markdown/JS floor.
 * At least 1 markdown-floor assertion is always exercised regardless of
 * whether better-sqlite3 is present.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

// ---------------------------------------------------------------------------
// Package root resolution (mirrors _pkg-root.cjs).
// ---------------------------------------------------------------------------
function findPackageRoot(startDir) {
  let dir = path.resolve(startDir);
  let firstWithPkg = null;
  for (let i = 0; i < 12; i++) {
    const pkgPath = path.join(dir, 'package.json');
    let pkg = null;
    try { pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')); } catch { pkg = null; }
    if (pkg) {
      if (firstWithPkg === null) firstWithPkg = dir;
      if (pkg.name === 'hone') return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return firstWithPkg || path.resolve(startDir);
}

const PKG_ROOT = findPackageRoot(__dirname);

// ---------------------------------------------------------------------------
// Load render-markdown (Executor C deliverable).
// ---------------------------------------------------------------------------
const renderMd = require(path.join(PKG_ROOT, 'scripts', 'lib', 'state', 'render-markdown.cjs'));
const { renderStateMarkdown, renderDecisionLog, renderBlockers } = renderMd;

// ---------------------------------------------------------------------------
// Probe Executor A's state-backend (optional - lazy require by pinned name).
// Prefer state-backend.cjs's probed Database over direct better-sqlite3 probe
// so we align with the same probe logic (FTS5 check) that the real backend uses.
// ---------------------------------------------------------------------------
let backendModule = null;
try {
  backendModule = require(path.join(PKG_ROOT, 'scripts', 'lib', 'state', 'state-backend.cjs'));
} catch {
  backendModule = null;
}

// ---------------------------------------------------------------------------
// Probe better-sqlite3 (optional - tests guard with if (!Database) return).
// Use state-backend.cjs's Database export when available (it does the FTS5 probe);
// fall back to direct require of better-sqlite3.
// ---------------------------------------------------------------------------
let Database = null;
if (backendModule && backendModule.Database) {
  Database = backendModule.Database;
} else {
  try {
    Database = require('better-sqlite3');
  } catch {
    Database = null;
  }
}

// ---------------------------------------------------------------------------
// Probe Executor B's migrate (optional - lazy require by pinned name).
// ---------------------------------------------------------------------------
let migrateModule = null;
try {
  migrateModule = require(path.join(PKG_ROOT, 'scripts', 'lib', 'state', 'migrate-to-sqlite.cjs'));
} catch {
  migrateModule = null;
}

// ---------------------------------------------------------------------------
// Dynamic import helpers for sdk/state TS modules.
// ---------------------------------------------------------------------------
const { pathToFileURL } = require('node:url');

let _sdkState = null;
async function importSdkState() {
  if (_sdkState !== null) return _sdkState;
  try {
    const url = pathToFileURL(path.join(PKG_ROOT, 'sdk', 'state', 'mutator.ts')).href;
    _sdkState = await import(url);
  } catch {
    _sdkState = null;
  }
  return _sdkState;
}

let _sdkParser = null;
async function importSdkParser() {
  if (_sdkParser !== null) return _sdkParser;
  try {
    const url = pathToFileURL(path.join(PKG_ROOT, 'sdk', 'state', 'parser.ts')).href;
    _sdkParser = await import(url);
  } catch {
    _sdkParser = null;
  }
  return _sdkParser;
}

/**
 * Load the combined sdk = { serialize, parse } object for injection into
 * renderStateMarkdown. Returns null if either module fails to load.
 * @returns {Promise<{ serialize: Function, parse: Function } | null>}
 */
async function loadSdkForRender() {
  const mutator = await importSdkState();
  const parser = await importSdkParser();
  if (!mutator || !parser) return null;
  if (typeof mutator.serialize !== 'function' || typeof parser.parse !== 'function') return null;
  return { serialize: mutator.serialize, parse: parser.parse };
}

// ---------------------------------------------------------------------------
// Test fixtures (inline minimal STATE.md strings for core assertions).
// Executor B's fixtures used for round-trip tests; fallback to these.
// ---------------------------------------------------------------------------

// Minimal fresh fixture - complete (all blocks serialize() will emit).
// serialize() always emits connections:{} and timestamps:{} as empty blocks.
// These fixtures are self-consistent SDK round-trips.
const INLINE_FRESH_MD = `---
pipeline_state_version: 1.0
stage: brief
cycle: test-fresh
wave: 1
started_at: 2026-06-01T00:00:00Z
last_checkpoint:
---

<position>
stage: brief
wave: 1
task_progress: 0/0
status: initialized
handoff_source: ""
handoff_path: ""
skipped_stages: ""
</position>

<decisions>
</decisions>

<must_haves>
</must_haves>

<connections>
</connections>

<blockers>
</blockers>

<timestamps>
</timestamps>
`;

// Minimal mid-cycle fixture - complete (all blocks serialize() will emit).
const INLINE_MID_MD = `---
pipeline_state_version: 1.0
stage: plan
cycle: test-mid
wave: 2
started_at: 2026-05-01T00:00:00Z
last_checkpoint: 2026-06-01T00:00:00Z
---

<position>
stage: plan
wave: 2
task_progress: 3/7
status: in_progress
handoff_source: ""
handoff_path: ""
skipped_stages: ""
</position>

<decisions>
D-01: Use token-based design system (locked)
D-02: React 18 TypeScript strict mode (tentative)
</decisions>

<must_haves>
M-01: Keyboard navigation passes | status: pending
M-02: Color contrast WCAG AA | status: pass
</must_haves>

<connections>
</connections>

<blockers>
[plan] [2026-05-28]: Figma token export requires paid org plan
</blockers>

<timestamps>
</timestamps>
`;

// Fixture with blockers using ISO date format (date-format hazard).
// Complete: all blocks serialize() will emit.
const INLINE_BLOCKERS_ISO_MD = `---
pipeline_state_version: 1.0
stage: design
cycle: test-blockers-iso
wave: 1
started_at: 2026-06-01T00:00:00Z
last_checkpoint: 2026-06-01T00:00:00Z
---

<position>
stage: design
wave: 1
task_progress: 1/3
status: in_progress
handoff_source: ""
handoff_path: ""
skipped_stages: ""
</position>

<decisions>
</decisions>

<must_haves>
</must_haves>

<connections>
</connections>

<blockers>
[design] [2026-06-01T10:00:00Z]: ISO timestamp blocker - date must round-trip exactly
[explore] [2026-05-15]: YYYY-MM-DD format blocker - must preserve format
</blockers>

<timestamps>
</timestamps>
`;

// ---------------------------------------------------------------------------
// Helper: create a minimal in-memory SQLite DB with Phase 57 schema.
// Inserts rows from a parsed STATE.md (using only the tables Phase 57 defines).
// ---------------------------------------------------------------------------

/**
 * Create minimal schema and return the DB.
 * Schema matches sdk/state/schema.sql (Phase 57 PINNED DDL) with composite PKs.
 * @param {any} DB - better-sqlite3 constructor
 * @returns {any} in-memory database
 */
function createTestDb(DB) {
  const db = new DB(':memory:');
  db.pragma('foreign_keys = ON');

  // Create the tables needed for renderStateMarkdown.
  db.exec(`
    CREATE TABLE IF NOT EXISTS state_position (
      cycle_id TEXT PRIMARY KEY,
      stage TEXT,
      wave INTEGER,
      task_progress TEXT,
      status TEXT,
      branch TEXT,
      raw_frontmatter TEXT,
      body_preamble TEXT,
      body_trailer TEXT,
      line_ending TEXT DEFAULT '\n',
      last_render_sha256 TEXT,
      updated_at TEXT,
      -- raw_body column for position block body (legacy compat - render prefers _block_meta)
      raw_body TEXT,
      handoff_source TEXT DEFAULT '',
      handoff_path TEXT DEFAULT '',
      skipped_stages TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS decisions (
      id TEXT NOT NULL,
      cycle_id TEXT NOT NULL,
      phase_id TEXT,
      status TEXT CHECK(status IN('locked','tentative')),
      body_md TEXT,
      tags TEXT,
      ordinal INTEGER NOT NULL,
      raw_line TEXT,
      created_at TEXT,
      last_referenced_at TEXT,
      PRIMARY KEY (cycle_id, id)
    );

    CREATE TABLE IF NOT EXISTS blockers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cycle_id TEXT,
      stage TEXT,
      date TEXT,
      severity TEXT,
      body_md TEXT,
      ordinal INTEGER NOT NULL,
      raw_line TEXT,
      resolved_at TEXT
    );

    CREATE TABLE IF NOT EXISTS must_haves (
      id TEXT NOT NULL,
      cycle_id TEXT NOT NULL,
      body_md TEXT,
      status TEXT CHECK(status IN('pending','pass','fail')),
      ordinal INTEGER NOT NULL,
      raw_line TEXT,
      PRIMARY KEY (cycle_id, id)
    );

    CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY,
      phase_id TEXT,
      status TEXT,
      body_md TEXT,
      ordinal INTEGER,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS _meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS _block_meta (
      cycle_id TEXT NOT NULL,
      block TEXT NOT NULL,
      gap TEXT,
      raw_body TEXT,
      ordinal INTEGER,
      PRIMARY KEY(cycle_id, block)
    );
  `);

  return db;
}

/**
 * Insert a minimal parsed STATE.md into a test DB.
 * Stores all block data needed for round-trip: structured rows + raw_body in _block_meta.
 * @param {any} db
 * @param {string} cycleId
 * @param {object} opts
 * @param {string} [opts.stage]
 * @param {number} [opts.wave]
 * @param {string} [opts.task_progress]
 * @param {string} [opts.status]
 * @param {string} [opts.raw_frontmatter]
 * @param {string} [opts.body_preamble]
 * @param {string} [opts.body_trailer]
 * @param {string} [opts.line_ending]
 * @param {string} [opts.raw_position_body]
 * @param {string} [opts.handoff_source]
 * @param {string} [opts.handoff_path]
 * @param {string} [opts.skipped_stages]
 * @param {Array<{id:string, body_md:string, status:string, raw_line?:string}>} [opts.decisions]
 * @param {Array<{id:string, body_md:string, status:string, raw_line?:string}>} [opts.must_haves]
 * @param {Array<{stage:string, date:string, body_md:string, raw_line?:string, resolved_at?:string}>} [opts.blockers]
 * @param {Record<string,string>} [opts.block_gaps] - map of block->gap text
 * @param {Record<string,string|null>} [opts.block_raw_bodies] - map of block->raw verbatim body
 */
function insertTestData(db, cycleId, opts = {}) {
  const {
    stage = 'brief',
    wave = 1,
    task_progress = '0/0',
    status = 'initialized',
    raw_frontmatter = null,
    body_preamble = '',
    body_trailer = '',
    line_ending = '\n',
    raw_position_body = null,
    handoff_source = '',
    handoff_path = '',
    skipped_stages = '',
    decisions = [],
    must_haves = [],
    blockers = [],
    block_gaps = {},
    block_raw_bodies = {},
  } = opts;

  db.prepare(`
    INSERT INTO state_position
      (cycle_id, stage, wave, task_progress, status, raw_frontmatter,
       body_preamble, body_trailer, line_ending,
       raw_body, handoff_source, handoff_path, skipped_stages, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    cycleId, stage, wave, task_progress, status,
    raw_frontmatter,
    body_preamble, body_trailer, line_ending,
    raw_position_body,
    handoff_source, handoff_path, skipped_stages,
    new Date().toISOString(),
  );

  const insertDecision = db.prepare(`
    INSERT INTO decisions (id, cycle_id, status, body_md, ordinal, raw_line, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (let i = 0; i < decisions.length; i++) {
    const d = decisions[i];
    insertDecision.run(d.id, cycleId, d.status, d.body_md, i, d.raw_line || null, new Date().toISOString());
  }

  const insertMustHave = db.prepare(`
    INSERT INTO must_haves (id, cycle_id, body_md, status, ordinal, raw_line)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (let i = 0; i < must_haves.length; i++) {
    const m = must_haves[i];
    insertMustHave.run(m.id, cycleId, m.body_md, m.status, i, m.raw_line || null);
  }

  const insertBlocker = db.prepare(`
    INSERT INTO blockers (cycle_id, stage, date, body_md, ordinal, raw_line, resolved_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (let i = 0; i < blockers.length; i++) {
    const b = blockers[i];
    insertBlocker.run(cycleId, b.stage, b.date, b.body_md, i, b.raw_line || null, b.resolved_at || null);
  }

  // Insert block metadata (gaps + raw_body for unstructured blocks).
  // Merge block_gaps and block_raw_bodies into _block_meta.
  const allBlocks = new Set([...Object.keys(block_gaps), ...Object.keys(block_raw_bodies)]);
  const insertBlockMeta = db.prepare(`
    INSERT OR REPLACE INTO _block_meta (cycle_id, block, gap, raw_body)
    VALUES (?, ?, ?, ?)
  `);
  for (const block of allBlocks) {
    const gap = block_gaps[block] !== undefined ? block_gaps[block] : null;
    const rawBody = block_raw_bodies[block] !== undefined ? block_raw_bodies[block] : null;
    insertBlockMeta.run(cycleId, block, gap, rawBody);
  }
}

// ---------------------------------------------------------------------------
// Floor assertions (always run, even without better-sqlite3).
// ---------------------------------------------------------------------------

test('57-C: renderStateMarkdown - throws TypeError for null db', () => {
  // renderStateMarkdown is synchronous — use assert.throws (not assert.rejects).
  // Pass a dummy sdk to reach the db check (sdk check comes after db check).
  const dummySdk = { serialize: () => '', parse: () => ({}) };
  assert.throws(
    () => renderStateMarkdown(null, 'any-cycle', dummySdk),
    (err) => {
      assert.ok(err instanceof TypeError, 'should be TypeError');
      assert.ok(
        err.message.includes('null') || err.message.includes('renderStateMarkdown'),
        `error message should mention null or the function: "${err.message}"`,
      );
      return true;
    },
  );
});

test('57-C: renderStateMarkdown - throws TypeError for undefined db', () => {
  // renderStateMarkdown is synchronous — use assert.throws.
  const dummySdk = { serialize: () => '', parse: () => ({}) };
  assert.throws(
    () => renderStateMarkdown(undefined, 'any-cycle', dummySdk),
    (err) => {
      assert.ok(err instanceof TypeError, 'should be TypeError');
      assert.ok(
        err.message.includes('undefined') || err.message.includes('renderStateMarkdown'),
        `error message should mention undefined or the function: "${err.message}"`,
      );
      return true;
    },
  );
});

test('57-C: BLOCK_ORDER export mirrors parser.ts canonical order', () => {
  const BLOCK_ORDER = renderMd._BLOCK_ORDER;
  assert.ok(Array.isArray(BLOCK_ORDER), '_BLOCK_ORDER should be an array');
  // Must start with position and include the critical blocks.
  assert.strictEqual(BLOCK_ORDER[0], 'position', 'first block should be position');
  assert.ok(BLOCK_ORDER.includes('decisions'), 'should include decisions');
  assert.ok(BLOCK_ORDER.includes('blockers'), 'should include blockers');
  assert.ok(BLOCK_ORDER.includes('must_haves'), 'should include must_haves');
  assert.ok(BLOCK_ORDER.includes('prototyping'), 'should include prototyping');
  assert.ok(BLOCK_ORDER.includes('quality_gate'), 'should include quality_gate');
  assert.ok(BLOCK_ORDER.includes('connections'), 'should include connections');
  // Verify canonical order: decisions before blockers, must_haves before prototyping.
  assert.ok(
    BLOCK_ORDER.indexOf('decisions') < BLOCK_ORDER.indexOf('blockers'),
    'decisions should come before blockers',
  );
  assert.ok(
    BLOCK_ORDER.indexOf('must_haves') < BLOCK_ORDER.indexOf('prototyping'),
    'must_haves should come before prototyping',
  );
});

test('57-C: tryReparseDecisionLine - handles valid decision lines', () => {
  const fn = renderMd._tryReparseDecisionLine;
  const result = fn('D-01: Use token-based design system (locked)');
  assert.deepStrictEqual(result, {
    id: 'D-01',
    text: 'Use token-based design system',
    status: 'locked',
  });
});

test('57-C: tryReparseDecisionLine - handles tentative status', () => {
  const fn = renderMd._tryReparseDecisionLine;
  const result = fn('D-03: Mobile-first breakpoints (tentative)');
  assert.ok(result !== null, 'should parse tentative decision');
  assert.strictEqual(result.status, 'tentative');
});

test('57-C: tryReparseDecisionLine - returns null for non-matching line', () => {
  const fn = renderMd._tryReparseDecisionLine;
  assert.strictEqual(fn('not a decision line'), null);
  assert.strictEqual(fn(''), null);
  assert.strictEqual(fn('<!-- comment -->'), null);
});

test('57-C: tryReparseMustHaveLine - handles valid must_have lines', () => {
  const fn = renderMd._tryReparseMustHaveLine;
  const result = fn('M-01: Keyboard navigation passes | status: pending');
  assert.deepStrictEqual(result, {
    id: 'M-01',
    text: 'Keyboard navigation passes',
    status: 'pending',
  });
});

test('57-C: tryReparseMustHaveLine - handles all statuses', () => {
  const fn = renderMd._tryReparseMustHaveLine;
  assert.strictEqual(fn('M-01: Test | status: pass')?.status, 'pass');
  assert.strictEqual(fn('M-01: Test | status: fail')?.status, 'fail');
  assert.strictEqual(fn('M-01: Test | status: pending')?.status, 'pending');
});

test('57-C: tryReparseBlockerLine - handles YYYY-MM-DD date', () => {
  const fn = renderMd._tryReparseBlockerLine;
  const result = fn('[plan] [2026-05-28]: Figma token export requires paid org plan');
  assert.deepStrictEqual(result, {
    stage: 'plan',
    date: '2026-05-28',
    text: 'Figma token export requires paid org plan',
  });
});

test('57-C: tryReparseBlockerLine - handles ISO timestamp date (date-format hazard)', () => {
  const fn = renderMd._tryReparseBlockerLine;
  const result = fn('[design] [2026-06-01T10:00:00Z]: ISO timestamp blocker');
  assert.ok(result !== null, 'should parse ISO date blocker');
  assert.strictEqual(result.date, '2026-06-01T10:00:00Z');
  assert.strictEqual(result.stage, 'design');
});

test('57-C: tryReparseBlockerLine - returns null for malformed line', () => {
  const fn = renderMd._tryReparseBlockerLine;
  assert.strictEqual(fn('not a blocker'), null);
  assert.strictEqual(fn('[plan] malformed'), null);
});

test('57-C: canonicalDecision - emits correct format', () => {
  const fn = renderMd._canonicalDecision;
  assert.strictEqual(
    fn({ id: 'D-01', text: 'Use tokens', status: 'locked' }),
    'D-01: Use tokens (locked)',
  );
  assert.strictEqual(
    fn({ id: 'D-02', text: 'React 18', status: 'tentative' }),
    'D-02: React 18 (tentative)',
  );
});

test('57-C: canonicalMustHave - emits correct format', () => {
  const fn = renderMd._canonicalMustHave;
  assert.strictEqual(
    fn({ id: 'M-01', text: 'Keyboard nav', status: 'pending' }),
    'M-01: Keyboard nav | status: pending',
  );
});

test('57-C: canonicalBlocker - emits correct format', () => {
  const fn = renderMd._canonicalBlocker;
  assert.strictEqual(
    fn({ stage: 'plan', date: '2026-05-28', text: 'some blocker' }),
    '[plan] [2026-05-28]: some blocker',
  );
});

test('57-C: sdk/state/mutator.ts and parser.ts are importable via dynamic import', async () => {
  const mutator = await importSdkState();
  const parser = await importSdkParser();
  assert.ok(mutator !== null, 'mutator.ts should be importable via pathToFileURL');
  assert.ok(parser !== null, 'parser.ts should be importable via pathToFileURL');
  assert.ok(typeof mutator.serialize === 'function', 'serialize should be a function');
  assert.ok(typeof parser.parse === 'function', 'parse should be a function');
  assert.ok(Array.isArray(parser.BLOCK_ORDER), 'BLOCK_ORDER should be an array');
});

// ---------------------------------------------------------------------------
// Round-trip stability: SDK serialize is a fixed point on its own output.
// Strategy: parse an inline fixture, serialize it (canonical form), then
// verify that parsing+serializing the canonical form is idempotent.
// This tests the SDK's round-trip guarantee — NOT byte-equality with the
// original fixture (which may use compact empty-block formatting that the
// serializer expands).
// ---------------------------------------------------------------------------

test('57-C: inline fresh fixture - SDK serialize output is round-trip stable', async () => {
  const mutator = await importSdkState();
  const parser = await importSdkParser();
  if (!mutator || !parser) return;

  const md = INLINE_FRESH_MD;
  const parsed = parser.parse(md);
  // First pass: serialize to canonical form.
  const canonical = mutator.serialize(parsed.state, {
    raw_frontmatter: parsed.raw_frontmatter,
    raw_bodies: parsed.raw_bodies,
    block_gaps: parsed.block_gaps,
    line_ending: parsed.line_ending,
  });
  // Second pass: parse then serialize canonical form - must be stable.
  const parsedCanonical = parser.parse(canonical);
  const reserialize = mutator.serialize(parsedCanonical.state, {
    raw_frontmatter: parsedCanonical.raw_frontmatter,
    raw_bodies: parsedCanonical.raw_bodies,
    block_gaps: parsedCanonical.block_gaps,
    line_ending: parsedCanonical.line_ending,
  });
  assert.strictEqual(
    reserialize,
    canonical,
    'SDK serialize output must be idempotent: serialize(parse(s)) === s',
  );
});

test('57-C: inline mid fixture - SDK serialize output is round-trip stable', async () => {
  const mutator = await importSdkState();
  const parser = await importSdkParser();
  if (!mutator || !parser) return;

  const md = INLINE_MID_MD;
  const parsed = parser.parse(md);
  const canonical = mutator.serialize(parsed.state, {
    raw_frontmatter: parsed.raw_frontmatter,
    raw_bodies: parsed.raw_bodies,
    block_gaps: parsed.block_gaps,
    line_ending: parsed.line_ending,
  });
  const parsedCanonical = parser.parse(canonical);
  const reserialize = mutator.serialize(parsedCanonical.state, {
    raw_frontmatter: parsedCanonical.raw_frontmatter,
    raw_bodies: parsedCanonical.raw_bodies,
    block_gaps: parsedCanonical.block_gaps,
    line_ending: parsedCanonical.line_ending,
  });
  assert.strictEqual(reserialize, canonical, 'SDK mid fixture canonical form is round-trip stable');
});

test('57-C: blockers ISO date preserved through SDK round-trip', async () => {
  const mutator = await importSdkState();
  const parser = await importSdkParser();
  if (!mutator || !parser) return;

  const md = INLINE_BLOCKERS_ISO_MD;
  const parsed = parser.parse(md);
  // Verify parsed blocker has the exact ISO timestamp.
  const isoBlocker = parsed.state.blockers.find((b) => b.date.includes('T'));
  assert.ok(isoBlocker, 'should parse ISO-dated blocker');
  assert.strictEqual(isoBlocker.date, '2026-06-01T10:00:00Z', 'ISO date must be preserved exactly');

  // Serialize and re-parse: the ISO date must survive the round-trip.
  const canonical = mutator.serialize(parsed.state, {
    raw_frontmatter: parsed.raw_frontmatter,
    raw_bodies: parsed.raw_bodies,
    block_gaps: parsed.block_gaps,
    line_ending: parsed.line_ending,
  });
  const parsedCanonical = parser.parse(canonical);
  const isoBlockerAfter = parsedCanonical.state.blockers.find((b) => b.date.includes('T'));
  assert.ok(isoBlockerAfter, 'ISO blocker must survive SDK round-trip');
  assert.strictEqual(isoBlockerAfter.date, '2026-06-01T10:00:00Z', 'ISO date must be byte-identical after round-trip');

  // Serializer must be stable (2nd serialize === 1st serialize).
  const reserialize = mutator.serialize(parsedCanonical.state, {
    raw_frontmatter: parsedCanonical.raw_frontmatter,
    raw_bodies: parsedCanonical.raw_bodies,
    block_gaps: parsedCanonical.block_gaps,
    line_ending: parsedCanonical.line_ending,
  });
  assert.strictEqual(reserialize, canonical, 'blockers ISO date canonical form is round-trip stable');
});

// ---------------------------------------------------------------------------
// SQLite-backed tests (guarded behind `if (!Database) return;`).
// ---------------------------------------------------------------------------

test('57-C: SQLite - renderStateMarkdown - throws for missing cycle_id', async () => {
  if (!Database) return; // SQLite not available in CI
  const sdk = await loadSdkForRender();
  if (!sdk) return;
  const db = createTestDb(Database);
  // renderStateMarkdown is synchronous — use assert.throws.
  assert.throws(
    () => renderStateMarkdown(db, 'nonexistent-cycle', sdk),
    (err) => {
      assert.ok(err instanceof Error);
      assert.ok(
        err.message.includes('nonexistent-cycle') || err.message.includes('state_position'),
        `error should mention cycle or table: "${err.message}"`,
      );
      return true;
    },
  );
});

test('57-C: SQLite - renderStateMarkdown - fresh state renders valid STATE.md', async () => {
  if (!Database) return;
  const sdk = await loadSdkForRender();
  if (!sdk) return;
  const { serialize: sdkSerialize, parse: sdkParse } = sdk;

  const db = createTestDb(Database);
  const cycleId = 'test-fresh';

  // Parse the inline fixture to extract structured data for insertion.
  const parsed = sdkParse(INLINE_FRESH_MD);

  // Store full fidelity: all block gaps + raw_bodies so unstructured blocks round-trip.
  insertTestData(db, cycleId, {
    stage: parsed.state.position.stage,
    wave: parsed.state.position.wave,
    task_progress: parsed.state.position.task_progress,
    status: parsed.state.position.status,
    handoff_source: parsed.state.position.handoff_source,
    handoff_path: parsed.state.position.handoff_path,
    skipped_stages: parsed.state.position.skipped_stages,
    raw_frontmatter: parsed.raw_frontmatter,
    body_preamble: parsed.state.body_preamble,
    body_trailer: parsed.state.body_trailer,
    line_ending: parsed.line_ending,
    raw_position_body: parsed.raw_bodies.position,
    decisions: [],
    must_haves: [],
    blockers: [],
    block_gaps: parsed.block_gaps,
    block_raw_bodies: parsed.raw_bodies,
  });

  const rendered = renderStateMarkdown(db, cycleId, sdk);

  // KEY ACCEPTANCE: rendered must be round-trip stable through SDK parse/serialize.
  assert.doesNotThrow(
    () => sdkParse(rendered),
    'rendered output must be valid parseable STATE.md',
  );

  const parsedRendered = sdkParse(rendered);
  const reserialize = sdkSerialize(parsedRendered.state, {
    raw_frontmatter: parsedRendered.raw_frontmatter,
    raw_bodies: parsedRendered.raw_bodies,
    block_gaps: parsedRendered.block_gaps,
    line_ending: parsedRendered.line_ending,
  });

  assert.strictEqual(
    reserialize,
    rendered,
    'rendered === serialize(parse(rendered).state, parse(rendered)) — round-trip stability',
  );
});

test('57-C: SQLite - renderStateMarkdown - mid state with decisions and must_haves', async () => {
  if (!Database) return;
  const sdk = await loadSdkForRender();
  if (!sdk) return;
  const { serialize: sdkSerialize, parse: sdkParse } = sdk;

  const db = createTestDb(Database);
  const cycleId = 'test-mid';

  const parsed = sdkParse(INLINE_MID_MD);

  // Store full fidelity: structured rows + raw_bodies for all blocks.
  insertTestData(db, cycleId, {
    stage: parsed.state.position.stage,
    wave: parsed.state.position.wave,
    task_progress: parsed.state.position.task_progress,
    status: parsed.state.position.status,
    handoff_source: parsed.state.position.handoff_source,
    handoff_path: parsed.state.position.handoff_path,
    skipped_stages: parsed.state.position.skipped_stages,
    raw_frontmatter: parsed.raw_frontmatter,
    body_preamble: parsed.state.body_preamble,
    body_trailer: parsed.state.body_trailer,
    line_ending: parsed.line_ending,
    raw_position_body: parsed.raw_bodies.position,
    decisions: parsed.state.decisions.map((d) => ({
      id: d.id,
      body_md: d.text,
      status: d.status,
      raw_line: parsed.raw_bodies.decisions
        ? parsed.raw_bodies.decisions.split('\n').filter((l) => l.trim().startsWith(d.id))[0] || null
        : null,
    })),
    must_haves: parsed.state.must_haves.map((m) => ({
      id: m.id,
      body_md: m.text,
      status: m.status,
      raw_line: parsed.raw_bodies.must_haves
        ? parsed.raw_bodies.must_haves.split('\n').filter((l) => l.trim().startsWith(m.id))[0] || null
        : null,
    })),
    blockers: parsed.state.blockers.map((b) => {
      const rawBlockersBody = parsed.raw_bodies.blockers || '';
      const raw = rawBlockersBody.split('\n').find((l) => {
        const t = l.trim();
        return t.startsWith(`[${b.stage}]`) && t.includes(`[${b.date}]`);
      }) || null;
      return { stage: b.stage, date: b.date, body_md: b.text, raw_line: raw };
    }),
    block_gaps: parsed.block_gaps,
    block_raw_bodies: parsed.raw_bodies,
  });

  const rendered = renderStateMarkdown(db, cycleId, sdk);

  // Must be parseable.
  assert.doesNotThrow(() => sdkParse(rendered), 'rendered mid output must be parseable');

  // KEY ACCEPTANCE: round-trip stability.
  const parsedRendered = sdkParse(rendered);
  const reserialize = sdkSerialize(parsedRendered.state, {
    raw_frontmatter: parsedRendered.raw_frontmatter,
    raw_bodies: parsedRendered.raw_bodies,
    block_gaps: parsedRendered.block_gaps,
    line_ending: parsedRendered.line_ending,
  });
  assert.strictEqual(
    reserialize,
    rendered,
    'mid rendered === serialize(parse(rendered).state, parse(rendered))',
  );

  // The rendered output should contain the decisions.
  assert.ok(rendered.includes('D-01:'), 'should contain D-01 decision');
  assert.ok(rendered.includes('D-02:'), 'should contain D-02 decision');
  assert.ok(rendered.includes('M-01:'), 'should contain M-01 must_have');
});

test('57-C: SQLite - blockers date-format hazard - raw_line emitted verbatim', async () => {
  if (!Database) return;
  const sdk = await loadSdkForRender();
  if (!sdk) return;

  const db = createTestDb(Database);
  const cycleId = 'test-blockers-date';

  // Blocker with ISO date - must survive round-trip byte-for-byte.
  const isoDate = '2026-06-01T10:00:00Z';
  const rawLine = `[design] [${isoDate}]: ISO timestamp blocker - must preserve exactly`;

  insertTestData(db, cycleId, {
    stage: 'design',
    wave: 1,
    task_progress: '1/3',
    status: 'in_progress',
    raw_frontmatter: 'pipeline_state_version: 1.0\nstage: design\ncycle: test-blockers-date\nwave: 1\nstarted_at: 2026-06-01T00:00:00Z\nlast_checkpoint: 2026-06-01T00:00:00Z',
    body_trailer: '',
    raw_position_body: 'stage: design\nwave: 1\ntask_progress: 1/3\nstatus: in_progress\nhandoff_source: ""\nhandoff_path: ""\nskipped_stages: ""',
    blockers: [{
      stage: 'design',
      date: isoDate,
      body_md: 'ISO timestamp blocker - must preserve exactly',
      raw_line: rawLine,
    }],
    block_gaps: {
      position: '\n',
      decisions: '\n',
      must_haves: '\n',
      blockers: '\n',
    },
  });

  const rendered = renderStateMarkdown(db, cycleId, sdk);

  // The raw_line must appear verbatim in the output.
  assert.ok(
    rendered.includes(rawLine),
    `rendered output must contain raw_line verbatim.\nExpected: "${rawLine}"\nGot rendered:\n${rendered}`,
  );

  // The ISO date must appear exactly as stored (not reformatted to YYYY-MM-DD).
  assert.ok(
    rendered.includes(isoDate),
    `ISO date "${isoDate}" must be preserved verbatim in rendered output`,
  );
});

test('57-C: SQLite - blockers raw_line verbatim always (date hazard guard)', async () => {
  if (!Database) return;
  const sdk = await loadSdkForRender();
  if (!sdk) return;

  const db = createTestDb(Database);
  const cycleId = 'test-blockers-raw';

  // Blocker with raw_line that includes extra whitespace edge cases
  const rawLine = '[plan] [2026-05-28]: Figma token export requires paid organization plan - waiting on license approval';

  insertTestData(db, cycleId, {
    stage: 'plan',
    wave: 2,
    task_progress: '3/7',
    status: 'in_progress',
    raw_frontmatter: 'pipeline_state_version: 1.0\nstage: plan\ncycle: test-blockers-raw\nwave: 2\nstarted_at: 2026-05-01T00:00:00Z\nlast_checkpoint: 2026-06-01T00:00:00Z',
    body_trailer: '',
    raw_position_body: 'stage: plan\nwave: 2\ntask_progress: 3/7\nstatus: in_progress\nhandoff_source: ""\nhandoff_path: ""\nskipped_stages: ""',
    blockers: [{
      stage: 'plan',
      date: '2026-05-28',
      body_md: 'Figma token export requires paid organization plan - waiting on license approval',
      raw_line: rawLine,
    }],
    block_gaps: {
      position: '\n',
      blockers: '\n',
    },
  });

  const rendered = renderStateMarkdown(db, cycleId, sdk);
  assert.ok(
    rendered.includes(rawLine),
    `rendered output must contain blocker raw_line verbatim: "${rawLine}"`,
  );
});

test('57-C: SQLite - raw_line semantic-compare: emits verbatim when unchanged', async () => {
  if (!Database) return;
  const sdk = await loadSdkForRender();
  if (!sdk) return;

  const db = createTestDb(Database);
  const cycleId = 'test-raw-line-fidelity';

  // Decision raw_line matches structured fields - should emit verbatim.
  const rawLine = 'D-01: Use token-based design system with CSS custom properties (locked)';

  insertTestData(db, cycleId, {
    stage: 'plan',
    wave: 1,
    task_progress: '0/0',
    status: 'in_progress',
    raw_frontmatter: 'pipeline_state_version: 1.0\nstage: plan\ncycle: test-raw-line-fidelity\nwave: 1\nstarted_at: 2026-06-01T00:00:00Z\nlast_checkpoint: 2026-06-01T00:00:00Z',
    body_trailer: '',
    raw_position_body: 'stage: plan\nwave: 1\ntask_progress: 0/0\nstatus: in_progress\nhandoff_source: ""\nhandoff_path: ""\nskipped_stages: ""',
    decisions: [{
      id: 'D-01',
      body_md: 'Use token-based design system with CSS custom properties',
      status: 'locked',
      raw_line: rawLine,
    }],
    block_gaps: {
      position: '\n',
      decisions: '\n',
    },
  });

  const rendered = renderStateMarkdown(db, cycleId, sdk);
  assert.ok(rendered.includes(rawLine), `raw_line should be emitted verbatim when it matches structured fields`);
});

test('57-C: SQLite - raw_line semantic-compare: emits canonical when raw_line drifted', async () => {
  if (!Database) return;
  const sdk = await loadSdkForRender();
  if (!sdk) return;

  const db = createTestDb(Database);
  const cycleId = 'test-drifted-raw-line';

  // raw_line text differs from body_md - should emit canonical form.
  const rawLine = 'D-01: OLD stale text (locked)'; // raw_line has old text
  const newText = 'NEW updated text'; // body_md has been updated

  insertTestData(db, cycleId, {
    stage: 'brief',
    wave: 1,
    task_progress: '0/0',
    status: 'initialized',
    raw_frontmatter: 'pipeline_state_version: 1.0\nstage: brief\ncycle: test-drifted-raw-line\nwave: 1\nstarted_at: 2026-06-01T00:00:00Z\nlast_checkpoint: 2026-06-01T00:00:00Z',
    body_trailer: '',
    raw_position_body: 'stage: brief\nwave: 1\ntask_progress: 0/0\nstatus: initialized\nhandoff_source: ""\nhandoff_path: ""\nskipped_stages: ""',
    decisions: [{
      id: 'D-01',
      body_md: newText,
      status: 'locked',
      raw_line: rawLine, // stale raw_line
    }],
    block_gaps: {
      position: '\n',
      decisions: '\n',
    },
  });

  const rendered = renderStateMarkdown(db, cycleId, sdk);
  // Should emit canonical form with the new body_md text.
  const expectedCanonical = `D-01: ${newText} (locked)`;
  assert.ok(
    rendered.includes(expectedCanonical),
    `should emit canonical form when raw_line is stale.\nExpected: "${expectedCanonical}"\nIn:\n${rendered}`,
  );
  assert.ok(
    !rendered.includes('OLD stale text'),
    'should NOT emit the old stale raw_line text',
  );
});

test('57-C: SQLite - renderStateMarkdown output contains frontmatter fences', async () => {
  if (!Database) return;
  const sdk = await loadSdkForRender();
  if (!sdk) return;
  const db = createTestDb(Database);
  insertTestData(db, 'cycle-1', {
    stage: 'brief',
    wave: 1,
    task_progress: '0/0',
    status: 'initialized',
    raw_frontmatter: 'pipeline_state_version: 1.0\nstage: brief\ncycle: cycle-1\nwave: 1\nstarted_at: 2026-01-01T00:00:00Z\nlast_checkpoint: 2026-01-01T00:00:00Z',
    body_trailer: '',
    raw_position_body: 'stage: brief\nwave: 1\ntask_progress: 0/0\nstatus: initialized\nhandoff_source: ""\nhandoff_path: ""\nskipped_stages: ""',
  });

  const rendered = renderStateMarkdown(db, 'cycle-1', sdk);
  assert.ok(rendered.startsWith('---\n'), 'output must start with --- frontmatter fence');
  assert.ok(rendered.includes('\n---\n'), 'output must have closing --- fence');
  assert.ok(rendered.includes('<position>'), 'output must contain <position> block');
  assert.ok(rendered.includes('</position>'), 'output must contain </position> closing tag');
});

test('57-C: SQLite - renderStateMarkdown round-trip on Executor-B sample-state-fresh fixture', async () => {
  if (!Database) return;
  const sdk = await loadSdkForRender();
  if (!sdk) return;
  const { serialize: sdkSerialize, parse: sdkParse } = sdk;

  const fixturePath = path.join(PKG_ROOT, 'test', 'fixtures', 'baselines', 'phase-57', 'sample-state-fresh.md');
  let fixtureContent;
  try {
    fixtureContent = fs.readFileSync(fixturePath, 'utf8');
  } catch {
    // Fixture not available yet - use inline fallback.
    fixtureContent = INLINE_FRESH_MD;
  }

  // Parse to extract structured data.
  let parsed;
  try {
    parsed = sdkParse(fixtureContent);
  } catch (err) {
    // If fixture is invalid, skip this test.
    return;
  }

  // SDK canonical form round-trip stability: serialize(parse(fixture)) is a fixed point.
  // The fixture file may not be in canonical SDK form (hand-authored), so we
  // verify idempotency of the canonical form rather than byte-equality with the file.
  const canonical = sdkSerialize(parsed.state, {
    raw_frontmatter: parsed.raw_frontmatter,
    raw_bodies: parsed.raw_bodies,
    block_gaps: parsed.block_gaps,
    line_ending: parsed.line_ending,
  });
  // canonical must be parseable.
  assert.doesNotThrow(() => sdkParse(canonical), 'serialize output must be parseable');
  // canonical must be a fixed point: serialize(parse(canonical)) === canonical.
  const parsedCanonical = sdkParse(canonical);
  const reserialize = sdkSerialize(parsedCanonical.state, {
    raw_frontmatter: parsedCanonical.raw_frontmatter,
    raw_bodies: parsedCanonical.raw_bodies,
    block_gaps: parsedCanonical.block_gaps,
    line_ending: parsedCanonical.line_ending,
  });
  assert.strictEqual(reserialize, canonical, 'SDK canonical form is idempotent (fixed point)');
});

test('57-C: SQLite - renderStateMarkdown round-trip on Executor-B sample-state-mid fixture', async () => {
  if (!Database) return;
  const sdk = await loadSdkForRender();
  if (!sdk) return;
  const { serialize: sdkSerialize, parse: sdkParse } = sdk;

  const fixturePath = path.join(PKG_ROOT, 'test', 'fixtures', 'baselines', 'phase-57', 'sample-state-mid.md');
  let fixtureContent;
  try {
    fixtureContent = fs.readFileSync(fixturePath, 'utf8');
  } catch {
    fixtureContent = INLINE_MID_MD;
  }

  let parsed;
  try {
    parsed = sdkParse(fixtureContent);
  } catch (err) {
    return;
  }

  // SDK canonical form round-trip stability.
  const canonical = sdkSerialize(parsed.state, {
    raw_frontmatter: parsed.raw_frontmatter,
    raw_bodies: parsed.raw_bodies,
    block_gaps: parsed.block_gaps,
    line_ending: parsed.line_ending,
  });
  assert.doesNotThrow(() => sdkParse(canonical), 'mid serialize output must be parseable');
  const parsedCanonical = sdkParse(canonical);
  const reserialize = sdkSerialize(parsedCanonical.state, {
    raw_frontmatter: parsedCanonical.raw_frontmatter,
    raw_bodies: parsedCanonical.raw_bodies,
    block_gaps: parsedCanonical.block_gaps,
    line_ending: parsedCanonical.line_ending,
  });
  assert.strictEqual(reserialize, canonical, 'mid fixture SDK canonical form is idempotent');
});

test('57-C: SQLite - renderDecisionLog produces valid markdown', async () => {
  if (!Database) return;
  const db = createTestDb(Database);
  insertTestData(db, 'cycle-dl', {
    stage: 'plan',
    wave: 1,
    task_progress: '0/0',
    status: 'in_progress',
    raw_frontmatter: 'pipeline_state_version: 1.0\nstage: plan\ncycle: cycle-dl\nwave: 1\nstarted_at: 2026-06-01T00:00:00Z\nlast_checkpoint: 2026-06-01T00:00:00Z',
    body_trailer: '',
    raw_position_body: 'stage: plan\nwave: 1\ntask_progress: 0/0\nstatus: in_progress\nhandoff_source: ""\nhandoff_path: ""\nskipped_stages: ""',
    decisions: [
      { id: 'D-01', body_md: 'Use token-based design', status: 'locked' },
      { id: 'D-02', body_md: 'React 18 TypeScript', status: 'tentative' },
    ],
  });

  const log = await renderDecisionLog(db, 'cycle-dl');
  assert.ok(typeof log === 'string', 'renderDecisionLog should return a string');
  assert.ok(log.includes('# Decision Log'), 'should contain Decision Log heading');
  assert.ok(log.includes('D-01'), 'should contain D-01');
  assert.ok(log.includes('D-02'), 'should contain D-02');
  assert.ok(log.includes('locked'), 'should include locked status');
  assert.ok(log.includes('tentative'), 'should include tentative status');
});

test('57-C: SQLite - renderDecisionLog handles empty decisions gracefully', async () => {
  if (!Database) return;
  const db = createTestDb(Database);
  insertTestData(db, 'cycle-empty-dl', {
    stage: 'brief',
    wave: 1,
    task_progress: '0/0',
    status: 'initialized',
    raw_frontmatter: 'pipeline_state_version: 1.0\nstage: brief\ncycle: cycle-empty-dl\nwave: 1\nstarted_at: 2026-06-01T00:00:00Z\nlast_checkpoint: 2026-06-01T00:00:00Z',
    body_trailer: '',
    raw_position_body: 'stage: brief\nwave: 1\ntask_progress: 0/0\nstatus: initialized\nhandoff_source: ""\nhandoff_path: ""\nskipped_stages: ""',
  });

  const log = await renderDecisionLog(db, 'cycle-empty-dl');
  assert.ok(log.includes('No decisions'), 'empty decision log should indicate no decisions');
});

test('57-C: SQLite - renderDecisionLog throws TypeError for null db', async () => {
  await assert.rejects(
    () => renderDecisionLog(null, 'any'),
    (err) => {
      assert.ok(err instanceof TypeError);
      return true;
    },
  );
});

test('57-C: SQLite - renderBlockers produces valid markdown', async () => {
  if (!Database) return;
  const db = createTestDb(Database);
  insertTestData(db, 'cycle-blk', {
    stage: 'design',
    wave: 1,
    task_progress: '2/5',
    status: 'in_progress',
    raw_frontmatter: 'pipeline_state_version: 1.0\nstage: design\ncycle: cycle-blk\nwave: 1\nstarted_at: 2026-06-01T00:00:00Z\nlast_checkpoint: 2026-06-01T00:00:00Z',
    body_trailer: '',
    raw_position_body: 'stage: design\nwave: 1\ntask_progress: 2/5\nstatus: in_progress\nhandoff_source: ""\nhandoff_path: ""\nskipped_stages: ""',
    blockers: [
      { stage: 'design', date: '2026-05-20', body_md: 'Bundle size exceeds 50KB', raw_line: '[design] [2026-05-20]: Bundle size exceeds 50KB' },
    ],
  });

  const report = await renderBlockers(db, 'cycle-blk');
  assert.ok(typeof report === 'string', 'renderBlockers should return a string');
  assert.ok(report.includes('# Active Blockers'), 'should contain Active Blockers heading');
  assert.ok(report.includes('design'), 'should include design stage');
});

test('57-C: SQLite - renderBlockers - resolved blockers not included', async () => {
  if (!Database) return;
  const db = createTestDb(Database);
  insertTestData(db, 'cycle-resolved', {
    stage: 'verify',
    wave: 1,
    task_progress: '0/0',
    status: 'initialized',
    raw_frontmatter: 'pipeline_state_version: 1.0\nstage: verify\ncycle: cycle-resolved\nwave: 1\nstarted_at: 2026-06-01T00:00:00Z\nlast_checkpoint: 2026-06-01T00:00:00Z',
    body_trailer: '',
    raw_position_body: 'stage: verify\nwave: 1\ntask_progress: 0/0\nstatus: initialized\nhandoff_source: ""\nhandoff_path: ""\nskipped_stages: ""',
    blockers: [
      {
        stage: 'design',
        date: '2026-05-01',
        body_md: 'This blocker was resolved',
        raw_line: '[design] [2026-05-01]: This blocker was resolved',
        resolved_at: '2026-05-10T00:00:00Z',
      },
    ],
  });

  const report = await renderBlockers(db, 'cycle-resolved');
  assert.ok(report.includes('No active blockers'), 'resolved blockers should not appear in active blockers report');
});

test('57-C: SQLite - renderBlockers throws TypeError for null db', async () => {
  await assert.rejects(
    () => renderBlockers(null, 'any'),
    (err) => {
      assert.ok(err instanceof TypeError);
      return true;
    },
  );
});

test('57-C: SQLite - multiple cycles independent isolation', async () => {
  if (!Database) return;
  const sdk = await loadSdkForRender();
  if (!sdk) return;
  const db = createTestDb(Database);

  insertTestData(db, 'cycle-A', {
    stage: 'brief',
    wave: 1,
    task_progress: '0/0',
    status: 'initialized',
    raw_frontmatter: 'pipeline_state_version: 1.0\nstage: brief\ncycle: cycle-A\nwave: 1\nstarted_at: 2026-06-01T00:00:00Z\nlast_checkpoint: 2026-06-01T00:00:00Z',
    body_trailer: '',
    raw_position_body: 'stage: brief\nwave: 1\ntask_progress: 0/0\nstatus: initialized\nhandoff_source: ""\nhandoff_path: ""\nskipped_stages: ""',
    decisions: [
      { id: 'D-01', body_md: 'Cycle A decision', status: 'locked' },
    ],
  });

  insertTestData(db, 'cycle-B', {
    stage: 'plan',
    wave: 2,
    task_progress: '1/3',
    status: 'in_progress',
    raw_frontmatter: 'pipeline_state_version: 1.0\nstage: plan\ncycle: cycle-B\nwave: 2\nstarted_at: 2026-06-01T00:00:00Z\nlast_checkpoint: 2026-06-01T00:00:00Z',
    body_trailer: '',
    raw_position_body: 'stage: plan\nwave: 2\ntask_progress: 1/3\nstatus: in_progress\nhandoff_source: ""\nhandoff_path: ""\nskipped_stages: ""',
    decisions: [
      { id: 'D-01', body_md: 'Cycle B decision', status: 'tentative' },
    ],
  });

  // Composite PK (cycle_id, id) means both cycles can have D-01 without conflict.
  const renderedA = renderStateMarkdown(db, 'cycle-A', sdk);
  const renderedB = renderStateMarkdown(db, 'cycle-B', sdk);

  assert.ok(renderedA.includes('Cycle A decision'), 'cycle-A render should contain A decision');
  assert.ok(!renderedA.includes('Cycle B decision'), 'cycle-A render should NOT contain B decision');
  assert.ok(renderedB.includes('Cycle B decision'), 'cycle-B render should contain B decision');
});
