'use strict';

/**
 * scripts/lib/install/runtime-artifact-layout.cjs — Phase 28.7 (Plan 28.7-02).
 *
 * Per-runtime artifact layout resolver. Maps `(runtime, configDir, scope)`
 * to a layout descriptor describing where the runtime expects its install
 * artifacts (commands / agents / skills) and how to stage them.
 *
 * Architecture ported from gsd-build/get-shit-done (MIT) — per Phase 28.7
 * D-02 (port architecture, not source). See NOTICE for upstream attribution.
 *
 * Scope: the 14 GDD runtimes locked by Phase 24 D-02. Phase 28.7 D-03 + D-10
 * keep `hermes` (and gsd-build's upstream `grok` slot) OUT of scope; their
 * branches are deliberately NOT ported.
 *
 * Layout table (D-03 + D-05 + D-09 + D-10):
 *   claude global → [{skills, 'skills', 'gdd-', passthrough}]
 *   claude local  → [{commands, 'commands/gdd', 'gdd-', passthrough},
 *                    {agents, 'agents', 'gdd-', passthrough}]
 *   cursor / codex / copilot / antigravity / windsurf / augment / trae /
 *     qwen / codebuddy → [{skills, 'skills', 'gdd-', <runtime>-converter}]
 *   gemini    → [{commands, 'commands/gdd', 'gdd-', gemini-converter}]
 *   opencode  → [{commands, 'command', 'gdd-', opencode-converter}]
 *   kilo      → [{commands, 'command', 'gdd-', kilo-converter}]
 *   cline     → []  (D-09: rules-based, embeds in `.clinerules` — wiring
 *                    handled by installer.cjs + converters/cline.cjs)
 *
 * Modular requires (D-08): converter modules are lazy-required from
 * `./converters/<runtime>.cjs` at `stage()` call time. This avoids:
 *   - cyclic dependencies at module load (converters may import shared
 *     utilities from this file's siblings),
 *   - loading 13 converters when only one runtime is being installed,
 *   - upstream's bundled-monolith `bin/install.js` pattern (D-08).
 *
 * Converter contract:
 *   convert(content: string, skillName: string, opts: { runtime: string })
 *     → string  // converted single-string content; multi-file output
 *               // is expressed by emitting joined content the installer
 *               // splits, or by the converter writing extra files itself
 *               // (only `cline` does the latter — D-09).
 *
 * Pure / side-effect-free at module load: only `require('path')` and
 * `require('fs')` are taken at top level. `findInstallSourceRoot` is the
 * sole `fs.*` caller, and it is only invoked when `stage(ctx)` runs.
 */

const path = require('path');
const fs = require('fs');

// ---------------------------------------------------------------------------
// Allowlisted runtimes (D-03 + D-10)
// ---------------------------------------------------------------------------

/**
 * The 14 runtimes GDD claims first-class install support for (Phase 24 D-02).
 *
 * NOTE: `hermes` and `grok` from gsd-build/get-shit-done's upstream list are
 * intentionally absent. Phase 28.7 D-03 + D-10 lock the 14-runtime scope;
 * adding a runtime to this set without a matching `switch` branch below will
 * throw `TypeError: Unknown runtime` (loud-fail signal).
 */
const ALLOWED_RUNTIMES = new Set([
  'claude',
  'cursor',
  'gemini',
  'codex',
  'copilot',
  'antigravity',
  'windsurf',
  'augment',
  'trae',
  'qwen',
  'codebuddy',
  'cline',
  'opencode',
  'kilo',
]);

// ---------------------------------------------------------------------------
// Source-root resolver
// ---------------------------------------------------------------------------

