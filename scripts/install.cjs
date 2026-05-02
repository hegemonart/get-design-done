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

const { listRuntimes, listRuntimeIds, detectInstalledPeers, listPeerCapableRuntimes } = require('./lib/install/runtimes.cjs');
const { installRuntime, uninstallRuntime } = require('./lib/install/installer.cjs');
const fs = require('node:fs');

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
    '  --no-peer-prompt  Suppress the post-install peer-CLI detection nudge',
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

  // v1.27.1 — Plan 27-11 wiring: post-install peer-CLI detection nudge.
  // Fires only on real install (not uninstall, not dry-run) when not
  // suppressed by --no-peer-prompt. Silently skips when no peers detected.
  // Always opt-in: writes .design/config.json#peer_cli.enabled_peers
  // ONLY on explicit y/Y; default is no.
  if (!uninstall && !dryRun && !flags.has('--no-peer-prompt')) {
    try {
      await maybeNudgePeerCli({ flags });
    } catch (e) {
      // Nudge is non-critical. Surface a one-line warning but don't fail
      // the install — the plugin is fully functional without peer-CLI.
      process.stderr.write(
        `\n[peer-cli] post-install nudge skipped: ${e && e.message ? e.message : e}\n`,
      );
    }
  }
}

// v1.27.1 — Plan 27-11: post-install nudge. Detects installed peer CLIs,
// asks the user (interactive y/N) whether to wire them as peers, writes
// .design/config.json#peer_cli.enabled_peers on yes. Default = NO (opt-in).
async function maybeNudgePeerCli({ flags }) {
  const detected = detectInstalledPeers();
  if (!detected || detected.length === 0) {
    // Nothing detected — silent skip. (No bad UX of "we found 0 peers".)
    return;
  }

  // Build the human-readable peer line for the prompt.
  const allPeerCapable = listPeerCapableRuntimes();
  const detectedDisplay = detected
    .map((id) => {
      const r = allPeerCapable.find((x) => x.id === id);
      return r && r.displayName ? r.displayName : id;
    })
    .join(', ');

  process.stdout.write(
    [
      '',
      '✓ Detected peer CLIs: ' + detectedDisplay,
      '',
      'gdd v1.27.0 introduced optional peer-CLI delegation. With your',
      'agents\\u2019 frontmatter `delegate_to:` set, gdd can route specific',
      'roles through these peer CLIs (cost or quality wins per Phase 23.5',
      'bandit). You can change this anytime via .design/config.json.',
      '',
    ].join('\n'),
  );

  // Decide interactive vs scripted. shouldUseInteractive lives in this
  // file; reuse it. If non-TTY, default to no (silent opt-out) so CI
  // installers don't hang waiting for input.
  let confirmed = false;
  if (shouldUseInteractive(flags)) {
    try {
      const clack = require('@clack/prompts');
      const ans = await clack.confirm({
        message: 'Enable peer-CLI delegation for these peers?',
        initialValue: false,
      });
      confirmed = (ans === true);
    } catch {
      // @clack/prompts unavailable — silently default to no.
      confirmed = false;
    }
  }

  if (!confirmed) {
    process.stdout.write(
      'Skipped — peer-CLI delegation remains disabled.\n' +
      'Enable later by adding to .design/config.json:\n' +
      '  { "peer_cli": { "enabled_peers": ' + JSON.stringify(detected) + ' } }\n\n',
    );
    return;
  }

  // Write the allowlist. Merge with any existing .design/config.json.
  const cfgPath = path.join(process.cwd(), '.design', 'config.json');
  let cfg = {};
  try {
    if (fs.existsSync(cfgPath)) {
      cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    }
  } catch {
    cfg = {};
  }
  if (!cfg.peer_cli || typeof cfg.peer_cli !== 'object') cfg.peer_cli = {};
  cfg.peer_cli.enabled_peers = detected;
  fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n');
  process.stdout.write(
    `✓ Wrote .design/config.json — peer-CLI enabled for: ${detected.join(', ')}\n` +
    '  Set delegate_to: <peer>-<role> on agent frontmatter to opt agents in.\n' +
    '  See docs/PEER-DELEGATION.md for the full ops guide.\n\n',
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
