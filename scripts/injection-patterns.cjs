'use strict';
// Shared prompt-injection patterns — single source of truth for both
// hooks/gdd-read-injection-scanner.js (runtime hook) and
// scripts/run-injection-scanner-ci.cjs (CI scanner).
// Add new patterns here; both consumers pick them up automatically.
//
// Phase 14.5 adds three new families: invisible-Unicode obfuscation,
// HTML-comment instruction hijacks, and secret-exfil trigger patterns.

// Zero-width + word-joiner + BOM + bidi overrides. Used for detection
// AND as a normalization stripper for hooks that run scan after NFKC.
const _CONTEXT_INVISIBLE_CHARS = /[\u200B-\u200D\u2060\uFEFF\u202A-\u202E]/;

const INJECTION_PATTERNS = [
  // ── classic prompt-injection verbs ──────────────────────────────────
  { name: 'ignore previous',         re: /ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/i },
  { name: 'disregard previous',      re: /disregard\s+(all\s+)?(previous|prior|above)\s+instructions?/i },
  { name: 'forget previous',         re: /forget\s+(the\s+|all\s+)?(previous|prior|above)/i },
  { name: 'you are now a different', re: /you\s+are\s+now\s+a\s+different/i },
  { name: 'system: you are',         re: /system\s*:\s*you\s+are/i },
  { name: 'role tag injection',      re: /<\s*\/?\s*(system|assistant|human)\s*>/i },
  { name: '[INST] fragment',         re: /\[INST\]/i },
  { name: '### instruction fragment',re: /###\s*instruction/i },

  // ── invisible-Unicode obfuscation (14.5 new family) ─────────────────
  { name: 'invisible-unicode chars', re: _CONTEXT_INVISIBLE_CHARS },
  { name: 'bidi-override instruction', re: /[\u202A-\u202E][^\n]*(ignore|disregard|forget|system\s*:)/i },

  // ── HTML-comment / hidden-element instruction hijack (14.5 new) ─────
  { name: 'html-comment system',      re: /<!--\s*system\s*:/i },
  { name: 'html-comment assistant',   re: /<!--\s*assistant\s*:/i },
  { name: 'html-comment ignore',      re: /<!--\s*(ignore|disregard|forget)\b/i },
  { name: 'hidden div system',        re: /<div\s+[^>]*style\s*=\s*["'][^"']*display\s*:\s*none[^"']*["'][^>]*>\s*(system|ignore|disregard)/i },
  { name: 'hidden span system',       re: /<span\s+[^>]*style\s*=\s*["'][^"']*visibility\s*:\s*hidden[^"']*["'][^>]*>\s*(system|ignore|disregard)/i },
  { name: 'zero-font-size trick',     re: /style\s*=\s*["'][^"']*font-size\s*:\s*0[^"']*["'][^>]*>\s*(ignore|system|disregard)/i },

  // ── secret-exfil trigger patterns (14.5 new) ─────────────────────────
  { name: 'curl-with-api-key-env',    re: /curl\s+[^|\n]*\$\{?[A-Z][A-Z0-9_]*_(KEY|TOKEN|SECRET|PASSWORD|AUTH)\}?/ },
  { name: 'cat-dotenv',               re: /\bcat\s+\.env(\.[a-z]+)?\b/ },
  { name: 'printenv-leak',            re: /\bprintenv\b[^\n]{0,80}\|\s*(curl|wget|nc|ssh)/ },
  { name: 'tar-home-netcat',          re: /\btar\s+c[fzvj]+\s+-\s+~[^\n]*\|\s*(nc|ssh|curl)/ },
  { name: 'env-dot-leak',             re: /process\.env\.[A-Z][A-Z0-9_]*_(KEY|TOKEN|SECRET)\s*[^;,\n]*(fetch|axios|XMLHttpRequest|http\.request)/ },
  { name: 'ssh-key-cat',              re: /\bcat\s+~?\/?\.ssh\/id_(rsa|ed25519|ecdsa|dsa)\b/ },

  // ── dangerous URL schemes + credential links (60.2 / SEC-CI-03) ──────
  // These flow from untrusted markdown (Read hook) and RSS/article ingest.
  // Each regex is anchored tightly to avoid false-positives on the repo's
  // own shipped docs (the CI scan:injection gate scans them) and is
  // linear-time (bounded quantifiers, no nested/overlapping repetition).

  // `javascript:` used as a link/href target. The colon must be directly
  // followed by a non-whitespace payload char — so prose like "JavaScript:"
  // (a sentence colon, followed by a space) and the bare word "JavaScript"
  // do NOT match. Preceded by start-of-string or a non-word char so it
  // anchors on `](javascript:` / `href="javascript:` / `=javascript:`.
  { name: 'javascript: uri',          re: /(?:^|[^\w])javascript:(?=\S)/i },

  // `data:text/html` URIs (optional ;base64). Will NOT match `data:image/…`,
  // nor `data: <word>` prose (colon-space): the literal `text/html` is required.
  { name: 'data:text/html uri',       re: /\bdata:text\/html\b/i },

  // `data:` URI carrying a script payload (covers data: media types beyond
  // text/html). `[^\s<]{0,200}` is a bounded run (no ReDoS) that also
  // EXCLUDES `<`, so it cannot reach across a `<script` that appears BEFORE
  // `data:` on the line (e.g. export-formats.md:27 "…<script> … data: URIs"):
  // there the char after `data:` is a backtick+space, the run stops at the
  // space, and no script marker follows. Requires `data:` to be immediately
  // followed (no space) by payload chars that lead into `<script`/`%3Cscript`.
  { name: 'data: script payload',     re: /data:[^\s<]{0,200}(?:<script|%3Cscript)/i },

  // userinfo-credential URL: `scheme://user:pass@host`. The `:` must appear
  // in the userinfo segment BEFORE the `@`, and both must precede the first
  // `/` of the path (i.e. inside the authority). Mutually-exclusive char
  // classes on the boundary chars keep it linear. Does NOT match
  // `mailto:user@host` (no `://`), bare `user@host` (no `://`), a plain
  // `https://host/path` (no `@`), nor an `@` that appears only in the path.
  { name: 'userinfo credentials url', re: /:\/\/[^/\s:@]+:[^/\s@]*@/ },

  // Secret-bearing query param. Two linear alternatives:
  //   (a) a query KEY named like a credential (token/api_key/secret/…)
  //       followed by `=` and a non-trivial value; OR
  //   (b) any query value matching a redact.cjs secret SHAPE
  //       (sk-ant-/sk-/jwt/AIza/ghp_/gh[sour]_/AKIA/xox…).
  // `[^&\s#]+` and the shape bodies are bounded by their delimiters / fixed
  // lengths — no catastrophic backtracking. Does NOT match benign params
  // like `?q=`, `?lang=en`, `?sort=desc`, `?page=2`.
  {
    name: 'secret-bearing query param',
    re: /[?&](?:access_token|client_secret|api[_-]?key|apikey|token|secret|password|auth)=[^&\s#]+|[?&][\w-]{1,40}=(?:sk-ant-[\w-]{20,}|sk-[\w-]{20,}|eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,}|AIza[\w-]{35}|ghp_[A-Za-z0-9]{36,}|gh[sour]_[A-Za-z0-9]{36,}|AKIA[0-9A-Z]{16}|xox[baprs]-[\w-]{10,})/i,
  },
];

/**
 * Apply patterns to content and return matched pattern names (deduped).
 */
function scan(content) {
  if (typeof content !== 'string' || !content) return [];
  const hits = [];
  for (const { name, re } of INJECTION_PATTERNS) {
    if (re.test(content)) hits.push(name);
  }
  return hits;
}

module.exports = { INJECTION_PATTERNS, _CONTEXT_INVISIBLE_CHARS, scan };
