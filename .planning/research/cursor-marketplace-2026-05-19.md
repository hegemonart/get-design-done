# Cursor Marketplace Research — 2026-05-19

<!-- Phase 28.8 / Plan 28-8-02 / pin-date 2026-05-19 / source-of-truth re-verify per CONTEXT D-07 -->

## TL;DR

- **Launch state on 2026-05-19:** Cursor Marketplace is live and the [Plugins documentation](https://cursor.com/docs/plugins) is public. The Plugins Reference at [cursor.com/docs/reference/plugins](https://cursor.com/docs/reference/plugins) publishes a complete manifest schema. Marketplace browse page at [cursor.com/marketplace](https://cursor.com/marketplace) is open.
- **Manifest filename + path:** `.cursor-plugin/plugin.json` at the plugin root. Per [Plugins reference](https://cursor.com/docs/reference/plugins): "Every plugin requires a `.cursor-plugin/plugin.json` manifest file."
- **Distribution model verdict:** `marketplace-UI-only` for the **public** Cursor Marketplace (every plugin manually reviewed before listing; submit via [cursor.com/marketplace/publish](https://cursor.com/marketplace/publish)). A separate **install-by-URL** path exists for **private team marketplaces** (Team/Enterprise plan; Import GitHub repo URL via Dashboard → Settings → Plugins → Team Marketplaces → Import). The public path is `marketplace-UI-only`.
- **Field-test gate verdict:** `BLOCKED — by Cursor publisher application + manual review window (no SLA published)`. The public marketplace requires (a) submitting a publisher application at [cursor.com/marketplace/publish](https://cursor.com/marketplace/publish) and (b) Cursor team manual review of both the publisher and every plugin update. Cursor explicitly states "We work with a small group of trusted partners" per [marketplace security](https://cursor.com/help/security-and-privacy/marketplace-security), which is an invite-friendly framing, not a self-serve registry. CONTEXT D-04 ("maintainer-confirmed publish access") is **partially refuted**: the maintainer may submit, but the doc does not establish that submission is guaranteed approval or that publish is same-day. CONTEXT D-09 (live publish as a post-merge maintainer step) needs a review-window caveat.
- **B1 ask:** Implement `.cursor-plugin/plugin.json` generator with `name` (required, kebab-case) plus the documented optional fields (description, version, author, homepage, repository, license, keywords, logo, rules, agents, skills, commands, hooks, mcpServers). The Manifest Format and Schema Mapping tables below contain the full field-by-field spec.
- **B2 ask:** Wire `scripts/install.cjs --doctor` to check manifest presence at `.cursor-plugin/plugin.json` plus a `.cursor-plugin/marketplace-state.json` written post-publish. Document the post-merge maintainer step as: "submit publisher application at cursor.com/marketplace/publish → wait for Cursor manual review → publish via review approval" (no `cursor publish` CLI documented; submission is web-form-based).

---

## Marketplace Re-verify

**Status verdict (2026-05-19):** Cursor Marketplace is **launched, public, and live**. Both the marketplace browse UI and the public plugin documentation resolve over HTTPS with status 200.

**Evidence:**

- [cursor.com/docs/plugins](https://cursor.com/docs/plugins) (HTTP 200; page title "Plugins | Cursor Docs"; meta description "Browse, install, and manage plugins from the Cursor Marketplace.") — published end-user docs for the marketplace.
- [cursor.com/marketplace](https://cursor.com/marketplace) (HTTP 200; 1.9 MB Next.js SPA) — public browse UI.
- [cursor.com/docs/reference/plugins](https://cursor.com/docs/reference/plugins) (HTTP 200; page title "Plugins Reference | Cursor Docs"; meta description "API reference for Cursor plugins. Manifest format, component discovery, rules, skills, agents, commands, hooks, MCP servers, and marketplace manifests.") — published manifest schema.
- [cursor.com/help/security-and-privacy/marketplace-security](https://cursor.com/help/security-and-privacy/marketplace-security) (HTTP 200; page title "Marketplace security | Cursor Docs") — published policy doc.
- [cursor.com/marketplace/publish](https://cursor.com/marketplace/publish) (HTTP 200; page title "Publish a Cursor Marketplace Plugin | Cursor Plugins"; meta robots `noindex, nofollow, noarchive`) — gated publisher application form (page is rendered, but the form body is client-rendered and effectively requires login to interact with).

**Launch date confirmation:** CONTEXT D-04 claims a "launched Feb 2026" framing. Direct launch-date confirmation was NOT pursued in this pass (`cursor.com/changelog` and `forum.cursor.com` were skipped to stay within the 6-call WebFetch budget; the four core docs pages above gave full manifest + publish-flow coverage without needing the changelog). The launch-date claim is therefore **carried over from CONTEXT D-04 unverified by this pass** and recorded in Open Questions. The public docs being live on 2026-05-19 is sufficient evidence for Wave B; precise launch-date confirmation is not blocking.

**Maintainer-access claim re-verify (CONTEXT D-04):** D-04 says "Cursor Marketplace: maintainer has access for live publish." On the basis of public docs alone, this resolves to: **anyone can submit a publisher application** at [cursor.com/marketplace/publish](https://cursor.com/marketplace/publish). The docs do not state submission is automatically approved. They state plugins are "manually reviewed before it's listed" and that Cursor "work with a small group of trusted partners" per [marketplace security](https://cursor.com/help/security-and-privacy/marketplace-security). The maintainer's status as a confirmed publisher (vs. a pending-applicant) is not verifiable from public docs. Recorded as partial confirmation.

**Marketplace state on 2026-05-19:**
- Browse UI: public, no login required to land on [cursor.com/marketplace](https://cursor.com/marketplace).
- Submission: gated by application at [cursor.com/marketplace/publish](https://cursor.com/marketplace/publish) — the application page is `noindex` and effectively gated (login required to interact).
- Installation flow described in [docs/plugins](https://cursor.com/docs/plugins): "Install plugins from the marketplace. Plugins can be scoped to a project or installed at the user level." Install is from the in-Cursor marketplace panel, not via a CLI command against a GitHub URL.

---

## Manifest Format

**Filename + path:** `.cursor-plugin/plugin.json` at the plugin root. Verbatim per [Plugins reference § Plugin manifest](https://cursor.com/docs/reference/plugins#plugin-manifest): "Every plugin requires a `.cursor-plugin/plugin.json` manifest file."

**JSON Schema URL:** None published. The reference page documents the schema in prose + table form; there is no `$schema` URL the manifest can validate against, and the docs do not show a `$schema` field on the example manifests. Implication for B1: schema validation will be implemented against this written spec, not by `Ajv` against a published schema URL.

**Schema versioning:** No schema-version field is documented or shown in examples. The manifest is treated as the current version implicitly.

**Plugin manifest fields (per [Plugins reference § Plugin manifest](https://cursor.com/docs/reference/plugins#plugin-manifest)):**

| Field        | Required? | Type              | Constraint                                                                                                                                                                                  | Description (docs verbatim where quoted)                                                                                                                                                                              | Example value                                                                  |
| ------------ | --------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `name`       | **YES**   | string            | "Lowercase, kebab-case (alphanumerics, hyphens, and periods). Must start and end with an alphanumeric character."                                                                            | "Plugin identifier." Per [§ Required fields](https://cursor.com/docs/reference/plugins#required-fields).                                                                                                              | `"my-plugin"` or `"prompts.chat"`                                              |
| `description`| no        | string            | None documented                                                                                                                                                                              | "Brief plugin description"                                                                                                                                                                                            | `"Custom development tools"`                                                   |
| `version`    | no        | string            | "Semantic version (e.g., `1.0.0`)"                                                                                                                                                           | "Semantic version (e.g., 1.0.0)"                                                                                                                                                                                      | `"1.0.0"`                                                                      |
| `author`     | no        | object            | "`name` (required), `email` (optional)" — when the `author` object is present, `author.name` is required inside it.                                                                          | "Author info: `name` (required), `email` (optional)"                                                                                                                                                                  | `{"name":"Your Name","email":"you@example.com"}`                               |
| `homepage`   | no        | string            | None documented (URL)                                                                                                                                                                        | "URL to plugin homepage"                                                                                                                                                                                              | `"https://github.com/owner/repo"`                                              |
| `repository` | no        | string            | None documented (URL)                                                                                                                                                                        | "URL to plugin repository"                                                                                                                                                                                            | `"https://github.com/owner/repo"`                                              |
| `license`    | no        | string            | None documented (SPDX-style identifier)                                                                                                                                                      | "License identifier (e.g., `MIT`)"                                                                                                                                                                                    | `"MIT"`                                                                        |
| `keywords`   | no        | array of strings  | None documented                                                                                                                                                                              | "Tags for discovery and categorization"                                                                                                                                                                               | `["enterprise","security","compliance"]`                                       |
| `logo`       | no        | string            | "Relative path to a logo file in the repo (e.g., `assets/logo.svg`), or an absolute URL. Relative paths resolve to `raw.githubusercontent.com` URLs." Preference: commit + use relative path. | "Preferred: commit the logo to your repo and use a relative path."                                                                                                                                                    | `"assets/logo.svg"`                                                            |
| `rules`      | no        | string or array   | "Path(s) to rule files or directories" — when set, replaces folder discovery for rules. Default folder `rules/` is not also scanned.                                                         | "Path(s) to rule files or directories"                                                                                                                                                                                | `"./my-rules/"` or `["rules/eslint/","rules/typescript/"]`                     |
| `skills`     | no        | string or array   | "Path(s) to skill directories" — when set, replaces folder discovery for skills.                                                                                                             | "Path(s) to skill directories"                                                                                                                                                                                        | `"./skills/"` or `["./skills/code/","./skills/design/"]`                       |
| `agents`     | no        | string or array   | "Path(s) to agent files or directories"                                                                                                                                                      | "Path(s) to agent files or directories"                                                                                                                                                                               | `"./agents/"`                                                                  |
| `commands`   | no        | string or array   | "Path(s) to command files or directories"                                                                                                                                                    | "Path(s) to command files or directories"                                                                                                                                                                             | `"./commands/"`                                                                |
| `hooks`      | no        | string or object  | "Path to hooks config file, or inline hook config"                                                                                                                                           | "Path to hooks config file, or inline hook config"                                                                                                                                                                    | `"hooks/hooks.json"` or `{"hooks":{"afterFileEdit":[{"command":"./fmt.sh"}]}}` |
| `mcpServers` | no        | string, object, or array | "Path to MCP config file, inline MCP server config, or an array of either. Overrides default `mcp.json` discovery."                                                                  | "Path to MCP config file, inline MCP server config, or an array of either. Overrides default `mcp.json` discovery."                                                                                                   | `"mcp.json"` or `{"mcpServers":{...}}`                                         |

**Component discovery rules** (per [§ Component discovery](https://cursor.com/docs/reference/plugins#component-discovery)):

When the manifest does NOT specify a path for a given component type, Cursor performs **automatic folder-based discovery**:

| Component | Default folder | Discovery rule                                                                                                |
| --------- | -------------- | -------------------------------------------------------------------------------------------------------------- |
| Skills    | `skills/`      | "Each subdirectory containing a `SKILL.md` file"                                                              |
| Rules     | `rules/`       | "All `.md`, `.mdc`, or `.markdown` files"                                                                      |
| Agents    | `agents/`      | "All `.md`, `.mdc`, or `.markdown` files"                                                                      |
| Commands  | `commands/`    | "All `.md`, `.mdc`, `.markdown`, or `.txt` files"                                                              |
| Hooks     | n/a (file)     | `hooks/hooks.json` is parsed for hook event names                                                              |
| MCP Servers | n/a (file)   | `mcp.json` at plugin root is parsed for server entries                                                         |
| Root Skill | `SKILL.md`     | "Treated as a single-skill plugin (only if no `skills/` dir and no manifest `skills` field)"                  |

**Note for B1:** If a manifest field is specified (e.g., `"skills": "./my-skills/"`), it **replaces** folder discovery for that component. The default folder is not also scanned. Our `skills/` tree already lives at `skills/`, so the simplest B1 output omits `skills` and lets Cursor auto-discover.

**Example manifest** (verbatim from [§ Example manifest](https://cursor.com/docs/reference/plugins#example-manifest)):

```json
{
  "name": "enterprise-plugin",
  "version": "1.2.0",
  "description": "Enterprise development tools with security scanning and compliance checks",
  "author": {
    "name": "ACME DevTools",
    "email": "devtools@acme.com"
  },
  "keywords": ["enterprise", "security", "compliance"],
  "logo": "assets/logo.svg"
}
```

**Minimal example** (from [docs/plugins § Creating plugins](https://cursor.com/docs/plugins#creating-plugins)):

```json
{
  "name": "my-plugin",
  "description": "Custom development tools",
  "version": "1.0.0",
  "author": { "name": "Your Name" }
}
```

**Multi-plugin marketplace manifest** (per [§ Multi-plugin repositories](https://cursor.com/docs/reference/plugins#multi-plugin-repositories)):

Filename: `.cursor-plugin/marketplace.json` at the **repository root** (not plugin root). Fields:

| Field      | Required? | Type   | Description                                                                                              |
| ---------- | --------- | ------ | -------------------------------------------------------------------------------------------------------- |
| `name`     | YES       | string | "Marketplace identifier (kebab-case)"                                                                    |
| `owner`    | YES       | object | "`name` (required), `email` (optional)"                                                                 |
| `plugins`  | YES       | array  | "Array of plugin entries (max 500)"                                                                      |
| `metadata` | no        | object | "Optional. `description`, `version`, `pluginRoot` (prefix path for all plugin sources)"                  |

Plugin entry fields (`plugins[i]`): `name` (required, kebab-case), `source` (string or object — path to plugin directory, or `{path, options}`), `description`, `version`, `author`, `homepage`, `license`, `keywords`, `logo`, `category`, `tags`, `skills`/`rules`/`agents`/`commands` (string or array), `hooks` (string or object), `mcpServers` (string or object).

**Resolution rule** (verbatim): "For a marketplace entry with `'source': 'my-plugin'`: (1) The parser looks for `my-plugin/.cursor-plugin/plugin.json`. (2) If found, the per-plugin manifest is merged with the marketplace entry (manifest values take precedence). (3) Component discovery runs within the `my-plugin/` directory, using manifest paths if specified or folder-based discovery as fallback."

**Implication for B1:** GDD is a **single-plugin** repo. Wave B1 generates `.cursor-plugin/plugin.json` only, NOT `.cursor-plugin/marketplace.json`. The marketplace manifest is a future option if we ever split GDD into multiple Cursor plugins (e.g., one per skill). Out of scope for v1.28.8.

---

## Publish Flow

Numbered step-by-step from cold-start to live-in-marketplace. Source: synthesis of [docs/plugins § Creating plugins / Test plugins locally](https://cursor.com/docs/plugins#creating-plugins), [reference/plugins § Submitting a plugin](https://cursor.com/docs/reference/plugins#submitting-a-plugin), and [marketplace-security](https://cursor.com/help/security-and-privacy/marketplace-security).

1. **Create a Cursor account** (free tier acceptable — no paid-plan requirement documented for individual publishers). The maintainer must be logged in to submit at [cursor.com/marketplace/publish](https://cursor.com/marketplace/publish). (Team/Enterprise plans are required only for **team marketplaces**, not public marketplace publishing.)

2. **Author the plugin manifest** at `.cursor-plugin/plugin.json` in the plugin root. Minimum required: `name` field (kebab-case). Per [§ Plugin manifest](https://cursor.com/docs/reference/plugins#plugin-manifest).

3. **Add components** under the default folders (`skills/`, `rules/`, `agents/`, `commands/`, `hooks/`, `mcp.json`) OR specify explicit paths in the manifest fields. Per [§ Component discovery](https://cursor.com/docs/reference/plugins#component-discovery).

4. **Test the plugin locally** by loading it from `~/.cursor/plugins/local/`:
   - Maintainer action: `mkdir -p ~/.cursor/plugins/local/get-design-done` (or symlink: `ln -s /path/to/get-design-done ~/.cursor/plugins/local/get-design-done`).
   - Restart Cursor or run **Developer: Reload Window**.
   - Verify components load (rules, skills, MCP servers visible in Settings panel).
   - Per [docs/plugins § Test plugins locally](https://cursor.com/docs/plugins#test-plugins-locally).

5. **Push to a public Git repository.** Docs require: "Push your plugin to a public Git repository. Commit your logo to the repo (optional but recommended)." Per [reference § Submitting a plugin](https://cursor.com/docs/reference/plugins#submitting-a-plugin). All marketplace plugins must be **open source** per [marketplace-security § Are plugins open source?](https://cursor.com/help/security-and-privacy/marketplace-security#are-plugins-open-source).

6. **Submit the publisher application + plugin link** at [cursor.com/marketplace/publish](https://cursor.com/marketplace/publish). The page's published meta description: "Submit your plugin publisher application to list your plugin in the Cursor Marketplace." This is a web form (no CLI documented). Maintainer must be logged in.

7. **Wait for Cursor manual review.** Per [marketplace-security § Are plugin updates reviewed?](https://cursor.com/help/security-and-privacy/marketplace-security): "We manually review every plugin update, so nothing gets into the marketplace without explicit approval." Review SLA: **not published in public docs.**

8. **Cursor approves → plugin appears in marketplace.** After approval, the plugin is browsable + installable from the in-Cursor marketplace panel. Users install via UI: open marketplace panel → search → install (scope: per-project or per-user).

**Admin requirements explicitly enumerated:**

- **Account required?** YES — must submit via logged-in web form at `cursor.com/marketplace/publish`.
- **Paid tier required for public marketplace publish?** NOT DOCUMENTED. The docs reference "Team and Enterprise marketplaces" as a paid upgrade for **private** marketplaces, but the public-marketplace publish flow does not document a paid-plan gate per [docs/plugins § Team and Enterprise marketplaces](https://cursor.com/docs/plugins).
- **App review?** YES — manual review every time per [marketplace-security § Are plugin updates reviewed?](https://cursor.com/help/security-and-privacy/marketplace-security).
- **Code signing?** NOT DOCUMENTED. No signing requirement appears in the reference page or security policy.
- **Repository ownership verification?** PROBABLE but not explicitly documented. The submission flow takes a GitHub repo URL; ownership is presumably verified via the publisher account, but the docs do not spell this out.
- **Two-factor auth?** NOT DOCUMENTED.
- **CLI for publish (`cursor publish` / `cursor marketplace publish`)?** NOT DOCUMENTED. Submission is web-form-based at [cursor.com/marketplace/publish](https://cursor.com/marketplace/publish). No `cursor` CLI publish subcommand appears in any of the four fetched docs pages.
- **Open-source requirement?** YES, strict: "All marketplace plugins must be open source." Per [marketplace-security](https://cursor.com/help/security-and-privacy/marketplace-security).
- **Trusted-partner framing:** "Every plugin in the Cursor Marketplace is manually reviewed before it's listed. We work with a small group of trusted partners and review each plugin for security, data handling, and quality." Per [marketplace-security](https://cursor.com/help/security-and-privacy/marketplace-security). This phrasing implies the bar to publish is curatorial, not self-serve.

**Install side (for the user, not the publisher):** Plugin install is **marketplace-UI-only** — open the marketplace panel inside Cursor → search → install. There is no documented `cursor marketplace add owner/repo` command for the **public** marketplace. (Team marketplaces are install-by-GitHub-URL via Dashboard → Settings → Plugins → Team Marketplaces → Import — but that is a private flow scoped to the team's members.)

### Open Questions (flagged for maintainer / Wave B confirmation)

- **What is Cursor's manual-review turnaround SLA?** Not published in public docs. Maintainer's experience post-submission will calibrate B2's doctor-mode messaging ("Pending review since X days").
- **Does the publisher application gate by repo metrics (stars, license, CI presence)?** Not documented. The submission checklist (below) is content-only.
- **Is the maintainer already an approved publisher?** Not verifiable from public docs. CONTEXT D-04 asserts yes; this research can neither confirm nor refute that. If the maintainer has prior trusted-partner standing, steps 1 and 6-7 collapse to a same-session publish; if not, step 7 may be multi-day.
- **Does the manifest need a `repository` field that exactly matches the submission GitHub URL?** The docs document `repository` as optional, but for a submitted plugin to pass review where the source is `https://github.com/hegemonart/get-design-done` it's almost certain the field needs to match. Not explicitly required in the schema, but treat as best practice.
- **What happens to the existing Phase 28.7 file-drop install at `~/.cursor/skills/` if our plugin is also marketplace-installed at the user level?** Out of scope for this research — flagged for Wave B testing.
- **Cursor launch date (Feb 2026 per CONTEXT D-04)?** Not verified in this pass (changelog not fetched within 6-call budget). Recorded as carried-over from CONTEXT.

### Submission checklist (verbatim from [reference § Submission checklist](https://cursor.com/docs/reference/plugins#submission-checklist))

- [ ] Plugin has a valid `.cursor-plugin/plugin.json` manifest
- [ ] `name` is unique, lowercase, kebab-case (e.g., `my-awesome-plugin`)
- [ ] `description` clearly explains the plugin's purpose
- [ ] All rules, skills, agents, and commands have proper frontmatter metadata
- [ ] Logo is committed to the repo and referenced by relative path (if provided)
- [ ] `README.md` documents usage and any configuration
- [ ] All paths in manifest are relative and valid (no `..`, no absolute paths)
- [ ] Plugin has been tested locally
- [ ] For multi-plugin repos: `.cursor-plugin/marketplace.json` is at the repo root with unique plugin names

---

## Field-Test Prerequisites

Every prerequisite the maintainer must satisfy BEFORE running the post-merge live-publish field-test, mapped to the publish-flow steps above.

**Software prerequisites:**
- **Cursor desktop app** installed (any current version). Needed to local-test step 4. The desktop app provides **Developer: Reload Window** + Settings → Features panel for verifying plugin components load. Per [docs/plugins § Test plugins locally](https://cursor.com/docs/plugins#test-plugins-locally).
- **Git client** on `$PATH`. Needed for step 5 (push public repo).
- **No `cursor` CLI binary requirement.** The docs document **no** `cursor` CLI publish command. Submission is via web form. (A `cursor` CLI does exist for other purposes — opening folders from terminal — but it is not part of the marketplace publish flow.)

**Configured state prerequisites:**
- Maintainer is **logged into a Cursor account** in the Cursor desktop app. Required for both local-testing step 4 (load from `~/.cursor/plugins/local`) and submission step 6 (publish form is logged-in-gated).
- Maintainer is **logged into cursor.com** in a browser with the same account. Required for step 6 (submit publisher application).
- No `cursor login` CLI command is documented. Auth is via the desktop app's OAuth/account-link flow + browser session at cursor.com.

**Account preconditions:**
- Cursor account exists (free tier OK for public-marketplace publishing per the docs — no paid-plan gate is documented for individual publishers).
- **Publisher application approved** — this is the key uncertain prerequisite. Per [marketplace-security](https://cursor.com/help/security-and-privacy/marketplace-security): "We work with a small group of trusted partners." The application form is at [cursor.com/marketplace/publish](https://cursor.com/marketplace/publish) and is gated; whether submission is auto-approved or human-reviewed (and on what SLA) is not documented publicly.
- **Terms-of-service for publishers signed** — not explicitly documented in the public docs, but reasonable expectation as part of the submission flow.

**Repo preconditions:**
- Plugin manifest file committed at `.cursor-plugin/plugin.json` at the plugin root (GDD repo root, since GDD is a single-plugin repo).
- Plugin source is in a **public Git repository.** Per [§ Submitting a plugin](https://cursor.com/docs/reference/plugins#submitting-a-plugin): "Host in a Git repository… Push your plugin to a public Git repository."
- License is open-source-compatible (GDD ships MIT — compatible per [marketplace-security § Are plugins open source?](https://cursor.com/help/security-and-privacy/marketplace-security#are-plugins-open-source)).
- Component files (skills/, agents/, commands/) have proper frontmatter (already true per Phase 28.5 contract + Phase 28.6 co-location).
- README.md documents usage (already true for GDD).
- Logo committed to repo, referenced by relative path (optional but recommended per submission checklist — currently no `assets/logo.svg` in GDD; not blocking).
- All manifest paths are relative and valid (no `..`, no absolute paths) — Wave B1 generator must enforce this.
- For v1.28.8 specifically: `package.json` version bumped to `1.28.8` and the manifest's `version` field matches.

**Field-test gate:** `BLOCKED — by Cursor publisher application + manual-review window (no SLA published)`.

Field-test gate: BLOCKED — by Cursor publisher application approval + manual-review window per plugin update (no SLA published in public docs; carries CONTEXT D-04 partial-refutation + needs CONTEXT D-09 review-window caveat).

**Rationale for BLOCKED verdict:** Cursor's public marketplace is `marketplace-UI-only` with mandatory manual review per plugin update. A maintainer cannot publish v1.28.8 "today" in a same-session sense — even if the publisher application is already approved, every update (including a v1.28.8 first listing) requires manual approval by the Cursor team. There is no documented self-serve publish or install-by-URL pathway for the **public** marketplace that would let GDD verify a successful publish within a CI-friendly window. The blocker is: (a) initial publisher approval if not already granted, AND (b) per-update review approval. Both are out of maintainer's hands.

**Caveats that could downgrade BLOCKED to GREEN:**
- If the maintainer is already an approved Cursor publisher (CONTEXT D-04 asserts maintainer access), step 7 reduces to the per-update review window only.
- If Cursor's review window is consistently short (hours, not days), the post-merge field-test can be run after merge with a stated review-window caveat in B2's doctor messaging.
- If the maintainer can authoritatively confirm publisher access (e.g., via an existing publisher dashboard URL or a prior successful publish), this research's BLOCKED verdict downgrades to **GREEN-with-review-window** for Wave B planning purposes.

The recommendation is: **proceed with Wave B B1/B2 implementation** (manifest generator + doctor mode), but **defer the live-publish field-test to a post-merge maintainer action** explicitly framed as "submission + review window, not same-session publish." CONTEXT D-09 (post-merge maintainer step) is already aligned with this; this research surfaces the review-window dimension that D-09 should capture explicitly.

---

## Schema Mapping

Per-field mapping from Cursor's `.cursor-plugin/plugin.json` schema to GDD source artifacts. One row per Manifest Format field above. Match-status legend: `direct` (copy verbatim), `transform` (reshape), `compose` (assembled from multiple sources), `generate` (B1 must generate), `static` (Cursor-specific constant).

| Cursor manifest field | Required? | Our source artifact | Our field/key | Match status | Transform required |
| --------------------- | --------- | -------------------- | -------------- | ------------- | ------------------- |
| `name` | YES | `package.json` | `name` (currently `"@hegemonart/get-design-done"`) | `transform` | Strip npm scope prefix `@hegemonart/` → `"get-design-done"` (already kebab-case-compliant). Alternative: use `.claude-plugin/plugin.json`'s `name` field which is already `"get-design-done"`. Prefer the latter as canonical source. |
| `description` | no | `.claude-plugin/plugin.json` OR `package.json` | `description` | `compose` | The Claude plugin description is a long-form 4-paragraph blob ill-suited to Cursor's "Brief plugin description" framing. Compose: take `package.json.description` (one sentence: "A design-quality pipeline for AI coding agents…") as the Cursor `description`. Optionally augment with a one-line tagline from README front-matter. Keep under ~200 chars for marketplace card display. |
| `version` | no | `package.json` | `version` (currently `"1.28.7"`, will be `"1.28.8"` post-Wave-D) | `direct` | Copy verbatim. Ensure the 4-manifest lockstep covers `.cursor-plugin/plugin.json` so version stays in sync with `package.json`, `.claude-plugin/plugin.json`, and the two marketplace.json slots. |
| `author` | no | `package.json` | `author` (currently string `"Hegemon"`); `.claude-plugin/plugin.json.author` (object `{name, url}`) | `transform` | Cursor schema requires `author.name` (when object present), `author.email` optional. Transform: `{ "name": ".claude-plugin/plugin.json.author.name" }` → `{ "name": "hegemonart" }`. Add `email` only if available; GDD source does not currently store a maintainer email — leave email unset. |
| `homepage` | no | `package.json` | `homepage` (`"https://github.com/hegemonart/get-design-done"`) | `direct` | Copy verbatim. |
| `repository` | no | `package.json` | `repository.url` (`"https://github.com/hegemonart/get-design-done.git"`) | `transform` | package.json has `repository: {type:"git", url:"…"}`; Cursor docs document `repository` as a string URL. Transform: pull the `.url`, strip trailing `.git` for cleaner display → `"https://github.com/hegemonart/get-design-done"`. |
| `license` | no | `package.json` | `license` (`"MIT"`) | `direct` | Copy verbatim. |
| `keywords` | no | `package.json` | `keywords` (long array — 60+ tags) OR `.claude-plugin/plugin.json.keywords` (same 60+ tag list) | `transform` | Cursor marketplace card likely surfaces only ~5-8 tags. Transform: take the curated subset most relevant to Cursor users (e.g., `["design","ui","ux","frontend","design-system","accessibility","figma","skill"]`) rather than dumping all 60+. Wave B1 generator should accept a configurable subset via a constant. |
| `logo` | no | (none currently) | n/a | `generate` | GDD does not currently ship an `assets/logo.svg`. Wave B1 should either (a) generate a placeholder logo committed at `assets/cursor-logo.svg`, OR (b) reuse an existing icon from `.claude-plugin/marketplace.json` (if it references one). If neither is feasible in v1.28.8, omit the `logo` field — it is optional and submission checklist marks it "if provided". |
| `rules` | no | (none currently) | n/a | `static` | GDD does not ship `rules/`-shaped content (no .mdc files at this time). Omit the `rules` field; Cursor will auto-discover the empty default `rules/` and find nothing — no harm. If a future phase adds Cursor-specific rules, add the field then. |
| `skills` | no | `skills/` directory (exists, 80+ skills with frontmatter) | `skills/<name>/SKILL.md` per skill | `static` | Per `Component discovery` rules, if `skills` field is omitted, Cursor auto-discovers `skills/` and treats every subdirectory containing a `SKILL.md` as a skill. GDD's `skills/` matches this convention exactly (Phase 28.5 contract). **B1 recommendation: omit `skills` field and rely on auto-discovery.** This minimizes manifest churn and lets new skills appear automatically. |
| `agents` | no | `agents/` directory (exists, 22+ agents) | `agents/<name>.md` per agent | `static` | Same logic as `skills`: omit the `agents` field and rely on auto-discovery against the default `agents/` folder. GDD's `agents/` is markdown-shaped per Phase 28.5; should match Cursor's discovery rule for `.md`/`.mdc`/`.markdown` files. **Caveat:** Cursor's agent format requires YAML frontmatter with `name` + `description`. Wave B1 should add a lint check (or rely on the existing Phase 28.5 frontmatter validator) to ensure every agent file has the right frontmatter shape. |
| `commands` | no | `commands/` directory (exists, dozens of slash commands) | `commands/<name>.md` per command | `static` | Same logic as `skills` and `agents`: omit the `commands` field and rely on auto-discovery. Cursor's command format requires YAML frontmatter with `name` + `description`. GDD's commands already use frontmatter per Phase 28.5. |
| `hooks` | no | `hooks/` directory (exists with several .js hooks) | various | `transform` | GDD's `hooks/` directory uses Claude-Code-shape Node.js hook scripts (`SessionStart`, `PostToolUse`, `statusLine`). Cursor's hook format is different: a single `hooks/hooks.json` file mapping event names to `{ command, matcher }` entries. **Decision:** This is an architectural delta — Claude-shape hooks do NOT trivially port to Cursor-shape hooks. Wave B1 should EITHER (a) skip the `hooks` field entirely for v1.28.8 (omit and ship without Cursor hooks), OR (b) build a converter that re-shapes the most useful Claude-shape hooks into Cursor's `hooks.json` schema. Recommend (a) for v1.28.8 — defer (b) to a later phase. |
| `mcpServers` | no | (none currently in GDD's standard install path) — but `scripts/mcp-servers/gdd-mcp/server.ts` and `scripts/mcp-servers/gdd-state/server.ts` exist (Phase 27.7 + Phase 20) | n/a | `transform` OR `generate` | GDD ships **two MCP servers** (`gdd-mcp`, `gdd-state-mcp`) as binaries in `package.json.bin`. To expose them via Cursor plugin install, Wave B1 should generate a `mcp.json` at the plugin root mapping each: `{ "mcpServers": { "gdd-mcp": { "command": "npx", "args": ["-y", "@hegemonart/get-design-done", "gdd-mcp"] }, "gdd-state": { "command": "npx", "args": ["-y", "@hegemonart/get-design-done", "gdd-state-mcp"] } } }`. The `mcpServers` field in `plugin.json` can be omitted (Cursor auto-discovers `mcp.json`). |

**Field count cross-check:** Manifest Format table has 15 fields total (1 required + 14 optional). Schema Mapping table above has 15 rows (one per field). Match.

**Implementation hint for Wave B1:**

```json
{
  "name": "get-design-done",
  "description": "A design-quality pipeline for AI coding agents: brief, plan, implement, and verify UI work against your design system.",
  "version": "1.28.8",
  "author": { "name": "hegemonart" },
  "homepage": "https://github.com/hegemonart/get-design-done",
  "repository": "https://github.com/hegemonart/get-design-done",
  "license": "MIT",
  "keywords": ["design","ui","ux","frontend","design-system","accessibility","figma","skill"]
}
```

…plus a sibling `mcp.json` to surface the two MCP servers. Skills, agents, commands auto-discover from existing `skills/`, `agents/`, `commands/` folders. Hooks deferred. Logo optional.

---

## Distribution Model

**Verdict: `marketplace-UI-only`** (for the public Cursor Marketplace).

**Cited evidence:**

1. **No install-by-URL command documented for the public marketplace.** All four fetched docs pages ([cursor.com/docs/plugins](https://cursor.com/docs/plugins), [cursor.com/docs/reference/plugins](https://cursor.com/docs/reference/plugins), [cursor.com/marketplace](https://cursor.com/marketplace), [cursor.com/help/security-and-privacy/marketplace-security](https://cursor.com/help/security-and-privacy/marketplace-security)) document install via the in-Cursor marketplace panel. The closest install-by-URL pattern in the docs is a `cursor://anysphere.cursor-deeplink/mcp/install?name=...&config=...` deeplink for MCP servers specifically — that is an MCP-only install link, NOT a general plugin install-by-URL. Plugins are installed from the marketplace panel, not from a URL or CLI.

2. **Mandatory manual review per [marketplace-security](https://cursor.com/help/security-and-privacy/marketplace-security):** "Every plugin in the Cursor Marketplace is manually reviewed before it's listed… Yes. Plugins in the marketplace are not automatically updated from source code. We manually review every plugin update, so nothing gets into the marketplace without explicit approval." This is incompatible with `install-by-URL` semantics, which would let a user point Cursor at any GitHub URL with a manifest.

3. **Submission flow is a web-form publisher application** per [cursor.com/marketplace/publish](https://cursor.com/marketplace/publish) (meta: "Submit your plugin publisher application to list your plugin in the Cursor Marketplace"). The `noindex, nofollow` meta on the publish page underscores that this is a gated submission gateway, not a self-serve registry.

4. **Trusted-partner framing** per [marketplace-security](https://cursor.com/help/security-and-privacy/marketplace-security): "We work with a small group of trusted partners." This is curatorial language, not registry language.

**Counter-evidence considered (and rejected as not applying to the public path):**

- **Team marketplaces ARE install-by-URL.** Per [docs/plugins § Add a team marketplace](https://cursor.com/docs/plugins#add-a-team-marketplace): "Use this flow to import a GitHub repository as a team marketplace: Go to Dashboard → Settings → Plugins. In Team Marketplaces, click Import. Paste the GitHub repository URL and continue." This IS install-by-URL — but scoped to a private team (Team/Enterprise plan), not the public marketplace. Not the channel Workstream B targets.

- **Local install IS install-by-path.** `~/.cursor/plugins/local/<name>` per [§ Test plugins locally](https://cursor.com/docs/plugins#test-plugins-locally) is a developer-only local-loading path. Not a distribution channel.

**Hybrid framing rejected:** The public marketplace + team marketplaces are TWO DIFFERENT CHANNELS, not a hybrid model for ONE channel. Workstream B (per CONTEXT line 25 and D-04) targets the **public** Cursor Marketplace — `marketplace-UI-only`.

**B1 implications:**

- **Manifest generator:** B1's `.cursor-plugin/plugin.json` generator targets the public marketplace's review pipeline. The manifest is the same shape whether the plugin ends up in the public marketplace or in a team marketplace, so the generator output is reusable for both, but the **publish path** is different.
- **No need to support install-by-URL discovery shape.** The manifest only needs to be valid against the public-marketplace schema. We do not need to encode discovery hints for a `cursor add owner/repo`-style command, because no such command exists for the public marketplace.
- **Manifest bundled with repo source.** Per the docs, the marketplace clones the maintainer's GitHub repo (after submission approval) to display the plugin. The manifest stays in the repo at `.cursor-plugin/plugin.json` and ships with the source — no separate marketplace-uploaded bundle is needed.

**B2 implications:**

- **Doctor mode SHOULD NOT make a network call to a public marketplace API.** The doctor's job is local: verify `.cursor-plugin/plugin.json` exists, parse it, schema-validate, and check that the version field matches `package.json.version`. Optionally, B2 may check a maintainer-written `.cursor-plugin/marketplace-state.json` for a `lastPublishedAt` timestamp and a `lastPublishedVersion` to flag stale published state vs. local manifest.
- **No "registered in Cursor Marketplace: yes/no" via network probe.** The Cursor public marketplace does not expose a documented API endpoint for "is this plugin published"; the only way to verify live state is to load the in-Cursor marketplace panel and search. Doctor should report state from the local `marketplace-state.json` (maintainer-maintained), not from a network probe.
- **Post-merge field-test framing:** B2 should document the maintainer's post-merge step as "submit + wait for review", NOT as "run `cursor marketplace publish` and verify". The latter is **not a documented Cursor CLI command** as of 2026-05-19.

---

## Open Questions

(Aggregated from earlier sections — these are what Plan 28-8-B1 and 28-8-B2 should ask the maintainer to confirm or accept as deferred.)

1. **Is the maintainer already an approved Cursor publisher?** CONTEXT D-04 asserts maintainer access; public docs cannot verify. If yes, post-submission review is per-plugin-update only; if no, the publisher application itself is a pre-step with unknown SLA.
2. **What is Cursor's review-window SLA?** Not published. Maintainer's first post-merge field-test will calibrate B2's doctor messaging.
3. **Does the maintainer want to ship a logo with v1.28.8?** Submission checklist marks logo "if provided". If yes, B1 needs to know the source path; if no, omit `logo` field.
4. **Hooks: omit or convert?** Wave B1 should default to omit (recommendation in Schema Mapping table). Maintainer may want to keep this open as a future task.
5. **MCP server bin invocation in `mcp.json`:** Is `npx -y @hegemonart/get-design-done gdd-mcp` the right command shape, or should the manifest reference a different bin entry point (e.g., a packaged JS path inside the installed plugin tree)? Wave B1 needs to test this against a local install before publishing.
6. **Does the `repository` field need to exactly match the submission GitHub URL?** Probably yes; the Wave B1 generator should hard-code the GDD repo URL and not let it drift from `package.json.repository`.
7. **CONTEXT D-04 launch-date claim (Feb 2026):** Not verified in this pass. If the precise launch date matters for any documentation copy, the changelog page should be consulted in a follow-up.

---

## Fetch Issues

No URLs returned 404 or were unreachable during this research pass. All five primary URLs returned HTTP 200:

| URL | HTTP | Notes |
|-----|------|-------|
| https://cursor.com/docs/plugins | 200 | Public end-user doc. 136 KB Next.js SPA, content extractable from streaming chunks. |
| https://docs.cursor.com/plugins | 200 (via redirect) | `docs.cursor.com/plugins` returned content identical in size to `cursor.com/docs` (123 KB), suggesting `docs.cursor.com` redirects to `cursor.com/docs`. Same content delivered. Used [cursor.com/docs/plugins](https://cursor.com/docs/plugins) as the canonical URL. |
| https://cursor.com/marketplace | 200 | 1.9 MB Next.js SPA, marketplace browse UI. Content is mostly client-rendered listings; not the primary source for manifest spec. |
| https://cursor.com/docs/reference/plugins | 200 | Public Plugins Reference — the primary source for the manifest schema. |
| https://cursor.com/help/security-and-privacy/marketplace-security | 200 | Public policy page — primary source for review-flow + open-source-required claims. |
| https://cursor.com/marketplace/publish | 200 | Page is `noindex, nofollow, noarchive, nosnippet, noimageindex, nocache`. The form is client-rendered and login-gated. Meta description confirms the gating: "Submit your plugin publisher application to list your plugin in the Cursor Marketplace." |

**URLs not fetched within the 6-call budget** (and not blocking for Wave B):
- `cursor.com/changelog` — would have confirmed CONTEXT D-04's "Feb 2026" launch-date claim. Skipped; logged in Open Questions.
- `forum.cursor.com` — would have been a fallback if the changelog 404'd. Not needed.
- `cursor.com/docs/hooks` — referenced by the Plugins Reference for full hooks docs. Wave B1 can fetch this in its own research if it ends up implementing the hooks converter (currently recommended to defer).

Total WebFetch calls in Step 1: **6** (within budget).

---

## Sources

| URL | Pin date | What we extracted |
|-----|----------|--------------------|
| [https://cursor.com/docs/plugins](https://cursor.com/docs/plugins) | 2026-05-19 | Plugin definition, plugin structure example, manifest path `.cursor-plugin/plugin.json`, local-testing flow (`~/.cursor/plugins/local`), submission URL [cursor.com/marketplace/publish](https://cursor.com/marketplace/publish), team marketplace import-by-URL flow, FAQ confirming manual security review + open-source requirement, references to [/docs/reference/plugins](https://cursor.com/docs/reference/plugins) and [/help/security-and-privacy/marketplace-security](https://cursor.com/help/security-and-privacy/marketplace-security). |
| [https://cursor.com/docs/reference/plugins](https://cursor.com/docs/reference/plugins) | 2026-05-19 | Full manifest schema (required vs. optional fields), example manifest, component discovery rules (skills/rules/agents/commands/hooks/mcp.json), per-component frontmatter requirements (skill `name + description`, rule `description + alwaysApply + globs`, agent `name + description`, command `name + description`), available hook events list, multi-plugin marketplace.json format, logo URL resolution rule, submission steps + submission checklist. |
| [https://cursor.com/marketplace](https://cursor.com/marketplace) | 2026-05-19 | Confirmed marketplace browse UI is public and live; canonical URL for the in-marketplace install surface. Marketplace UI is the install path (no install-by-URL command). |
| [https://cursor.com/marketplace/publish](https://cursor.com/marketplace/publish) | 2026-05-19 | Confirmed the publish page exists as a publisher application form (meta description: "Submit your plugin publisher application to list your plugin in the Cursor Marketplace"). Page has `noindex, nofollow, noarchive` meta robots — gated submission gateway. Form is client-rendered + login-gated. |
| [https://cursor.com/help/security-and-privacy/marketplace-security](https://cursor.com/help/security-and-privacy/marketplace-security) | 2026-05-19 | Mandatory manual review for every plugin AND every update. Open-source requirement for all marketplace plugins. "Small group of trusted partners" framing. Plugin author maintenance expectation (delisting consequence for unresponsive authors). MCP allowlist/blocklist enforcement at plugin install time. |
| [https://docs.cursor.com/plugins](https://docs.cursor.com/plugins) | 2026-05-19 | Redirects/resolves to the same content as `cursor.com/docs` (123 KB; same hash as docs homepage). Logged for completeness — `docs.cursor.com` is not a separate host with its own plugin docs; the canonical docs surface is `cursor.com/docs/...`. |

**Total distinct URLs cited inline in this document:** 6 cursor.com docs URLs plus the GitHub template link [github.com/cursor/plugin-template](https://github.com/cursor/plugin-template) referenced by the Plugins Reference (not fetched in this pass; cited only as a B1-future-work hint).

---

*End of research. Pin-date 2026-05-19. Per CONTEXT D-07 mandatory workstream-start re-verify. Wave B (Plan 28-8-B1 + Plan 28-8-B2) may proceed against this spec without re-fetching Cursor docs.*
