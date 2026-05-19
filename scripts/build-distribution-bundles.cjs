'use strict';
/**
 * scripts/build-distribution-bundles.cjs — Phase 28.8 (Plan 28-8-X1).
 *
 * Shared-source / multi-channel distribution bundler.
 *
 * Per CONTEXT D-06: skills are shared source / per-channel converters at
 * distribution-build time. This script fans out canonical `skills/` into
 * three channel-specific bundles under `dist/`:
 *
 *   - dist/cursor-marketplace/  (via scripts/lib/install/converters/cursor-marketplace.cjs)
 *   - dist/codex-plugin/        (via scripts/lib/install/converters/codex-plugin.cjs)
 *   - dist/agentskills-io/      (passthrough per D-13 lint-only)
 *
 * Tier-2 channels are discovered by inspecting `runtimes.cjs` entries with
 * `kind: 'cursor-marketplace'` or `kind: 'codex-plugin'`. `agentskills-io`
 * is hardcoded as a passthrough (it's a spec, not a runtime — D-02/D-13).
 *
 * Determinism: two consecutive runs produce byte-identical output.
 * Tier-1 unaffected: only writes under `dist/`.
 *
 * --- ADAPTER NOTE (Plan 28-8-X1 implementation): the Wave-B converters
 * (B1: cursor-marketplace.cjs, C1: codex-plugin.cjs) actually export
 * `{ buildManifest, convert, CURATED_KEYWORDS }` — NOT the
 * `{ convertSkill, buildManifest, MANIFEST_PATH }` shape that the plan's
 * `<interfaces>` block hypothesized. Per the plan's "Adapter divergence
 * handling" clause, this bundler adapts to the actual converter shape
 * rather than modifying the converters (which are already shipped and
 * out of scope per D-05).
 *
 * Actual converter contract used here:
 *   - converter.buildManifest({ packageJson, claudePlugin, claudePluginJson,
 *                               marketplaceJson, readmeFirstPara })
 *       → returns a manifest OBJECT (not a string).
 *       (cursor-marketplace looks for `claudePluginJson`; codex-plugin
 *        looks for `claudePlugin`. We pass BOTH keys to be compatible
 *        with either accessor.)
 *   - converter.convert({ skillsDir, outDir, manifest })
 *       → writes manifest + copies skills/ tree under outDir. Owns its
 *        own manifest path (.cursor-plugin/plugin.json or .codex-plugin/
 *        plugin.json) — the bundler doesn't need to know.
 *
 * CLI:
 *   node scripts/build-distribution-bundles.cjs              # all channels
 *   node scripts/build-distribution-bundles.cjs --channel cursor-marketplace
 *   node scripts/build-distribution-bundles.cjs --help
 *
 * Exit codes: 0 ok / 1 converter error / 2 missing dependency.
 */

const fs = require('fs');
const path = require('path');

const EXIT_CODES = Object.freeze({
  OK: 0,
  CONVERTER_ERROR: 1,
  MISSING_DEPENDENCY: 2,
});

// agentskills-io is hardcoded — it is a spec, not a runtime entry
// (per CONTEXT D-02 / D-13). No converter file, no manifest file.
const PASSTHROUGH_CHANNEL = Object.freeze({
  id: 'agentskills-io',
  kind: 'passthrough',
  converterPath: null,
});

// Set of runtime `kind` values that the bundler dispatches to Wave-B
// converters. Hardcoded to two kinds — adding a third Tier-2 channel in
// a future phase requires (a) adding the runtime entry with a new kind,
// (b) shipping a converter at scripts/lib/install/converters/<kind>.cjs,
// (c) extending this set. The channel-ID discovery itself is data-driven.
const TIER2_KINDS = Object.freeze(new Set(['cursor-marketplace', 'codex-plugin']));

// ---------------------------------------------------------------
// Channel discovery
// ---------------------------------------------------------------

