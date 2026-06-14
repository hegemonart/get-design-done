#!/usr/bin/env node
'use strict';

/**
 * Pure-Node port of scripts/bootstrap.sh.
 *
 * Original: scripts/bootstrap.sh — hone SessionStart bootstrap.
 * Auto-provisions companion resources that hone references but
 * which are not Claude Code plugins (so they cannot be listed in `dependencies`).
 *
 * Idempotency: a marker file under ${CLAUDE_PLUGIN_DATA}/bootstrap-manifest.txt
 * is compared byte-for-byte to the bundled scripts/bootstrap-manifest.txt.
 * If they match, the script no-ops — only first install (or a manifest bump)
 * triggers the network/IO work.
 *
 * Behavior preserved from the .sh:
 *   - Env-var fallbacks: CLAUDE_PLUGIN_DATA → ~/.claude/plugins/data/hone,
 *     CLAUDE_PLUGIN_ROOT → resolved relative to this script (../).
 *   - Windows backslash normalization for both env vars (\ → /).
 *   - mkdir -p of PLUGIN_DATA, ~/.claude/libs, ~/.claude/skills.
 *   - Clone (--depth 1 --quiet) or `git -C <target> pull --quiet --ff-only`
 *     for VoltAgent/awesome-design-md. We DO shell out to the `git` CLI
 *     (that's a real dep, not bash) via spawnSync — the rule against
 *     spawnSync is specifically against spawnSync('bash', …).
 *   - Soft-notice (stderr only) if ~/.claude/skills/emil-design-eng is absent.
 *   - Ensures cwd/.design/budget.json with the literal default JSON from the .sh
 *     (written atomically via .tmp + rename).
 *   - Ensures cwd/.design/telemetry/.
 *   - Copies manifest → marker on success.
 *   - Silent-on-failure: every error path collapses to exit 0. Only logs go to
 *     stderr with the `[hone bootstrap]` prefix.
 *
 * Sourcing-guard pattern: helpers are exported on module.exports; main() only
 * runs when this file is the entry point (require.main === module). Tests can
 * require() this module and exercise helpers without triggering the network
 * clone or the cwd/.design/ side effects.
 *
 * Module.exports.run({argv, env, cwd}) accepts optional injection for tests.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const LOG_PREFIX = '[hone bootstrap]';

/**
 * Stderr logger matching the .sh `log()` function.
 * @param {string} msg
 */
function log(msg) {
  // The .sh used: printf '[hone bootstrap] %s\n' "$*" >&2
  process.stderr.write(`${LOG_PREFIX} ${msg}\n`);
}

/**
 * Normalize Windows backslashes to forward slashes, mirroring the bash
 * `${VAR//\\//}` parameter expansion used in the .sh.
 * @param {string|undefined|null} p
 * @returns {string}
 */
function normalizeSlashes(p) {
  if (p === undefined || p === null) return '';
  return String(p).replace(/\\/g, '/');
}

/**
 * Default for CLAUDE_PLUGIN_DATA — matches the .sh fallback exactly.
 * Returns forward-slash form so the bash-style normalization is a no-op
 * here; the env-var path still gets normalized in resolveContext.
 * @param {string} home
 */
function defaultPluginData(home) {
  return normalizeSlashes(path.join(home, '.claude', 'plugins', 'data', 'hone'));
}

/**
 * Default for CLAUDE_PLUGIN_ROOT — matches the .sh fallback:
 *   `cd "$(dirname "$0")/.." && pwd`
 * In Node terms: the parent of __dirname.
 */
function defaultPluginRoot() {
  return normalizeSlashes(path.resolve(__dirname, '..'));
}

/**
 * Resolve the full set of paths/flags the script needs.
 * Pure — no IO. Exposed for tests.
 * @param {{env?: NodeJS.ProcessEnv, home?: string}} [opts]
 */
function resolveContext(opts = {}) {
  const env = opts.env || process.env;
  const home = opts.home || os.homedir();

  const pluginDataRaw = env.CLAUDE_PLUGIN_DATA || defaultPluginData(home);
  const pluginData = normalizeSlashes(pluginDataRaw);

  const pluginRootRaw = env.CLAUDE_PLUGIN_ROOT || defaultPluginRoot();
  const pluginRoot = normalizeSlashes(pluginRootRaw);

  const manifest = `${pluginRoot}/scripts/bootstrap-manifest.txt`;
  const marker = `${pluginData}/bootstrap-manifest.txt`;

  return {
    home,
    pluginData,
    pluginRoot,
    manifest,
    marker,
    libsDir: path.join(home, '.claude', 'libs'),
    skillsDir: path.join(home, '.claude', 'skills'),
    awesomeRepoTarget: path.join(home, '.claude', 'libs', 'awesome-design-md'),
    emilSkillTarget: path.join(home, '.claude', 'skills', 'emil-design-eng'),
  };
}

