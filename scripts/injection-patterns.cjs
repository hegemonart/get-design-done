'use strict';
// Shared prompt-injection patterns — single source of truth for both
// hooks/gdd-read-injection-scanner.js (runtime hook) and
// scripts/run-injection-scanner-ci.cjs (CI scanner).
// Add new patterns here; both consumers pick them up automatically.

const INJECTION_PATTERNS = [
  { name: 'ignore previous',         re: /ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/i },
  { name: 'disregard previous',      re: /disregard\s+(all\s+)?(previous|prior|above)\s+instructions?/i },
  { name: 'you are now a different', re: /you\s+are\s+now\s+a\s+different/i },
  { name: 'system: you are',         re: /system\s*:\s*you\s+are/i },
  { name: 'role tag injection',      re: /<\s*\/?\s*(system|assistant|human)\s*>/i },
  { name: '[INST] fragment',         re: /\[INST\]/i },
  { name: '### instruction fragment',re: /###\s*instruction/i },
];

module.exports = { INJECTION_PATTERNS };