/**
 * Locate the GDD repo's `skills/` source root.
 *
 * Resolution order:
 *   1. If `runtimeConfigDir` is provided AND `<runtimeConfigDir>/.gdd-source`
 *      exists, read its first line as an absolute path override (test-mode
 *      hook — Plan 28.7-09 can point the resolver at a fixture skills dir).
 *   2. Walk up from `__dirname` up to 6 levels looking for `<dir>/skills/`.
 *   3. Throw `Error` with a descriptive message.
 *
 * Pure read-only fs use; safe to call repeatedly. The returned path is the
 * directory containing `skills/`, NOT the `skills/` directory itself — that
 * matches gsd-build's `findInstallSourceRoot()` return contract so the
 * installer can locate `skills/`, `agents/`, and `commands/` as siblings.
 *
 * @param {string} [runtimeConfigDir] optional runtime config directory
 * @returns {string} absolute path to the directory containing `skills/`
 */
function findInstallSourceRoot(runtimeConfigDir) {
  // Step 1 — marker override
  if (runtimeConfigDir) {
    const markerPath = path.join(runtimeConfigDir, '.gdd-source');
    if (fs.existsSync(markerPath)) {
      try {
        const src = fs.readFileSync(markerPath, 'utf8').trim();
        if (src && fs.existsSync(src)) return src;
      } catch {
        /* fall through */
      }
    }
  }

  // Step 2 — walk up from __dirname looking for skills/
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, 'skills');
    if (fs.existsSync(candidate)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  throw new Error(
    `findInstallSourceRoot: could not locate skills/ from ${__dirname}`
  );
}

// ---------------------------------------------------------------------------
// Kind factories
// ---------------------------------------------------------------------------

/**
 * @typedef {'commands'|'agents'|'skills'} ArtifactKindName
 *
 * @typedef {Object} StageCtx
 * @property {string} skillsRoot   Absolute path to the GDD `skills/` dir.
 * @property {string[]} skillNames Names of skill directories to stage.
 * @property {'local'|'global'} scope
 * @property {string} runtime
 * @property {string} configDir
 *
 * @typedef {Object} StagedArtifact
 * @property {string} srcPath  Absolute path to the source file on disk.
 * @property {string} content  Converted content to be written.
 * @property {string} name     Final artifact name (prefix already applied).
 *
 * @typedef {Object} ArtifactKind
 * @property {ArtifactKindName} kind
 * @property {string} destSubpath
 * @property {string} prefix
 * @property {(ctx: StageCtx) => StagedArtifact[]} stage
 *
 * @typedef {Object} Layout
 * @property {string} runtime
 * @property {string} configDir
 * @property {ArtifactKind[]} kinds
 */

/**
 * Build a `skills` artifact-kind descriptor.
 *
 * @param {string} destSubpath  e.g. `'skills'`.
 * @param {string} prefix       e.g. `'gdd-'`.
 * @param {string|null} converterPath  relative require path to the converter
 *   module (e.g. `'./converters/cursor.cjs'`), or `null` for passthrough
 *   copy (claude global skills).
 * @param {string} runtime      canonical runtime ID, passed to converter as
 *   `{runtime}` so a multi-runtime converter can branch on it.
 * @returns {ArtifactKind}
 */
function skillsKind(destSubpath, prefix, converterPath, runtime) {
  return {
    kind: 'skills',
    destSubpath,
    prefix,
    stage: (ctx) => {
      // Lazy require — converter is only loaded if/when an installer
      // actually stages this runtime (D-08). For claude global, the
      // converter is null and we passthrough-copy the source content.
      const convert = converterPath ? require(converterPath).convert : null;
      return ctx.skillNames.map((name) => {
        const srcPath = path.join(ctx.skillsRoot, name, 'SKILL.md');
        const raw = fs.readFileSync(srcPath, 'utf8');
        const content = convert ? convert(raw, name, { runtime }) : raw;
        return { srcPath, content, name: prefix + name };
      });
    },
  };
}

/**
 * Build a `commands` artifact-kind descriptor.
 *
 * Used by:
 *   - claude local → `commands/gdd/`, no converter (passthrough copy)
 *   - gemini       → `commands/gdd/`, gemini converter
 *   - opencode     → `command/` (singular), opencode converter
 *   - kilo         → `command/` (singular), kilo converter
 *
 * @param {string} destSubpath
 * @param {string} prefix
 * @param {string|null} converterPath
 * @param {string} runtime
 * @returns {ArtifactKind}
 */
