-- sdk/state/schema.sql - Phase 57 SQLite State Backbone.
-- PINNED DDL: all executors align to this exact schema.
-- Created by Executor A; consumed by state-backend, migrate-to-sqlite, render-markdown,
-- and any downstream reader that opens state.sqlite.
--
-- All tables use CREATE TABLE IF NOT EXISTS so this file is safely re-executed
-- (openStateDb calls loadSchema on every open).
--
-- FTS5 virtual tables are in a separate section at the bottom.
-- state-backend.cjs executes that section ONLY when _sqliteOk (better-sqlite3 + fts5
-- probe passed). A no-fts5 build creates all base tables without issue.
--
-- Column sources annotated per CONTEXT.md "Shared contracts".

-- ---------------------------------------------------------------------------
-- Base tables
-- ---------------------------------------------------------------------------

-- state_position: mirrors the <position> block + frontmatter fields of STATE.md.
-- One row per cycle_id; the active cycle is the most recent updated_at.
CREATE TABLE IF NOT EXISTS state_position (
  cycle_id            TEXT PRIMARY KEY,   -- cycle: field from frontmatter
  stage               TEXT,               -- stage: (scan/explore/decide/build/verify/operate)
  wave                INTEGER,            -- wave: (integer progress within stage)
  task_progress       TEXT,               -- e.g. "3/7" from <position> block
  status              TEXT,               -- status: field from <position>
  branch              TEXT,               -- branch: field from <position>
  raw_frontmatter     TEXT,               -- verbatim frontmatter text (for byte-equal round-trip)
  body_preamble       TEXT,               -- text between frontmatter and first block (for round-trip)
  body_trailer        TEXT,               -- text after last block (for round-trip)
  line_ending         TEXT DEFAULT '\n',  -- '\n' or '\r\n' (for round-trip)
  last_render_sha256  TEXT,               -- sha256 of the last rendered STATE.md (R8 freshness guard)
  updated_at          TEXT                -- ISO 8601 timestamp of last SQLite write
);

-- decisions: mirrors <decisions> block lines.
-- Composite PRIMARY KEY (cycle_id, id) so D-NN identifiers recur across cycles (R11).
CREATE TABLE IF NOT EXISTS decisions (
  id                  TEXT NOT NULL,      -- e.g. D-01, D-02 (stable within cycle)
  cycle_id            TEXT NOT NULL,      -- FK -> state_position.cycle_id
  phase_id            TEXT,               -- phase tag from the decision line (if any)
  status              TEXT CHECK(status IN ('locked', 'tentative')),
  body_md             TEXT,               -- the decision text (markdown)
  tags                TEXT,               -- JSON array of tag strings
  ordinal             INTEGER NOT NULL,   -- explicit emit order (preserved on conflict per R11)
  raw_line            TEXT,               -- verbatim source line (prevents reformat drift, R6)
  created_at          TEXT,               -- ISO 8601 (preserved on conflict per R11)
  last_referenced_at  TEXT,               -- ISO 8601 last time this decision was referenced
  PRIMARY KEY (cycle_id, id),
  FOREIGN KEY (cycle_id) REFERENCES state_position(cycle_id)
);
CREATE INDEX IF NOT EXISTS idx_decisions_cycle ON decisions(cycle_id);

-- blockers: mirrors <blockers> block lines.
-- AUTOINCREMENT id; stable composite is [stage][date] for UPSERT (R11).
CREATE TABLE IF NOT EXISTS blockers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  cycle_id    TEXT,               -- FK -> state_position.cycle_id
  stage       TEXT,               -- stage label from "[stage][date]: text"
  date        TEXT,               -- date string from blocker line (YYYY-MM-DD or ISO)
  severity    TEXT,               -- optional severity tag
  body_md     TEXT,               -- blocker text
  ordinal     INTEGER NOT NULL,   -- emit order
  raw_line    TEXT,               -- verbatim source line (R6 - parser THROWS on malformed)
  resolved_at TEXT,               -- ISO 8601 when resolved (NULL = unresolved)
  FOREIGN KEY (cycle_id) REFERENCES state_position(cycle_id)
);
CREATE INDEX IF NOT EXISTS idx_blockers_cycle ON blockers(cycle_id);