/**
 * Discover Tier-2 channels from the runtimes registry + add the hardcoded
 * passthrough channel. Returns Array<{id, kind, converterPath}>.
 *
 * `runtimesModule` is dependency-injected so tests can supply a fixture.
 * Production callers pass `require('./lib/install/runtimes.cjs')`.
 *
 * Determinism: runtime list sorted lexicographically by id before iteration.
 * The hardcoded PASSTHROUGH_CHANNEL is appended last; callers that want a
 * fully lexicographic ordering should re-sort the returned array.
 */
function discoverTier2Channels(runtimesModule) {
  const channels = [];
  const runtimes = (runtimesModule && typeof runtimesModule.listRuntimes === 'function')
    ? runtimesModule.listRuntimes()
    : [];
  const sorted = runtimes.slice().sort((a, b) => a.id.localeCompare(b.id));
  for (const rt of sorted) {
    if (!TIER2_KINDS.has(rt.kind)) continue;
    channels.push({
      id: rt.id,
      kind: rt.kind,
      // Converter file lives at scripts/lib/install/converters/<kind>.cjs.
      // T-28.8-X1-01 (Tampering / require()): `kind` originates in the
      // version-controlled runtimes.cjs file — an attacker would already
      // need write access to introduce a malicious value. Acceptable.
      converterPath: path.join(
        __dirname,
        'lib', 'install', 'converters',
        rt.kind + '.cjs',
      ),
    });
  }
  channels.push(PASSTHROUGH_CHANNEL);
  return channels;
}

// ---------------------------------------------------------------
// Skill enumeration (canonical source)
// ---------------------------------------------------------------

/**
 * Enumerate child directories of `<sourceRoot>/skills/` that contain a
 * `SKILL.md`. Returns { skillsRoot, skillNames } where skillNames is
 * sorted lexicographically (determinism).
 *
 * Throws Error with code MISSING_SKILLS_ROOT if skills/ is absent.
 */
function enumerateSkills(sourceRoot) {
  const skillsRoot = path.join(sourceRoot, 'skills');
  if (!fs.existsSync(skillsRoot)) {
    const err = new Error('Canonical skills/ tree not found at ' + skillsRoot);
    err.code = 'MISSING_SKILLS_ROOT';
    throw err;
  }
  const names = fs.readdirSync(skillsRoot)
    .filter((name) => {
      const skillDir = path.join(skillsRoot, name);
      try {
        return fs.statSync(skillDir).isDirectory()
          && fs.existsSync(path.join(skillDir, 'SKILL.md'));
      } catch {
        return false;
      }
    })
    .sort();
  return { skillsRoot, skillNames: names };
}

// ---------------------------------------------------------------
// Filesystem helpers
// ---------------------------------------------------------------

function ensureCleanDir(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
  fs.mkdirSync(dirPath, { recursive: true });
}

/**
 * Deterministic file write: 0o644, no timestamp metadata leaked into content.
 */
function writeFile(dest, content) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, content, { mode: 0o644 });
}

/**
 * Recursive byte-for-byte copy of `srcDir` into `destDir`. Used by the
 * passthrough channel. Deterministic: lexicographic readdir + 0o644.
 *
 * T-28.8-X1-03 (Tampering / symlinks): only entry.isFile() and
 * entry.isDirectory() are propagated. Symlinks and other types are
 * silently skipped — the canonical skills/ tree is expected to be
 * regular files only.
 */
function copyDirRecursive(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  const entries = fs.readdirSync(srcDir, { withFileTypes: true })
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else if (entry.isFile()) {
      const content = fs.readFileSync(srcPath);
      writeFile(destPath, content);
    }
    // Symlinks / other entry types: skip.
  }
}

function countFiles(dir) {
  let count = 0;
  if (!fs.existsSync(dir)) return 0;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) stack.push(p);
      else if (entry.isFile()) count++;
    }
  }
  return count;
}

// ---------------------------------------------------------------
// Optional ancillary sources (loaded best-effort from repo root)
// ---------------------------------------------------------------

