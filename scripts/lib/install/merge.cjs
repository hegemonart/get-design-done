'use strict';

// Pure merge / mutation helpers for the multi-runtime installer.
//
// mergeClaudeSettings — extracted from the v1.23.5 entrypoint. Adds a
//   marketplace registration + flips enabledPlugins[<plugin>@<marketplace>].
//
// removeClaudeSettings — inverse: removes the marketplace + the
//   enabledPlugins entry. Leaves untouched anything we did not write.
//
// agentsFileFingerprint — first-line marker we drop into every AGENTS.md /
//   GEMINI.md write so uninstall can confirm the file is plugin-owned.

const PLUGIN_FINGERPRINT = 'get-design-done plugin instructions';

function mergeClaudeSettings(existing, marketplaceEntry) {
  const next = { ...(existing || {}) };

  const marketplaces = { ...(next.extraKnownMarketplaces || {}) };
  const desired = {
    source: { source: 'github', repo: marketplaceEntry.repo },
  };
  const marketplaceChanged =
    JSON.stringify(marketplaces[marketplaceEntry.name]) !==
    JSON.stringify(desired);
  marketplaces[marketplaceEntry.name] = desired;
  next.extraKnownMarketplaces = marketplaces;

  const enabled = { ...(next.enabledPlugins || {}) };
  const enabledKey = `${marketplaceEntry.pluginName}@${marketplaceEntry.name}`;
  const enabledChanged = enabled[enabledKey] !== true;
  enabled[enabledKey] = true;
  next.enabledPlugins = enabled;

  return { next, changed: marketplaceChanged || enabledChanged };
}

function removeClaudeSettings(existing, marketplaceEntry) {
  const next = { ...(existing || {}) };

  const marketplaces = { ...(next.extraKnownMarketplaces || {}) };
  const marketplaceChanged = Object.prototype.hasOwnProperty.call(
    marketplaces,
    marketplaceEntry.name,
  );
  delete marketplaces[marketplaceEntry.name];
  if (Object.keys(marketplaces).length > 0) {
    next.extraKnownMarketplaces = marketplaces;
  } else if ('extraKnownMarketplaces' in next) {
    delete next.extraKnownMarketplaces;
  }

  const enabled = { ...(next.enabledPlugins || {}) };
  const enabledKey = `${marketplaceEntry.pluginName}@${marketplaceEntry.name}`;
  const enabledChanged = Object.prototype.hasOwnProperty.call(
    enabled,
    enabledKey,
  );
  delete enabled[enabledKey];
  if (Object.keys(enabled).length > 0) {
    next.enabledPlugins = enabled;
  } else if ('enabledPlugins' in next) {
    delete next.enabledPlugins;
  }

  return { next, changed: marketplaceChanged || enabledChanged };
}

function agentsFileFingerprint() {
  return PLUGIN_FINGERPRINT;
}

function buildAgentsFileContent(runtime, payloadHeader) {
  const lines = [
    `<!-- ${PLUGIN_FINGERPRINT} -->`,
    '',
    `# ${runtime.displayName} — get-design-done plugin`,
    '',
    'This file was written by `npx @hegemonart/get-design-done`. It loads',
    'the GDD plugin instructions for this runtime. Re-run the installer to',
    'refresh; run `npx @hegemonart/get-design-done --uninstall` to remove.',
    '',
    payloadHeader || '',
    '',
    `Plugin repository: https://github.com/hegemonart/get-design-done`,
    '',
  ];
  return lines.join('\n');
}

function isPluginOwned(content) {
  if (!content || typeof content !== 'string') return false;
  return content.includes(PLUGIN_FINGERPRINT);
}

module.exports = {
  mergeClaudeSettings,
  removeClaudeSettings,
  agentsFileFingerprint,
  buildAgentsFileContent,
  isPluginOwned,
  PLUGIN_FINGERPRINT,
};