-- must_haves: mirrors <must_haves> block checklist items.
-- Composite PRIMARY KEY (cycle_id, id) so M-NN identifiers recur across cycles (R11).
CREATE TABLE IF NOT EXISTS must_haves (
  id       TEXT NOT NULL,        -- e.g. M-01, M-02 (stable within cycle)
  cycle_id TEXT NOT NULL,        -- FK -> state_position.cycle_id
  body_md  TEXT,                 -- item text
  status   TEXT CHECK(status IN ('pending', 'pass', 'fail')),
  ordinal  INTEGER NOT NULL,     -- emit order
  raw_line TEXT,                 -- verbatim source line
  PRIMARY KEY (cycle_id, id),
  FOREIGN KEY (cycle_id) REFERENCES state_position(cycle_id)
);
CREATE INDEX IF NOT EXISTS idx_must_haves_cycle ON must_haves(cycle_id);

-- plans: mirrors <plans> block entries (one row per plan file reference).
CREATE TABLE IF NOT EXISTS plans (
  id           TEXT PRIMARY KEY,   -- plan filename as stable key
  phase_id     TEXT,               -- phase identifier
  status       TEXT,               -- pending/active/complete
  body_md      TEXT,               -- plan description text
  ordinal      INTEGER,            -- emit order
  completed_at TEXT                -- ISO 8601 (NULL = not yet complete)
);
CREATE INDEX IF NOT EXISTS idx_plans_phase ON plans(phase_id);

-- findings: Phase 22 / Phase 52 research findings stored across cycles.
CREATE TABLE IF NOT EXISTS findings (
  id           TEXT PRIMARY KEY,   -- stable finding id
  source_agent TEXT,               -- agent that produced the finding
  cycle_id     TEXT,               -- FK -> state_position.cycle_id
  phase_id     TEXT,               -- phase the finding came from
  pillar       TEXT,               -- pillar category (e.g. architecture/security/perf)
  severity     TEXT,               -- critical/high/medium/low/info
  confidence   REAL,               -- 0.0-1.0
  body_md      TEXT,               -- finding body (markdown)
  applied      INTEGER DEFAULT 0,  -- 0 = not yet applied, 1 = applied
  created_at   TEXT,               -- ISO 8601
  FOREIGN KEY (cycle_id) REFERENCES state_position(cycle_id)
);
CREATE INDEX IF NOT EXISTS idx_findings_cycle ON findings(cycle_id);

-- design_debt: mirrors <design_debt> block entries.
CREATE TABLE IF NOT EXISTS design_debt (
  id        TEXT PRIMARY KEY,   -- stable id
  category  TEXT,               -- debt category
  instances TEXT,               -- JSON array of affected instances/files
  priority  TEXT,               -- critical/high/medium/low
  status    TEXT                -- open/acknowledged/resolved
);

-- recall_records: Phase 19.5 recall store mirror (extended for Phase 57).
-- The standalone Phase 19.5 design-search store keeps working as the fallback;
-- this table is populated by migrate-to-sqlite and updated on dual-write.
CREATE TABLE IF NOT EXISTS recall_records (
  id         TEXT PRIMARY KEY,   -- stable recall id
  cycle_id   TEXT,               -- FK -> state_position.cycle_id
  kind       TEXT,               -- recall kind (finding/decision/note/...)
  body_md    TEXT,               -- recall body
  tags       TEXT,               -- JSON array of tag strings
  created_at TEXT,               -- ISO 8601
  FOREIGN KEY (cycle_id) REFERENCES state_position(cycle_id)
);
CREATE INDEX IF NOT EXISTS idx_recall_cycle ON recall_records(cycle_id);

