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
