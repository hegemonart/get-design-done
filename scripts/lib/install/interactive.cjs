'use strict';

// @clack/prompts wrapper for the multi-runtime installer.
//
// runInteractiveInstall walks the user through three steps:
//   1. Multi-select runtimes (with [a] all shortcut).
//   2. Radio: Global vs Local install.
//   3. Confirmation summary.
//
// runInteractiveUninstall walks the user through:
//   1. Multi-select detected-installed runtimes.
//   2. Confirmation summary.
//
// Both return null when the user cancels at any step (ESC / ctrl-c). The
// caller is responsible for translating null into a "cancelled" exit-0
// message.

const { listRuntimes, getRuntime } = require('./runtimes.cjs');
const { detectInstalled } = require('./installer.cjs');

let clackCache = null;
function loadClack() {
  if (clackCache) return clackCache;
  try {
    clackCache = require('@clack/prompts');
  } catch (err) {
    throw new Error(
      [
        'Interactive install requires @clack/prompts.',
        'Install it (npm i @clack/prompts) or pass an explicit runtime flag',
        '(e.g. --claude --global) to skip the interactive session.',
        `Original error: ${err && err.message}`,
      ].join('\n'),
    );
  }
  return clackCache;
}

function isCancel(p, value) {
  return typeof p.isCancel === 'function' ? p.isCancel(value) : false;
}

// Build a one-line picker hint per runtime kind. Multi-artifact entries
// intentionally lack a `files` field (see runtimes.cjs header) — destinations
// are computed by runtime-artifact-layout.cjs from the runtime's configDir.
function hintForRuntime(r) {
  if (r.kind === 'claude-marketplace') return 'marketplace registration';
  if (r.kind === 'multi-artifact') {
    return r.configDirFallback
      ? `installs into ~/${r.configDirFallback}`
      : 'installs skills/commands/agents';
  }
  // Future-proof fallback for any new kind: prefer files[0] when present,
  // then configDirFallback, then a neutral label. Never crash on missing
  // optional fields.
  if (Array.isArray(r.files) && r.files.length > 0) return `drops ${r.files[0]}`;
  if (r.configDirFallback) return `installs into ~/${r.configDirFallback}`;
  return r.kind || 'install target';
}

async function runInteractiveInstall() {
  const p = loadClack();

  p.intro('hone — multi-runtime installer');

  // Tier-2 distribution channels (cursor-marketplace, codex-plugin) carry
  // `configDir: null` per Phase 28.8 — they're out-of-band bundles, not
  // per-user install targets. The interactive picker should hide them; the
  // regular install pipeline already skips them because configDir is null.
  const runtimes = listRuntimes().filter(
    (r) => r.configDir !== null && r.configDirFallback != null,
  );
  const options = runtimes.map((r) => ({
    value: r.id,
    label: r.displayName,
    hint: hintForRuntime(r),
  }));

  const picked = await p.multiselect({
    message: 'Pick the runtimes to install into (space to toggle, [a] all):',
    options,
    required: true,
  });
  if (isCancel(p, picked)) {
    p.cancel('Install cancelled.');
    return null;
  }

  const location = await p.select({
    message: 'Install location:',
    options: [
      { value: 'global', label: 'Global ($HOME-level config dir)' },
      { value: 'local', label: 'Local (current working directory)' },
    ],
    initialValue: 'global',
  });
  if (isCancel(p, location)) {
    p.cancel('Install cancelled.');
    return null;
  }

  const summary = picked
    .map((id) => `  • ${getRuntime(id).displayName}`)
    .join('\n');
  const confirmed = await p.confirm({
    message: `Install into:\n${summary}\nLocation: ${location}\n\nProceed?`,
    initialValue: true,
  });
  if (isCancel(p, confirmed) || confirmed === false) {
    p.cancel('Install cancelled.');
    return null;
  }

  return { runtimes: picked, location };
}

async function runInteractiveUninstall(opts) {
  const p = loadClack();

  p.intro('hone — uninstall');

  const installed = detectInstalled(opts || {});
  if (installed.length === 0) {
    p.note(
      'No runtimes appear to have the hone plugin installed.',
      'Nothing to do.',
    );
    p.outro('Done.');
    return null;
  }

  const options = installed.map((id) => ({
    value: id,
    label: getRuntime(id).displayName,
    hint: 'installed',
  }));

  const picked = await p.multiselect({
    message: 'Pick the runtimes to uninstall from:',
    options,
    required: true,
  });
  if (isCancel(p, picked)) {
    p.cancel('Uninstall cancelled.');
    return null;
  }

  const summary = picked
    .map((id) => `  • ${getRuntime(id).displayName}`)
    .join('\n');
  const confirmed = await p.confirm({
    message: `Uninstall from:\n${summary}\n\nProceed?`,
    initialValue: true,
  });
  if (isCancel(p, confirmed) || confirmed === false) {
    p.cancel('Uninstall cancelled.');
    return null;
  }

  return { runtimes: picked };
}

module.exports = {
  runInteractiveInstall,
  runInteractiveUninstall,
  hintForRuntime,
};
