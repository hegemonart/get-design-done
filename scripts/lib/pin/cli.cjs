'use strict';
/**
 * scripts/lib/pin/cli.cjs — Phase 46 (Skill UX Polish).
 *
 * Thin CLI over scripts/lib/pin/store.cjs. projectRoot is always process.cwd().
 *
 * Usage:
 *   node cli.cjs pin <skill> [--user]
 *   node cli.cjs unpin <skill>
 *   node cli.cjs list
 *
 * Exit codes:
 *   0  action succeeded (at least one file written/removed, or a non-empty list)
 *   1  nothing done (no harness dirs / nothing to remove / empty list)
 *   2  error (bad usage, unknown skill, unexpected failure)
 *
 * Dependency-free CommonJS. Ships in the npm package; runtime-safe.
 */

const path = require('path');

const { pinSkill, unpinSkill, listPins } = require('./store.cjs');

function out(msg) {
  process.stdout.write(msg + '\n');
}
function err(msg) {
  process.stderr.write(msg + '\n');
}

function usage() {
  return [
    'gdd pin - manage pinned skill aliases across installed harness dirs',
    '',
    'Usage:',
    '  node cli.cjs pin <skill> [--user]',
    '  node cli.cjs unpin <skill>',
    '  node cli.cjs list',
    '',
    'Exit codes: 0 ok / 1 nothing done / 2 error.',
  ].join('\n');
}

function runPin(skillId, opts) {
  const projectRoot = process.cwd();
  let res;
  try {
    res = pinSkill({ projectRoot, skillId, user: Boolean(opts.user) });
  } catch (e) {
    err(`pin: ${e.message}`);
    return 2;
  }
  if (res.written.length === 0) {
    err(`pin: no harness skills dirs found under ${projectRoot}${opts.user ? '' : ' (try --user to create them)'}.`);
    for (const s of res.skipped) err(`  skipped ${s.config_dir}: ${s.reason}`);
    return 1;
  }
  out(`Pinned "${skillId}" into ${res.written.length} harness dir(s):`);
  for (const w of res.written) out(`  ${w.config_dir} -> ${path.relative(projectRoot, w.path)}`);
  for (const s of res.skipped) err(`  skipped ${s.config_dir}: ${s.reason}`);
  return 0;
}

function runUnpin(skillId) {
  const projectRoot = process.cwd();
  let res;
  try {
    res = unpinSkill({ projectRoot, skillId });
  } catch (e) {
    err(`unpin: ${e.message}`);
    return 2;
  }
  for (const r of res.refused) err(`  refused ${r.config_dir}: ${r.reason}`);
  if (res.removed.length === 0) {
    err(`unpin: no pinned "${skillId}" stubs removed.`);
    return 1;
  }
  out(`Unpinned "${skillId}" from ${res.removed.length} harness dir(s):`);
  for (const r of res.removed) out(`  ${r.config_dir} -> ${path.relative(projectRoot, r.path)}`);
  return 0;
}

function runList() {
  const projectRoot = process.cwd();
  let pins;
  try {
    pins = listPins(projectRoot);
  } catch (e) {
    err(`list: ${e.message}`);
    return 2;
  }
  if (pins.length === 0) {
    out('No pinned skills found.');
    return 1;
  }
  out(`Pinned skills (${pins.length}):`);
  for (const p of pins) {
    out(`  [${p.config_dir}] ${p.alias} -> source=${p.source} (pinned ${p.pinnedAt})`);
  }
  return 0;
}

/**
 * Pure entry point. argv is the slice AFTER node + script (process.argv.slice(2)).
 * Returns an exit code; never calls process.exit (so tests can call it directly).
 */
function main(argv) {
  const args = Array.isArray(argv) ? argv.slice() : [];
  const cmd = args.shift();

  if (!cmd || cmd === '--help' || cmd === '-h') {
    out(usage());
    return cmd ? 0 : 2;
  }

  if (cmd === 'list') {
    if (args.length) { err(`list: unexpected argument "${args[0]}"`); return 2; }
    return runList();
  }

  if (cmd === 'pin' || cmd === 'unpin') {
    const opts = { user: false };
    const positionals = [];
    for (const a of args) {
      if (a === '--user') opts.user = true;
      else if (a.startsWith('--')) { err(`${cmd}: unknown flag ${a}`); return 2; }
      else positionals.push(a);
    }
    const skillId = positionals[0];
    if (!skillId) { err(`${cmd}: missing <skill> argument`); return 2; }
    if (positionals.length > 1) { err(`${cmd}: unexpected argument "${positionals[1]}"`); return 2; }
    if (cmd === 'unpin' && opts.user) { err('unpin: --user is not valid for unpin'); return 2; }
    return cmd === 'pin' ? runPin(skillId, opts) : runUnpin(skillId);
  }

  err(`unknown command: ${cmd}`);
  err(usage());
  return 2;
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = { main };