-- instincts: Phase 51 instinct-store mirror (created empty in Wave A; populated by migrate).
-- The standalone Phase 51 instinct-store keeps working as the fallback;
-- merge-and-retire is a v1.58 concern (documented deferral).
CREATE TABLE IF NOT EXISTS instincts (
  id          TEXT PRIMARY KEY,   -- stable instinct id
  scope       TEXT,               -- project / global
  domain      TEXT,               -- intake/explore/decide/build/verify/operate/utility
  body_md     TEXT,               -- instinct body (markdown)
  confidence  REAL,               -- 0.0-1.0 posterior mean
  cycles_seen INTEGER,            -- number of cycles this instinct has been observed
  project_ids TEXT,               -- JSON array of project ids (sha8)
  last_seen   TEXT                -- ISO 8601 date last surfaced
);

-- sessions: runtime session records (Phase 22 / worktree awareness).
CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,   -- session id (UUID or opaque string)
  runtime    TEXT,               -- runtime name (claude-code / gemini / codex / ...)
  harness    TEXT,               -- harness identifier
  started_at TEXT,               -- ISO 8601
  ended_at   TEXT                -- ISO 8601 (NULL = still active)
);

-- worktree_state: per-worktree active state (Phase 49 / parallel executor awareness).
CREATE TABLE IF NOT EXISTS worktree_state (
  path            TEXT PRIMARY KEY,   -- absolute worktree path
  branch          TEXT,               -- current branch in worktree
  owns_session_id TEXT,               -- FK -> sessions.id (advisory; may be NULL)
  updated_at      TEXT                -- ISO 8601
);

-- conflict_incidents: detected concurrent-write conflict events.
CREATE TABLE IF NOT EXISTS conflict_incidents (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  files       TEXT,               -- JSON array of conflicting file paths
  session_ids TEXT,               -- JSON array of session ids involved
  detected_at TEXT                -- ISO 8601
);

-- _meta: schema-level key/value store.
-- Holds schema_version and last_render_sha256 (mirror of state_position for fast lookup).
CREATE TABLE IF NOT EXISTS _meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- _block_meta: per-cycle, per-block rendering metadata for byte-equal round-trip (R6).
-- Stores the gap (blank lines) before each block, the raw verbatim block body,
-- and emit ordinal so unstructured blocks (connections/timestamps/parallelism_decision/todos)
-- round-trip exactly.
CREATE TABLE IF NOT EXISTS _block_meta (
  cycle_id TEXT    NOT NULL,   -- FK -> state_position.cycle_id
  block    TEXT    NOT NULL,   -- block name (decisions/blockers/must_haves/position/...)
  gap      TEXT,               -- blank lines preceding the block open tag (for emit order)
  raw_body TEXT,               -- verbatim raw body of the block (for unstructured blocks)
  ordinal  INTEGER,            -- emit ordinal (position in BLOCK_ORDER for this cycle)
  PRIMARY KEY (cycle_id, block),
  FOREIGN KEY (cycle_id) REFERENCES state_position(cycle_id)
);

-- ---------------------------------------------------------------------------
-- FTS5 virtual tables (execute ONLY when _sqliteOk - better-sqlite3 + fts5 probe passed)
-- state-backend.cjs splits on the marker comment below and executes this
-- section separately, guarded by the _sqliteOk flag.
-- ---------------------------------------------------------------------------
-- GDD_FTS5_SECTION_START

-- decisions_fts: full-text search over decision body and tags.
-- Uses trigram tokenizer for partial-match queries (like instinct-store FTS5).
CREATE VIRTUAL TABLE IF NOT EXISTS decisions_fts
  USING fts5(id UNINDEXED, body_md, tags, tokenize='trigram');

-- findings_fts: full-text search over finding body and pillar.
CREATE VIRTUAL TABLE IF NOT EXISTS findings_fts
  USING fts5(id UNINDEXED, body_md, pillar, tokenize='trigram');

-- recall_fts: full-text search over recall record body and tags.
CREATE VIRTUAL TABLE IF NOT EXISTS recall_fts
  USING fts5(id UNINDEXED, body_md, tags, tokenize='trigram');

-- instincts_fts: full-text search over instinct body and domain (mirrors instinct-store).
CREATE VIRTUAL TABLE IF NOT EXISTS instincts_fts
  USING fts5(id UNINDEXED, body_md, domain, tokenize='trigram');

-- GDD_FTS5_SECTION_END