/**
 * Best-effort `mkdir -p`. Swallows EEXIST; logs and swallows everything else.
 * @param {string} dir
 */
function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (err) {
    if (err && err.code !== 'EEXIST') {
      log(`mkdir failed for ${dir} (${err.code || err.message}) — continuing`);
    }
  }
}

/**
 * Byte-for-byte comparison of two files. Returns true only if both exist and
 * have identical contents. Any error path → false (we'd rather re-run than
 * skip).
 * @param {string} a
 * @param {string} b
 */
function filesEqual(a, b) {
  try {
    if (!fs.existsSync(a) || !fs.existsSync(b)) return false;
    const bufA = fs.readFileSync(a);
    const bufB = fs.readFileSync(b);
    if (bufA.length !== bufB.length) return false;
    return bufA.equals(bufB);
  } catch {
    return false;
  }
}

/**
 * Network timeout (ms) for the git clone/pull. SessionStart hooks must never
 * block the harness: without a timeout, a hung network connection would stall
 * the whole session-start sequence indefinitely. spawnSync kills the child
 * with `killSignal` once this elapses and reports it as a failure.
 */
const GIT_TIMEOUT_MS = 15000;

/**
 * Match the .sh `clone_or_update`:
 *   - target/.git exists  → `git -C target pull --quiet --ff-only`, log on fail
 *   - target exists, no .git → log+skip
 *   - target absent → `git clone --quiet --depth 1 <url> <target>`, log on fail
 *
 * We invoke the `git` CLI directly via spawnSync. spawnSync('git', …) is fine —
 * the prohibition is on spawnSync('bash', …).
 *
 * Returns true ONLY when the repo is in a good post-condition (pull/clone
 * succeeded, or a pre-existing non-git dir we intentionally skip). Returns
 * false when a network op failed or timed out — so the caller can withhold the
 * success marker and retry next session instead of recording failure as done.
 *
 * @param {string} repoUrl
 * @param {string} target
 * @returns {boolean} success
 */
function cloneOrUpdate(repoUrl, target) {
  let isGitCheckout = false;
  let targetExists = false;
  try {
    targetExists = fs.existsSync(target);
    if (targetExists) {
      isGitCheckout = fs.existsSync(path.join(target, '.git'));
    }
  } catch {
    // fall through — treat as absent
  }

  if (isGitCheckout) {
    log(`updating ${target}`);
    const r = spawnSync('git', ['-C', target, 'pull', '--quiet', '--ff-only'], {
      stdio: ['ignore', 'ignore', 'ignore'],
      windowsHide: true,
      timeout: GIT_TIMEOUT_MS,
      killSignal: 'SIGKILL',
    });
    if (r.error || r.status !== 0) {
      const why = r.error && r.error.code === 'ETIMEDOUT' ? 'timed out' : 'failed';
      log(`pull ${why} for ${target} (continuing)`);
      return false;
    }
    return true;
  }

  if (targetExists) {
    log(`${target} exists and is not a git checkout — skipping`);
    // A pre-existing non-git dir is a stable post-condition, not a failure:
    // re-running won't change it, so don't force a retry every session.
    return true;
  }

  // Defense in depth: refuse repoUrl / target arguments that look like git
  // CLI flags (e.g. --upload-pack=evil). Even though both args originate
  // from compile-time constants in resolveContext(), a future refactor
  // could let env-derived values reach this point — fail closed.
  if (typeof repoUrl !== 'string' || repoUrl.startsWith('-') ||
      typeof target !== 'string' || target.startsWith('-')) {
    log(`refusing suspicious clone args for ${repoUrl} -> ${target}`);
    return false;
  }

  log(`cloning ${repoUrl} -> ${target}`);
  // Use `--` to terminate option parsing so a malicious URL that looks
  // like a flag is treated as a positional arg by git.
  const r = spawnSync('git', ['clone', '--quiet', '--depth', '1', '--', repoUrl, target], {
    stdio: ['ignore', 'ignore', 'ignore'],
    windowsHide: true,
    timeout: GIT_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  });
  if (r.error || r.status !== 0) {
    const why = r.error && r.error.code === 'ETIMEDOUT' ? 'timed out' : 'failed';
    log(`clone ${why} for ${repoUrl}`);
    return false;
  }
  return true;
}

/**
 * Default budget.json content — copied verbatim from the heredoc in the .sh
 * (BUDGET_EOF block, lines 60–69). Trailing newline preserved to match
 * `cat > file <<'EOF'` output.
 */
const DEFAULT_BUDGET_JSON = `{
  "per_task_cap_usd": 2.00,
  "per_phase_cap_usd": 20.00,
  "tier_overrides": {},
  "auto_downgrade_on_cap": true,
  "cache_ttl_seconds": 3600,
  "enforcement_mode": "enforce"
}
`;

/**
 * Atomic write: write to <dest>.tmp then rename. Silent on failure.
 * @param {string} dest
 * @param {string} content
 */