function commandsKind(destSubpath, prefix, converterPath, runtime) {
  return {
    kind: 'commands',
    destSubpath,
    prefix,
    stage: (ctx) => {
      const convert = converterPath ? require(converterPath).convert : null;
      return ctx.skillNames.map((name) => {
        const srcPath = path.join(ctx.skillsRoot, name, 'SKILL.md');
        const raw = fs.readFileSync(srcPath, 'utf8');
        const content = convert ? convert(raw, name, { runtime }) : raw;
        return { srcPath, content, name: prefix + name };
      });
    },
  };
}

/**
 * Build an `agents` artifact-kind descriptor.
 *
 * claude local only — passthrough copy from `<repo>/agents/*.md` into
 * `<configDir>/agents/`. No converter.
 *
 * AR7 fix (Phase 59.8): the agent set is ENUMERATED from the `agents/`
 * directory on disk — NOT derived from `ctx.skillNames`. Real agent files
 * are named after agent roles (`design-planner.md`, `a11y-mapper.md`, …),
 * which never coincide with skill directory names. The old skill-name-derived
 * path read `agents/<skillName>.md`, found nothing for any skill, and staged
 * ~96 empty `gdd-<skillName>.md` artifacts while installing ZERO real agents.
 *
 * Enumeration rules:
 *   - top-level `*.md` files in `agents/` only (no nested dirs),
 *   - `README.md` is excluded (it is documentation, not an agent),
 *   - empty / unreadable files are skipped (best-effort; never throws).
 *
 * @param {string} destSubpath
 * @param {string} prefix
 * @returns {ArtifactKind}
 */
