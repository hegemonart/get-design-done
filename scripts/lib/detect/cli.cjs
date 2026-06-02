'use strict';
// Phase 41 — gdd-detect CLI. Dep-free by default (regex-fast). The DOM-aware (jsdom) and URL
// (puppeteer) paths are SOFT optionals loaded via try-require — never a package.json dependency, so
// the SC#10 network-isolation scan stays clean and the plugin keeps its zero-runtime-dep guarantee.
//
//   gdd-detect <path> [--json] [--fast] [--rule BAN-NN] [--puppeteer]
//
// Exit codes: 0 = clean · 2 = findings · 1 = invocation error.

const engine = require('./engine.cjs');

const HELP = `gdd-detect — scan HTML/CSS/JSX for GDD anti-patterns (BAN-NN).

Usage:
  gdd-detect <path> [options]

Arguments:
  <path>            A file or directory (scanned recursively), or a http(s):// URL (needs --puppeteer).

Options:
  --json            Machine-readable JSON output.
  --fast            Regex-only; do not load jsdom even if present.
  --rule <BAN-NN>   Run a single rule (e.g. --rule BAN-08).
  --puppeteer       Allow scanning a URL via Puppeteer (an optional, separately-installed dependency).
  -h, --help        This help.

Exit codes: 0 clean · 2 findings · 1 invocation error.`;

function parseArgs(argv) {
  const opts = { path: null, json: false, fast: false, rule: null, puppeteer: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') opts.json = true;
    else if (a === '--fast') opts.fast = true;
    else if (a === '--puppeteer') opts.puppeteer = true;
    else if (a === '-h' || a === '--help') opts.help = true;
    else if (a === '--rule') opts.rule = argv[++i] || null;
    else if (a.startsWith('--rule=')) opts.rule = a.slice('--rule='.length);
    else if (!a.startsWith('-') && opts.path === null) opts.path = a;
  }
  return opts;
}

function isUrl(p) {
  return /^https?:\/\//i.test(String(p || ''));
}

/** Select the detection engine. Returns { mode, warning }. Regex-fast is the dep-free default. */
function selectEngine(opts, requireFn) {
  if (opts.fast) return { mode: 'regex-fast', warning: null };
  let hasJsdom = false;
  try { requireFn('jsdom'); hasJsdom = true; } catch { hasJsdom = false; }
  if (hasJsdom) return { mode: 'dom-aware', warning: null };
  return { mode: 'regex-fast', warning: 'jsdom not installed — using regex-fast (install jsdom for DOM-aware mode, or pass --fast to silence this).' };
}

function renderHuman(result, mode) {
  const lines = [];
  for (const f of result.findings) {
    lines.push(`${f.file}:${f.line}:${f.column}  ${f.severity.toUpperCase()}  ${f.ruleId} ${f.name} — ${f.references[0]}`);
  }
  const errs = result.findings.filter((f) => f.severity === 'error').length;
  const warns = result.findings.length - errs;
  lines.push('');
  lines.push(`gdd-detect (${mode}): ${result.filesScanned} file(s), ${result.findings.length} finding(s) — ${errs} error, ${warns} warn.`);
  return lines.join('\n');
}

/**
 * @param {string[]} argv  process.argv.slice(2)
 * @param {{ cwd?: string, log?: fn, err?: fn, requireFn?: fn }} [io]  injectable for tests
 * @returns {number} exit code
 */
function main(argv, io) {
  const o = io || {};
  const log = o.log || ((s) => process.stdout.write(s + '\n'));
  const err = o.err || ((s) => process.stderr.write(s + '\n'));
  const requireFn = o.requireFn || require;
  const cwd = o.cwd || process.cwd();
  const opts = parseArgs(argv);

  if (opts.help || (!opts.path && argv.length === 0)) { log(HELP); return opts.help ? 0 : 1; }
  if (!opts.path) { err('gdd-detect: missing <path>. See --help.'); return 1; }
  if (opts.rule && !/^BAN-\d{2}$/i.test(opts.rule)) { err(`gdd-detect: --rule expects a BAN-NN id (got "${opts.rule}").`); return 1; }

  // URL path → Puppeteer (optional, separately installed). Never a stack trace.
  if (isUrl(opts.path)) {
    if (!opts.puppeteer) { err('gdd-detect: scanning a URL requires --puppeteer. Pass --puppeteer (and `npm i -D puppeteer`) to enable URL scans.'); return 1; }
    let hasPuppeteer = false;
    try { requireFn('puppeteer'); hasPuppeteer = true; } catch { hasPuppeteer = false; }
    if (!hasPuppeteer) { err('gdd-detect: --puppeteer given but puppeteer is not installed. Install it with `npm i -D puppeteer` (it stays an optional dependency).'); return 1; }
    err('gdd-detect: URL scanning is not wired in this build; clone the page locally and scan the files instead.');
    return 1;
  }

  const { mode, warning } = selectEngine(opts, requireFn);
  if (warning && !opts.json) err('gdd-detect: ' + warning);

  let result;
  try { result = engine.run(opts.path, { ruleId: opts.rule, cwd }); }
  catch (e) { err('gdd-detect: ' + (e && e.message ? e.message : String(e))); return 1; }

  if (opts.json) log(JSON.stringify({ mode, ...result }, null, 2));
  else log(renderHuman(result, mode));

  return result.findings.length > 0 ? 2 : 0;
}

module.exports = { main, parseArgs, isUrl, selectEngine, HELP };

if (require.main === module) process.exit(main(process.argv.slice(2)));
