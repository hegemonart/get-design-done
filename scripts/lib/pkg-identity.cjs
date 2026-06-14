'use strict';

// scripts/lib/pkg-identity.cjs — identity Source-of-Truth for the Phase 61
// rebrand (REBRAND-01). Renamed from get-design-done → Hone.
//
// ~90% of the legacy `gdd-` surface (skills/, commands/, manifests, MCP keys) is
// GENERATED from this handful of constants. Centralizing them makes the rename
// a "change one place + regenerate" operation rather than 717 hand-edits.
// Every install/marketplace/MCP/skill/command derivation MUST import from here.
//
// Dep-free by design: no `require`. This module is loaded by low-level install,
// build, and generator code; introducing a dependency here would risk cycles.
//
// SCOPE NOTE (locked in 61-RESEARCH §"SCOPE DECISION"): `GDD_*` environment
// variables are DEFERRED and intentionally NOT renamed in Phase 61. Do NOT
// change env-reading code to a `HONE_*` prefix from this module — env_prefix
// stays `GDD` until a later phase. The legacy/back-compat values below exist so
// the deprecated-alias and dual-marketplace layer (Wave 3) and the
// migration-warning paths can reference the prior identity from one place.

const IDENTITY = Object.freeze({
  // --- npm / package ---
  NPM_NAME: '@hegemonart/hone',
  PLUGIN_NAME: 'hone',
  SHORT_NAME: 'hone',
  MARKETPLACE_NAME: 'hone',
  REPO: 'hegemonart/hone',
  HOMEPAGE: 'https://github.com/hegemonart/hone',
  LICENSE: 'Apache-2.0',

  // --- command prefixes ---
  COMMAND_PREFIX: '/hone:', // Claude/namespaced form (renamed from legacy '/gdd:')
  COMMAND_PREFIX_FLAT: '/hone-', // Codex flat form (renamed from legacy '/gdd-')
  COMMAND_ALIAS: 'gdd', // deprecated alias kept 1-2 versions, wired in Wave 3

  // --- skill / bin prefixes ---
  SKILL_PREFIX: 'hone-', // renamed from legacy `gdd-` in `name: gdd-<id>` (trailing hyphen included)
  BIN_PREFIX: 'hone-', // renamed from legacy `gdd-` in bin filenames (trailing hyphen included)

  // --- MCP servers / tools ---
  MCP_SERVER_PRIMARY: 'hone-mcp', // renamed from legacy `gdd-mcp`
  MCP_SERVER_STATE: 'hone-state', // renamed from legacy `gdd-state`
  MCP_STATE_LAUNCH_BIN: 'hone-state-mcp', // renamed from legacy `gdd-state-mcp`
  MCP_TOOL_PREFIX: 'hone_', // renamed from legacy `gdd_` in tool/schema names

  // --- env prefix (DEFERRED — kept as GDD on purpose; see SCOPE NOTE) ---
  ENV_PREFIX: 'GDD',

  // --- display ---
  DISPLAY_NAME: 'Hone',
  TAGLINE: 'Hone every design to shipped.',

  // --- back-compat / legacy (prior get-design-done identity) ---
  // Single reference point for the deprecated alias, the dual-marketplace
  // registration, the brand-gate allowlist, and migration warnings (Wave 3).
  BACK_COMPAT: Object.freeze({
    LEGACY_NPM_NAME: '@hegemonart/get-design-done',
    LEGACY_NPM_NAME_BARE: 'get-design-done',
    LEGACY_PLUGIN_NAME: 'get-design-done',
    LEGACY_SHORT_NAME: 'gdd',
    LEGACY_MARKETPLACE_NAME: 'get-design-done',
    LEGACY_REPO: 'hegemonart/get-design-done',
    LEGACY_COMMAND_PREFIX: '/gdd:',
    LEGACY_COMMAND_PREFIX_FLAT: '/gdd-',
    LEGACY_SKILL_PREFIX: 'gdd-',
    LEGACY_BIN_PREFIX: 'gdd-',
    LEGACY_MCP_SERVER_PRIMARY: 'gdd-mcp',
    LEGACY_MCP_SERVER_STATE: 'gdd-state',
    LEGACY_MCP_STATE_LAUNCH_BIN: 'gdd-state-mcp',
    LEGACY_MCP_TOOL_PREFIX: 'gdd_',
  }),
});

module.exports = IDENTITY;
