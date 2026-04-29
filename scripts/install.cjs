#!/usr/bin/env node
'use strict';

// npx @hegemonart/get-design-done
// Multi-runtime installer for the get-design-done plugin.
//
// Runtime selection:
//   • zero-flag in TTY      → @clack/prompts interactive multi-select
//   • zero-flag in non-TTY  → defaults to --claude --global (back-compat)
//   • any explicit flag     → scripted, no prompts
//
// Per-runtime flags: --claude, --opencode, --gemini, --kilo, --codex,
//   --copilot, --cursor, --windsurf, --antigravity, --augment, --trae,
//   --qwen, --codebuddy, --cline. --all selects every runtime.
//
// Modifiers: --global (default) | --local; --uninstall; --dry-run;
//   --config-dir <path>; --help / -h.

const path = require('node:path');

const { listRuntimes, listRuntimeIds } = require('./lib/install/runtimes.cjs');
const { installRuntime, uninstallRuntime } = require('./lib/install/installer.cjs');

function parseArgs(argv) {
  const args = argv.slice(2);
  const flags = new Set();
  let configDir = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--config-dir') {
      configDir = args[++i] || null;
      continue;
    }
    if (a.startsWith('--config-dir=')) {
      configDir = a.slice('--config-dir='.length);
      continue;
    }
    flags.add(a);
  }
  return { flags, configDir };
}

function helpText() {
  const ids = listRuntimes()
    .map((r) => `  --${r.id.padEnd(12)} ${r.displayName}`)
    .join('\n');
  return [
    'npx @hegemonart/get-design-done — install the plugin into one or more runtimes',
    '',
    'Zero-flag in a TTY launches the interactive multi-select.',
    'Zero-flag in a non-TTY (CI, pipes) defaults to --claude --global.',
    '',
    'Per-runtime flags:',
    ids,
    '  --all           Select every runtime',
    '',
    'Modifiers:',
    '  --global        Install at $HOME / $USERPROFILE level (default)',
    '  --local         Install in current working directory',
    '  --uninstall     Remove the plugin from selected runtimes',
    '  --dry-run       Print the diff without writing',
    '  --config-dir D  Override the config directory',
    '  --help, -h      Show this message',
    '',
    'Environment overrides (per-runtime):',
    '  CLAUDE_CONFIG_DIR, OPENCODE_CONFIG_DIR, GEMINI_CONFIG_DIR,',
    '  CODEX_HOME, CURSOR_CONFIG_DIR, … (one per runtime)',
    '',
  ].join('\n');
}

function runtimesFromFlags(flags) {
  if (flags.has('--all')) return listRuntimeIds();
  const picked = [];
  for (const id of listRuntimeIds()) {
    if (flags.has(`--${id}`)) picked.push(id);
  }
  return picked;
}

async function pickRuntimesInteractively(opts) {
  const { runInteractiveInstall, runInteractiveUninstall } = require('./lib/install/interactive.cjs');
  if (opts.uninstall) {
    return runInteractiveUninstall(opts);
  }
  return runInteractiveInstall();
}

function resolveLocalConfigDir(runtime) {
  return path.resolve(process.cwd(), runtime.configDirFallback);
}

function shouldUseInteractive(flags) {
  // Any of these flags means "scripted mode":
  //   per-runtime, --all, --uninstall (with explicit list), --help
  if (flags.has('--all')) return false;
  for (const id of listRuntimeIds()) {
    if (flags.has(`--${id}`)) return false;
  }
  // Bare --uninstall (no runtime list) is itself a trigger for interactive
  // select-which-to-remove flow, so it returns true.
  return Boolean(process.stdout.isTTY) && Boolean(process.stdin.isTTY);
}

function summariseResults(results) {
  const lines = [];
  for (const r of results) {
    const tag = r.dryRun ? '[dry-run] ' : '';
    const status = r.action;
    lines.push(`${tag}• ${r.runtime.padEnd(12)} ${status.padEnd(16)} ${r.path}`);
    if (r.reason) lines.push(`    ${r.reason}`);
    // Phase 26 D-06 — surface the models.json side-effect inline so
    // operators see what was written / would be written / was removed.
    if (r.modelsJson) {
      const m = r.modelsJson;
      const mTag = m.dryRun ? '[dry-run] ' : '';
      lines.push(`${mTag}    ↳ models.json   ${m.action.padEnd(16)} ${m.path}`);
      if (m.reason) lines.push(`        ${m.reason}`);
    }
  }
  return lines.join('\n');
}

async function main() {
  const { flags, configDir } = parseArgs(process.argv);

  if (flags.has('--help') || flags.has('-h')) {
    process.stdout.write(helpText());
    process.exit(0);
  }

  const dryRun = flags.has('--dry-run');
  const uninstall = flags.has('--uninstall');
  const local = flags.has('--local');
  const explicitRuntimes = runtimesFromFlags(flags);

  let runtimes = explicitRuntimes;
  let location = local ? 'local' : 'global';

  if (runtimes.length === 0) {
    if (shouldUseInteractive(flags)) {
      const opts = { uninstall };
      const picked = await pickRuntimesInteractively(opts);
      if (picked == null) {
        process.exit(0);
      }
      runtimes = picked.runtimes;
      if (picked.location) location = picked.location;
    } else {
      // Non-TTY zero-flag fallback: back-compat with v1.23.5 behaviour.
      runtimes = ['claude'];
      location = local ? 'local' : 'global';
    }
  }

  const results = [];
  const { getRuntime } = require('./lib/install/runtimes.cjs');
  for (const id of runtimes) {
    const runtime = getRuntime(id);
    const opts = { dryRun };
    if (configDir) {
      opts.configDir = configDir;
    } else if (location === 'local') {
      opts.configDir = resolveLocalConfigDir(runtime);
    }
    const result = uninstall
      ? uninstallRuntime(id, opts)
      : installRuntime(id, opts);
    results.push(result);
  }

  const verb = uninstall ? 'uninstall' : 'install';
  const allUnchanged = results.length > 0 && results.every((r) => r.action === 'unchanged');
  if (allUnchanged && !dryRun) {
    process.stdout.write(
      [
        `get-design-done is already registered (${runtimes.length} runtime(s) unchanged):`,
        summariseResults(results),
        '',
        'Nothing to do. Restart the affected runtime(s) if you have not yet.',
        '',
      ].join('\n'),
    );
    return;
  }
  process.stdout.write(
    [
      dryRun
        ? `[dry-run] would ${verb} into ${runtimes.length} runtime(s):`
        : `${verb} complete (${runtimes.length} runtime(s)):`,
      summariseResults(results),
      '',
      uninstall
        ? ''
        : 'Restart the affected runtime(s) for the plugin to load.',
      '',
    ].join('\n'),
  );
}

main().catch((err) => {
  if (err && err.code === 'EINSTALLER_BAD_JSON') {
    process.stderr.write(`${err.message}\n`);
  } else {
    process.stderr.write(
      `get-design-done installer error: ${err && err.stack ? err.stack : err}\n`,
    );
  }
  process.exit(1);
});
