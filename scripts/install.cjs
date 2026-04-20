#!/usr/bin/env node
'use strict';

// npx @hegemonart/get-design-done
// One-command installer for the get-design-done Claude Code plugin.
//
// Registers the github.com/hegemonart/get-design-done marketplace and enables
// the plugin in ~/.claude/settings.json (or $CLAUDE_CONFIG_DIR/settings.json).
// Claude Code fetches the plugin payload from the marketplace on next launch.
//
// Usage:
//   npx @hegemonart/get-design-done           # install
//   npx @hegemonart/get-design-done --dry-run # show what would change
//   npx @hegemonart/get-design-done --help

const fs = require('fs');
const path = require('path');
const os = require('os');

const REPO = 'hegemonart/get-design-done';
const MARKETPLACE_NAME = 'get-design-done';
const PLUGIN_NAME = 'get-design-done';
const ENABLED_KEY = `${PLUGIN_NAME}@${MARKETPLACE_NAME}`;

const args = new Set(process.argv.slice(2));

if (args.has('--help') || args.has('-h')) {
  process.stdout.write(
    [
      'npx @hegemonart/get-design-done — install the plugin',
      '',
      'Registers the github.com/hegemonart/get-design-done marketplace and',
      'enables the get-design-done plugin in your Claude Code settings.',
      '',
      'Flags:',
      '  --dry-run    Print the diff without writing',
      '  --help, -h   Show this message',
      '',
      'Environment:',
      '  CLAUDE_CONFIG_DIR   Override the Claude config directory',
      '                      (default: ~/.claude)',
      '',
      'After install, restart Claude Code to load the plugin.',
      '',
    ].join('\n'),
  );
  process.exit(0);
}

const DRY_RUN = args.has('--dry-run');

function resolveConfigDir() {
  if (process.env.CLAUDE_CONFIG_DIR && process.env.CLAUDE_CONFIG_DIR.trim()) {
    return process.env.CLAUDE_CONFIG_DIR.trim();
  }
  return path.join(os.homedir(), '.claude');
}

function loadSettings(settingsPath) {
  if (!fs.existsSync(settingsPath)) return {};
  try {
    const raw = fs.readFileSync(settingsPath, 'utf8');
    if (!raw.trim()) return {};
    return JSON.parse(raw);
  } catch (err) {
    process.stderr.write(
      `get-design-done installer: cannot parse ${settingsPath} as JSON\n` +
        `  ${err.message}\n` +
        `  Fix the file manually or delete it, then re-run.\n`,
    );
    process.exit(1);
  }
}

function mergeSettings(existing) {
  const next = { ...existing };

  const marketplaces = { ...(next.extraKnownMarketplaces || {}) };
  const marketplaceEntry = {
    source: { source: 'github', repo: REPO },
  };
  const marketplaceChanged =
    JSON.stringify(marketplaces[MARKETPLACE_NAME]) !==
    JSON.stringify(marketplaceEntry);
  marketplaces[MARKETPLACE_NAME] = marketplaceEntry;
  next.extraKnownMarketplaces = marketplaces;

  const enabled = { ...(next.enabledPlugins || {}) };
  const enabledChanged = enabled[ENABLED_KEY] !== true;
  enabled[ENABLED_KEY] = true;
  next.enabledPlugins = enabled;

  return { next, changed: marketplaceChanged || enabledChanged };
}

function atomicWrite(target, contents) {
  const tmp = `${target}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, contents, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmp, target);
}

function main() {
  const configDir = resolveConfigDir();
  const settingsPath = path.join(configDir, 'settings.json');

  if (!fs.existsSync(configDir)) {
    if (DRY_RUN) {
      process.stdout.write(
        `[dry-run] would create ${configDir}\n`,
      );
    } else {
      fs.mkdirSync(configDir, { recursive: true });
    }
  }

  const existing = loadSettings(settingsPath);
  const { next, changed } = mergeSettings(existing);
  const formatted = `${JSON.stringify(next, null, 2)}\n`;

  if (!changed) {
    process.stdout.write(
      `get-design-done is already registered in ${settingsPath}\n` +
        `Nothing to do. Restart Claude Code if you haven't yet.\n`,
    );
    return;
  }

  if (DRY_RUN) {
    process.stdout.write(
      `[dry-run] would update ${settingsPath}\n` +
        `  extraKnownMarketplaces["${MARKETPLACE_NAME}"] = { source: { source: "github", repo: "${REPO}" } }\n` +
        `  enabledPlugins["${ENABLED_KEY}"] = true\n`,
    );
    return;
  }

  atomicWrite(settingsPath, formatted);

  process.stdout.write(
    [
      `✓ get-design-done registered in ${settingsPath}`,
      `  marketplace: github:${REPO}`,
      `  plugin:      ${ENABLED_KEY}`,
      '',
      'Next steps:',
      '  1. Restart Claude Code (or run /reload-plugins).',
      '  2. Claude Code will fetch the plugin on first launch.',
      '  3. Verify with: /plugin list',
      '',
    ].join('\n'),
  );
}

main();
