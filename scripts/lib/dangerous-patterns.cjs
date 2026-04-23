'use strict';
/**
 * scripts/lib/dangerous-patterns.cjs — canonical dangerous-shell pattern list
 * + Unicode NFKC + ANSI-strip + zero-width/bidi normalization used by
 * hooks/gdd-bash-guard.js and any downstream audit tooling.
 *
 * Contract: exports
 *   - normalize(s): string  — NFKC + ANSI strip + zero-width/bidi strip
 *   - patterns: Array<{name, regex, description, severity}>
 *   - match(command): { matched: boolean, pattern?, description?, severity? }
 *
 * Severity levels: 'critical' (system-destroying), 'high' (data-destroying / credential),
 * 'medium' (destructive but scoped).
 */

const ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]/g;
const INVISIBLE_RE = /[\u200B-\u200D\u2060\uFEFF\u202A-\u202E]/g;

function normalize(s) {
  if (typeof s !== 'string') return '';
  return s.normalize('NFKC').replace(ANSI_RE, '').replace(INVISIBLE_RE, '');
}

// Hex-decode helper so obfuscated `\x72\x6d` attacks land in the same pattern space.
function hexDecodedVariant(s) {
  return s.replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

// Ordered: critical first so the first match is always the worst.
const patterns = [
  // ── filesystem destruction ────────────────────────────────────────────
  { name: 'rm-rf-root',             regex: /\brm\s+-[rRfF]+\s+\/(\s|$)/, description: 'rm -rf / — root filesystem deletion', severity: 'critical' },
  { name: 'rm-rf-no-preserve-root', regex: /\brm\s+-[rRfF]+\s+(--no-preserve-root)/, description: 'rm -rf with --no-preserve-root', severity: 'critical' },
  { name: 'rm-rf-home',             regex: /\brm\s+-[rRfF]+\s+(~|\/home(\s|\/|$))/, description: 'rm -rf of home directory', severity: 'critical' },
  { name: 'rm-rf-etc',              regex: /\brm\s+-[rRfF]+\s+\/etc(\s|\/|$)/, description: 'rm -rf of /etc', severity: 'critical' },
  { name: 'rm-rf-wildcard-root',    regex: /\brm\s+-[rRfF]+\s+\/\*/, description: 'rm -rf /*', severity: 'critical' },
  { name: 'rm-rf-usr',              regex: /\brm\s+-[rRfF]+\s+\/usr(\s|\/|$)/, description: 'rm -rf /usr', severity: 'critical' },
  { name: 'rm-rf-var',              regex: /\brm\s+-[rRfF]+\s+\/var(\s|\/|$)/, description: 'rm -rf /var', severity: 'critical' },
  { name: 'fork-bomb',              regex: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, description: 'classic :(){ :|:& };: fork bomb', severity: 'critical' },

  // ── disk / device mutation ───────────────────────────────────────────
  { name: 'dd-zero-to-device',      regex: /\bdd\s+if=\/dev\/(zero|random|urandom)\s+of=\/dev\/(sd|hd|nvme)/, description: 'dd overwrite of block device', severity: 'critical' },
  { name: 'mkfs-device',            regex: /\bmkfs(\.[a-z0-9]+)?\s+\/dev\//, description: 'mkfs on a block device', severity: 'critical' },
  { name: 'redirect-to-device',     regex: />\s*\/dev\/(sd|hd|nvme)[a-z]\d*/, description: 'shell redirect overwrites a block device', severity: 'critical' },

  // ── permission escalation ────────────────────────────────────────────
  { name: 'chmod-777',              regex: /\bchmod\s+(-[A-Za-z]+\s+)?777\b/, description: 'chmod 777 — world-writable permissions', severity: 'high' },
  { name: 'chmod-recursive-world',  regex: /\bchmod\s+-R\s+[0-7]*[0-7]7[0-7]\b/, description: 'chmod -R with world-writable bits', severity: 'high' },
  { name: 'chown-root-recursive',   regex: /\bchown\s+-R\s+root(:root)?\s+\//, description: 'chown -R root on absolute path', severity: 'high' },

  // ── pipe to shell ─────────────────────────────────────────────────────
  { name: 'curl-pipe-sh',           regex: /\bcurl\s[^|;&\n]*\|\s*(sh|bash|zsh|sudo\s+sh|sudo\s+bash)\b/i, description: 'curl … | sh  (remote-code execution)', severity: 'critical' },
  { name: 'wget-pipe-sh',           regex: /\bwget\b[^|;&\n]*\|\s*(sh|bash|zsh|sudo\s+sh|sudo\s+bash)\b/i, description: 'wget … | sh  (remote-code execution)', severity: 'critical' },
  { name: 'fetch-pipe-sh',          regex: /\bfetch\s[^|;&\n]*\|\s*(sh|bash)\b/i, description: 'fetch … | sh', severity: 'critical' },
  { name: 'eval-curl',              regex: /\beval\s*"?\s*\$\s*\(\s*(curl|wget)/i, description: 'eval $(curl|wget …) — remote-code execution via eval', severity: 'critical' },

  // ── git destruction ─────────────────────────────────────────────────
  { name: 'git-reset-hard-HEAD',    regex: /\bgit\s+reset\s+--hard\s*(HEAD)?(\s|$)/, description: 'git reset --hard (unscoped) — discards uncommitted work', severity: 'high' },
  { name: 'git-clean-fd',           regex: /\bgit\s+clean\s+-[a-z]*[fF][a-z]*[dD][a-z]*\b/, description: 'git clean -fd — untracked file wipe', severity: 'high' },
  { name: 'git-push-force-main',    regex: /\bgit\s+push\s+(--force|-f)(\s+\S+)?\s+(main|master|trunk)/i, description: 'git push --force to a protected branch', severity: 'high' },
  { name: 'git-branch-delete-main', regex: /\bgit\s+branch\s+-D\s+(main|master|trunk)\b/i, description: 'git branch -D on the main branch', severity: 'high' },
  { name: 'git-filter-repo',        regex: /\bgit\s+filter-(branch|repo)\s+/, description: 'git history rewrite', severity: 'high' },
  { name: 'git-checkout-all',       regex: /\bgit\s+checkout\s+\.\s*$/, description: 'git checkout . — overwrites all uncommitted edits', severity: 'medium' },

  // ── system mutation / config ────────────────────────────────────────
  { name: 'sed-inplace-etc',        regex: /\bsed\s+-i\s+[^\n]*\/etc\//, description: 'sed -i on /etc/* config', severity: 'high' },
  { name: 'shutdown-now',           regex: /\b(shutdown|halt|poweroff|reboot)\s+(-[a-z]\s+)*(now|0|\+0)\b/, description: 'shutdown/halt/reboot now', severity: 'high' },
  { name: 'init-0-6',               regex: /\binit\s+[06]\b/, description: 'init 0/6 — system halt or reboot', severity: 'high' },

  // ── process nuking ────────────────────────────────────────────────
  { name: 'kill-all-pgrep',         regex: /\bkill\s+-9\s+\$\(\s*pgrep/, description: 'kill -9 $(pgrep …) — broad process kill', severity: 'medium' },
  { name: 'killall-9',              regex: /\bkillall\s+-9\b/, description: 'killall -9', severity: 'medium' },
  { name: 'pkill-9-dotall',         regex: /\bpkill\s+-9\s+-f\s+['"]?\.\*['"]?/, description: 'pkill -9 -f .* — process kill everything', severity: 'high' },

  // ── credential exfil ────────────────────────────────────────────────
  { name: 'env-to-curl',            regex: /\b(cat\s+)?\.env(\.[a-z]+)?\s*\|\s*curl/i, description: 'exfil .env via curl', severity: 'critical' },
  { name: 'ssh-key-to-curl',        regex: /\bcat\s+~?\/?\.ssh\/id_(rsa|ed25519|ecdsa|dsa)\b[^\n]*\|\s*(curl|nc|ssh)/, description: 'ssh private-key exfiltration', severity: 'critical' },
  { name: 'printenv-to-curl',       regex: /\bprintenv\b[^\n]*\|\s*(curl|wget|nc)/, description: 'printenv | curl — environment exfiltration', severity: 'critical' },
  { name: 'tar-home-to-netcat',     regex: /\btar\s+c[fzvj]+\s+-\s+~[^\n]*\|\s*(nc|ssh|curl)/, description: 'tar ~ | nc|ssh — home-directory exfil', severity: 'critical' },
  { name: 'aws-credentials-read',   regex: /\bcat\s+~\/\.aws\/credentials\b/, description: 'reading AWS credentials file', severity: 'high' },

  // ── shell mutation / obfuscation ────────────────────────────────────
  { name: 'bash-decode-base64',     regex: /\becho\s+[A-Za-z0-9+\/=]{40,}\s*\|\s*base64\s+-d\s*\|\s*(sh|bash)/, description: 'base64 decode | shell — obfuscated exec', severity: 'critical' },
  { name: 'exec-python-c',          regex: /\bpython[23]?\s+-c\s+["']import\s+os[^"']*os\.(system|popen|exec)\b/i, description: 'python -c inline os.system shell-out', severity: 'high' },
  { name: 'bash-c-remote',          regex: /\bbash\s+-c\s+["'][^"']*(curl|wget)\s+[^"']*\|/, description: 'bash -c with embedded curl|wget pipe', severity: 'critical' },

  // ── path traversal ────────────────────────────────────────────────
  { name: 'path-traversal-deep',    regex: /(\.\.\/){5,}/, description: '5+ chained ../../../../../ traversal', severity: 'medium' },

  // ── npm / package registry abuse ────────────────────────────────────
  { name: 'npm-install-remote-tgz', regex: /\bnpm\s+(install|i)\s+https?:\/\/[^\s]+\.tgz/, description: 'npm install from an arbitrary HTTP tarball URL', severity: 'high' },
  { name: 'npm-publish-force',      regex: /\bnpm\s+publish\s+(--force|-f)\b/, description: 'npm publish --force (bypasses version checks)', severity: 'medium' },
  { name: 'npm-run-in-quotes-eval', regex: /\bnpm\s+run\s+\S+\s+--\s+--?eval=/, description: 'npm run … --eval= (code injection through script runner)', severity: 'medium' },

  // ── docker / container escape ───────────────────────────────────────
  { name: 'docker-run-privileged',  regex: /\bdocker\s+run\b[^\n]*--privileged\b[^\n]*(--|[^\n]*(-v|--volume)\s+\/:\/host|\/var\/run\/docker\.sock)/, description: 'docker run --privileged mounting host fs / docker socket', severity: 'critical' },
  { name: 'docker-socket-mount',    regex: /-v\s+\/var\/run\/docker\.sock:\/var\/run\/docker\.sock/, description: 'host docker socket mount (escape vector)', severity: 'high' },

  // ── firewall / networking flip ──────────────────────────────────────
  { name: 'iptables-flush',         regex: /\biptables\s+-F(\s|$)/, description: 'iptables -F — flush all firewall rules', severity: 'high' },
  { name: 'ufw-disable',            regex: /\bufw\s+disable\b/, description: 'ufw disable — firewall off', severity: 'high' },

  // ── sudo bypass ────────────────────────────────────────────────────
  { name: 'sudo-nopasswd-write',    regex: /\becho\s+[^\n]*NOPASSWD[^\n]*\|\s*sudo\s+tee\s+\/etc\/sudoers/, description: 'sudo NOPASSWD injection via tee', severity: 'critical' },
];

function match(command) {
  const normalized = normalize(command);
  const hexVariant = hexDecodedVariant(normalized);
  for (const p of patterns) {
    if (p.regex.test(normalized) || p.regex.test(hexVariant)) {
      return { matched: true, pattern: p.name, description: p.description, severity: p.severity };
    }
  }
  return { matched: false };
}

module.exports = { normalize, patterns, match, _INVISIBLE_RE: INVISIBLE_RE, _ANSI_RE: ANSI_RE };