/**
 * Best-effort loader for ancillary inputs the converters may consult:
 *   - .claude-plugin/plugin.json     → claudePlugin / claudePluginJson
 *   - .claude-plugin/marketplace.json → marketplaceJson
 *   - README.md (first paragraph)    → readmeFirstPara
 *
 * Returns an object with each key present only if the corresponding source
 * exists and parses cleanly. Never throws — converters are tolerant of
 * absent optional sources, and tmpdir test fixtures typically omit them.
 */
function loadAncillarySources(sourceRoot) {
  const sources = {};
  const pluginJsonPath = path.join(sourceRoot, '.claude-plugin', 'plugin.json');
  if (fs.existsSync(pluginJsonPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'));
      sources.claudePlugin = parsed;
      sources.claudePluginJson = parsed;
    } catch {
      // Best-effort: malformed plugin.json is the converter's problem,
      // not the bundler's. Continue without it.
    }
  }
  const marketplaceJsonPath = path.join(sourceRoot, '.claude-plugin', 'marketplace.json');
  if (fs.existsSync(marketplaceJsonPath)) {
    try {
      sources.marketplaceJson = JSON.parse(fs.readFileSync(marketplaceJsonPath, 'utf8'));
    } catch {
      // skip
    }
  }
  const readmePath = path.join(sourceRoot, 'README.md');
  if (fs.existsSync(readmePath)) {
    try {
      const raw = fs.readFileSync(readmePath, 'utf8');
      // First non-empty, non-heading paragraph.
      const paragraphs = raw.split(/\n\s*\n/);
      for (const p of paragraphs) {
        const trimmed = p.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        sources.readmeFirstPara = trimmed.replace(/\s+/g, ' ');
        break;
      }
    } catch {
      // skip
    }
  }
  return sources;
}

// ---------------------------------------------------------------
// Channel build dispatch
// ---------------------------------------------------------------

/**
 * Build a single channel into `outRoot/<channelId>/`.
 * Returns { channel, fileCount }.
 *
 * Throws on converter error or missing dependency — caller maps to exit code.
 *
 * Errors set `err.code` to one of:
 *   - 'MISSING_CONVERTER'      → exit 2
 *   - 'CONVERTER_LOAD_FAILED'  → exit 2 (require() failed — broken module)
 *   - 'CONVERTER_EXEC_FAILED'  → exit 1 (converter ran and threw)
 *   - 'MANIFEST_BUILD_FAILED'  → exit 1 (buildManifest threw)
 *   - 'MISSING_SKILLS_ROOT'    → exit 2 (no skills/ dir to read)
 */
