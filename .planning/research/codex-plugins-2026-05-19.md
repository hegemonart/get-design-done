# Codex Plugins Research — 2026-05-19

<!-- Phase 28.8 / Plan 28-8-03 / pin-date 2026-05-19 / source-of-truth re-verify per CONTEXT D-07 -->

Source-of-truth re-verify against [developers.openai.com/codex/plugins/build](https://developers.openai.com/codex/plugins/build) on 2026-05-19. Adjacent pages fetched: [/codex/plugins](https://developers.openai.com/codex/plugins) (overview), [/codex/skills](https://developers.openai.com/codex/skills) (skill spec referenced by `manifest.skills`), [/codex](https://developers.openai.com/codex) (Codex docs home, for navigation + Feature Maturity link).

## TL;DR

- **Page status:** [developers.openai.com/codex/plugins/build](https://developers.openai.com/codex/plugins/build) is `live` (HTTP 200, 334 KB on 2026-05-19); content materially expanded vs. the 2026-05-18 audit — minimal-manifest example, marketplace JSON schema, plugin tree, install-cache path, and hooks-feature-flag are all now spelled out on this single page.
- **Manifest filename + path:** `.codex-plugin/plugin.json` (required entry point) at the **plugin root**. The folder `.codex-plugin/` MUST be a folder and MUST hold `plugin.json` inside. Only `plugin.json` belongs in `.codex-plugin/`; all other plugin assets (`skills/`, `hooks/`, `assets/`, `.app.json`, `.mcp.json`) live at the plugin root.
- **Distribution model:** `install-by-URL` (literal). `codex plugin marketplace add owner/repo` accepts GitHub shorthand, full HTTP/HTTPS Git URLs, SSH Git URLs, and local marketplace root directories. **HOWEVER**: a marketplace catalog file (`marketplace.json` listing plugins) is required somewhere addressable by that source — either at `$REPO_ROOT/.agents/plugins/marketplace.json`, `$REPO_ROOT/.claude-plugin/marketplace.json` (legacy-compatible), or `~/.agents/plugins/marketplace.json`. Self-serve plugin publishing to OpenAI's curated Plugin Directory is `coming soon` ([per build page](https://developers.openai.com/codex/plugins/build) — "Adding plugins to the official Plugin Directory is coming soon. Self-serve plugin publishing and management are coming soon."). Install-by-URL via marketplace JSON is **not gated** on the self-serve registry going live.
- **vs AGENTS.md verdict:** `additive` (literal). The Phase 28.7 `AGENTS.md` surface remains the file-drop Tier-1 path for users who don't run `codex /plugins`. The new `.codex-plugin/plugin.json` surface adds Tier-2 marketplace discovery + versioned install + bundled capability declarations (skills, hooks, apps, mcpServers, interface metadata). No precedence rule documented — both surfaces coexist; AGENTS.md is consumed as repo-rooted Codex agent context, plugin.json is consumed as installed plugin under `~/.codex/plugins/cache/...`.
- **Field-test gate verdict:** `Field-test gate: GREEN` — the install pipeline requires the maintainer to ALSO ship a marketplace catalog file (we already have `.claude-plugin/marketplace.json` and Codex documents that path as legacy-compatible). The exact one-liner `codex plugin marketplace add hegemonart/get-design-done` works against the GitHub shorthand source.
- **Ask for C1:** Implement `kind: 'codex-plugin'` converter that emits `.codex-plugin/plugin.json` with the 8 required+optional fields documented in the Manifest Format table, plus a parallel `marketplace.json` (we have a Claude-shape one already — verify Codex's legacy-compat consumption) or a new `.agents/plugins/marketplace.json`. The Schema Mapping table specifies every source.
- **Ask for C2:** Wire `scripts/install.cjs --doctor` to check three local artifacts: (a) `.codex-plugin/plugin.json` exists + is valid JSON + has required fields `name`/`version`/`description`; (b) a marketplace catalog file exists with an entry whose `source.path` resolves; (c) optionally check `~/.codex/plugins/cache/$MARKETPLACE_NAME/get-design-done/$VERSION/` for post-install state (this is post-`marketplace add` so probably stays out of doctor scope until field-test). Field-test command verbatim: `codex plugin marketplace add hegemonart/get-design-done`.

## Codex Plugins Re-verify

Re-fetched [developers.openai.com/codex/plugins/build](https://developers.openai.com/codex/plugins/build) on 2026-05-19 (NOT cached from the 2026-05-18 audit). Findings:

| Aspect | 2026-05-18 audit assumption | 2026-05-19 re-verify finding | Verdict |
|--------|-----------------------------|-------------------------------|---------|
| Page existence | live, source-of-truth | `live` (HTTP 200, 334 KB) | **confirmed** |
| Page redirected? | n/a | final URL = `developers.openai.com/codex/plugins/build` (no redirect) | **confirmed** |
| Manifest filename | `.codex-plugin/plugin.json` | `.codex-plugin/plugin.json` — quoted verbatim: "Every plugin has a manifest at .codex-plugin/plugin.json" ([per build page](https://developers.openai.com/codex/plugins/build)) | **confirmed** |
| Required fields | `name`, `version`, `description` | Quoted minimal manifest example: `{ "name": "my-first-plugin", "version": "1.0.0", "description": "Reusable greeting workflow", "skills": "./skills/" }`. Body text: "name, version, and description identify the plugin." `name` MUST be kebab-case: "Use a stable plugin name in kebab-case. Codex uses it as the plugin identifier and component namespace." | **confirmed; name constraint is kebab-case** |
| Optional fields | `skills`, `mcpServers`, `apps`, `hooks`, `interface` (5) | Confirmed all 5, PLUS publisher metadata fields: `author`, `homepage`, `repository`, `license`, `keywords`. The `interface` sub-object has 14 sub-fields enumerated in the complete-manifest example. | **expanded — see Manifest Format table** |
| Self-serve registry | "coming soon" | "Adding plugins to the official Plugin Directory is coming soon. Self-serve plugin publishing and management are coming soon." ([per build page, Publish official public plugins section](https://developers.openai.com/codex/plugins/build)) | **confirmed — still coming soon as of 2026-05-19** |
| Install-by-URL | works against any GitHub URL | `codex plugin marketplace add` accepts `owner/repo`, `owner/repo@ref`, HTTP/HTTPS Git URLs, SSH Git URLs, and local marketplace root directories. **BUT** the source must point at a marketplace catalog file, not the plugin manifest directly. | **partially confirmed — see Distribution Mechanism** |
| Plugin cache path | `~/.codex/plugins/cache/<owner>/<repo>/` | `~/.codex/plugins/cache/$MARKETPLACE_NAME/$PLUGIN_NAME/$VERSION/` ([per build page, How Codex uses marketplaces section](https://developers.openai.com/codex/plugins/build)) — keyed on marketplace name + plugin name + version, NOT owner/repo. For local plugins, `$VERSION` is the literal string `local`. | **refined — see Install Verification Flow** |
| Manifest fields added since 2026-05-18 | n/a | The `interface` object's full shape (14 sub-fields: `displayName`, `shortDescription`, `longDescription`, `developerName`, `category`, `capabilities`, `websiteURL`, `privacyPolicyURL`, `termsOfServiceURL`, `defaultPrompt`, `brandColor`, `composerIcon`, `logo`, `screenshots`) is enumerated in the complete-manifest example. The hooks feature flag `[features].plugin_hooks = true` is documented as off-by-default. | **new since 2026-05-18 audit — interface sub-shape + hooks feature flag** |

**Materially new content vs. 2026-05-18 audit:**
1. The complete-manifest example now shows the full 8-field shape WITH the `interface` sub-object expanded into 14 sub-fields.
2. Marketplace metadata file format (`.agents/plugins/marketplace.json`) is now fully specified with per-plugin `policy.installation`, `policy.authentication`, and `category` fields.
3. The plugin-hooks `[features].plugin_hooks = true` opt-in is now documented (off by default in this release).
4. Plugin cache path is keyed on `$MARKETPLACE_NAME/$PLUGIN_NAME/$VERSION` (not `owner/repo/`).
5. Legacy-compat marketplace path `$REPO_ROOT/.claude-plugin/marketplace.json` is now an officially documented Codex marketplace location ([per build page, How Codex uses marketplaces section](https://developers.openai.com/codex/plugins/build): "a legacy-compatible marketplace at $REPO_ROOT/.claude-plugin/marketplace.json"). **This is load-bearing for GDD because we already ship `.claude-plugin/marketplace.json` for the Claude-side marketplace** — Codex will read it as-is.

## Manifest Format

**Filename + path:** `.codex-plugin/plugin.json` at the plugin root. Only this single file belongs in `.codex-plugin/`. Required entry point ([per build page, Plugin structure section](https://developers.openai.com/codex/plugins/build): "`.codex-plugin/plugin.json` is the required entry point. The other manifest fields are optional, but published plugins commonly use them.").

**Published JSON Schema URL:** Not documented on the build page as of 2026-05-19. No `$schema` reference in the published examples. (Recorded in Open Questions.)

**Manifest versioning:** No `manifestVersion` field, no `$schema` reference in published examples ([per build page complete-manifest example](https://developers.openai.com/codex/plugins/build)). The Codex docs do not surface a manifest-version concept on 2026-05-19.

### Top-level fields

| Field | Required? | Type | Constraint | Description | Example value |
|-------|-----------|------|------------|-------------|---------------|
| `name` | **required** | string | kebab-case ([per build page](https://developers.openai.com/codex/plugins/build): "Use a stable plugin name in kebab-case. Codex uses it as the plugin identifier and component namespace.") | The plugin identifier and component namespace | `"get-design-done"` |
| `version` | **required** | string | semver (inferred from `"1.0.0"` and `"0.1.0"` examples — no explicit constraint quoted, but standard practice) | Plugin version. Powers `~/.codex/plugins/cache/.../$VERSION/` install path. | `"1.28.8"` |
| `description` | **required** | string | free text (no length constraint documented) | Plugin description. Identifies the plugin. | `"Agent-orchestrated 5-stage design pipeline."` |
| `author` | optional | object `{ name, email?, url? }` | object with `name` always present in published example ([per build page complete-manifest example](https://developers.openai.com/codex/plugins/build)) | Publisher metadata. | `{ "name": "hegemonart", "url": "https://github.com/hegemonart" }` |
| `homepage` | optional | string (URL) | https URL | Plugin homepage. | `"https://github.com/hegemonart/get-design-done"` |
| `repository` | optional | string (URL or git URL) | Git URL or HTTPS URL | Repo URL for source. | `"https://github.com/hegemonart/get-design-done"` |
| `license` | optional | string (SPDX) | SPDX identifier (`"MIT"` in published example) | License. | `"MIT"` |
| `keywords` | optional | string[] | array of free-text strings | Discovery keywords. | `["design", "ui", "ux"]` |
| `skills` | optional | string \| object \| array | Path string (relative, `./`-prefixed) to a skills folder OR per-skill manifest. Published example uses single-path form: `"skills": "./skills/"` ([per build page minimal-manifest + complete-manifest examples](https://developers.openai.com/codex/plugins/build)). | Path to bundled skills. Each skill is `skills/<name>/SKILL.md`. | `"./skills/"` |
| `mcpServers` | optional | string \| object | Path string (`"./.mcp.json"`) OR inline object `{ <name>: { command, args } }`. The pointed-at `.mcp.json` may contain either a direct server map or a wrapped `{ "mcp_servers": { ... } }` ([per build page, Bundled MCP servers section](https://developers.openai.com/codex/plugins/build)). | Path or inline MCP server config. | `"./.mcp.json"` |
| `apps` | optional | string \| object | Path string (`"./.app.json"`) OR inline object. Maps to app/connector definitions. | App/connector mappings. | `"./.app.json"` |
| `hooks` | optional | string \| string[] \| object \| object[] | Path to hooks file (`"./hooks/hooks.json"`), array of paths, inline `{ "hooks": { ... } }` object, or array of inline objects ([per build page, Bundled MCP servers and lifecycle hooks section](https://developers.openai.com/codex/plugins/build): "The manifest field can be a single path, an array of paths, an inline hooks object, or an array of inline hooks objects."). **OFF BY DEFAULT** — requires `[features].plugin_hooks = true` in user config. | Lifecycle hooks. | `"./hooks/hooks.json"` |
| `interface` | optional | object | See sub-table below. Controls install-surface presentation ([per build page, Manifest fields section](https://developers.openai.com/codex/plugins/build)). | Install-surface metadata. | See `interface` sub-shape |

### `interface` sub-shape (14 sub-fields)

| Sub-field | Type | Description | Example value |
|-----------|------|-------------|---------------|
| `displayName` | string | Plugin title in install surface | `"Get Design Done"` |
| `shortDescription` | string | Short copy for marketplace card | `"5-stage design pipeline."` |
| `longDescription` | string | Long copy for plugin detail page | `"Agent-orchestrated 5-stage design pipeline: Brief → Explore → Plan → Design → Verify."` |
| `developerName` | string | Publisher display name | `"hegemonart"` |
| `category` | string | Marketplace category (e.g., `"Productivity"`, `"Design"`) | `"Design"` |
| `capabilities` | string[] | Tool capabilities declared by plugin (e.g., `["Read", "Write"]`) | `["Read", "Write"]` |
| `websiteURL` | string (URL) | Publisher website | `"https://github.com/hegemonart/get-design-done"` |
| `privacyPolicyURL` | string (URL) | Privacy policy link | _N/A for GDD MIT-license repo_ |
| `termsOfServiceURL` | string (URL) | ToS link | _N/A_ |
| `defaultPrompt` | string[] | Starter prompts shown in install surface | `["Run /gdd:brief to start a design cycle."]` |
| `brandColor` | string (hex) | Brand color for plugin card | `"#10A37F"` (example value from build doc) |
| `composerIcon` | string (path) | Path to composer icon image, `./`-prefixed | `"./assets/icon.png"` |
| `logo` | string (path) | Path to logo image | `"./assets/logo.png"` |
| `screenshots` | string[] (paths) | Array of screenshot paths under `./assets/` | `["./assets/screenshot-1.png"]` |

### Marketplace catalog file (parallel artifact)

The plugin manifest by itself is NOT enough for distribution — Codex's `codex plugin marketplace add` command consumes a **marketplace catalog file**, NOT the plugin manifest directly. The catalog file is the entry point for `codex plugin marketplace add`.

Three valid locations ([per build page, How Codex uses marketplaces section](https://developers.openai.com/codex/plugins/build)):
- `$REPO_ROOT/.agents/plugins/marketplace.json` (canonical, repo-scoped)
- `$REPO_ROOT/.claude-plugin/marketplace.json` ("legacy-compatible" — same JSON shape consumed)
- `~/.agents/plugins/marketplace.json` (personal scope)

**Catalog file fields** ([per build page complete catalog example](https://developers.openai.com/codex/plugins/build)):

| Field | Required? | Type | Description |
|-------|-----------|------|-------------|
| `name` | required | string | Marketplace identifier (e.g., `"local-example-plugins"`) |
| `interface.displayName` | optional | string | Marketplace title shown in Codex |
| `plugins` | required | object[] | Array of plugin entries |
| `plugins[].name` | required | string | Plugin name (must match plugin manifest `name`) |
| `plugins[].source` | required | object \| string | Plugin source. Object form: `{ "source": "local" \| "url" \| "git-subdir", "path"?: "./...", "url"?: "https://...", "ref"?: "main", "sha"?: "..." }`. String form: plain path `"./plugins/my-plugin"` (local only). |
| `plugins[].policy.installation` | required | string | One of `"AVAILABLE"`, `"INSTALLED_BY_DEFAULT"`, `"NOT_AVAILABLE"` |
| `plugins[].policy.authentication` | required | string | E.g., `"ON_INSTALL"`, `"ON_FIRST_USE"` |
| `plugins[].category` | required | string | Marketplace category |

## Plugin Structure

```
<plugin-root>/
  .codex-plugin/
    plugin.json            [required — plugin manifest entry point]
  skills/                  [optional — required IF manifest.skills points here]
    <skill-name>/
      SKILL.md             [required — skill instructions + frontmatter (name, description)]
      scripts/             [optional — executable code]
      references/          [optional — documentation]
      assets/              [optional — templates, resources]
      agents/openai.yaml   [optional — UI metadata, invocation policy, tool deps]
  hooks/                   [optional — required IF manifest.hooks is set AND [features].plugin_hooks=true]
    hooks.json             [default hook file when manifest.hooks omitted but plugin_hooks=true]
  .mcp.json                [optional — required IF manifest.mcpServers points here]
  .app.json                [optional — required IF manifest.apps points here]
  assets/                  [optional — icons, logos, screenshots referenced by manifest.interface]
```

**Required-vs-optional citations:**
- `.codex-plugin/plugin.json` is `[required — manifest entry point]` ([per build page, Plugin structure section](https://developers.openai.com/codex/plugins/build): "Every plugin has a manifest at .codex-plugin/plugin.json").
- `.codex-plugin/` MUST be a folder ([per build page Plugin structure tree](https://developers.openai.com/codex/plugins/build)). The docs do not provide a single-file alternative; no `.codex-plugin.json` alternative is documented.
- "Only `plugin.json` belongs in `.codex-plugin/`. Keep `skills/`, `hooks/`, `assets/`, `.mcp.json`, and `.app.json` at the plugin root." ([per build page, Plugin structure section](https://developers.openai.com/codex/plugins/build)) — verbatim quote.
- `skills/` is `[optional — only if manifest.skills is present]`. Skill file format is `SKILL.md` with YAML frontmatter containing `name` and `description` ([per skills page, Create a skill section](https://developers.openai.com/codex/skills)): "The SKILL.md file must include name and description."
- `hooks/` is `[optional]` AND off-by-default ([per build page, Bundled MCP servers and lifecycle hooks section](https://developers.openai.com/codex/plugins/build): "Plugin hooks are off by default in this release; bundled hooks won't run unless `[features].plugin_hooks = true`.")
- `.mcp.json` is `[optional — required IF manifest.mcpServers references it]`. Pointed-at file may use direct server map OR wrapped `{ "mcp_servers": { ... } }` ([per build page](https://developers.openai.com/codex/plugins/build)).
- `.app.json` is `[optional — required IF manifest.apps references it]`. Schema not fully spelled out on the build page.
- `assets/` is `[optional — referenced by manifest.interface.composerIcon, .logo, .screenshots]` ([per build page Path rules section](https://developers.openai.com/codex/plugins/build): "Store visual assets such as composerIcon, logo, and screenshots under ./assets/ when possible.").

**Path rule** ([per build page, Path rules section](https://developers.openai.com/codex/plugins/build)): "Keep manifest paths relative to the plugin root and start them with `./`. Store visual assets such as composerIcon, logo, and screenshots under ./assets/ when possible."

**SKILL.md content format constraint** ([per skills page](https://developers.openai.com/codex/skills)): YAML frontmatter MUST contain `name` and `description`. Codex's implicit skill activation depends on `description` content.

**Install-time tree copy:** Codex copies the **full plugin folder** into the cache during install. Confirmed by the example flow ([per build page, Install a local plugin manually](https://developers.openai.com/codex/plugins/build)): "Step 1: Copy the plugin folder into ~/.codex/plugins/my-plugin." Codex resolves manifest-pointed paths relative to the installed plugin root.

## Distribution Mechanism

**Distribution model verdict: `install-by-URL`** (literal — one of `install-by-URL` / `marketplace-UI-only` / `hybrid`).

**Evidence:**
- `codex plugin marketplace add owner/repo` is the documented one-liner ([per build page, Add a marketplace from the CLI section](https://developers.openai.com/codex/plugins/build)).
- All four URL-like sources documented:
  - `codex plugin marketplace add owner/repo` (GitHub shorthand)
  - `codex plugin marketplace add owner/repo --ref main` (pinned Git ref)
  - `codex plugin marketplace add https://github.com/example/plugins.git --sparse .agents/plugins` (full HTTPS URL + sparse checkout)
  - `codex plugin marketplace add ./local-marketplace-root` (local marketplace root dir)
- "Marketplace sources can be GitHub shorthand (`owner/repo` or `owner/repo@ref`), HTTP or HTTPS Git URLs, SSH Git URLs, or local marketplace root directories." ([per build page](https://developers.openai.com/codex/plugins/build)) — verbatim.

**CONTEXT D-03 confirm/refute:** **Partially confirmed with refinement.** CONTEXT D-03 says "`codex plugin marketplace add owner/repo` install-by-URL is confirmed working today against any GitHub URL with `.codex-plugin/plugin.json`". The 2026-05-19 re-verify confirms the command works but adds a critical nuance: **the URL must resolve to a marketplace catalog file**, not directly to the plugin manifest. The catalog file (`marketplace.json`) lists the plugin and its `source.path`. For our case, `hegemonart/get-design-done` is the GitHub source; Codex will look for `.agents/plugins/marketplace.json` or `.claude-plugin/marketplace.json` (legacy-compatible) at the repo root. We already ship `.claude-plugin/marketplace.json` — this Just Works for Codex per the legacy-compat path.

**Self-serve registry status:** `coming soon` as of 2026-05-19. Verbatim ([per build page, Publish official public plugins section](https://developers.openai.com/codex/plugins/build)): "Adding plugins to the official Plugin Directory is coming soon. Self-serve plugin publishing and management are coming soon." This does NOT gate install-by-URL — the marketplace add command works today against any Git URL exposing a marketplace catalog.

**Account / auth requirements:** None documented for `codex plugin marketplace add owner/repo` from a public GitHub repo. No account, no review window, no Codex publisher signup. The doc enumerates auth only for `policy.authentication` (the install-time auth for end-user use of the plugin's bundled apps, not for publishers).

**Review / approval:** None for install-by-URL. The Plugin Directory's review queue is the gated path for the future curated catalog, but install-by-URL is instant.

**Implications:**
- **C1:** The manifest generator only needs to support the repo-rooted shape (plugin manifest at `.codex-plugin/plugin.json` + marketplace catalog at `.claude-plugin/marketplace.json` OR `.agents/plugins/marketplace.json`). No need to support a separate marketplace-uploaded bundle shape today. **Important**: C1 must also emit (or augment) a marketplace catalog file with a Codex-shaped entry for our plugin. Our existing `.claude-plugin/marketplace.json` is the legacy-compat slot Codex reads as-is — verify field shape matches Codex's catalog schema (per Manifest Format → Marketplace catalog file section above) and either reuse-as-is or generate a Codex-specific catalog at `.agents/plugins/marketplace.json`.
- **C2:** Doctor mode checks three local artifacts: (a) `.codex-plugin/plugin.json` exists + valid JSON + has required fields `name`/`version`/`description`; (b) a marketplace catalog file exists at one of the documented paths and contains an entry for our plugin with `source.path` resolvable; (c) optional `~/.codex/plugins/cache/...` post-install check (best left for post-field-test verification, not local doctor scope). NO network calls required for local doctor mode.

## Install Verification Flow

End-to-end install state machine for `codex plugin marketplace add hegemonart/get-design-done`:

### 1. Pre-install state
- No directory exists at `~/.codex/plugins/cache/<MARKETPLACE_NAME>/get-design-done/<VERSION>/`.
- `~/.codex/config.toml` has no `[plugins."get-design-done@<MARKETPLACE_NAME>"]` section.

### 2. Command execution
```bash
codex plugin marketplace add hegemonart/get-design-done
```
The CLI:
- Resolves `hegemonart/get-design-done` as GitHub shorthand to `https://github.com/hegemonart/get-design-done.git`.
- Looks for a marketplace catalog file at one of the recognized paths in that repo. Per [build page How Codex uses marketplaces section](https://developers.openai.com/codex/plugins/build), Codex reads:
  - `$REPO_ROOT/.agents/plugins/marketplace.json` (canonical)
  - `$REPO_ROOT/.claude-plugin/marketplace.json` (legacy-compatible — our existing slot)
- Registers the marketplace source in `~/.codex/config.toml`.

The build page does not quote example success-stdout verbatim. The CLI output shape is undocumented as of 2026-05-19 (recorded in Open Questions).

### 3. Post-install state
Per [build page, How Codex uses marketplaces section](https://developers.openai.com/codex/plugins/build) — verbatim quote: "Codex installs plugins into `~/.codex/plugins/cache/$MARKETPLACE_NAME/$PLUGIN_NAME/$VERSION/`. For local plugins, `$VERSION` is `local`, and Codex loads the installed copy from that cache path rather than directly from the marketplace entry."

Expected post-install filesystem layout for our plugin:
```
~/.codex/plugins/cache/
  <MARKETPLACE_NAME>/                    # marketplace catalog's `name` field
    get-design-done/                     # plugin manifest's `name` field
      <VERSION>/                         # plugin manifest's `version` field (e.g., 1.28.8)
        .codex-plugin/
          plugin.json
        skills/
          discuss/SKILL.md
          ...
        hooks/
          hooks.json
        assets/
          ...
        README.md
        ...
```
For our case the marketplace name will be whatever we set in our catalog's top-level `name` field (e.g., we could use `get-design-done` matching the existing `.claude-plugin/marketplace.json` `name` value).

### 4. Skills landing
Skills bundled via `manifest.skills: "./skills/"` are preserved verbatim in the cache — Codex copies the full plugin tree. So `skills/<name>/SKILL.md` lands at `~/.codex/plugins/cache/<MARKETPLACE_NAME>/get-design-done/<VERSION>/skills/<name>/SKILL.md`. NOT flattened, NOT copied to a separate skills root.

### 5. Verification
**Filesystem check** (definitive — no network call needed):
```bash
ls ~/.codex/plugins/cache/get-design-done/get-design-done/1.28.8/
```
Expected output: directory listing showing `.codex-plugin/`, `skills/`, `hooks/`, `assets/`, plus repo files like `README.md`, `package.json`, etc.

**CLI verification** ([per build page, Install and use a plugin section in /codex/plugins overview](https://developers.openai.com/codex/plugins)):
```bash
codex /plugins
```
This opens the Codex CLI plugin browser, which groups plugins by marketplace. Expected behavior: navigate to our marketplace tab, see `get-design-done` listed with its installed-state indicator. Pressing Space toggles enabled state.

**Config inspection**:
```bash
grep -A 1 "get-design-done" ~/.codex/config.toml
```
Expected output: a `[plugins."get-design-done@<MARKETPLACE_NAME>"]` section with `enabled = true` (default state after install).

### 6. Uninstall path
Two-step. First, **uninstall the plugin** from the plugin browser ([per overview page, Remove or turn off a plugin section](https://developers.openai.com/codex/plugins)): "To remove a plugin, reopen it from the plugin browser and select Uninstall plugin."

Second, **remove the marketplace source** (if you want a clean re-install for field-testing):
```bash
codex plugin marketplace remove <MARKETPLACE_NAME>
```
Per [build page, Add a marketplace from the CLI section](https://developers.openai.com/codex/plugins/build): "`codex plugin marketplace remove marketplace-name`".

To **refresh** (re-pull from source after a remote update):
```bash
codex plugin marketplace upgrade <MARKETPLACE_NAME>
```
Per same section: "`codex plugin marketplace upgrade marketplace-name`". This pulls the latest from the marketplace source.

To **disable without uninstalling** ([per overview page](https://developers.openai.com/codex/plugins)): edit `~/.codex/config.toml`, set `[plugins."<plugin-name>@<MARKETPLACE_NAME>"] enabled = false`, restart Codex.

## Schema Mapping

Mapping from Codex `.codex-plugin/plugin.json` fields → GDD source artifacts.

| Codex manifest field | Required? | Our source artifact | Our field/key | Match status | Transform required |
|----------------------|-----------|---------------------|---------------|--------------|--------------------|
| `name` | **required** | `package.json` | `name` (currently `"@hegemonart/get-design-done"`) | `transform` | Strip npm scope: `@hegemonart/get-design-done` → `get-design-done` (kebab-case constraint). Or use `.claude-plugin/plugin.json#name` which is already `"get-design-done"`. |
| `version` | **required** | `package.json` | `version` (e.g., `"1.28.7"` → `"1.28.8"` at v1.28.8 release) | `direct` | Copy verbatim. Single source of truth — `.claude-plugin/plugin.json#version` and `.claude-plugin/marketplace.json#metadata.version` already mirror this. |
| `description` | **required** | `package.json` | `description` | `direct` | Copy verbatim. (Currently `"A design-quality pipeline for AI coding agents: brief, plan, implement, and verify UI work against your design system."` — short form preferred.) |
| `author` | optional | `package.json` + `.claude-plugin/plugin.json` | `author` object | `compose` | Combine `package.json#author` (`"Hegemon"`) + `.claude-plugin/plugin.json#author` (`{ name: "hegemonart", url: "https://github.com/hegemonart" }`) into Codex shape `{ name, email?, url? }`. Use `.claude-plugin/plugin.json#author` as canonical (it has the url). |
| `homepage` | optional | `package.json` | `homepage` (currently `"https://github.com/hegemonart/get-design-done"`) | `direct` | Copy verbatim. |
| `repository` | optional | `package.json` | `repository.url` (currently `"https://github.com/hegemonart/get-design-done.git"`) | `transform` | Drop trailing `.git` to get the canonical homepage form, OR keep as-is (Codex accepts both). |
| `license` | optional | `package.json` | `license` (currently `"MIT"`) | `direct` | Copy verbatim. |
| `keywords` | optional | `package.json` | `keywords` array (50+ entries currently) | `transform` | Trim to a curated subset (Codex marketplace listings prefer ≤10 keywords typically). Pick top 10 design-relevant terms: `["design","ui","ux","frontend","pipeline","design-system","accessibility","figma","wcag","agent-sdk"]`. |
| `skills` | optional | `skills/` directory | Per-skill `SKILL.md` in `skills/<name>/` (70 skills currently) | `transform` | Set `manifest.skills = "./skills/"` (path form — Codex auto-discovers `skills/<name>/SKILL.md`). Verify each SKILL.md frontmatter has both `name` and `description` (Codex skill requirement per [/codex/skills](https://developers.openai.com/codex/skills) Create a skill section). Phase 28.5 contract already enforces these — should pass. |
| `mcpServers` | optional | GDD Phase 27.7 MCP server | `gdd-mcp` (npm-published MCP server) | `transform` | Emit `./.mcp.json` with `{ "gdd-mcp": { "command": "npx", "args": ["-y", "@hegemonart/gdd-mcp"] } }` (or wrapped `{ "mcp_servers": { ... } }` form). Verify exact bin name during C1. |
| `apps` | optional | _none_ | _N/A — GDD has no app/connector integrations_ | `static` | Omit. (Apps are ChatGPT-side connectors like Gmail/Drive/Slack — GDD is a local pipeline, not a connector.) |
| `hooks` | optional | `hooks/` directory | 15 hook files (`.js`, `.ts`, `.sh`) under `hooks/` root | `transform` | Build a `hooks/hooks.json` that maps Codex hook events to our handler scripts. Codex hook events are documented under [/codex/configuration/hooks](https://developers.openai.com/codex) (not deep-fetched here — C1 must verify event names). **Off by default** — requires user opt-in `[features].plugin_hooks = true`. C1 may choose to OMIT this field initially since hooks won't run for most users. |
| `interface.displayName` | optional | `.claude-plugin/marketplace.json` | `metadata.description` first phrase (e.g., `"Get Design Done"`) | `static` | Use literal `"Get Design Done"`. |
| `interface.shortDescription` | optional | `package.json` | First sentence of `description` | `transform` | Truncate to ≤120 chars: `"A design-quality pipeline for AI coding agents"`. |
| `interface.longDescription` | optional | `README.md` | Opening paragraph | `transform` | Extract first paragraph from `README.md`. |
| `interface.developerName` | optional | `.claude-plugin/plugin.json` | `author.name` (`"hegemonart"`) | `direct` | Copy verbatim. |
| `interface.category` | optional | `.claude-plugin/marketplace.json` | `plugins[0].category` (`"design"`) | `transform` | Capitalize: `"Design"` (Codex categories are TitleCase per build doc examples — `"Productivity"`). |
| `interface.capabilities` | optional | _Claude tool surface_ | Tools our skills declare in frontmatter (`Read, Write, Edit, Bash, Task`) | `transform` | Set `["Read", "Write"]` (most common). The full set is Read/Write/Edit/Bash/Task; Codex's `capabilities` field accepts free-text strings per build doc complete example. |
| `interface.websiteURL` | optional | `package.json` | `homepage` | `direct` | Copy. |
| `interface.privacyPolicyURL` | optional | _none_ | _N/A — MIT-license OSS repo_ | `static` | Omit. |
| `interface.termsOfServiceURL` | optional | _none_ | _N/A_ | `static` | Omit. |
| `interface.defaultPrompt` | optional | `skills/help/SKILL.md` or `README.md` | Common-entry skill commands | `generate` | C1 emits canonical starter prompts: `["Run /gdd:brief to start a design cycle.", "Use $gdd-explore to audit a screen."]`. |
| `interface.brandColor` | optional | _none_ | _N/A — no brand color picked yet_ | `generate` | C1 emits a chosen color or omits. Suggested: `"#10A37F"` (Codex example) or a project-chosen color. |
| `interface.composerIcon` | optional | `.claude-plugin/plugin.json` | `icon` if present — verify | `transform` | If we have an icon path, copy to `./assets/icon.png` and reference. Otherwise omit. |
| `interface.logo` | optional | _none currently_ | _N/A — not yet shipped_ | `static` | Omit until we ship `./assets/logo.png`. |
| `interface.screenshots` | optional | _none currently_ | _N/A — not yet shipped_ | `static` | Omit. |

**Auxiliary marketplace catalog mapping** (for `.agents/plugins/marketplace.json` or reuse of `.claude-plugin/marketplace.json`):

| Catalog field | Our source | Match status | Transform |
|---------------|-----------|--------------|-----------|
| `name` (top-level marketplace name) | `.claude-plugin/marketplace.json#name` (`"get-design-done"`) | `direct` | Copy. |
| `interface.displayName` | _N/A — Claude marketplace.json doesn't have this_ | `generate` | C1 emits `"Get Design Done"`. |
| `plugins[].name` | manifest `name` (above) | `direct` | Must match plugin manifest. |
| `plugins[].source` | `./` (plugin lives at repo root) | `static` | Emit `{ "source": "local", "path": "./" }` (since the marketplace.json is at repo root in `.claude-plugin/` and the plugin manifest is also at repo root in `.codex-plugin/`, the relative path resolves to `./`). Verify path-resolution rule during C1 — Codex resolves `source.path` relative to marketplace root, which is the dir containing marketplace.json. From `.claude-plugin/marketplace.json` the plugin root is `../` (one level up). |
| `plugins[].policy.installation` | _N/A — Codex-specific_ | `static` | Set `"AVAILABLE"`. |
| `plugins[].policy.authentication` | _N/A — Codex-specific_ | `static` | Set `"ON_FIRST_USE"` (we don't gate on install). |
| `plugins[].category` | `.claude-plugin/marketplace.json#plugins[0].category` (`"design"`) | `transform` | Capitalize: `"Design"`. |

## vs AGENTS.md

**Verdict: `additive`** (literal — one of `additive` / `replacement` / `parallel`).

### Side-by-side comparison

**AGENTS.md surface** (Phase 28.7 file-drop):
- Distribution mechanism: maintainer-side `scripts/install.cjs` copies `AGENTS.md` to user's repo or `~/.codex/AGENTS.md` location (verify path in C1 against Phase 28.7 `codex.cjs` converter — file produces a converted SKILL.md, not a literal AGENTS.md copy).
- Consumer: Codex CLI reads `AGENTS.md` as agent-context at session start.
- Versioning: unversioned — file-drop overwrites latest content.
- Capability declarations: none — AGENTS.md is free-form Markdown.
- Discovery: requires user to clone our repo or `npm install -g`. No marketplace surface.
- Bundles: AGENTS.md does NOT bundle skills/hooks/MCP servers/apps as declared capabilities.

**`.codex-plugin/plugin.json` surface** (Phase 28.8 Tier-2):
- Distribution mechanism: `codex plugin marketplace add hegemonart/get-design-done` (one-line install-by-URL).
- Consumer: Codex CLI reads the installed plugin from `~/.codex/plugins/cache/.../$VERSION/`.
- Versioning: `manifest.version` is a first-class concept — Codex caches per-version and supports `codex plugin marketplace upgrade` for refresh.
- Capability declarations: `manifest.skills`, `manifest.hooks`, `manifest.apps`, `manifest.mcpServers`, plus `manifest.interface` for install-surface metadata.
- Discovery: when self-serve registry lands, GDD becomes browsable in Codex's Plugin Directory + CLI `codex /plugins` browser. Today, discovery is still GitHub-URL-based but via the marketplace plumbing.
- Bundles: declares skills (`./skills/`), MCP servers (`./.mcp.json`), hooks (`./hooks/hooks.json`), and interface metadata.

### Precedence rule (load-bearing)

Searched build page + plugins overview + skills page for an explicit "if `.codex-plugin/plugin.json` is present, `AGENTS.md` is ignored" rule. **No such rule documented as of 2026-05-19** ([per build page](https://developers.openai.com/codex/plugins/build), [per plugins overview](https://developers.openai.com/codex/plugins), [per skills page](https://developers.openai.com/codex/skills)). The two surfaces serve different roles:
- `AGENTS.md` is the agent-context surface for the **current working repo or user-home** — Codex picks it up regardless of whether the plugin is installed.
- `.codex-plugin/plugin.json` is the **packaged plugin surface** — installed under `~/.codex/plugins/cache/.../$VERSION/`, opt-in via `codex /plugins`.

They coexist cleanly. A user who clones our repo gets `AGENTS.md` automatically (Tier-1). A user who `codex plugin marketplace add hegemonart/get-design-done` gets the packaged plugin (Tier-2) WITHOUT needing to clone — discovery + capabilities + install-surface metadata all flow through `plugin.json`.

### Verdict citation

**`additive`** — both surfaces ship in parallel. CONTEXT D-05 working hypothesis CONFIRMED. Phase 28.7's `codex.cjs` converter remains unchanged for the Codex slot. C1 adds a new `kind: 'codex-plugin'` converter that emits `.codex-plugin/plugin.json` (+ Codex-compatible marketplace.json entry if our existing one needs adjustment) without touching `codex.cjs`.

### Implications for C1

- C1 adds `kind: 'codex-plugin'` to `scripts/lib/install/runtimes.cjs` per CONTEXT D-05 (additive).
- C1 implements `scripts/lib/install/converters/codex-plugin.cjs` that generates `.codex-plugin/plugin.json` from the Schema Mapping table.
- C1 does NOT modify `scripts/lib/install/converters/codex.cjs` (the Phase 28.7 file-drop SKILL.md converter remains intact).
- C1 also verifies our existing `.claude-plugin/marketplace.json` is consumable by Codex's legacy-compat path. If field-shape gap detected (e.g., missing `policy.installation`, `policy.authentication`, `category` on plugin entries), C1 either (a) adds those fields to `.claude-plugin/marketplace.json` (preserves single-source-of-truth) or (b) emits a Codex-specific `.agents/plugins/marketplace.json` (cleaner separation; recommended).

## Field-Test Plan

### Prerequisites
1. **Codex CLI installed.** Version requirement: not explicitly documented on the build page as of 2026-05-19; the build page references `codex` CLI commands generically. Recorded in Open Questions. The CLI binary is `codex` (per `codex /plugins` and `codex plugin marketplace add` shapes documented).
2. **Codex CLI authenticated for THIS user.** Sign-in/account requirements documented under Codex Authentication ([developers.openai.com/codex/authentication](https://developers.openai.com)) but install-by-URL itself does not require a Codex publisher account.
3. **`.codex-plugin/plugin.json` committed to `main` branch** of `github.com/hegemonart/get-design-done` at the v1.28.8 tag (the manifest C1 ships).
4. **Marketplace catalog file** present at one of the recognized paths:
   - `.agents/plugins/marketplace.json` (canonical, C1 generates this in Wave B), OR
   - `.claude-plugin/marketplace.json` (legacy-compat — we already ship this; C1 verifies Codex-shape compatibility).
5. **v1.28.8 tag pushed to GitHub** so the GitHub shorthand resolves cleanly. (Codex docs do not specify whether the marketplace add command resolves to HEAD of `main`, latest tag, or `--ref`-pinned commit; if HEAD is default, the tag-push is a soft requirement — recorded in Open Questions.)

### Field-test command (verbatim)
```bash
codex plugin marketplace add hegemonart/get-design-done
```

### Expected success output
The build page does not quote an example stdout/stderr for `codex plugin marketplace add`. Expected shape (inferred from command semantics):
```
(undocumented success output — likely a confirmation that the marketplace has been added,
 followed by a list of plugins discovered in the catalog, with prompt to install each plugin
 individually OR a default-install action if policy.installation is INSTALLED_BY_DEFAULT)
```
**Recorded in Open Questions:** exact success-output shape.

### Expected post-install filesystem state
```
~/.codex/plugins/cache/get-design-done/get-design-done/1.28.8/
  .codex-plugin/
    plugin.json
  skills/
    discuss/SKILL.md
    explore/SKILL.md
    ... (68 more)
  hooks/
    hooks.json            # only present if C1 ships hooks
    ...
  assets/                 # only if C1 ships icons/screenshots
  README.md
  package.json
  ... (other root-level files)
```
NOTE: First path segment `get-design-done` = marketplace catalog's top-level `name`. Second segment `get-design-done` = plugin manifest's `name`. Third segment `1.28.8` = plugin manifest's `version`.

### Verification command
```bash
ls ~/.codex/plugins/cache/get-design-done/get-design-done/1.28.8/.codex-plugin/plugin.json
```
Expected output: file path printed (file exists) and 0 exit code.

Additional verification:
```bash
codex /plugins
```
Expected: opens the Codex CLI plugin browser; navigates to the "get-design-done" marketplace tab; lists the `get-design-done` plugin with install state indicator. (Per [plugins overview](https://developers.openai.com/codex/plugins).)

### Failure modes
- **Manifest JSON syntax error in `.codex-plugin/plugin.json`** — CLI exit code likely non-zero; expected message references invalid JSON at the manifest path. Exact format undocumented.
- **Repo not public / not found** — CLI exit code non-zero; expected message references unreachable Git source. The build page doesn't document this verbatim but is implied by Codex marketplace's source-resolution logic.
- **`.codex-plugin/plugin.json` missing entirely** — Per the build page, `.codex-plugin/plugin.json` is the required entry point; without it, Codex would have no plugin to install. The marketplace catalog might still register, but plugin install would fail.
- **Marketplace catalog file missing at any recognized path** — `codex plugin marketplace add` would have nothing to add. Expected failure: "no marketplace catalog found at `<paths searched>`" or similar.
- **`source.path` in catalog doesn't resolve relative to marketplace root** — Per [build page](https://developers.openai.com/codex/plugins/build): "If Codex can't resolve a marketplace entry's source, it skips that plugin entry instead of failing the whole marketplace." So a path-resolution bug results in the plugin being silently absent from the post-install listing, NOT a hard error. **C2 doctor mode must guard against this** by validating that `source.path` from the marketplace.json resolves to an existing directory.
- **`name` not kebab-case** — Per the build page kebab-case constraint, an invalid name (camelCase, with `@npm-scope`, etc.) likely produces an install error. Exact message undocumented.
- **`hooks` declared but `[features].plugin_hooks = true` not set in user config** — Per the build page: "Plugin hooks are off by default in this release; bundled hooks won't run unless `[features].plugin_hooks = true`." Install succeeds; hooks silently don't run. C2 doctor mode should warn the user if `manifest.hooks` is present but the feature flag is unset, with link to enabling.

### Doctor mode integration (Plan 28-8-C2 scope)

Three local checks runnable WITHOUT executing `codex plugin marketplace add`:

| Check | Local-checkable? | Action |
|-------|------------------|--------|
| `.codex-plugin/plugin.json` exists at repo root | **yes** | `fs.existsSync('.codex-plugin/plugin.json')` |
| Manifest is valid JSON | **yes** | `JSON.parse()` doesn't throw |
| Manifest has required fields `name`, `version`, `description` | **yes** | Field presence check |
| `manifest.name` is kebab-case | **yes** | Regex `/^[a-z0-9]+(-[a-z0-9]+)*$/` |
| `manifest.version` matches semver | **yes** | Use existing semver-compare helper |
| `manifest.skills` path resolves to a directory | **yes** | `fs.statSync(manifest.skills).isDirectory()` |
| `manifest.mcpServers` path resolves to a file (if set) | **yes** | `fs.statSync` |
| `manifest.hooks` path resolves to a file (if set) | **yes** | `fs.statSync` |
| Marketplace catalog file at one of `[.agents/plugins/marketplace.json, .claude-plugin/marketplace.json]` exists | **yes** | `fs.existsSync` on each |
| Marketplace catalog has an entry whose `name` matches `manifest.name` | **yes** | JSON traversal |
| Marketplace catalog entry's `source.path` resolves to an existing directory | **yes** | `fs.statSync` |
| `~/.codex/plugins/cache/...` post-install state | **no — requires field-test** | Out of doctor scope. Maintainer runs field-test post-merge. |
| Codex CLI plugin listing (`codex /plugins`) | **no — requires Codex CLI installed + interactive UI** | Out of doctor scope. |

### Verdict

**Field-test gate: GREEN** — maintainer can run `codex plugin marketplace add hegemonart/get-design-done` post-merge with the following prerequisites met:
1. Codex CLI installed (version unspecified; latest stable).
2. Codex CLI authenticated (sign-in is a one-time install setup).
3. `.codex-plugin/plugin.json` committed and pushed to `main` at v1.28.8 (C1 ships this).
4. Marketplace catalog file (either Codex-canonical `.agents/plugins/marketplace.json` OR legacy-compat `.claude-plugin/marketplace.json`) committed and pushed (C1 verifies/emits this).
5. v1.28.8 tag pushed (soft requirement — TBD whether marketplace add resolves to HEAD or tag by default).

No blockers identified. Install-by-URL is documented and not gated on the self-serve registry going live. CONTEXT D-03 confirmed (with the catalog-file refinement noted in the Distribution Mechanism section).

## Open Questions

The following could not be answered from public docs as of 2026-05-19. C1 + C2 implementations should treat these as "verify-on-field-test" items:

1. **Exact `codex plugin marketplace add` success output shape.** The build page documents the command's usage but does not quote example stdout/stderr. Field-test will reveal — record verbatim in Plan 28-8-C2's post-merge field-test result writeup.
2. **Whether `codex plugin marketplace add owner/repo` resolves to HEAD of default branch, latest tag, or some other Git ref by default.** The build page documents `--ref` for explicit pinning but doesn't specify the default resolution. Affects whether the v1.28.8 tag push is hard or soft requirement.
3. **Whether Codex enforces a `$schema` URL or `manifestVersion` field.** The build page complete-manifest example does not include either. No JSON Schema URL is published as of 2026-05-19.
4. **Codex CLI minimum version.** Not specified on the build page. C1 + C2 should not encode a version gate without empirical evidence.
5. **Exact JSON shape that Codex's legacy-compat reads from `.claude-plugin/marketplace.json`.** The build page says Codex reads this path "legacy-compatible" but doesn't enumerate what subset of fields it understands. Our existing `.claude-plugin/marketplace.json` may or may not need `policy.installation`/`policy.authentication`/`category` fields added per plugin entry. C1 must verify empirically.
6. **Codex hook event names and schema.** The build page references "the same event schema as regular hooks" and points at the Codex Hooks doc which was not fetched in this re-verify (would have exceeded the 6-fetch budget). C1 must fetch [/codex/configuration/hooks](https://developers.openai.com) if it ships `hooks` in the manifest.
7. **Whether `.app.json` schema is documented anywhere.** Not on the build page. Plus GDD has no apps to declare, so out of scope for C1.
8. **Whether `manifest.skills` as a single path string (`"./skills/"`) auto-discovers ALL skills in that folder.** The minimal example uses the single-path form, implying auto-discovery. The complete-manifest example also uses single-path form. Confirm via field-test that all 70 GDD skills are loaded under the cache.
9. **What "Plugin Directory" listing requires (when self-serve eventually lands).** Out of scope for v1.28.8 — Phase 28.10+ concern.
10. **Whether install-by-URL is rate-limited or has any quota.** No documentation. Field-test will reveal.

## Fetch Issues

| URL | Attempt date | HTTP status | Note |
|-----|--------------|-------------|------|
| `https://developers.openai.com/codex/plugins/manifest` | 2026-05-19 | 404 | Page does not exist. Manifest schema is documented inline on `/codex/plugins/build`, not as a separate page. No impact — full schema is on the build page. |
| `https://developers.openai.com/codex/plugins/distribute` | 2026-05-19 | 404 | Page does not exist. Distribution is documented inline on `/codex/plugins/build` (Add a marketplace from the CLI + How Codex uses marketplaces sections). No impact. |

No CRITICAL fetch failures. [developers.openai.com/codex/plugins/build](https://developers.openai.com/codex/plugins/build) — the source page CONTEXT D-03 was based on — is `live` (HTTP 200). CONTEXT D-03 does NOT need revision for "page exists" reasons; the only refinement is the catalog-file requirement noted in the Distribution Mechanism section above.

## Sources

| URL | Pin-date | What we extracted |
|-----|----------|-------------------|
| [https://developers.openai.com/codex/plugins/build](https://developers.openai.com/codex/plugins/build) | 2026-05-19 | Primary source. Full manifest format (8 top-level fields + 14 `interface` sub-fields), plugin file/folder structure tree, distribution mechanism (`codex plugin marketplace add` command + sources), install cache path (`~/.codex/plugins/cache/$MARKETPLACE_NAME/$PLUGIN_NAME/$VERSION/`), marketplace catalog format, MCP/hooks bundling rules, hooks feature flag (`[features].plugin_hooks = true`), publish official public plugins "coming soon" verdict. |
| [https://developers.openai.com/codex/plugins](https://developers.openai.com/codex/plugins) | 2026-05-19 | Plugins overview. Install/uninstall flows from end-user perspective; `codex /plugins` CLI plugin browser; `~/.codex/config.toml` per-plugin enabled-state config; remove-or-turn-off flow; "build your own plugin" pointer back to /build. |
| [https://developers.openai.com/codex/skills](https://developers.openai.com/codex/skills) | 2026-05-19 | Skill spec referenced by `manifest.skills`. SKILL.md required fields (`name`, `description`); skill scopes (REPO/USER/ADMIN/SYSTEM) and discovery locations (`$CWD/.agents/skills`, `$HOME/.agents/skills`, etc.); `agents/openai.yaml` optional UI metadata file; "Distribute skills with plugins" pointer back to /build. |
| [https://developers.openai.com/codex](https://developers.openai.com/codex) | 2026-05-19 | Codex docs home / overview. Used to confirm Plugins sit under the Codex docs tree, navigation structure, Feature Maturity link present (not fetched). |
| `https://developers.openai.com/codex/plugins/manifest` | 2026-05-19 | HTTP 404 — page does not exist. Recorded in Fetch Issues. |
| `https://developers.openai.com/codex/plugins/distribute` | 2026-05-19 | HTTP 404 — page does not exist. Recorded in Fetch Issues. |

**Re-verify discipline:** All citations above were fetched on 2026-05-19 (today), NOT cached from the 2026-05-18 audit. Per CONTEXT D-07 (mandatory workstream-start re-verify) and CONTEXT D-03 (Codex install-by-URL works today — re-verify against build page). Build page state on 2026-05-19 confirms D-03 (with the catalog-file refinement) and confirms D-05 (additive vs Phase 28.7 AGENTS.md surface).
