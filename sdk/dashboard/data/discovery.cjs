'use strict';
/**
 * sdk/dashboard/data/discovery.cjs — Phase 55 (GDD Dashboard, dep-free).
 *
 * Best-effort, graceful-absent discovery of the three "where is GDD running"
 * surfaces the dashboard renders:
 *
 *   - discoverRuntimes()            -> the 14 installable runtimes + whether
 *                                      each one's global config dir is present
 *                                      on this machine (Phase 24/28.7 set).
 *   - discoverWorktrees({root?})    -> linked git worktrees via
 *                                      `git worktree list --porcelain`.
 *   - discoverSessions({root?})     -> session manifests under
 *                                      `<root>/.design/sessions/*.json`
 *                                      (Phase 55 R4: not yet persisted by the
 *                                      pipeline -> degrades to []).
 *   - recordSession({id, harness})  -> OPTIONAL additive writer that atomically
 *                                      drops `<root>/.design/sessions/<id>.json`
 *                                      so cross-harness visibility can grow over
 *                                      time (tmp + rename, same-dir, Windows-safe).
 *
 * Everything is graceful-absent and NEVER throws: no git -> [] worktrees; no
 * sessions dir -> [] sessions; an unknown runtime in the catalog is skipped
 * rather than thrown. Sibling resolution (runtime-homes) is required via a
 * package-root walk-up so this file survives being copied around the tree
 * (the Phase 53/54 __dirname lesson).
 *
 * Determinism: the runtime catalog order is fixed; worktree order follows git's
 * porcelain output order; session order follows readdir then a stable id sort.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { requireFromPackageRoot } = require('./_pkg-root.cjs');

// runtime-homes is a sibling .cjs lib; resolve it via package-root walk-up so a
// fixed __dirname-relative jump never breaks if this file moves (Phase 53/54).
const runtimeHomes = requireFromPackageRoot('scripts/lib/install/runtime-homes.cjs');

/**
 * The 14 GDD runtimes locked by Phase 24 D-02 (and resolved by
 * runtime-homes.cjs). `cline` is rules-based and has no skills dir
 * (getGlobalSkillsBase('cline') === null) — surfaced as skillsBase: null.
 */
const RUNTIMES = Object.freeze([
  'claude',
  'opencode',
  'gemini',
  'kilo',
  'codex',
  'copilot',
  'cursor',
  'windsurf',
  'antigravity',
  'augment',
  'trae',
  'qwen',
  'codebuddy',
  'cline',
]);