function buildChannel(channel, opts) {
  const { sourceRoot, outRoot, packageJson } = opts || {};
  if (!channel || typeof channel !== 'object') {
    throw new Error('buildChannel: channel is required');
  }
  if (typeof sourceRoot !== 'string' || sourceRoot.length === 0) {
    throw new Error('buildChannel: opts.sourceRoot is required');
  }
  if (typeof outRoot !== 'string' || outRoot.length === 0) {
    throw new Error('buildChannel: opts.outRoot is required');
  }

  const bundleRoot = path.join(outRoot, channel.id);
  ensureCleanDir(bundleRoot);

  if (channel.kind === 'passthrough') {
    // agentskills-io: passthrough copy of skills/ (D-13).
    const skillsSrc = path.join(sourceRoot, 'skills');
    if (!fs.existsSync(skillsSrc)) {
      const err = new Error('Canonical skills/ tree not found at ' + skillsSrc);
      err.code = 'MISSING_SKILLS_ROOT';
      err.channelId = channel.id;
      throw err;
    }
    copyDirRecursive(skillsSrc, path.join(bundleRoot, 'skills'));
    return { channel: channel.id, fileCount: countFiles(bundleRoot) };
  }

  // Tier-2 converter-backed channels (cursor-marketplace, codex-plugin).
  if (!fs.existsSync(channel.converterPath)) {
    const err = new Error(
      'Missing converter for channel "' + channel.id + '": expected at ' + channel.converterPath
    );
    err.code = 'MISSING_CONVERTER';
    err.channelId = channel.id;
    throw err;
  }

  let converter;
  try {
    converter = require(channel.converterPath);
  } catch (e) {
    const err = new Error(
      'Failed to load converter for channel "' + channel.id + '": ' + e.message
    );
    err.code = 'CONVERTER_LOAD_FAILED';
    err.channelId = channel.id;
    err.cause = e;
    throw err;
  }

  if (typeof converter.buildManifest !== 'function' || typeof converter.convert !== 'function') {
    const err = new Error(
      'Converter for channel "' + channel.id + '" missing required exports: ' +
      'expected { buildManifest, convert }, got ' + Object.keys(converter).join(', ')
    );
    err.code = 'CONVERTER_LOAD_FAILED';
    err.channelId = channel.id;
    throw err;
  }

  // Enumerate skills BEFORE invoking convert(). This both validates that
  // skills/ exists and surfaces a deterministic name list for error
  // messages — convert() will re-walk the directory itself per its own
  // semantics, which is fine (idempotent) but we want a stable list for
  // the CONVERTER_EXEC_FAILED error message.
  const { skillsRoot, skillNames } = enumerateSkills(sourceRoot);

  // Build manifest via the converter.
  // Pass BOTH `claudePlugin` and `claudePluginJson` accessor keys so the
  // adapter works regardless of which key the specific converter consults.
  const ancillary = loadAncillarySources(sourceRoot);
  const sources = Object.assign({}, ancillary, { packageJson });

  let manifest;
  try {
    manifest = converter.buildManifest(sources);
  } catch (e) {
    const err = new Error(
      'Converter "' + channel.id + '" failed building manifest: ' + e.message
    );
    err.code = 'MANIFEST_BUILD_FAILED';
    err.channelId = channel.id;
    err.cause = e;
    throw err;
  }

  // Invoke convert() — converter writes manifest + copies skills/ under outDir.
  try {
    converter.convert({
      skillsDir: skillsRoot,
      outDir: bundleRoot,
      manifest,
    });
  } catch (e) {
    // The converter walked skills/ internally so we don't know which
    // individual skill triggered the throw — surface the full list to
    // aid debugging.
    const skillsHint = skillNames.length > 0
      ? ' (skills: ' + skillNames.join(', ') + ')'
      : '';
    const err = new Error(
      'Converter "' + channel.id + '" failed during convert()' + skillsHint + ': ' + e.message
    );
    err.code = 'CONVERTER_EXEC_FAILED';
    err.channelId = channel.id;
    err.skillName = skillNames[0] || null;
    err.cause = e;
    throw err;
  }

  return { channel: channel.id, fileCount: countFiles(bundleRoot) };
}

/**
 * Build all (or one filtered) channel(s) into `outRoot`.
 *
 * Options:
 *   sourceRoot      — repo root containing skills/ + ancillary sources
 *   outRoot         — destination root (e.g., repo/dist)
 *   runtimesModule  — dependency-injected runtimes registry (test seam)
 *   packageJson     — parsed package.json object passed to converters
 *   channelFilter   — optional channel id to scope the build to one channel
 *
 * Returns Array<{ channel, fileCount }> in lexicographic channel order.
 */
function buildAllChannels(opts) {
  const { sourceRoot, outRoot, runtimesModule, packageJson, channelFilter } = opts || {};
  const channels = discoverTier2Channels(runtimesModule);
  const targets = channelFilter
    ? channels.filter((c) => c.id === channelFilter)
    : channels;
  if (channelFilter && targets.length === 0) {
    const err = new Error(
      'Unknown channel: "' + channelFilter + '". Available: ' +
      channels.map((c) => c.id).join(', ')
    );
    err.code = 'UNKNOWN_CHANNEL';
    throw err;
  }
  // Lexicographic order for deterministic stdout + filesystem traversal.
  targets.sort((a, b) => a.id.localeCompare(b.id));
  const results = [];
  for (const channel of targets) {
    results.push(buildChannel(channel, { sourceRoot, outRoot, packageJson }));
  }
  return results;
}