function atomicWrite(dest, content) {
  const tmp = `${dest}.tmp`;
  try {
    fs.writeFileSync(tmp, content);
    fs.renameSync(tmp, dest);
    return true;
  } catch (err) {
    log(`write failed for ${dest} (${err && (err.code || err.message)}) — continuing`);
    // Best-effort cleanup of the .tmp; ignore any error.
    try { fs.unlinkSync(tmp); } catch {}
    return false;
  }
}

/**
 * Ensure cwd/.design/budget.json (with defaults) and cwd/.design/telemetry/.
 * Mirrors lines 56–73 of the .sh.
 * @param {string} cwd
 */
function ensureDesignDir(cwd) {
  const designDir = path.join(cwd, '.design');
  ensureDir(designDir);

  const budgetPath = path.join(designDir, 'budget.json');
  let budgetExists = false;
  try {
    budgetExists = fs.existsSync(budgetPath);
  } catch {
    budgetExists = false;
  }
  if (!budgetExists) {
    atomicWrite(budgetPath, DEFAULT_BUDGET_JSON);
  }

  ensureDir(path.join(designDir, 'telemetry'));
}

/**
 * Best-effort `cp manifest marker`. The .sh wraps this in `if [[ -f MANIFEST ]]`.
 * @param {string} manifest
 * @param {string} marker
 */
function copyManifestToMarker(manifest, marker) {
  try {
    if (!fs.existsSync(manifest)) return;
  } catch {
    return;
  }
  try {
    const data = fs.readFileSync(manifest);
    // Write atomically so a partial copy doesn't leave a half-written marker
    // that would later equal-compare false but trigger weird states.
    const tmp = `${marker}.tmp`;
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, marker);
  } catch (err) {
    log(`copy manifest→marker failed (${err && (err.code || err.message)}) — continuing`);
  }
}

/**
 * Main entry — equivalent to executing bootstrap.sh top-to-bottom.
 * Always returns 0 (silent-on-failure policy from the .sh: `set -u` + final
 * `exit 0`; no `set -e`, every IO action is guarded). Optional opts allow
 * tests to inject env/cwd/home without mutating process state.
 *
 * @param {{env?: NodeJS.ProcessEnv, cwd?: string, home?: string}} [opts]
 * @returns {number} exit code (always 0)
 */
function run(opts = {}) {
  const ctx = resolveContext({ env: opts.env, home: opts.home });
  const cwd = opts.cwd || process.cwd();

  // mkdir -p "${PLUGIN_DATA}" "${HOME}/.claude/libs" "${HOME}/.claude/skills"
  ensureDir(ctx.pluginData);
  ensureDir(ctx.libsDir);
  ensureDir(ctx.skillsDir);

  // Early-exit: bundled manifest matches last-run marker.
  if (filesEqual(ctx.manifest, ctx.marker)) {
    return 0;
  }

  // Required library: VoltAgent/awesome-design-md.
  const repoOk = cloneOrUpdate(
    'https://github.com/VoltAgent/awesome-design-md.git',
    ctx.awesomeRepoTarget
  );

  // Soft notice for companion skills we cannot auto-install.
  try {
    if (!fs.existsSync(ctx.emilSkillTarget)) {
      log('optional: emil-design-eng skill not found in ~/.claude/skills. See hone README for install options.');
    }
  } catch {
    // ignore — emil notice is purely advisory
  }

  // Phase 10.1: .design/budget.json + .design/telemetry/ (D-12).
  ensureDesignDir(cwd);

  // Record success ONLY when the network provisioning actually succeeded.
  // Writing the marker unconditionally records a failed clone as "done" and
  // never retries — leaving the required library permanently absent. Gating on
  // repoOk means a transient network failure/timeout is retried next session.
  if (repoOk) {
    copyManifestToMarker(ctx.manifest, ctx.marker);
  } else {
    log('skipping success marker — provisioning incomplete, will retry next session');
  }

  return 0;
}

module.exports = {
  run,
  // Helpers exported so test/suite/* can exercise them in isolation
  // (sourcing-guard equivalent).
  log,
  normalizeSlashes,
  defaultPluginData,
  defaultPluginRoot,
  resolveContext,
  ensureDir,
  filesEqual,
  cloneOrUpdate,
  atomicWrite,
  ensureDesignDir,
  copyManifestToMarker,
  DEFAULT_BUDGET_JSON,
  LOG_PREFIX,
};

// Run main() only when invoked as the entry point.
if (require.main === module) {
  // Match the .sh: always exit 0 unless a programmer error blows up.
  // run() never throws; if it ever did, we'd still rather no-op silently
  // than crash a SessionStart hook.
  try {
    process.exit(run());
  } catch (err) {
    // Last-resort guard. Surface to stderr (the hook is fire-and-forget)
    // then exit 0 to match silent-on-failure.
    try { log(`unhandled error: ${err && (err.stack || err.message || String(err))} — exiting 0`); } catch {}
    process.exit(0);
  }
}
