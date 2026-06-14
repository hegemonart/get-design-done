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

const PLUGIN_FINGERPRINT = 'hone plugin instructions';

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
    `# ${runtime.displayName} — hone plugin`,
    '',
    'This file was written by `npx @hegemonart/hone`. It loads',
    'the GDD plugin instructions for this runtime. Re-run the installer to',
    'refresh; run `npx @hegemonart/hone --uninstall` to remove.',
    '',
    payloadHeader || '',
    '',
    `Plugin repository: https://github.com/hegemonart/hone`,
    '',
  ];
  return lines.join('\n');
}

// Phase 28.7 (Plan 28.7-08) — Extended fingerprint detection.
//
// In Phase 24, plugin-owned AGENTS.md / GEMINI.md files were marked with the
// `<!-- hone plugin instructions -->` HTML comment (PLUGIN_FINGERPRINT
// above). Phase 28.7 introduces TWO more fingerprint shapes for the new
// multi-artifact installer:
//
//   - `gdd: auto-generated from Claude SKILL.md` — emitted by every per-runtime
//     SKILL converter (cursor.cjs, codex.cjs, etc.) via shared.ensureAdapterHeader.
//     This applies to every SKILL.md / command file written into a runtime's
//     skills/ or command/ directory.
//
//   - `# hone rules` — emitted as the heading of the .clinerules
//     file by converters/cline.cjs#buildClinerulesFile. Cline is rules-based
//     and does not have a per-skill directory layout (Phase 28.7 D-09).
//
// All three shapes count as "plugin-owned" for the foreign-file protection
// + idempotent-re-install discipline that the installer enforces (Phase 24
// D-04 carry-forward). Anything else is treated as user-authored and left
// alone (skipped-foreign action).
const GDD_ADAPTER_FINGERPRINT = 'gdd: auto-generated from Claude SKILL.md';
const CLINERULES_HEADER_FINGERPRINT = '# hone rules';

// B5/S4 fix (Phase 59.8): ownership detection is WHOLE-LINE anchored, not a
// loose `String.includes` substring scan. The old substring match treated any
// user-authored file that merely *mentioned* a marker string (e.g. a doc that
// quotes "hone plugin instructions", or a code fence containing
// "gdd: auto-generated from Claude SKILL.md") as plugin-owned — so install
// would overwrite it and uninstall would delete it. We now require the marker
// to appear on a recognized GENERATED line:
//
//   - `<!-- ... <fingerprint> ... -->`  HTML-comment marker line. Both the
//     Phase-24 plugin fingerprint and the per-runtime/sibling adapter header
//     are emitted as a standalone HTML comment line; we accept the marker only
//     when it sits inside an HTML comment that occupies the whole (trimmed)
//     line. A bare prose mention of the same words no longer qualifies.
//   - `# hone rules`  cline rules header — must be the exact, whole
//     trimmed line (a Markdown H1), matching converters/cline.cjs.
//
// Scanning line-by-line keeps detection of genuinely plugin-owned files intact
// (the generated marker line is always present near the top) while refusing to
// claim ownership of user files that merely contain the words somewhere.
function isHtmlCommentMarkerLine(line, fingerprint) {
  const t = line.trim();
  if (!t.startsWith('<!--') || !t.endsWith('-->')) return false;
  return t.includes(fingerprint);
}

function isPluginOwned(content) {
  if (!content || typeof content !== 'string') return false;
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    if (isHtmlCommentMarkerLine(line, PLUGIN_FINGERPRINT)) return true;
    if (isHtmlCommentMarkerLine(line, GDD_ADAPTER_FINGERPRINT)) return true;
    if (line.trim() === CLINERULES_HEADER_FINGERPRINT) return true;
  }
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
