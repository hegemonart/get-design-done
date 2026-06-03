#!/usr/bin/env node
/**
 * get-design-done — update check (Phase 13.3) — Node port
 *
 * Original: hooks/update-check.sh
 * SessionStart hook. Silent-on-failure by policy (D-04): exits 0 on every error path.
 * 24h-cached unauthenticated GET of /releases/latest. Renders .design/update-available.md
 * only when a newer version exists AND it is not dismissed AND stage-guard allows.
 *
 * Sourcing guard (Node equivalent): main() runs only when require.main === module.
 * Helpers are exported for tests. This mirrors the bash `[ "${BASH_SOURCE[0]}" = "$0" ]`
 * pattern — sourcing the .sh in tests loads functions without side effects; requiring
 * this .cjs likewise loads exports without running main.
 *
 * Non-obvious behaviors preserved:
 *   - 4-segment semver tuple comparison (handles "v1.0.7.3" off-cadence builds).
 *   - LATEST_TAG safety regex /^v?\d+\.\d+(\.\d+)*$/ before trusting fetched data.
 *   - Body excerpt: stripped of control chars 0x00-0x08, 0x0B, 0x0C, 0x0E-0x1F and
 *     double-quotes (prevents JSON read-back injection — body is display-only).
 *   - C_DELTA allowlist gate (major|minor|patch|off-cadence|none → else "unknown").
 *   - Atomic writes via .tmp.<pid> + rename for both cache and banner files.
 *   - State stage suppression: plan|design|verify silences the banner.
 *   - --refresh flag forces fresh fetch regardless of cache age.
 *   - GDD_UPDATE_DEBUG=1 enables '[gdd update-check]' prefixed stderr logging.
 *   - Cache freshness: mtime < 24h ago (86400s).
 *   - Plugin root: CLAUDE_PLUGIN_ROOT env override, else dirname(__dirname).
 *   - Windows backslashes in PLUGIN_ROOT normalized to forward slashes.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const process = require('node:process');

const CACHE_TTL_SECONDS = 86400; // 24h

// ---- Logger (silent unless GDD_UPDATE_DEBUG=1) ----
function log(...args) {
  if (process.env.GDD_UPDATE_DEBUG === '1') {
    process.stderr.write('[gdd update-check] ' + args.join(' ') + '\n');
  }
}

// ---- Path helpers — derive paths from cwd + plugin root ----
function getPluginRoot() {
  let root = process.env.CLAUDE_PLUGIN_ROOT;
  if (!root || root.length === 0) {
    // dirname of __dirname == project root (hooks/.. == plugin root)
    root = path.resolve(__dirname, '..');
  }
  return root.replace(/\\/g, '/');
}

function getPaths(cwd) {
  const designDir = path.join(cwd || process.cwd(), '.design');
  return {
    designDir,
    cache: path.join(designDir, 'update-cache.json'),
    banner: path.join(designDir, 'update-available.md'),
    config: path.join(designDir, 'config.json'),
    state: path.join(designDir, 'STATE.md'),
    pluginJson: path.join(getPluginRoot(), '.claude-plugin', 'plugin.json'),
  };
}

// ---- Read current plugin version from .claude-plugin/plugin.json ----
function readCurrentTag(pluginJsonPath) {
  const p = pluginJsonPath || getPaths().pluginJson;
  try {
    if (!fs.existsSync(p)) return '';
    const raw = fs.readFileSync(p, 'utf8');
    const obj = JSON.parse(raw);
    const v = obj && typeof obj.version === 'string' ? obj.version : '';
    return v;
  } catch (e) {
    log('readCurrentTag failed:', e && e.message);
    return '';
  }
}

// ---- Semver normalizer: "v1.0.7" → [1,0,7,0]; "v1.0.7.3" → [1,0,7,3] ----
// Returns 4-element array of non-negative integers. Sanitizes each segment to digits only.
function normalizeSemver(input) {
  if (input == null) return [0, 0, 0, 0];
  let t = String(input);
  if (t.startsWith('v')) t = t.slice(1);
  // strip any -pre/-beta suffix after first hyphen
  const hyphenIdx = t.indexOf('-');
  if (hyphenIdx >= 0) t = t.slice(0, hyphenIdx);
  const parts = t.split('.');
  const out = [0, 0, 0, 0];
  for (let i = 0; i < 4; i++) {
    const seg = parts[i] != null ? String(parts[i]).replace(/[^0-9]/g, '') : '';
    out[i] = seg.length === 0 ? 0 : parseInt(seg, 10);
    if (!Number.isFinite(out[i])) out[i] = 0;
  }
  return out;
}

// ---- Classify delta: compare 4-segment tuples ----
// Returns { state: 'newer'|'older'|'same', kind: 'major'|'minor'|'patch'|'off-cadence'|'none' }
function classifyDelta(currentTag, latestTag) {
  const cur = normalizeSemver(currentTag);
  const lat = normalizeSemver(latestTag);
  const kinds = ['major', 'minor', 'patch', 'off-cadence'];
  for (let i = 0; i < 4; i++) {
    if (lat[i] > cur[i]) return { state: 'newer', kind: kinds[i] };
    if (lat[i] < cur[i]) return { state: 'older', kind: kinds[i] };
  }
  return { state: 'same', kind: 'none' };
}

// ---- Cache freshness: returns true if cache exists and mtime is < 24h ago ----
function isCacheFresh(cachePath) {
  try {
    const st = fs.statSync(cachePath);
    if (!st || !st.isFile()) return false;
    const now = Math.floor(Date.now() / 1000);
    const mtime = Math.floor(st.mtimeMs / 1000);
    const age = now - mtime;
    return age < CACHE_TTL_SECONDS;
  } catch (e) {
    return false;
  }
}

// ---- Fetch latest release. Returns Promise<string> with raw body, or '' on failure. ----
function fetchLatest() {
  const url = 'https://api.github.com/repos/hegemonart/get-design-done/releases/latest';
  return new Promise((resolve) => {
    let done = false;
    const finish = (val) => {
      if (done) return;
      done = true;
      resolve(val);
    };
    try {
      const req = https.get(
        url,
        {
          headers: {
            Accept: 'application/vnd.github+json',
            'User-Agent': 'gdd-update-check',
          },
          timeout: 3000,
        },
        (res) => {
          // Follow one redirect (3xx). GitHub API rarely redirects but be defensive.
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            const redirected = https.get(
              res.headers.location,
              {
                headers: {
                  Accept: 'application/vnd.github+json',
                  'User-Agent': 'gdd-update-check',
                },
                timeout: 3000,
              },
              (r2) => {
                if (r2.statusCode < 200 || r2.statusCode >= 300) {
                  r2.resume();
                  log('fetch redirect status', r2.statusCode);
                  return finish('');
                }
                const chunks = [];
                r2.on('data', (c) => chunks.push(c));
                r2.on('end', () => finish(Buffer.concat(chunks).toString('utf8')));
                r2.on('error', (e) => {
                  log('redirect read error', e && e.message);
                  finish('');
                });
              }
            );
            redirected.on('error', (e) => {
              log('redirect request error', e && e.message);
              finish('');
            });
            redirected.on('timeout', () => {
              try { redirected.destroy(); } catch (_) {}
              finish('');
            });
            return;
          }
          if (res.statusCode < 200 || res.statusCode >= 300) {
            res.resume();
            log('fetch status', res.statusCode);
            return finish('');
          }
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => finish(Buffer.concat(chunks).toString('utf8')));
          res.on('error', (e) => {
            log('read error', e && e.message);
            finish('');
          });
        }
      );
      req.on('timeout', () => {
        try { req.destroy(); } catch (_) {}
        log('timeout');
        finish('');
      });
      req.on('error', (e) => {
        log('request error', e && e.message);
        finish('');
      });
    } catch (e) {
      log('fetch threw', e && e.message);
      finish('');
    }
  });
}

// ---- Extract tag_name from release JSON. Returns '' on failure. ----
function extractTag(raw) {
  if (!raw || typeof raw !== 'string') return '';
  try {
    const obj = JSON.parse(raw);
    return obj && typeof obj.tag_name === 'string' ? obj.tag_name : '';
  } catch (e) {
    log('extractTag parse error:', e && e.message);
    return '';
  }
}

// ---- Extract body from release JSON. Slices to 500 chars, strips ctrl chars + double-quotes. ----
function extractBody(raw) {
  if (!raw || typeof raw !== 'string') return '';
  try {
    const obj = JSON.parse(raw);
    let body = obj && typeof obj.body === 'string' ? obj.body : '';
    body = body.slice(0, 500);
    // Strip control chars: 0x00-0x08, 0x0B, 0x0C, 0x0E-0x1F
    // eslint-disable-next-line no-control-regex
    body = body.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
    // Strip double-quotes (display-only, prevents JSON read-back injection)
    body = body.replace(/"/g, '');
    return body;
  } catch (e) {
    log('extractBody parse error:', e && e.message);
    return '';
  }
}

// ---- Read .design/STATE.md stage field. Returns "brief"|"explore"|"plan"|"design"|"verify"|"" ----
function readStateStage(statePath) {
  const p = statePath || getPaths().state;
  try {
    if (!fs.existsSync(p)) return '';
    const raw = fs.readFileSync(p, 'utf8');
    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
      const m = line.match(/^stage:\s*"?([^"\s]+)"?/);
      if (m) return m[1];
    }
    return '';
  } catch (e) {
    log('readStateStage failed:', e && e.message);
    return '';
  }
}

// ---- Read .design/config.json#update_dismissed. Returns tag string or ''. ----
function readDismissed(configPath) {
  const p = configPath || getPaths().config;
  try {
    if (!fs.existsSync(p)) return '';
    const raw = fs.readFileSync(p, 'utf8');
    try {
      const obj = JSON.parse(raw);
      const v = obj && typeof obj.update_dismissed === 'string' ? obj.update_dismissed : '';
      return v;
    } catch (_) {
      // Fall back to regex extraction if JSON is malformed — matches bash grep behavior.
      const m = raw.match(/"update_dismissed"\s*:\s*"([^"]+)"/);
      return m ? m[1] : '';
    }
  } catch (e) {
    log('readDismissed failed:', e && e.message);
    return '';
  }
}

// ---- Validate that a tag string is a safe semver before trusting it (CR-02). ----
function isSafeSemverTag(tag) {
  if (!tag || typeof tag !== 'string') return false;
  return /^v?\d+\.\d+(\.\d+)*$/.test(tag);
}

// ---- Atomic write: write to .tmp.<pid> then rename. On any error, attempt cleanup. ----
function atomicWrite(targetPath, contents) {
  const tmp = `${targetPath}.tmp.${process.pid}`;
  try {
    fs.writeFileSync(tmp, contents);
    fs.renameSync(tmp, targetPath);
    return true;
  } catch (e) {
    log('atomicWrite failed:', e && e.message);
    try { fs.unlinkSync(tmp); } catch (_) {}
    return false;
  }
}

// ---- Build the JSON cache contents. Body excerpt is JSON-string-escaped. ----
function buildCacheJson({ checkedAt, currentTag, latestTag, deltaKind, isNewer, bodyExcerpt }) {
  // Match the bash output format closely: newlines and 2-space indent.
  // JSON.stringify the body to handle escape sequences cleanly.
  const escapedBody = JSON.stringify(bodyExcerpt || '').slice(1, -1); // strip outer quotes
  const lines = [
    '{',
    `  "checked_at": ${checkedAt},`,
    `  "current_tag": "${currentTag}",`,
    `  "latest_tag": "${latestTag}",`,
    `  "delta": "${deltaKind}",`,
    `  "is_newer": ${isNewer ? 'true' : 'false'},`,
    `  "changelog_excerpt": "${escapedBody}"`,
    '}',
    '',
  ];
  return lines.join('\n');
}

// ---- Read cache and extract the four fields the main flow consumes. ----
function readCache(cachePath) {
  try {
    const raw = fs.readFileSync(cachePath, 'utf8');
    try {
      const obj = JSON.parse(raw);
      return {
        latest_tag: typeof obj.latest_tag === 'string' ? obj.latest_tag : '',
        delta: typeof obj.delta === 'string' ? obj.delta : '',
        is_newer: obj.is_newer === true,
        changelog_excerpt:
          typeof obj.changelog_excerpt === 'string'
            ? obj.changelog_excerpt.replace(/\\n/g, '\n')
            : '',
      };
    } catch (_) {
      // Regex fallback to mirror the bash grep+sed pipeline (handles slightly malformed caches).
      const get = (key) => {
        const m = raw.match(new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`));
        return m ? m[1] : '';
      };
      const newerMatch = raw.match(/"is_newer"\s*:\s*(true|false)/);
      return {
        latest_tag: get('latest_tag'),
        delta: get('delta'),
        is_newer: newerMatch ? newerMatch[1] === 'true' : false,
        changelog_excerpt: get('changelog_excerpt').replace(/\\n/g, '\n'),
      };
    }
  } catch (e) {
    log('readCache failed:', e && e.message);
    return null;
  }
}

// ---- Banner renderer ----
function buildBanner({ displayCurrent, latestTag, deltaKind, body }) {
  const bar = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  const lines = [];
  lines.push(bar);
  lines.push(` 📦 Plugin update: ${displayCurrent} → ${latestTag} (${deltaKind})`);
  if (body && body.length > 0) {
    lines.push(body);
  }
  lines.push(' Install: /gdd:update   Dismiss: /gdd:check-update --dismiss');
  lines.push(bar);
  lines.push('');
  return lines.join('\n');
}

// ---- Main control flow. argv is process.argv-style; defaults to process.argv. ----
async function main(argv) {
  argv = argv || process.argv.slice(2);
  const paths = getPaths();

  // Ensure .design/ exists (belt+suspenders — bootstrap normally creates it).
  try {
    fs.mkdirSync(paths.designDir, { recursive: true });
  } catch (_) {
    return 0;
  }

  const currentTag = readCurrentTag(paths.pluginJson);
  if (!currentTag) {
    log('no plugin.json or no current version parsed');
    return 0;
  }
  const displayCurrent = 'v' + currentTag.replace(/^v/, '');

  let forceRefresh = false;
  for (const arg of argv) {
    if (arg === '--refresh') forceRefresh = true;
  }

  // 1. Populate cache if missing/stale or forced.
  if (forceRefresh || !isCacheFresh(paths.cache)) {
    let raw = '';
    try {
      raw = await fetchLatest();
    } catch (_) {
      raw = '';
    }
    if (raw && raw.length > 0) {
      const latestTagRaw = extractTag(raw);
      const bodyExcerpt = extractBody(raw);
      let latestTag = latestTagRaw;
      if (!isSafeSemverTag(latestTag)) {
        log(`LATEST_TAG '${latestTag}' failed semver safety check — aborting cache write`);
        latestTag = '';
      }
      if (latestTag) {
        const delta = classifyDelta(displayCurrent, latestTag);
        const isNewer = delta.state === 'newer';
        const checkedAt = Math.floor(Date.now() / 1000);
        const json = buildCacheJson({
          checkedAt,
          currentTag: displayCurrent,
          latestTag,
          deltaKind: delta.kind,
          isNewer,
          bodyExcerpt,
        });
        atomicWrite(paths.cache, json);
      }
    }
  }

  // 2. Read cache (whether freshly written or still valid).
  if (!fs.existsSync(paths.cache)) {
    return 0; // no cache, nothing to do — silent exit
  }
  const cache = readCache(paths.cache);
  if (!cache) return 0;

  const cLatest = cache.latest_tag;
  let cDelta = cache.delta;
  // Allowlist-gate cDelta before it reaches any banner context (WR-04).
  const allowedDeltas = new Set(['major', 'minor', 'patch', 'off-cadence', 'none']);
  if (!allowedDeltas.has(cDelta)) cDelta = 'unknown';
  const cNewer = cache.is_newer === true;
  const cBody = cache.changelog_excerpt || '';

  // 3. Gate: if cache says not newer, remove any stale banner and exit.
  if (!cNewer) {
    try { fs.unlinkSync(paths.banner); } catch (_) {}
    return 0;
  }

  // 4. Dismissal gate (D-13): if user already dismissed this exact tag, suppress.
  const dismissed = readDismissed(paths.config);
  if (dismissed && dismissed === cLatest) {
    try { fs.unlinkSync(paths.banner); } catch (_) {}
    return 0;
  }

  // 5. State-machine guard (D-11/D-12): suppress during plan|design|verify.
  const stage = readStateStage(paths.state);
  if (stage === 'plan' || stage === 'design' || stage === 'verify') {
    try { fs.unlinkSync(paths.banner); } catch (_) {}
    return 0;
  }

  // 6. All gates passed — render the banner atomically.
  const banner = buildBanner({
    displayCurrent,
    latestTag: cLatest,
    deltaKind: cDelta,
    body: cBody,
  });
  atomicWrite(paths.banner, banner);

  return 0;
}

// ---- Exports for tests (mirrors bash sourcing pattern) ----
module.exports = {
  // Public helpers (named to match the bash function names where reasonable).
  normalizeSemver,
  classifyDelta,
  isCacheFresh,
  readCurrentTag,
  readStateStage,
  readDismissed,
  fetchLatest,
  extractTag,
  extractBody,
  // Additional helpers useful for tests / orchestrator.
  isSafeSemverTag,
  atomicWrite,
  buildCacheJson,
  buildBanner,
  readCache,
  getPaths,
  getPluginRoot,
  main,
};

// ---- Entry-point guard: only run main when invoked directly (not when required). ----
if (require.main === module) {
  // Always exit 0 (silent-on-failure). Promise rejections also exit 0.
  main(process.argv.slice(2))
    .then(() => process.exit(0))
    .catch((e) => {
      log('main threw:', e && e.message);
      process.exit(0);
    });
}