/** True iff `p` exists and is a directory. Never throws. */
function dirExists(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Discover the installable runtimes and whether each is present locally.
 *
 * "present" = the runtime's global config dir exists on disk. We do NOT read
 * any file inside it (pure presence probe), and a resolver RangeError on an
 * unexpected id is swallowed (the entry is still emitted with present:false).
 *
 * @returns {Array<{runtime:string, configDir:string|null, skillsBase:string|null, present:boolean}>}
 */
function discoverRuntimes() {
  const out = [];
  for (const runtime of RUNTIMES) {
    let configDir = null;
    let skillsBase = null;
    let present = false;
    try {
      configDir = runtimeHomes.getGlobalConfigDir(runtime);
    } catch {
      configDir = null;
    }
    try {
      skillsBase = runtimeHomes.getGlobalSkillsBase(runtime); // null for cline
    } catch {
      skillsBase = null;
    }
    if (configDir) present = dirExists(configDir);
    out.push({ runtime, configDir, skillsBase, present });
  }
  return out;
}

/**
 * Default git runner: synchronous `git <args>` in `cwd`, trimmed stdout or null
 * on ANY failure (git missing, non-zero, not a repo). Matches the
 * worktree-resolve.cjs injectable-exec contract: `(cmd, args) => string`.
 *
 * @param {string} cmd  literal 'git'
 * @param {string[]} args
 * @param {string} cwd
 * @returns {string|null}
 */
function defaultGitExec(cmd, args, cwd) {
  try {
    const res = spawnSync(cmd, args, { cwd, encoding: 'utf8', windowsHide: true });
    if (!res || res.status !== 0 || typeof res.stdout !== 'string') return null;
    return res.stdout;
  } catch {
    return null;
  }
}

/**
 * Parse `git worktree list --porcelain` output into structured records.
 *
 * Porcelain format is blank-line-separated stanzas; each stanza has lines like:
 *   worktree /abs/path
 *   HEAD <sha>
 *   branch refs/heads/<name>      (or `detached` / `bare`)
 *   locked [reason]               (optional)
 *
 * Tolerant: unknown keys are ignored; a stanza without a `worktree` line is
 * dropped. Pure string parsing — never throws.
 *
 * @param {string} porcelain
 * @returns {Array<{path:string, head:string|null, branch:string|null, detached:boolean, bare:boolean, locked:boolean}>}
 */
function parseWorktreePorcelain(porcelain) {
  const out = [];
  if (typeof porcelain !== 'string' || porcelain.trim() === '') return out;
  // Stanzas separated by one or more blank lines.
  const stanzas = porcelain.replace(/\r\n/g, '\n').split(/\n\s*\n/);
  for (const stanza of stanzas) {
    const rec = { path: null, head: null, branch: null, detached: false, bare: false, locked: false };
    for (const lineRaw of stanza.split('\n')) {
      const line = lineRaw.trim();
      if (line === '') continue;
      if (line.startsWith('worktree ')) rec.path = line.slice('worktree '.length).trim();
      else if (line.startsWith('HEAD ')) rec.head = line.slice('HEAD '.length).trim();
      else if (line.startsWith('branch ')) {
        const ref = line.slice('branch '.length).trim();
        rec.branch = ref.replace(/^refs\/heads\//, '');
      } else if (line === 'detached') rec.detached = true;
      else if (line === 'bare') rec.bare = true;
      else if (line === 'locked' || line.startsWith('locked ')) rec.locked = true;
    }
    if (rec.path) out.push(rec);
  }
  return out;
}

/**
 * Discover linked git worktrees for the repo containing `root`.
 *
 * `exec` is injectable (matching worktree-resolve.cjs): `(cmd, args) => string`.
 * Returns [] when git is unavailable / `root` is not a repo. NEVER throws.
 *
 * @param {{root?: string, exec?: (cmd:string, args:string[]) => string}} [opts]
 * @returns {Array<{path:string, head:string|null, branch:string|null, detached:boolean, bare:boolean, locked:boolean}>}
 */
function discoverWorktrees(opts = {}) {
  const root = opts.root || process.cwd();
  const run = typeof opts.exec === 'function'
    ? (args) => {
        try {
          const o = opts.exec('git', args);
          return typeof o === 'string' ? o : null;
        } catch {
          return null;
        }
      }
    : (args) => defaultGitExec('git', args, root);

  const porcelain = run(['worktree', 'list', '--porcelain']);
  if (porcelain == null) return [];
  return parseWorktreePorcelain(porcelain);
}

/**
 * Resolve the sessions directory: `<root>/.design/sessions`.
 * @param {{root?: string}} [opts]
 * @returns {string}
 */
function sessionsDirFor(opts = {}) {
  const root = opts.root || process.cwd();
  return path.join(root, '.design', 'sessions');
}

/**
 * Discover persisted session manifests under `<root>/.design/sessions/*.json`.
 *
 * Phase 55 R4: the pipeline does not yet persist session manifests, so this
 * degrades to [] in practice. When present, each `<id>.json` is read + parsed
 * (malformed/unreadable files skipped). Results are sorted by id for
 * determinism. NEVER throws.
 *
 * @param {{root?: string}} [opts]
 * @returns {Array<Record<string, unknown>>}
 */
function discoverSessions(opts = {}) {
  const dir = sessionsDirFor(opts);
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return []; // no sessions dir -> graceful empty
  }
  const out = [];
  for (const ent of entries) {
    if (!ent.isFile() || !ent.name.endsWith('.json')) continue;
    try {
      const body = fs.readFileSync(path.join(dir, ent.name), 'utf8');
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed === 'object') out.push(parsed);
    } catch {
      // skip malformed/unreadable manifest
    }
  }
  out.sort((a, b) => String(a && a.id).localeCompare(String(b && b.id)));
  return out;
}

/**
 * OPTIONAL additive writer (Phase 55 R4 / D5): atomically persist a session
 * manifest at `<root>/.design/sessions/<id>.json` so future runs / other
 * harnesses can discover it. Uses tmp + same-dir rename (Windows-safe atomic
 * write idiom, mirrors scripts/lib/graph/atomic-write.mjs).
 *
 * Stamps `updated_at` (ISO) so the manifest carries freshness — this is the one
 * intentional non-deterministic field (a write side-effect, not part of any
 * deterministic render contract). `id` is required.
 *
 * Returns the written file path. NEVER throws on a sanitizable input; throws
 * only on a missing/empty id (a programmer error the caller must fix).
 *
 * @param {{id: string, harness?: string, root?: string, [k:string]: unknown}} input
 * @returns {string} absolute path of the written manifest
 */
function recordSession(input) {
  if (!input || typeof input.id !== 'string' || input.id.length === 0) {
    throw new TypeError('recordSession: id is required');
  }
  // Sanitize id into a safe filename (no path separators / traversal).
  const safeId = input.id.replace(/[^A-Za-z0-9._-]/g, '_');
  const dir = sessionsDirFor({ root: input.root });
  const target = path.join(dir, `${safeId}.json`);

  const manifest = { id: input.id };
  if (typeof input.harness === 'string') manifest.harness = input.harness;
  // Preserve opaque extras (anything except control keys).
  for (const key of Object.keys(input)) {
    if (key === 'root' || key === 'id' || key === 'harness') continue;
    manifest[key] = input[key];
  }
  manifest.updated_at = new Date().toISOString();

  const base = path.basename(target);
  const tmp = path.join(
    dir,
    `.${base}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`,
  );
  fs.mkdirSync(dir, { recursive: true });
  const body = JSON.stringify(manifest, null, 2) + '\n';
  try {
    fs.writeFileSync(tmp, body, 'utf8');
    fs.renameSync(tmp, target);
  } catch (err) {
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch {
      /* best-effort cleanup; original error takes precedence */
    }
    throw err;
  }
  return target;
}

module.exports = {
  discoverRuntimes,
  discoverWorktrees,
  discoverSessions,
  recordSession,
  parseWorktreePorcelain,
  sessionsDirFor,
  RUNTIMES,
};