function agentsKind(destSubpath, prefix) {
  return {
    kind: 'agents',
    destSubpath,
    prefix,
    stage: (ctx) => {
      const agentsRoot = path.join(
        path.dirname(ctx.skillsRoot),
        'agents'
      );
      let entries;
      try {
        entries = fs.readdirSync(agentsRoot, { withFileTypes: true });
      } catch {
        // No agents/ dir on disk — stage nothing (never throw).
        return [];
      }
      const staged = [];
      for (const ent of entries) {
        if (!ent.isFile()) continue;
        if (!ent.name.toLowerCase().endsWith('.md')) continue;
        if (ent.name.toLowerCase() === 'readme.md') continue;
        // Strip any pre-existing gdd-/gsd- prefix on the agent filename before
        // re-applying `prefix`, so an agent already named `gdd-foo.md` does not
        // become `gdd-gdd-foo.md`. Real agents ship un-prefixed
        // (`a11y-mapper.md`); this guard keeps both shapes correct.
        const fileBase = ent.name.slice(0, -'.md'.length);
        const bareName = fileBase.replace(/^(gdd-|gsd-)/i, '');
        const srcPath = path.join(agentsRoot, ent.name);
        let raw = '';
        try {
          raw = fs.readFileSync(srcPath, 'utf8');
        } catch {
          continue;
        }
        if (!raw.trim()) continue; // skip empty agent files
        staged.push({ srcPath, content: raw, name: prefix + bareName });
      }
      return staged;
    },
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve the artifact layout for `(runtime, configDir, scope)`.
 *
 * @param {string} runtime  one of the 14 GDD runtimes (D-03).
 * @param {string} configDir  absolute path to the runtime's config directory
 *   (typically obtained from `runtime-homes.getGlobalConfigDir(runtime)`).
 * @param {'local'|'global'} [scope]  defaults to `'global'`.
 * @returns {Layout}
 * @throws {TypeError}  on empty configDir, invalid scope, or unknown runtime.
 */
function resolveRuntimeArtifactLayout(runtime, configDir, scope = 'global') {
  if (typeof configDir !== 'string' || configDir === '') {
    throw new TypeError('configDir must be a non-empty string');
  }
  if (scope !== 'local' && scope !== 'global') {
    throw new TypeError('scope must be "local" or "global"');
  }
  if (!ALLOWED_RUNTIMES.has(runtime)) {
    throw new TypeError(
      `Unknown runtime: '${runtime}' — add to runtime-artifact-layout.cjs ` +
        `ALLOWED_RUNTIMES and switch table`
    );
  }

  let kinds;
  switch (runtime) {
    case 'claude':
      if (scope === 'local') {
        kinds = [
          commandsKind('commands/gdd', 'gdd-', null, 'claude'),
          agentsKind('agents', 'gdd-'),
        ];
      } else {
        // Global claude install — passthrough skills/ tree (no conversion).
        kinds = [skillsKind('skills', 'gdd-', null, 'claude')];
      }
      break;

    case 'cursor':
      kinds = [
        skillsKind('skills', 'gdd-', './converters/cursor.cjs', 'cursor'),
      ];
      break;

    case 'gemini':
      kinds = [
        commandsKind(
          'commands/gdd',
          'gdd-',
          './converters/gemini.cjs',
          'gemini'
        ),
      ];
      break;

    case 'codex':
      kinds = [
        skillsKind('skills', 'gdd-', './converters/codex.cjs', 'codex'),
      ];
      break;

    case 'copilot':
      kinds = [
        skillsKind('skills', 'gdd-', './converters/copilot.cjs', 'copilot'),
      ];
      break;

    case 'antigravity':
      kinds = [
        skillsKind(
          'skills',
          'gdd-',
          './converters/antigravity.cjs',
          'antigravity'
        ),
      ];
      break;

    case 'windsurf':
      kinds = [
        skillsKind(
          'skills',
          'gdd-',
          './converters/windsurf.cjs',
          'windsurf'
        ),
      ];
      break;

    case 'augment':
      kinds = [
        skillsKind('skills', 'gdd-', './converters/augment.cjs', 'augment'),
      ];
      break;

    case 'trae':
      kinds = [
        skillsKind('skills', 'gdd-', './converters/trae.cjs', 'trae'),
      ];
      break;

    case 'qwen':
      // Qwen Code uses claude-shape per gsd-build precedent (their converter
      // re-uses convertClaudeCommandToClaudeSkill with runtime='qwen'). Our
      // modular equivalent is `./converters/qwen.cjs` (Plan 28.7-05 ships).
      kinds = [
        skillsKind('skills', 'gdd-', './converters/qwen.cjs', 'qwen'),
      ];
      break;

    case 'codebuddy':
      kinds = [
        skillsKind(
          'skills',
          'gdd-',
          './converters/codebuddy.cjs',
          'codebuddy'
        ),
      ];
      break;

    case 'cline':
      // D-09: Cline is rules-based, not skills-based. No skills/ directory
      // is created. Plan 28.7-06's `./converters/cline.cjs` emits a
      // `.clinerules` rule-block at install time; Plan 28.7-08's
      // `installer.cjs` special-cases the empty-kinds + cline-converter
      // combination. We surface the routing hint via `specialCase` so
      // installer code can branch without re-encoding the rule.
      kinds = [];
      break;

    case 'opencode':
      kinds = [
        commandsKind(
          'command',
          'gdd-',
          './converters/opencode.cjs',
          'opencode'
        ),
      ];
      break;

    case 'kilo':
      kinds = [
        commandsKind('command', 'gdd-', './converters/kilo.cjs', 'kilo'),
      ];
      break;

    /* istanbul ignore next — defensive (ALLOWED_RUNTIMES guard above). */
    default:
      throw new TypeError(
        `Unknown runtime: '${runtime}' — switch table not synced with ` +
          `ALLOWED_RUNTIMES`
      );
  }

  const layout = { runtime, configDir, kinds };
  if (runtime === 'cline') {
    // D-09 routing hint — kept distinct from `kinds` so callers can detect
    // the rules-based runtime without scanning for empty arrays.
    layout.specialCase = 'clinerules-embed';
    layout.converterName = 'cline';
  }
  return layout;
}

module.exports = {
  resolveRuntimeArtifactLayout,
  findInstallSourceRoot,
  ALLOWED_RUNTIMES,
};
