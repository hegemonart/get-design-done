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

// Phase 28.7 (Plan 28.7-08) — Extended fingerprint detection.
//
// In Phase 24, plugin-owned AGENTS.md / GEMINI.md files were marked with the
// `<!-- get-design-done plugin instructions -->` HTML comment (PLUGIN_FINGERPRINT
// above). Phase 28.7 introduces TWO more fingerprint shapes for the new
// multi-artifact installer:
//
//   - `gdd: auto-generated from Claude SKILL.md` — emitted by every per-runtime
//     SKILL converter (cursor.cjs, codex.cjs, etc.) via shared.ensureAdapterHeader.
//     This applies to every SKILL.md / command file written into a runtime's
//     skills/ or command/ directory.
//
//   - `# get-design-done rules` — emitted as the heading of the .clinerules
//     file by converters/cline.cjs#buildClinerulesFile. Cline is rules-based
//     and does not have a per-skill directory layout (Phase 28.7 D-09).
//
// All three shapes count as "plugin-owned" for the foreign-file protection
// + idempotent-re-install discipline that the installer enforces (Phase 24
// D-04 carry-forward). Anything else is treated as user-authored and left
// alone (skipped-foreign action).
const GDD_ADAPTER_FINGERPRINT = 'gdd: auto-generated from Claude SKILL.md';
const CLINERULES_HEADER_FINGERPRINT = '# get-design-done rules';

function isPluginOwned(content) {
  if (!content || typeof content !== 'string') return false;
  if (content.includes(PLUGIN_FINGERPRINT)) return true;
  if (content.includes(GDD_ADAPTER_FINGERPRINT)) return true;
  if (content.includes(CLINERULES_HEADER_FINGERPRINT)) return true;
  return false;
}

module.exports = {
  mergeClaudeSettings,
  removeClaudeSettings,
  agentsFileFingerprint,
  buildAgentsFileContent,
  isPluginOwned,
  PLUGIN_FINGERPRINT,
  // Phase 28.7 (Plan 28.7-08) — additional fingerprint shapes for the
  // multi-artifact installer (per-runtime converters + cline rules file).
  GDD_ADAPTER_FINGERPRINT,
  CLINERULES_HEADER_FINGERPRINT,
};