// ---------------------------------------------------------------
// CLI entrypoint
// ---------------------------------------------------------------

function parseArgs(argv) {
  const args = { help: false, channel: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      args.help = true;
    } else if (a === '--channel') {
      if (i + 1 >= argv.length) {
        throw new Error('--channel requires a value');
      }
      args.channel = argv[++i];
    } else {
      throw new Error('Unknown argument: ' + a);
    }
  }
  return args;
}

function printUsage(out) {
  out.write([
    'Usage: node scripts/build-distribution-bundles.cjs [--channel <id>]',
    '',
    'Builds Tier-2 distribution bundles from canonical skills/ into dist/.',
    '',
    'Options:',
    '  --channel <id>   Build only the named channel (e.g., cursor-marketplace,',
    '                   codex-plugin, agentskills-io). Default: all channels.',
    '  --help, -h       Print this message.',
    '',
    'Exit codes:',
    '  0  success',
    '  1  converter error (converter ran and threw)',
    '  2  missing dependency (converter file, runtimes.cjs entry, skills/, or bad arg)',
    '',
  ].join('\n'));
}

function main(argv, ioOpts) {
  const stdout = (ioOpts && ioOpts.stdout) || process.stdout;
  const stderr = (ioOpts && ioOpts.stderr) || process.stderr;

  let args;
  try {
    args = parseArgs(argv || []);
  } catch (e) {
    stderr.write('Error: ' + e.message + '\n');
    printUsage(stderr);
    return EXIT_CODES.MISSING_DEPENDENCY;
  }
  if (args.help) {
    printUsage(stdout);
    return EXIT_CODES.OK;
  }

  const repoRoot = path.resolve(__dirname, '..');
  const sourceRoot = repoRoot;
  const outRoot = path.join(repoRoot, 'dist');

  let runtimesModule;
  try {
    runtimesModule = require('./lib/install/runtimes.cjs');
  } catch (e) {
    stderr.write('Error: failed to load runtimes.cjs: ' + e.message + '\n');
    return EXIT_CODES.MISSING_DEPENDENCY;
  }

  let packageJson;
  try {
    packageJson = require(path.join(repoRoot, 'package.json'));
  } catch (e) {
    stderr.write('Error: failed to load package.json: ' + e.message + '\n');
    return EXIT_CODES.MISSING_DEPENDENCY;
  }

  try {
    const results = buildAllChannels({
      sourceRoot,
      outRoot,
      runtimesModule,
      packageJson,
      channelFilter: args.channel,
    });
    for (const r of results) {
      stdout.write('[bundles] ' + r.channel + ': ' + r.fileCount + ' file(s)\n');
    }
    return EXIT_CODES.OK;
  } catch (e) {
    stderr.write('Error: ' + e.message + '\n');
    if (
      e.code === 'MISSING_CONVERTER' ||
      e.code === 'MISSING_SKILLS_ROOT' ||
      e.code === 'UNKNOWN_CHANNEL' ||
      e.code === 'CONVERTER_LOAD_FAILED'
    ) {
      return EXIT_CODES.MISSING_DEPENDENCY;
    }
    // CONVERTER_EXEC_FAILED, MANIFEST_BUILD_FAILED, or anything else.
    return EXIT_CODES.CONVERTER_ERROR;
  }
}

module.exports = {
  buildAllChannels,
  buildChannel,
  discoverTier2Channels,
  enumerateSkills,
  loadAncillarySources,
  main,
  parseArgs,
  EXIT_CODES,
  PASSTHROUGH_CHANNEL,
  TIER2_KINDS,
};

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}
