'use strict';
// Phase 41 — hone-detect CLI. A regex anti-pattern scanner over LOCAL files: it walks a file or
// directory and runs each BAN-NN rule's matcher against the file text. There is exactly one engine
// (regex over file content) and it never touches the network or any optional dependency, so the
// SC#10 network-isolation scan stays clean and the plugin keeps its zero-runtime-dep guarantee.
//
//   hone-detect <path> [--json] [--rule BAN-NN]
//
// Exit codes: 0 = clean · 2 = findings · 1 = invocation error.

const engine = require('./engine.cjs');

const HELP = `hone-detect — scan local HTML/CSS/JSX for GDD anti-patterns (BAN-NN).

Usage:
  hone-detect <path> [options]

Arguments:
  <path>            A file or directory (scanned recursively). Regex anti-pattern scan over local files.

Options:
  --json            Machine-readable JSON output.
  --rule <BAN-NN>   Run a single rule (e.g. --rule BAN-08).
  -h, --help        This help.

Exit codes: 0 clean · 2 findings · 1 invocation error.`;

function parseArgs(argv) {
  const opts = { path: null, json: false, rule: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') opts.json = true;
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

/**
 * Report the active engine. There is exactly one path: regex over file text (see engine.cjs#run).
 * Returns { mode } so callers and the --json report can label output truthfully.
 */
function selectEngine() {
  return { mode: 'regex-fast' };
}

function renderHuman(result, mode) {
  const lines = [];
  for (const f of result.findings) {
    lines.push(`${f.file}:${f.line}:${f.column}  ${f.severity.toUpperCase()}  ${f.ruleId} ${f.name} — ${f.references[0]}`);
  }
  const errs = result.findings.filter((f) => f.severity === 'error').length;
  const warns = result.findings.length - errs;
  lines.push('');
  lines.push(`hone-detect (${mode}): ${result.filesScanned} file(s), ${result.findings.length} finding(s) — ${errs} error, ${warns} warn.`);
  return lines.join('\n');
}

/**
 * @param {string[]} argv  process.argv.slice(2)
 * @param {{ cwd?: string, log?: fn, err?: fn }} [io]  injectable for tests
 * @returns {number} exit code
 */
function main(argv, io) {
  const o = io || {};
  const log = o.log || ((s) => process.stdout.write(s + '\n'));
  const err = o.err || ((s) => process.stderr.write(s + '\n'));
  const cwd = o.cwd || process.cwd();
  const opts = parseArgs(argv);

  if (opts.help || (!opts.path && argv.length === 0)) { log(HELP); return opts.help ? 0 : 1; }
  if (!opts.path) { err('hone-detect: missing <path>. See --help.'); return 1; }
  if (opts.rule && !/^BAN-\d{2}$/i.test(opts.rule)) { err(`hone-detect: --rule expects a BAN-NN id (got "${opts.rule}").`); return 1; }

  // URL path is not wired: this is a regex scanner over local files. Never a stack trace.
  if (isUrl(opts.path)) {
    err('hone-detect: URL scanning is not wired in this build; clone the page locally and scan the files instead.');
    return 1;
  }

  const { mode } = selectEngine();

  let result;
  try { result = engine.run(opts.path, { ruleId: opts.rule, cwd }); }
  catch (e) { err('hone-detect: ' + (e && e.message ? e.message : String(e))); return 1; }

  if (opts.json) log(JSON.stringify({ mode, ...result }, null, 2));
  else log(renderHuman(result, mode));

  return result.findings.length > 0 ? 2 : 0;
}

module.exports = { main, parseArgs, isUrl, selectEngine, HELP };

if (require.main === module) process.exit(main(process.argv.slice(2)));
