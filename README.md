<div align="center">

# GET DESIGN DONE

**English** · [简体中文](docs/i18n/README.zh-CN.md) · [日本語](docs/i18n/README.ja.md) · [한국어](docs/i18n/README.ko.md) · [Français](docs/i18n/README.fr.md) · [Italiano](docs/i18n/README.it.md) · [Deutsch](docs/i18n/README.de.md)

**A design-quality pipeline for AI coding agents: brief → explore → plan → design → verify.**

**Get Design Done keeps AI-generated UI tied to your brief, your design system, your references, and your quality gates. Works with Claude Code, OpenCode, Gemini CLI, Kilo, Codex, Copilot, Cursor, Windsurf, Antigravity, Augment, Trae, Qwen Code, CodeBuddy, and Cline.**

[![npm version](https://img.shields.io/npm/v/@hegemonart/get-design-done?style=for-the-badge&logo=npm&logoColor=white&color=CB3837)](https://www.npmjs.com/package/@hegemonart/get-design-done)
[![npm downloads](https://img.shields.io/npm/dm/@hegemonart/get-design-done?style=for-the-badge&logo=npm&logoColor=white&color=CB3837)](https://www.npmjs.com/package/@hegemonart/get-design-done)
[![CI](https://img.shields.io/github/actions/workflow/status/hegemonart/get-design-done/ci.yml?branch=main&style=for-the-badge&logo=github&label=CI)](https://github.com/hegemonart/get-design-done/actions/workflows/ci.yml)
[![GitHub stars](https://img.shields.io/github/stars/hegemonart/get-design-done?style=for-the-badge&logo=github&color=181717)](https://github.com/hegemonart/get-design-done)
[![Node](https://img.shields.io/badge/node-22%20%7C%2024-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)](LICENSE)

<br>

```bash
npx @hegemonart/get-design-done@latest
```

**Works on macOS, Linux, and Windows.**

<br>

*"AI coding agents ship UI fast. Get Design Done makes sure it ships as design."*

<br>

[Why I Built This](#why-i-built-this) · [How It Works](#how-it-works) · [Commands](#commands) · [Connections](#connections) · [Why It Works](#why-it-works)

</div>

---

> [!IMPORTANT]
> ### Already have a Claude Design bundle?
>
> If you exported a design from [claude.ai/design](https://claude.ai/design), you can skip Stages 1–3 entirely:
>
> ```
> /gdd:handoff ./my-design.html
> ```
>
> Parses the bundle's CSS custom properties into D-XX design decisions, runs the verification pass with Handoff Faithfulness scoring, and optionally writes implementation status back to Figma.

---

## Why I Built This

I'm a designer who ships with AI coding agents. The code-side workflow is mature: specs, tasks, tests, commits, review loops. The design-side workflow was not.

What I kept running into: the agent could generate a screen that looked fine in isolation, but the work was disconnected. Tokens did not match the existing system. Contrast ratios drifted below WCAG. Hierarchy got reinvented per screen. Old anti-patterns leaked into new components. And because nothing verified the output against the original brief, the problems usually surfaced late, in PR review or after handoff.

So I built Get Design Done: a design pipeline that gives AI coding agents the same kind of structure developers already expect from engineering workflows. It captures the brief, maps the current design system, grounds decisions in references, decomposes the work into atomic tasks, executes those tasks, and verifies the result before you ship.

Behind the scenes: 61 specialized agents, a queryable intel store, tier-aware model routing, 42 optional tool connections, atomic commits, and a no-regret adaptive layer that learns from solidify-with-rollback outcomes. What you use day to day: a few `/gdd:*` commands that keep design work coherent.

- **Hegemon**

---

AI-generated design has the same failure mode as AI-generated code: describe what you want, get something plausible, then watch it fall apart at scale because no system tied the output back to the brief.

Get Design Done is the context engineering layer for design work. It turns "make this UI better" into a traceable cycle: brief → explore → plan → design → verify.

---

## What You Get

- **Brief-grounded design work** - every cycle starts with the problem, audience, constraints, success metrics, and must-haves.
- **Design-system extraction** - GDD inventories tokens, typography, spacing, components, motion, accessibility, dark mode, and design debt before planning changes.
- **Reference-backed decisions** - agents use embedded design references plus optional Figma, Refero, Pinterest, Storybook, Chromatic, Preview, Claude Design, paper.design, pencil.dev, Graphify, 21st.dev Magic, and Magic Patterns connections.
- **Atomic execution** - design tasks are decomposed by dependency, run in safe waves, and committed independently.
- **Verification before shipping** - audits check brief fit, token integration, WCAG contrast, component conformance, motion consistency, dark-mode architecture, and design anti-patterns.
- **Rollback on failed validation** - solidify-with-rollback validates each task before it sticks; failed work is automatically reverted.

---

## Who This Is For

GDD is for engineers, designers, design engineers, founders, and product builders who ship UI with AI coding agents and need the result to hold together beyond the first screenshot.

Use it when you care that tokens match, contrast passes WCAG, motion feels cohesive, components follow your system, and the final implementation still matches what you asked for.

You do not need to be a designer to benefit from it. The pipeline carries the design discipline into the agent workflow: it extracts context, asks only for missing decisions, grounds the work in references, and catches the issues people usually find too late.

### v1.27.0 Highlights - Peer-CLI Delegation Layer

Closes the **outbound** half of multi-runtime: gdd agents now OPTIONALLY delegate to local peer CLIs (Codex via App Server Protocol; Gemini/Cursor/Copilot/Qwen via Agent Client Protocol) when measurably cheaper or higher-quality for the role. Falls back to in-process Anthropic SDK when peer is unavailable. Honors v1.26.0's tier maps + v1.22.0's event chain + v1.23.5's bandit posterior - `delegate?` becomes another arm in `(agent_type × tier × delegate)` Thompson sampling.

- **ACP + ASP protocol clients** - `scripts/lib/peer-cli/{acp-client,asp-client}.cjs` ship line-delimited JSON-RPC over stdio with 16 MiB line-buffer overflow guards. ACP serves Gemini/Cursor/Copilot/Qwen; ASP serves Codex (thread-oriented, multi-turn). Protocol shapes adapted from `greenpolo/cc-multi-cli` (Apache 2.0, see `NOTICE`). Long-lived broker per `(peer, workspace)` over Unix socket / named pipe - cold-spawn cost amortized across delegated calls in a cycle.
- **5 per-peer adapters + central registry** - `scripts/lib/peer-cli/adapters/{codex,gemini,cursor,copilot,qwen}.cjs` thin-wrap the protocol clients with role→prompt-prefix maps and slash-command translation. Central dispatch via `registry.cjs#findPeerFor(role, tier)` consults the locked capability matrix (codex→execute; gemini→research/exploration; cursor→debug/plan; copilot→review/research; qwen→write).
- **`delegate_to:` agent frontmatter** - additive optional field; values are `<peer>-<role>` per matrix or `none` for explicit opt-out. Session-runner tries delegate first; transparent fallback on peer-absent OR peer-error. `peer_call_failed` event logs to `events.jsonl` for reflector telemetry. v1.27.0 ships the field but no agent in the fleet uses it yet - opt-in per agent via `/gdd:run-skill peer-cli-customize`.
- **Bandit posterior `delegate?` dimension** - Phase 23.5's `(agent_type, touches_size_bin)` arm space expands to `(agent_type, touches_size_bin, delegate)` where `delegate ∈ {none, gemini, codex, cursor, copilot, qwen}`. Existing priors carry forward as the `none` arm (no behavior change for unconfigured agents); 5 delegation arms start neutral. Reward signal unchanged (two-stage lexicographic). The bandit measures and learns which delegations actually pay off over cycles.
- **Event chain `runtime_role` + `peer_id` tags** - additive Phase 22 extension. `events.jsonl` rows optionally tag `runtime_role: "host" | "peer"` (defaults `"host"` for back-compat) and `peer_id`. 3 new event types: `peer_call_started`, `peer_call_complete`, `peer_call_failed`. costs.jsonl threads the same fields so v1.26's cross-runtime cost-arbitrage reflector extends to host-vs-peer arbitrage naturally.
- **`/gdd:peers` discoverability + skills for setup** - `/gdd:peers` shows a single-command capability matrix (peer × installed? × allowlisted? × claimed roles × posterior delta vs local). `peer-cli-customize` rewires per-agent `delegate_to:` mappings; `peer-cli-add` walks the verification ladder for adding a brand-new peer (model-ID `-preview`-suffix trap, Windows `.cmd` quirks, 3-file footprint). Install-time peer-detection helpers (`detectInstalledPeers()`) ship in `runtimes.cjs` and v1.27.1's post-install interactive nudge wires them through `@clack/prompts` (silent skip when no peers detected or non-TTY; opt-in writes `.design/config.json#peer_cli.enabled_peers`).

See [docs/PEER-DELEGATION.md](docs/PEER-DELEGATION.md) for the ops guide (when delegation fires, fallback diagnostics, broker lifecycle, Windows quirks) and [reference/peer-protocols.md](reference/peer-protocols.md) for the ACP + ASP protocol cheat sheet.

### OpenRouter provider (v1.33.6, opt-in)

You can route any agent's tier (`opus`/`sonnet`/`haiku`) through **OpenRouter** - an aggregator that fronts Claude, GPT, Llama, Gemini, DeepSeek and more behind a single API key - *alongside* your native provider auth, never instead of it. Set `OPENROUTER_API_KEY` and GDD's tier-resolver adapter dynamically fetches the OpenRouter catalog (24h TTL cache) and maps each tier onto a concrete model via a closed-vs-open + pricing heuristic, with a `.design/config.json#openrouter_tier_overrides` escape hatch for pinning exact ids. When the key is absent or the catalog is unreachable, resolution gracefully falls back to your native provider - OpenRouter is purely additive. See [`connections/openrouter.md`](connections/openrouter.md) for setup, the probe pattern, and fallback behavior, and run `/gdd:openrouter-status` to inspect catalog freshness and the resolved tier→model mapping.

### Native mobile output (v1.34.1)

GDD now generates **native mobile** UI, not just web. A project-type detector routes the brief to the matching executor - web stays the default; `native-ios` / `native-android` / `flutter` opt in via the brief plus `package.json` / `pubspec.yaml` / `*.xcodeproj` presence:

- **[`swift-executor`](agents/swift-executor.md)** - compilable **SwiftUI** views per iOS conventions (navigation, safe areas, SF Pro Dynamic Type).
- **[`compose-executor`](agents/compose-executor.md)** - **Jetpack Compose** Material 3 composables (Kotlin), edge-to-edge with the Material 3 `sp` type scale.
- **[`flutter-executor`](agents/flutter-executor.md)** - one Dart codebase that adapts the theme **per target**: Material 3 for web/Android, Cupertino for iOS.

All three are fed by a shared **token-bridge** ([`reference/native-platforms.md`](reference/native-platforms.md)) that extends the Phase-23 token engine with `swift`/`compose`/`flutter` emitters - mapping your canonical tokens (`#3B82F6`, `16px`, `Inter`) deterministically onto each platform's theme primitives (`Color`/`Font`, `MaterialTheme`, `ThemeData`) with a documented, round-trippable precision contract, so the executors never hand-author colour or dimension math. Rendered verification via the iOS Simulator / Android emulator is **optional** - when no simulator is present the verify stage degrades to a code-only structural audit (the simulator only *adds* rendered confirmation).

### Email output (v1.34.2)

GDD also generates **email templates** - the project-type detector routes an `email` brief to a dedicated executor that honors the real client constraints web HTML/CSS breaks on:

- **[`email-executor`](agents/email-executor.md)** - generates one email per task as **MJML source (canonical) + the derived HTML**, against the constraint catalogue, with the static validator as its own self-check. It is an agent-prompt, not a compiler - **no `mjml` runtime, no Litmus account, no network** is needed to produce the email.

The constraints live in [`reference/email-design.md`](reference/email-design.md) - table-based layout (no flexbox/grid/`position`), inline styles (no `<style>` sheet in Gmail), MSO conditional comments for Outlook's Word engine, dark-mode `color-scheme` handling, ~600px width, and the top-20-client quirks. A deterministic static checker ([`scripts/lib/email/validate-email-html.cjs`](scripts/lib/email/validate-email-html.cjs)) flags the statically-verifiable subset (`EM-LAYOUT`/`EM-STYLE`/`EM-MSO`/`EM-DARK`). Cross-client rendered verification via [`Litmus`](connections/litmus.md) (or Email-on-Acid) is **optional** - when absent the verify stage degrades to the static validator. Email generation is opt-in; **web stays the default**.

### Print/PDF output (v1.34.3)

GDD also generates **print/PDF** output - the project-type detector routes a `print` brief to a dedicated executor that honors the production constraints screen-RGB web HTML ignores. This **completes the Non-Web Output Layer** (native + email + print all shipped):

- **[`pdf-executor`](agents/pdf-executor.md)** - generates **Paged.js-compatible print HTML/CSS** (with PDFKit-fallback notes for Chrome-less runtimes) against the constraint catalogue, with the static validator as its own self-check. It is an agent-prompt, not a compiler - **no headless Chrome, no PDFKit, no network** is needed to produce the print HTML/CSS.

The constraints live in [`reference/print-design.md`](reference/print-design.md) - the `@page` box model (size/margin/marks), bleed box + crop/registration marks, CMYK color-space awareness (print is subtractive CMYK, not screen RGB), font embedding/outlining (print RIPs have no web fonts), and a 300dpi raster fallback. A deterministic static checker ([`scripts/lib/print/validate-print-css.cjs`](scripts/lib/print/validate-print-css.cjs)) flags the statically-verifiable subset (`PR-PAGE`/`PR-BLEED`/`PR-CMYK`/`PR-FONT`/`PR-DPI`). Rendered PDF/page verification via the optional [`print-renderer`](connections/print-renderer.md) connection (Paged.js/headless-Chrome or PDFKit) is **optional** - when absent the verify stage degrades to the static validator. Print generation is opt-in; **web stays the default**.

### Research connections - Lazyweb + Mobbin (v1.34.4)

The **discover** stage grounds design in real product references, resolving sources **cost-aware - the free source is tried before any paid one**. [`Lazyweb`](connections/lazyweb.md) (free MCP, 250k+ app screens - pricing pages, onboarding, redesign comparisons) is **Tier 1, always first**; [`Mobbin`](connections/mobbin.md) (paid MCP, 600k+ screens / 130k+ flows - mobile + flow-level) and [`Refero`](connections/refero.md) are **Tier 2** (use whichever you subscribe to), then Pinterest → local archetypes → WebFetch. Both are optional user-installed MCPs (**no new runtime dependency**), onboardable via `/gdd:connections`.

### Team surfaces - PR inline review (v1.35.1)

After `/gdd:ship` opens the PR, the [`pr-commenter`](agents/pr-commenter.md) agent posts GDD's verify/audit output **inline** on it: selector-specific findings as inline review comments on changed lines, Preview/Chromatic before-after screenshot pairs, and a `gdd/design-review` status check (audit pillar scores + verify pass/fail + a11y) that a teammate's branch protection can require. Outbound bodies are redacted; `GDD_DISABLE_PR_COMMENTER` (or `.design/config.json`) is the kill-switch; it degrades to a noop (prints bodies for manual paste) and **never fails the ship**. Uses `gh` only - **no new runtime dependency**. First sub-phase of the Team Surfaces layer (Slack/Discord notifications + Linear/Jira ticket-sync follow). Contract: [`reference/pr-review-integration.md`](reference/pr-review-integration.md).

### Team surfaces - Notification backplane (v1.35.2)

Routes pipeline events (verify-fail / audit-pass / ship) to **Slack** + **Discord** via incoming webhooks ([`connections/slack.md`](connections/slack.md) / [`connections/discord.md`](connections/discord.md)). The dispatcher ([`scripts/lib/notify/dispatch.cjs`](scripts/lib/notify/dispatch.cjs)) redacts every body at a single chokepoint, honors per-channel kill-switches (`GDD_DISABLE_SLACK` / `GDD_DISABLE_DISCORD`), and degrades to a noop when a webhook URL is unset - notification never blocks the pipeline. **No new runtime dependency** (injectable `fetch`, no Slack/Discord SDK). Routing: [`reference/notification-routing.md`](reference/notification-routing.md).

### Team surfaces - Ticket sync (v1.35.3)

Links a design cycle to a **Linear** or **Jira** ticket and keeps them in sync ([`connections/linear.md`](connections/linear.md) / [`connections/jira.md`](connections/jira.md), MCP-based). [`agents/ticket-sync-agent.md`](agents/ticket-sync-agent.md) surfaces the linked ticket's comments as context when a design file opens (via the decision-injector) and, on `/gdd:complete-cycle`, transitions the ticket + posts a **redacted** summary. Per-system kill-switches (`GDD_DISABLE_LINEAR` / `GDD_DISABLE_JIRA`); degrade-to-noop (never gates the cycle). **No new runtime dependency, no new egress** (MCP tools only). Contract: [`reference/ticket-sync.md`](reference/ticket-sync.md). **Completes the Team Surfaces layer** (PR inline + notifications + ticket sync).

### Design-artifact export (v1.35.5)

`/gdd:export <cycle> --format html|pdf|notion` packages a finished cycle's design output (`EXPERIENCE.md`, `DESIGN.md`, `DESIGN-VERIFICATION.md`, the decision log, screenshots) into a stakeholder-shareable artifact - for PMs/execs/brand who aren't in the repo. The [`build-html`](scripts/lib/export/build-html.cjs) assembler emits a **self-contained** HTML (inline CSS, base64-embedded screenshots, **zero external references**); `pdf` is the same HTML plus Paged.js-compatible `@page` print CSS you render yourself; `notion` writes a page via the Notion MCP ([`connections/notion.md`](connections/notion.md), degrade-to-HTML). Every artifact is **redacted**; `--pseudonymize` masks identity/paths/hostname for external sharing; `--pr` posts the HTML preview as a PR comment via `pr-commenter`. **No new runtime dependency** (D-02: pure assembler, no PDF/markdown library). Contract: [`reference/export-formats.md`](reference/export-formats.md).

### Domain packs - Knowledge Tier 3 (v1.36.1)

Four industry-specific design-pattern packs at [`reference/domains/`](reference/domains/) - **finance** (data-table density, trading-UI color semantics, Reg-T/MiFID II disclosure, PCI-DSS masking, number-formatting precision), **healthcare** (HIPAA PHI isolation, audit-trail-as-UI, WCAG 2.1 AAA, medical-data viz), **gaming** (HUD/diegetic taxonomy, vestibular + photosensitive safety, ESRB/PEGI age-gates, controller/touch input adaptation), and **civic** (Section 508 + WCAG 2.1 AA floor, multi-language gov forms, Plain Writing Act, USWDS). The [`design-context-builder`](agents/design-context-builder.md) auto-detects the domain from brief keywords + `package.json` dependencies (`@stripe/`, `fhir`, `@react-three/fiber`, `@uswds/uswds`, …) and loads the matching pack into downstream context; [`design-auditor`](agents/design-auditor.md) folds each pack's audit checklist into the relevant pillar. Additive knowledge - no new pillar, no new runtime dependency. First sub-phase of Phase 36 (Motion-tool verification + Conversational UI follow).

### Motion-tool verification (v1.36.2)

GDD now opens the motion **exports** a project ships. The pure, dependency-free [`validate-motion`](scripts/lib/motion/validate-motion.cjs) checks a **Lottie** JSON for frame-rate sanity, non-positive duration, embedded-asset bloat, and a perf budget (`MO-*` rules); for **Rive** `.riv` (binary) it does size + a `RIVE`-header sanity, and surfaces the state-machine graph (unreachable states, no-exit loops) when the opt-in Rive runtime is present. The [`motion-verifier`](agents/motion-verifier.md) agent runs at verify time ([`connections/lottie.md`](connections/lottie.md) / [`connections/rive.md`](connections/rive.md)) and **WARNs - never blocks** (motion is creative). **No new runtime dependency** - the Lottie player and Rive runtime are opt-in. Second sub-phase of Phase 36.

### Conversational UI (v1.36.3)

[`reference/conversational-ui.md`](reference/conversational-ui.md) closes a zero-coverage surface: voice flows + chatbots. It codifies voice-flow reprompts (no-input / no-match → human handoff), multi-turn dialogue (context carryover, slot-filling, repair), **prompt-as-UX** (the assistant's persona/tone/boundaries as a versioned design artifact), chatbot empty-states + suggested replies, voice-first onboarding, and error recovery + accessibility. [`design-context-builder`](agents/design-context-builder.md) detects a `conversational` project type (brief keywords + chatbot/voice deps like `botpress` / `dialogflow` / `actions-on-google` / `ask-sdk-core`) and loads the pack into context. **No new runtime dependency.** This is the **final sub-phase of Phase 36 - which is now complete** (domain packs + motion-tool verification + conversational UI).

### AI-native tools - Wave 2 (v1.37.1)

Six more AI-native design tools join the connection layer (Phase 14's backlog, now scheduled): **Framer**, **Penpot**, and **Webflow** (canvas-category - read frames/boards/structure as design sources) plus **v0.dev**, **Plasmic**, and **Builder.io** (generator-category - prompt→component, wired into [`design-component-generator`](agents/design-component-generator.md) as `<!-- impl: -->` sections). Plasmic is dual (canvas + generator). Onboarding grows 21 → 27. Each is an opt-in MCP/API connection that degrades to code-only when absent - **no new runtime dependency**. First sub-phase of Phase 37 (Greenfield DS Bootstrap follows).

### Greenfield design-system bootstrap (v1.37.2)

`/gdd:bootstrap-ds` gives a brand-new project a coherent design system from a brand input (a primary color + optional secondary + tone tags + target framework). The pure [`token-scale`](scripts/lib/ds/token-scale.cjs) helper emits a 9-stop OKLCH color scale as native CSS `oklch()` (no color-conversion library), a modular type scale, a 4pt/8pt spacing scale, and radius/motion defaults; [`ds-generator`](agents/ds-generator.md) offers **3 variants** (conservative / balanced / bold) to pick from per [`reference/ds-bootstrap-rubric.md`](reference/ds-bootstrap-rubric.md), then scaffolds button/input/card proof components. Never invents a brand; never overwrites an existing DS. **No new runtime dependency.** This **completes Phase 37** (AI-native Wave 2 + greenfield bootstrap).

### Outcome-driven adaptation (v1.38.0)

GDD now learns **which design patterns win with users**, not just which pass lint. `/gdd:design --variants N` emits N competing, hypothesis-tagged variants; a new `design_arms` posterior ([`design-arms-store`](scripts/lib/ds-arms/design-arms-store.cjs) - Beta(2,8), distinct from the routing bandit) consults prior outcomes to bias generation (**advisory, never directive**). Two read-only external signal sources close the loop: **A/B experiments** ([LaunchDarkly / Statsig / GrowthBook](connections/launchdarkly.md) → [`experiment-result-ingester`](agents/experiment-result-ingester.md)) and **user research** ([UserTesting / Maze / Hotjar](connections/usertesting.md) → [`user-research-synthesizer`](agents/user-research-synthesizer.md)), the latter **pseudonymized before any agent context** (a tested PII guard). Findings populate the brief's `<prior-research>` block, which verify cross-checks. **No new runtime dependency.** Onboarding 27 → 33.

### Deployment coordination (v1.38.5)

GDD now tracks a design past "PR merged" to **actually live**. [`/gdd:rollout-status`](skills/rollout-status/SKILL.md) reads the feature-flag service (the Phase 38 LaunchDarkly/Statsig/GrowthBook connections) via [`rollout-coordinator`](agents/rollout-coordinator.md) and classifies each cycle - `unrolled` / `staging-only` / `canary-N%` / `prod-100%` - surfacing **stuck** rollouts (a canary that hasn't advanced in N days). The pure [`rollout-status`](scripts/lib/rollout/rollout-status.cjs) classifier also computes a **deployed-percentage weight** that feeds the `design_arms` posterior via `verify_outcome` events - a variant that only reached 10% of users counts as weak evidence (0.1), a fully-rolled one counts 1.0. **Read-only** (GDD never advances or rolls back) and **no new runtime dependency**.

### DS migration workflows (v1.39.1)

When a design system ships a breaking major - shadcn/ui v1→v2, Tailwind v3→v4, MUI v5→v6, or the Material 2/3 token rename - GDD detects the skew from the in-repo `package.json`, consults a curated rule library ([`reference/migrations/`](reference/migrations/)), and produces an **impact-scored, proposal-only** migration plan via [`ds-migration-planner`](agents/ds-migration-planner.md). Each affected component is scored by visual-delta × usage × tests-affected, and the planner emits codemod scaffolds to `.design/migration/` through the pure [`codemod-gen`](scripts/lib/migration/codemod-gen.cjs) - which produces jscodeshift/ast-grep template **text only** (it never imports or runs a codemod engine). [`design-verifier`](agents/design-verifier.md) then treats an in-flight migration as a contract: visual-diff within threshold, component API surface unchanged, tests green, and an unmigrated high-impact rule is a gap. **Proposal-only, no new runtime dependency, no new egress.**

### Long-horizon cost governance (v1.39.2)

GDD already tracks cost per task and per runtime - now it **forecasts** it, **caps** it at the project level, and shows whether the spend **shipped**. [`/gdd:budget`](skills/budget/SKILL.md) groups `costs.jsonl` by cycle and (via [`cost-forecaster`](agents/cost-forecaster.md) → the pure [`cost-forecast`](scripts/lib/budget/cost-forecast.cjs)) projects the next N cycles in **best / typical / worst** scenarios - "at the current rate you'll hit your $X project cap in Y cycles." A new `budget.json.project_cap_usd` adds a **project-level hard cap**: the [`budget-enforcer`](hooks/budget-enforcer.ts) hook warns at 50% + 80% and **gracefully halts** the next agent spawn at 100% (via the pure [`project-cap`](scripts/lib/budget/project-cap.cjs) classifier) - **disabled by default**, so existing users are unaffected. [`/gdd:roi`](skills/roi/SKILL.md) joins per-cycle cost with commits that shipped (survived ≥ 14 days) vs reverted into a cost-per-shipped-commit table ([`roi`](scripts/lib/budget/roi.cjs)). **No new runtime dependency, no new egress** - the hook only ever blocks, never spends.

### GDD self-migration (v1.39.5)

GDD migrates *your* design systems (above) - now it migrates **itself**. When GDD ships a breaking path change (like the Phase 31.5 `scripts/lib/**` → `sdk/**` reorg), a machine-readable registry in [`reference/DEPRECATIONS.md`](reference/DEPRECATIONS.md) records `Since · Removed in · Old · New · hint`. After an upgrade, [`/gdd:update`](skills/update/SKILL.md) flags anything that crossed into deprecated/removed, and [`/gdd:migrate`](skills/migrate/SKILL.md) rewrites your project's stale references - **previewing a diff first, never silent** - via the pure [`deprecation-registry`](scripts/lib/deprecation-registry.cjs). Two CI gates keep the system honest: a completeness check (every entry has a shim or a confirmed removal) and `lint-changelog` (every future minor must declare a `### Breaking changes` section). **No new runtime dependency, no new egress.**

### Team collaboration mode (v1.40.0)

GDD's single-operator baseline now extends to **teams** - git-native + advisory, no server. Two developers working a cycle on parallel branches merge their `.design/STATE.md` **per section** ([`section-merge`](scripts/lib/collab/section-merge.cjs) unions decisions by `D-id`; a real conflict is only a same-id divergence, which [`conflict-resolver`](agents/conflict-resolver.md) reconciles with human confirmation - never auto-picking or dropping a decision). Decisions carry optional `[author= co-author=]` attribution, move through an async review queue (`proposed → reviewing → approved → locked`) with **hard locks** (the only escape is an audited [`/gdd:unlock-decision`](skills/unlock-decision/SKILL.md)), and [`/gdd:review-decisions`](skills/review-decisions/SKILL.md) surfaces what's pending. [`decision-journal-exporter`](agents/decision-journal-exporter.md) publishes a **pseudonymized, read-only** Notion/Confluence journal for stakeholders who don't run GDD. `gdd_cycle_mode` (designer/dev/full) partitions a cycle by role, a `permissions` model gates per-section writes, and `collab.multi_writer_enabled` switches the advisory lock to a team-mode backoff. The full contract: [`reference/multi-author-model.md`](reference/multi-author-model.md). **Everything is off by default** - a single-operator project is unaffected. **No new runtime dependency.**

### CLI localization (v1.40.5)

GDD's README is multilingual - now its **CLI** is too. [`/gdd:locale <code>`](skills/locale/SKILL.md) sets the language of `--help`, common error messages, and skill prompt headers, resolved by [`scripts/lib/i18n`](scripts/lib/i18n/index.cjs) (precedence: `config.locale` > env `LANG` > `en`; fallback chain `locale → base → en`). Flat-JSON message tables ship for **en** (complete source), **ru** (full), and **uk/de/fr/zh/ja** placeholders - a missing key always falls back to English, so a partial locale never breaks the CLI. Skills + agents can carry an opt-in `description_i18n` map. Adding a locale is a PR: translate the table, add a `NOTICE` credit (the contribution path is in [`reference/cli-localization.md`](reference/cli-localization.md)). Completeness is **warn-only**. **No new runtime dependency.**

### Deterministic anti-pattern CLI - `gdd-detect` (v1.41.0)

GDD's BAN-NN anti-pattern catalogue is now executable. [`gdd-detect`](bin/gdd-detect) is a **dep-free, offline** Node CLI that scans HTML/CSS/JSX for the 11 statically-detectable BAN rules ([`scripts/lib/detect/rules/`](scripts/lib/detect/)) - `transition: all`, `will-change: all`, gradient text, bounce easing, `scale(0)` entry, naked `outline: none`, pure-black dark mode, disabled zoom, tinted image outline - each finding linked to its [`reference/anti-patterns.md`](reference/anti-patterns.md) paragraph. `gdd-detect <path> [--json] [--fast] [--rule BAN-NN]` exits `0` clean / `2` findings / `1` error. The rule files are the canonical executable; the markdown stays canonical prose; [`sync-rule-catalogue`](scripts/sync-rule-catalogue.cjs) keeps them in parity. `npm run lint:design` is the CI gate; an opt-in pre-commit scaffold ships too. `design-auditor` and the Phase-25 quality-gate consume it; `jsdom`/`puppeteer` are soft-optional (regex-fast is the default). **No new runtime dependency.**

### Previous releases

- **v1.26.0** - Headless Model Resolver (per-runtime tier→model map, `resolved_models` router field, per-runtime price tables, `reasoning-class` runtime-neutral alias).
- **v1.25.0** - Pipeline Hardening (prototype gate + STATE `<prototyping>` block, router S/M/L/XL `complexity_class`, quality-gate Stage 4.5, Stop-hook turn closeout).
- **v1.24.0** - Multi-Runtime Installer (`@clack/prompts` interactive multi-select for all 14 runtimes, idempotent + foreign-AGENTS.md-safe, scripted CI surface preserved 1:1).
- **v1.23.5** - No-Regret Adaptive Layer (Thompson sampling bandit + AdaNormalHedge ensemble + MMR rerank; single-user via informed-prior bootstrap, no opt-in telemetry).
- **v1.23.0** - SDK Domain Primitives (solidify-with-rollback gate, JSON output contracts, auto-crystallization of `Touches:` patterns).
- **v1.22.0** - SDK Observability (~24 typed event types, per-tool-call trajectory, append-only event chain, secret scrubber).
- **v1.21.0** - Headless SDK (`gdd-sdk` CLI runs full pipeline without Claude Code, parallel researchers, cross-harness MCP).
- **v1.20.0** - SDK Foundation (resilience primitives, lockfile-safe `STATE.md`, `gdd-state` MCP server with 11 typed tools, TypeScript foundation).

For full release notes see [CHANGELOG.md](CHANGELOG.md).

---

<p align="center">
  <strong>Supported by</strong>
</p>

<div align="center">
  <a href="https://www.humbleteam.com/" aria-label="Humbleteam">
    <img src="docs/assets/sponsors/humbleteam.svg" alt="Humbleteam logo" width="180">
  </a>
  <br>
  <sub>Product design partner for ambitious startups and AI products.</sub>
</div>

---

## Getting Started

```bash
npx @hegemonart/get-design-done@latest
```

The installer prompts you to choose:
1. **Runtime** - Claude Code, OpenCode, Gemini, Kilo, Codex, Copilot, Cursor, Windsurf, Antigravity, Augment, Trae, Qwen Code, CodeBuddy, Cline, or all (interactive multi-select - pick multiple runtimes in a single session)
2. **Location** - Global (all projects) or local (current project only)

All 14 runtimes receive their native artifact layout (`skills/`, `command/`, `agents/`, or `.clinerules`) via per-runtime content converters - Claude SKILL.md sources are translated to each runtime's expected shape at install time (frontmatter pass-through, path rewrite, tool-name rewrite via the Phase 21 cross-harness maps). Architecture ported from `gsd-build/get-shit-done` (MIT - see `NOTICE`; upstream is now archived following the May 2026 $GSD token rug-pull, community continuation lives at [`open-gsd/get-shit-done-redux`](https://github.com/open-gsd/get-shit-done-redux)).

**Multi-harness compilation (v1.42.0).** Skills are authored once in `source/skills/` with placeholders (`{{command_prefix}}`, `{{model}}`, `{{config_file}}`, `{{ask_instruction}}`) and compiled per-harness by `scripts/build-skills.cjs` (`npm run build:skills`, or `gdd-sdk build skills`) using a pure transformer factory that reads the single harness manifest at `scripts/lib/manifest/harnesses.json`. The committed `skills/` tree is the regenerated Claude-Code default (CI drift-gates `committed === generated`); the default bundle ships at `dist/claude-code/`, and the other 13 bundles are produced on demand. Adding a 15th harness is one manifest entry. Contributors: edit `source/skills/`, never `skills/` directly - see `reference/skill-placeholders.md` and `reference/DEPRECATIONS.md`.

**Editorial quality floor (v1.43.0).** A tool that audits design quality should hold its own prose to the same bar. `npm run lint:prose` is a CI gate that fails on em dashes, prose double hyphens, and AI-prose tells (`load-bearing`, `leverage`, `robust`, `seamless`, ...) across the README, `SKILL.md`, `source/skills/`, `agents/`, `CHANGELOG.md`, and `reference/` (bodies and frontmatter descriptions). Fenced/inline code, HTML comments, and Cyrillic-majority files are skipped. The ruleset lives in `STYLE.md`, generated from the shared denylist at `scripts/lib/manifest/prose-denylist.json`. See `CONTRIBUTING.md`. **No new runtime dependency.**

**Harness capability matrix (v1.44.0).** The full per-harness support matrix (skill discovery, command syntax, MCP, install path, status) lives in **[`HARNESSES.md`](HARNESSES.md)** at the repo root, generated from `scripts/lib/manifest/harnesses.json` (the single source of truth; CI drift-gates it). Each harness carries an honest status (`tested` / `experimental` / `untested`) and a `last_verified` stamp; a freshness gate warns at 60 days and fails at 180 for `tested` harnesses, surfaced in `/gdd:health`. The 14-harness count above is the same SoT the matrix reads, so it cannot drift. The five deep-dive reference files (`reference/codex-tools.md`, `reference/gemini-tools.md`, `reference/peer-cli-capabilities.md`, `reference/peer-protocols.md`, `reference/runtime-models.md`) remain as appendices linked from the matrix. **No new runtime dependency.**

**Domain reference index (v1.45.0).** The 38+ reference docs are now navigated through 7 canonical entry-points - `reference/{typography,color,spatial,motion,interaction,responsive,ux-writing}.md` - each indexing its subordinate fragments with a "use this when" pointer plus a handful of rules-of-thumb. Design skills load the relevant domain index first and drill into a fragment only when needed (motion-mapper dropped roughly 89% of its up-front reference tokens this way). The indexes link, never copy: `check:domain-links` fails CI on a broken cross-link and `check:no-duplication` fails on large copy-paste. The detailed fragments stay in place as the drill-in targets. **No new runtime dependency.**

**Skill UX polish (v1.46.0).** Skill frontmatter now has a single source of truth at `scripts/lib/manifest/skills.json` (description, argument hint, tools allow-list per skill); `scripts/generate-skill-frontmatter.cjs` regenerates each `source/skills/<id>/SKILL.md` from it, and `generate:skill-frontmatter:check` drift-gates the two in CI. The generator is order-preserving, so the committed tree stays a byte-for-byte fixed point and existing snapshots never churn. Power users get `/gdd:pin <skill>`, which writes standalone shortcut aliases (for example `/audit` alongside `/gdd:audit`) across every installed harness dir, each carrying a `gdd-pinned-skill` marker, plus `/gdd:unpin` and `/gdd:list-pins`. The 1024-character description budget (in place since the skill-authoring contract) is now an explicit `lint:agentskills` CI gate. **No new runtime dependency.**

**In-browser design iteration (v1.47.0).** `/gdd:live` tightens the design loop: pick an element on a running dev server, generate N variants in one batch (default 3, grounded in the Phase 45 canonical reference), post-check each with `gdd-detect`, hot-swap them via HMR, then accept or discard. Accepted variants are applied as the canonical edit and feed the Phase 38 bandit store with a `dev_time` source tag (a conservative `Beta(2,8)` prior keeps them advisory until production outcomes accumulate). The session persists to `.design/live-sessions/<id>.json` with resume, a scope guard blocks writes outside the picked element's source files, and harnesses without MCP fall back to a screenshot-only degraded mode. It drives the existing Preview connection, so there is **no new runtime dependency**.

**Audit and pillar expansion (v1.48.0).** Four audit-side gaps close at once. The copy pillar gets a real rubric (`reference/copy-quality.md` + `copy-auditor`): microcopy, error and empty-state text, ARIA and alt text, voice alignment, with an i18n overflow lens. A project-wide `design-debt-crawler` walks an existing codebase (not just the current cycle), enumerates raw color literals, anti-patterns, untokenized components, and contrast/density issues, and writes a priority-scored `.design/debt/DEBT-CATALOG.md`. A `brief-auditor` grades the brief against five anti-patterns (vague verbs, missing audience, immeasurable success criteria, scope creep, missing anti-goals) and surfaces a non-blocking `/gdd:discuss brief` pointer. And the Stage 4.5 quality-gate gains an `a11y` failure class so `axe` / `pa11y` / `lighthouse` regressions route to `design-fixer` like any other gate failure. **No new runtime dependency.**

**Quick anti-slop floor (v1.49.0).** Three small safety primitives. A worktree redirect (`scripts/lib/worktree-resolve.cjs`) sends `.design/` and `.planning/` writes to the main repo root when GDD runs inside a git worktree, so artifacts never leak into an ephemeral checkout. A design-quality PostToolUse hook (`gdd-design-quality-check.js`) runs a free regex pass on every `.tsx`/`.vue`/`.svelte`/`.astro` write and warns on eight default-AI-aesthetic tells (gradient spam, generic CTAs, centered-everything, font-inter defaults, purple/violet defaults, glassmorphism spam, isometric fallbacks, decorative motion), catalogued in `reference/visual-tells.md`. And a reviewer confidence gate adds a `confidence: 0.0-1.0` field plus a 4-question Pre-Report Gate to every audit finding: HIGH and CRITICAL findings need at least 0.8 confidence and cited proof, low-confidence findings stay tentative and never reach `design-fixer`. The hook is WARN-only and there is **no new runtime dependency**.

**Authoring contract v3 (v1.50.0).** Two additions. A verb-based anti-slop rubric (`reference/anti-slop-rubric.md`) scores five orthogonal axes (Directness, Distinctness, Hierarchy, Authenticity, Density); a sum below 35/50 routes a finding to the debt crawler as `aesthetic-slop`. It rides as a lens-tag on the existing 7-pillar audit, so it catches "generically AI-default" where the pillars catch "wrong". And a machine-parseable skill-composition manifest: optional `composes_with` / `next_skills` frontmatter, a DAG validator (`validate:composition-graph` fails on cycles or dangling refs), and an auto-generated `reference/skill-graph.md`. Skill descriptions move to a multi-paragraph v3 form (`<what>. Use when <triggers>. Activates for requests involving <kw>.`) with both forms accepted during a transition window, a boilerplate-cohort lint, and a `/gdd:new-skill` scaffolder. **No new runtime dependency.**

**Instinct-based learnings (v1.51.0).** The reflection loop now produces atomic, confidence-weighted instinct units instead of prose nobody reads. Each unit (`reference/instinct-format.md`: trigger, confidence 0.3-0.9, domain, scope, project id) is stored via `scripts/lib/instinct-store.cjs` (a JSON store with optional `better-sqlite3` FTS5 acceleration, the same probe-and-fall-back pattern as cross-cycle recall, so no dependency is added). `design-reflector` dual-emits instincts plus a narrative; `/gdd:apply-reflections` accepts them; the decision-injector surfaces the top-3 relevant instincts into agent context on every design-file read; and `/gdd:instinct list|query|promote` inspects the project and global stores. A project instinct promotes to the global layer only after it recurs across at least two projects (a conservative `Beta(2,8)` prior keeps it advisory), and stale instincts decay and archive. **No new runtime dependency.**

**Typed DesignContext graph (v1.52.0, keystone).** Design knowledge moves from flat `.design/map/*.md` notes to a typed graph at `.design/context-graph.json`: nodes are tokens, components, variants, states, motion fragments, a11y patterns, screens, layers, and design patterns; typed edges connect them (uses-token, composes, depends-on, consumes-context, and eight more). A Draft-07 schema (`reference/schemas/design-context.schema.json`) plus a dep-free validator (`scripts/validate-design-context.cjs`) and a pure query lib (`scripts/lib/design-context-query.cjs`: nodes / edges / path / consumers / unreachable / cycles / coverage) back it; regex extract passes build fragments that merge into the graph. The five mapper agents and the synthesizer dual-emit, so the markdown maps stay while fragments are added. A 13th read-only MCP tool (`gdd_context_query`) and two skills (`/gdd:context`, `/gdd:migrate-context`) expose it. Regex not tree-sitter, JSON not SQLite; this is the keystone for the phases that follow. **No new runtime dependency.**

**Semantic mapper engine (v1.53.0).** Mappers get smart about scale and re-runs on top of the Phase 52 graph. Louvain community batching (`scripts/lib/mappers/compute-batches.mjs`, dep-free, deterministic) groups files that import each other so each parallel mapper sees a coherent slice; a neighborMap sidecar (`neighbor-map.mjs`) hands each batch its 1-hop external symbols so cross-batch edges emit without rereading other batches. SHA-256 fingerprinting (`sdk/fingerprint/`) classifies each re-run as SKIP / PARTIAL / ARCHITECTURE / FULL, so `/gdd:discover` (now incremental by default, `--full` to override) only re-discovers what actually changed. A graph-context-reviewer agent runs nine checks on the assembled graph (hard-reject on schema or referential breakage, soft-warn otherwise). Node builtins only, no `graphology`, no embeddings. **No new runtime dependency.**

**Composable reference addendums (v1.54.0).** One general mapper prompt cannot know Tailwind's `@theme` tokens from shadcn's `cn()` from vanilla-extract's `style({})`. Phase 54 adds 18 stack-specific addendums (8 design systems, 6 frameworks, 4 motion libraries) under `reference/{systems,frameworks,motion}/`, each at most 50 lines with Conventions / File patterns / Gotchas / Example-output sections. `scripts/lib/detect/stack.cjs` detects the project stack from dependencies plus config files and import signatures; `scripts/lib/mapper-spawn.cjs` composes the matching addendums (capped at one DS + one framework + one motion) into each explore mapper's prompt at spawn time, additively, so a project on an unknown stack just keeps the base prompt and `gsd-health` reports the coverage gap. A `/gdd:new-addendum` scaffolder adds more. Maintainer-authored, vendor-cross-checked, no LLM-generated content. **No new runtime dependency.**

**GDD dashboard (v1.55.0).** A read-only multi-harness control plane. `gdd-dashboard` opens a terminal TUI with five panes (sessions per runtime, current cycle, cost telemetry, findings, a DesignContext tree); `gdd dashboard --web` opens an interactive browser view of the Phase 52 graph (layered Atomic/Molecular/Organism/Template layout, pan/zoom, click-to-inspect, type/tag filters, find-consumers highlight, PNG export, minimap). It is **built fully dep-free** (a maintainer decision over the roadmap's Ink + React Flow + Vite stack, which would have added ~100 packages): the TUI is a hand-rolled ANSI renderer, the graph view is a self-contained HTML file (inline SVG + vanilla JS, extending the export builder), and the data plane reads GDD state through the existing shared libraries in-process. Read-only by design (the action surface is open-file / copy-command / run-skill); the `--web` server is a local loopback that serves to your own browser and exits. **No new runtime dependency.**

**Risk-scoring and fact-forcing gate (v1.56.0).** Writer actions now carry a quantified risk score instead of a binary allow/deny. A pure, deterministic scorer (`scripts/lib/risk/compute-risk.cjs`, frozen tables, no I/O) grades each Write / Edit / MultiEdit / Bash by tool, file sensitivity, and input shape, then two PreToolUse hooks act on it: `gdd-risk-gate.js` emits a `risk_assessment` event and blocks only the genuinely dangerous actions (destructive bash, high-sensitivity-file rewrites at or above 0.85), while `gdd-fact-force.js` holds the first write to a file until its DesignContext consumers and recorded decisions have actually been read this session. The fact-force hold is soft and softens to a warning when the Phase 52 graph is absent, so greenfield projects are never over-blocked. `/gdd:override` clears a block or a fact-force hold with an approver and reason (audit-trailed as a `D-XX` override decision), and `design-fixer` routes findings by confidence times risk. **Built dep-free** (a maintainer decision: a pure scorer plus static tables, no ML). **No new runtime dependency.**

**SQLite state backbone (v1.57.0).** Project state (decisions, blockers, plans, findings, recall, instincts) lives in per-file markdown, which makes cross-cycle queries ("every accessibility decision across the last five cycles") infeasible. Phase 57 adds an opt-in `.design/state.sqlite` as an indexed query layer while markdown stays the human-editable source of truth. It is **built with zero new dependency**: SQLite is reached through the existing opportunistic `probeOptional('better-sqlite3')` runtime probe (the Phase 51 pattern), with a guaranteed markdown / JS-scan fallback whenever the module is absent. Run `migrate-to-sqlite.cjs --migrate-state` to build the database (14 tables plus FTS5); afterwards state mutations dual-write (SQLite authoritative, STATE.md rendered from it byte-for-byte) while the `gdd-state` read/mutate/transition API is unchanged. `/gdd:state query "<sql>"` runs read-only SELECTs (engine-level readonly), `/gdd:state recover` rebuilds a corrupt database from markdown, and `/gdd:state demigrate` reverts to markdown-only. When better-sqlite3 is not installed, GDD behaves exactly as before. **No new runtime dependency.**

Verify with:

```
/gdd:help
```

> [!TIP]
> Run Claude Code with `--dangerously-skip-permissions` for a frictionless experience. GDD is designed for autonomous multi-stage execution - approving each Read and `git commit` defeats the purpose.

### Staying Updated

GDD ships often. Update by re-running the installer (it's idempotent - updates registered marketplace entries in place):

```bash
npx @hegemonart/get-design-done@latest
```

Or from inside Claude Code:

```
/gdd:update
```

`/gdd:update` previews the changelog before applying. Local modifications under `reference/` are preserved - if a structural update needs re-stitching, run `/gdd:reapply-patches`. When a new release lands, the SessionStart hook prints a one-line banner gated by state-machine logic so it never interrupts a running stage.

<details>
<summary><strong>Non-interactive Install (Docker, CI, Scripts)</strong></summary>

```bash
# Claude Code
npx @hegemonart/get-design-done --claude --global   # Install to ~/.claude/
npx @hegemonart/get-design-done --claude --local    # Install to ./.claude/

# OpenCode
npx @hegemonart/get-design-done --opencode --global # Install to ~/.config/opencode/

# Gemini CLI
npx @hegemonart/get-design-done --gemini --global   # Install to ~/.gemini/

# Kilo
npx @hegemonart/get-design-done --kilo --global     # Install to ~/.kilo/

# Codex
npx @hegemonart/get-design-done --codex --global    # Install to ~/.codex/

# Copilot
npx @hegemonart/get-design-done --copilot --global  # Install to ~/.copilot/

# Cursor
npx @hegemonart/get-design-done --cursor --global   # Install to ~/.cursor/

# Windsurf, Antigravity, Augment, Trae, Qwen, CodeBuddy, Cline
npx @hegemonart/get-design-done --windsurf --global
npx @hegemonart/get-design-done --antigravity --global
npx @hegemonart/get-design-done --augment --global
npx @hegemonart/get-design-done --trae --global
npx @hegemonart/get-design-done --qwen --global
npx @hegemonart/get-design-done --codebuddy --global
npx @hegemonart/get-design-done --cline --global

# All runtimes
npx @hegemonart/get-design-done --all --global

# Dry run (print diff, write nothing)
npx @hegemonart/get-design-done --dry-run

# Custom config dir (Docker, non-default Claude root)
CLAUDE_CONFIG_DIR=/workspace/.claude npx @hegemonart/get-design-done
```

</details>

<details>
<summary><strong>Alternative: Claude Code CLI</strong></summary>

```bash
claude plugin marketplace add hegemonart/get-design-done
claude plugin install get-design-done@get-design-done
```

This is what the npx installer does for you - `npx` just collapses two commands into one.

</details>

### Tier-2 Distribution Channels (v1.28.8+)

Beyond the Phase 28.7 file-drop install paths above (which remain the default and continue to work exactly as before), v1.28.8 adds three Tier-2 distribution channels for discovery-driven install:

- **agentskills.io cross-runtime portability.** Our `skills/` are spec-compliant per the [agentskills.io](https://agentskills.io) standard (lint-only path per Phase 28.8 D-13; Phase 28.5 frontmatter contract already matches the 2 required spec fields `name` + `description`; current lint score 38 PASS / 32 WARN / 0 FAIL). Runtimes that claim agentskills.io compatibility (Codex, Kilo, Augment, Hermes, Qwen) can consume our skills directly via that channel - see `.planning/research/agentskills-io-compat/<runtime>.md` for per-runtime verification reports.
- **Cursor Marketplace.** Install via Cursor's marketplace UI. Publisher application submitted to Cursor post-merge; live link pending Cursor team review approval (no published SLA) - see `docs/cursor-marketplace-field-test.md` for current status. Manifest at `.cursor-plugin/plugin.json`.
- **Codex Plugin.** Install via Codex's GitHub-URL plugin add:

  ```bash
  codex plugin marketplace add hegemonart/get-design-done
  ```

  Works today against any GitHub URL with `.codex-plugin/plugin.json`. Per Phase 28.8 D-14: catalog discovery reuses `.claude-plugin/marketplace.json` - no separate Codex catalog file required.

Tier-1 file-drop paths above and Tier-2 channels here are **additive opt-in** - both work independently per Phase 28.8 D-05 backward-compat discipline.

### Capability-Gap Telemetry + Self-Authoring (v1.29.0+)

The reflector loop now tracks "capability lookup failed" signals as first-class telemetry and - once enough recurring gaps surface - can draft new agents or skills as proposals for your review.

**Stage 0 - telemetry (ships immediately).**
Three lookup-fail points now emit typed `capability_gap` events: `skills/fast` no-skill-match paths, `gdd-router` unmatched-intent paths, and the reflector's pattern-detection pass (recurring `Touches:` clusters without a dedicated owner). The reflector aggregates per-cycle gap events into a `## Capability gaps observed` section in your reflection notes. View with `gdd-events --type capability_gap`. No authoring on Stage 0 - this just surfaces signal.

**Stage 1 - self-authoring (opt-in once data crosses the gate).**
When K=3 stable clusters surface across M=10 reflection cycles (defaults in `reference/capability-gap-stage-gate.md`), `/gdd:apply-reflections` prompts you once to enable Stage 1. With Stage 1 on, the reflector drafts incubator artifacts at `.design/reflections/incubator/<slug>/` - `SKILL.md` or `agents/<slug>.md` with full Phase 28.5-compliant frontmatter, originating events, computed usage frequency, and a suggested integration point. Drafts surface in `/gdd:apply-reflections` as a 5th proposal class with four actions: `accept` (promotes + registers), `reject`, `defer`, `edit`. Promoted arms enter the bandit with a conservative `Beta(2, 8)` prior so they don't get preferential selection until evidence accumulates. Drafts not promoted/refreshed within 30 days auto-archive.

**Scope guard.** Authoring is limited to `agents/` and `skills/` only - never runtimes, transports, connections, hooks, or CI workflows. `scripts/validate-incubator-scope.cjs` blocks promotion attempts outside scope.

**Discipline preserved.** Reflector authors nothing that auto-ships. `/gdd:apply-reflections` remains the single human gate (Phase 11 SC-8). Stage 1 never auto-flips - user opts in.


### Figma off-context extraction (v1.31.0+)

Pull an entire Figma design system into a compact, LLM-readable local digest - **without the raw JSON ever entering Claude's context**. One command extracts the file via the Figma REST API into a local raw cache; a separate digest stage reduces it to `DESIGN.md` + `tokens.json` + `components.json`.

```bash
# Stage 1 — raw pull (0 Claude tokens; writes a gitignored cache)
node scripts/lib/figma-extract/pull.cjs <figma-file-url-or-key>
# Stage 2 — digest (reads the cache, writes the compact spec)
node scripts/lib/figma-extract/digest.cjs --raw <cache>/raw/<key> --out .design/figma
```

**The economics.** A spike measured **898× compression** (223 MB raw → 254 KB digest) with a ~15.7K-token `DESIGN.md`, capturing 127 component sets + 40 singletons (variants, props, defaults) in ~33s - at **0 Claude tokens and 0 Figma MCP calls during extraction**. This is the cost-sane alternative to the Figma MCP for whole-design-system work, which can run tens of minutes and 50–500K+ tokens for the same data. (The Figma MCP remains the right tool for spot questions on a single component.)

- **Token-safe by construction.** `FIGMA_TOKEN` is read from the environment only and sent solely as a request header - never logged, never written to disk (a CI static-analysis test enforces this across the whole extract library). The digest never reads raw JSON into context.
- **Works on any Figma plan.** The optional **"GDD Sync"** Figma plugin (`figma-plugin/`) fills the Variables-API-Enterprise gap: it reads `figma.variables` from inside Figma and POSTs them to an ephemeral, 127.0.0.1-only receiver - so Free-tier users get full token coverage too.
- **Per-component slices.** `digest --component <name|glob>` renders a ~500-token slice of just the components you ask for, instead of the full digest.
- **Health-aware.** `/gdd:health` reports a `figma_extract` readiness line (token set / token missing / Free-tier plugin-sync needed).

See [`skills/figma-extract/SKILL.md`](skills/figma-extract/SKILL.md) and [`figma-plugin/README.md`](figma-plugin/README.md) for the full flow.

### Skill discipline bootstrap (v1.32.0+)

GDD ships 96 skills, but a description-match skill router consults them opportunistically - easy to skip a stage under pressure. v1.32.0 added the forcing function GDD lacked, porting the skill-discipline **mechanism** (not content) from [`obra/superpowers`](https://github.com/obra/superpowers) (MIT):

- **SessionStart inject.** A `using-gdd` bootstrap contract is injected at every session start / `/clear` / compact (`hooks/inject-using-gdd.sh`, per-harness: Cursor / Claude Code / SDK). It carries the **1%-rule** ("even a 1% chance a skill applies → invoke it"), a red-flags `Thought → Reality` table, and the skill-priority + instruction-priority order - so the agent is primed to find the right skill before it acts.
- **`<HARD-GATE>` at every stage transition.** Brief / Explore / Plan / Design / Verify each refuse to advance until the stage's artifact exists and is approved - no free-handing a stage.
- **Rationalization tables** in all 7 stage skills name the common "skip it" justifications and rebut each; **inline self-review** blocks gate the brief and plan specs.
- **`<SUBAGENT-STOP>` no-cascade.** The inject fires only on SessionStart, so the bootstrap never cascades into spawned subagents.
- **Portable + health-aware.** `AGENTS.md` + `GEMINI.md` carry the same discipline block for non-Claude-Code harnesses, and `/gdd:health` reports a `skill-discipline` readiness line.

See [`skills/using-gdd/SKILL.md`](skills/using-gdd/SKILL.md) and the `NOTICE` attribution for details.

### Skill behavior tests (v1.33.0+)

Static validators check a skill's shape; **behavior tests** check that it holds under pressure. v1.33.0 adds a manifest-driven pressure-scenario harness (porting the TDD-for-skills methodology + pressure-scenario pattern from [`obra/superpowers/skills/writing-skills`](https://github.com/obra/superpowers), MIT): a runner drives a scenario (time / sunk-cost / authority / exhaustion / scope-minimization) through an injectable agent-invoker and scores the response against a compliance/violation rubric with N-attempts + majority rule. Ships 8 scenarios (7 stage skills + `using-gdd`) with synthetic RED baselines.

Behavior tests are **opt-in** and key-gated - the default `npm test` stub suite covers the harness structurally and stays CI-green (LLM non-determinism keeps live runs out of CI). To run the live pass:

```bash
# Skips + exits 0 when ANTHROPIC_API_KEY is unset.
ANTHROPIC_API_KEY=sk-... GDD_BEHAVIOR_INVOKER=./path/to/invoker.cjs npm run test:behavior
```

See [`docs/research/description-format-ab.md`](docs/research/description-format-ab.md) for the description-format A/B methodology and [`CONTRIBUTING.md`](CONTRIBUTING.md) ("How to add a pressure scenario").


## How It Works

> **New to an existing codebase?** Run `/gdd:map` first. It dispatches 5 specialist mappers in parallel (tokens, components, visual hierarchy, a11y, motion) and writes structured JSON to `.design/map/` - much higher signal than the grep-based fallback in Explore.

### 1. Brief

```
/gdd:brief
```

Captures the design problem before any scanning or exploration. The skill interviews via `AskUserQuestion`, one question at a time, only for unanswered sections: problem, audience, constraints, success metrics, scope.

**Creates:** `.design/BRIEF.md`

---

### 2. Explore

```
/gdd:explore
```

Inventories the current codebase's design system: colors, typography, spacing, components, motion, a11y, dark-mode. Five parallel mappers + a `design-discussant` interview produce three artifacts. Connection probes detect Figma, Refero, Storybook, Chromatic, Preview, Pinterest, Claude Design, paper.design, pencil.dev, Graphify, 21st.dev Magic, and Magic Patterns availability.

**Creates:** `.design/DESIGN.md`, `.design/DESIGN-DEBT.md`, `.design/DESIGN-CONTEXT.md`, `.design/map/{tokens,components,a11y,motion,visual-hierarchy}.{md,json}`

---

### 3. Plan

```
/gdd:plan
```

Decomposes Explore output into atomic, wave-coordinated, dependency-analyzed design tasks. Each task carries explicit `Touches:` paths, parallel-safety tags, and acceptance criteria. `design-planner` (opus) authors; `design-plan-checker` (haiku) gate-checks against the brief goal before execution.

**Creates:** `.design/DESIGN-PLAN.md`

---

### 4. Design

```
/gdd:design
```

Executes plan tasks in waves. Each task gets a dedicated `design-executor` agent with a fresh 200k context, atomic git commit, and automatic deviation handling per in-context rules. Parallel-safe tasks run in worktrees.

**Solidify-with-rollback** (v1.23.0) - every task validates (typecheck + build + targeted test) before locking in. Validation fails → `git stash` revert. Each task is atomic commit-or-revert.

**Creates:** `.design/tasks/task-NN.md` per task, atomic git commit per task

```
┌────────────────────────────────────────────────────────────────────┐
│  WAVE EXECUTION                                                    │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  WAVE 1 (parallel)          WAVE 2 (parallel)         WAVE 3       │
│  ┌─────────┐ ┌─────────┐    ┌─────────┐ ┌─────────┐    ┌─────────┐ │
│  │ Task 01 │ │ Task 02 │ →  │ Task 03 │ │ Task 04 │ →  │ Task 05 │ │
│  │ tokens  │ │ a11y    │    │ button  │ │ form    │    │ verify  │ │
│  └─────────┘ └─────────┘    └─────────┘ └─────────┘    └─────────┘ │
│       │           │              ↑           ↑              ↑      │
│       └───────────┴──────────────┴───────────┴──────────────┘      │
│              Touches: paths drive dependency analysis              │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

---

### 5. Verify

```
/gdd:verify
```

Verifies against the brief - must-haves, NN/g heuristics, audit rubric, token integration. Three agents run in sequence: `design-auditor` (6-pillar 1–4 score), `design-verifier` (goal-backward), `design-integration-checker` (greps D-XX decisions back to code). On failures, produces a structured gap list and enters a verify→fix loop via `design-fixer`.

**Creates:** `.design/DESIGN-VERIFICATION.md`, gap-fix commits if issues found

---

### 6. Ship → Reflect → Next Cycle

```
/gdd:ship                    # Generate clean PR branch (filters .design/ commits)
/gdd:reflect                 # design-reflector reads telemetry + learnings
/gdd:apply-reflections       # Review and selectively apply reflector proposals
/gdd:complete-cycle          # Archive cycle artifacts, write EXPERIENCE.md
/gdd:new-cycle               # Open a new design cycle
```

Or auto-route:

```
/gdd:next                    # Auto-detect state and run the next step
```

Each cycle gets a brief, scan, plan, execution, verification, and a per-cycle `EXPERIENCE.md` (~100–200 lines: Goal / Decisions made / Learnings graduated / What died / Handoff to next cycle) that becomes the highest-priority source for the decision-injector hook.

---

### Fast Mode

```
/gdd:fast "<task>"
```

For trivial single-file fixes that don't need the full pipeline. Skips the router, cache-manager, and telemetry. Same atomic-commit guarantees.

```
/gdd:quick
```

For ad-hoc tasks that need GSD-style guarantees but skip optional gates (no phase-researcher, no assumptions analyzer, no integration-checker). Faster than the full pipeline; safer than `/gdd:fast`.

---

## Why It Works

### Context Engineering

AI coding CLIs are powerful **if** you feed them context. Most people don't.

GDD handles it for you:

| File | What it does |
|------|--------------|
| `.design/BRIEF.md` | The cycle's problem, audience, success metrics |
| `.design/DESIGN.md` | Current design-system snapshot (tokens, components, hierarchy) |
| `.design/DESIGN-CONTEXT.md` | D-XX decisions, interview answers, upstream/downstream constraints |
| `.design/DESIGN-PLAN.md` | Atomic tasks, wave choreography, dependencies |
| `.design/DESIGN-VERIFICATION.md` | Verification result, gap list, Handoff Faithfulness score |
| `.design/intel/` | Queryable knowledge layer: token fan-out, component call-graph, decision traceability |
| `.design/archive/cycle-N/EXPERIENCE.md` | Per-cycle retrospective for cross-cycle memory |
| `.design/telemetry/events.jsonl` | Typed event stream across stages |
| `.design/telemetry/posterior.json` | Bandit posterior (when `adaptive_mode != static`) |

Size limits where Claude's quality degrades. Stay under, get consistency.

### 61 Specialized Agents

Each stage is a thin orchestrator that spawns specialized agents. Heavy lifting happens in fresh 200k contexts, not your main session.

| Stage | Orchestrator does | Agents do |
|-------|-------------------|-----------|
| Brief | one-question interview | (no subagents - leaf skill) |
| Explore | spawns 5 mappers + discussant | 5 parallel mappers, design-discussant, research-synthesizer |
| Plan | spawns researcher + planner + checker | design-phase-researcher (optional), design-planner (opus), design-plan-checker (haiku) |
| Design | wave coordination + worktree isolation | design-executor per task, design-fixer on solidify failure |
| Verify | spawns auditor + verifier + checker | design-auditor (6-pillar score), design-verifier (goal-backward), design-integration-checker (D-XX → code) |
| Reflect | reads telemetry + learnings | design-reflector (opus), design-authority-watcher, design-update-checker |

### 42 Tool Connections

All optional - the pipeline degrades gracefully when any connection is unavailable:

- **Figma** (read + write + Code Connect) - annotations, token bindings, implementation status write-back
- **Refero** - design reference search
- **Pinterest** - visual reference grounding
- **Claude Design** - handoff bundle import (`/gdd:handoff`)
- **Storybook** - component-spec lookup
- **Chromatic** - visual regression baseline diff
- **Preview** - Playwright + Claude Preview MCP for runtime screenshots
- **paper.design** - MCP canvas read/write for round-trip verification
- **pencil.dev** - git-tracked `.pen` spec files
- **Graphify** - knowledge-graph export
- **21st.dev Magic** - prior-art component search before greenfield builds
- **Magic Patterns** - DS-aware component generation with `preview_url`

### Embedded Design References

The plugin ships **18+ reference files** covering every major design-knowledge domain. Agents have authoritative answers without web search:

- **Heuristics** - NN/g 10, Don Norman emotional design (visceral/behavioral/reflective), Dieter Rams 10, Disney 12 (motion), Sonner / Emil Kowalski component-authoring lens, Peak-End Rule, Loss Aversion, Cognitive Load Theory, Aesthetic-Usability Effect, Doherty Threshold, Flow.
- **Components** - 35 component specs (Material 3, Apple HIG, Radix, shadcn, Polaris, Carbon, Fluent, Atlassian, Ant, Mantine, Chakra, Base Web, Spectrum, Lightning, Evergreen, Gestalt) with locked spec template (Purpose · Anatomy · Variants · States · Sizing · Typography · Keyboard · Motion · Do/Don't · Anti-patterns · Citations · Grep signatures).
- **Visual + brand** - gestalt principles, visual-hierarchy, brand-voice, palette catalog (161 industry palettes), style vocabulary (67 UI aesthetics), iconography (Lucide / Phosphor / Heroicons / Radix Icons / Tabler / SF Symbols).
- **Motion** - 12 canonical easings (RN MIT) + 8 transition families (hyperframes Apache-2.0) + spring presets + interpolation taxonomy + advanced craft (gesture mechanics, clip-path, blur crossfades, View Transitions API, WAAPI).
- **Platform + a11y** - WCAG 2.1 AA thresholds, platforms (iOS / Android / web / visionOS / watchOS), RTL + CJK + cultural color, form patterns (Wroblewski label research, autocomplete taxonomy, CAPTCHA ethics).
- **Anti-patterns** - regex-signature catalog matched by `design-pattern-mapper`.

### Atomic Git Commits

Each design task gets its own commit immediately after completion:

```
abc123f docs(08-02): complete user-card token plan
def456g feat(08-02): unify card surface tokens with --color-bg-elevated
hij789k feat(08-02): replace inline padding with --space-* scale
lmn012o test(08-02): assert card.spec passes WCAG contrast 4.5:1
```

Git bisect finds exact failing task. Each task is independently revertable. Solidify-with-rollback adds a per-task validation gate so a broken task 3 never corrupts tasks 4–10 before verify runs.

### Self-Improvement Loop

After every cycle, `design-reflector` (opus) reads `events.jsonl`, `agent-metrics.json`, and `learnings/`, then proposes diffs:

- **Tier overrides** - "design-verifier on plans <300 lines: drop to haiku, no measured quality regression"
- **Parallelism rules** - "token-mapper + component-taxonomy-mapper conflict on `Touches: src/styles/`; serialize"
- **Reference additions** - "L-12 cited 9 times across cycles 3–5; promote to `reference/heuristics.md`"
- **Frontmatter updates** - "design-executor `typical-duration-seconds: 60` measured at 142s; propose 120s"

`/gdd:apply-reflections` shows the diff and asks before applying. Nothing auto-applies. The **No-Regret Adaptive Layer** (v1.23.5) layers a Thompson sampling bandit + AdaNormalHedge ensemble + MMR rerank on top, viable in single-user mode via informed-prior bootstrap.

### Cost Governance

- **`gdd-router` skill** - deterministic intent → fast / quick / full routing. No model call.
- **`gdd-cache-manager`** - Layer-B explicit cache with SHA-256 input-hash + 5-min TTL awareness.
- **`budget-enforcer` PreToolUse hook** - enforces tier overrides, hard caps, lazy-spawn gates from `.design/budget.json`.
- **Per-spawn cost telemetry** - `.design/telemetry/costs.jsonl` rows feed `/gdd:optimize` rule-based recommendations.

Targets 50–70% per-task token-cost reduction with no quality-floor regression.

---

## Commands

### Core Pipeline

| Command | What it does |
|---------|--------------|
| `/gdd:brief` | Stage 1 - capture the design brief |
| `/gdd:explore` | Stage 2 - codebase inventory + interview |
| `/gdd:plan` | Stage 3 - produce DESIGN-PLAN.md |
| `/gdd:design` | Stage 4 - execute plan in waves |
| `/gdd:verify` | Stage 5 - verify against brief |
| `/gdd:ship` | Generate clean PR branch (filters .design/ commits) |
| `/gdd:next` | Auto-route to the next stage based on STATE.md |
| `/gdd:do <text>` | Natural-language router - picks the right command |
| `/gdd:fast <text>` | One-shot trivial fix, no pipeline |
| `/gdd:quick` | Ad-hoc task with GDD guarantees but skipped optional gates |

### First-Run + Onboarding

| Command | What it does |
|---------|--------------|
| `/gdd:start` | First-run proof path - top-3 design issues in your repo (no `.design/` footprint until you opt in) |
| `/gdd:new-project` | Initialize a GDD project (PROJECT.md + STATE.md + first cycle) |
| `/gdd:connections` | Onboarding wizard for the 12 external integrations |

### Cycle Lifecycle

| Command | What it does |
|---------|--------------|
| `/gdd:new-cycle` | Open a new design cycle |
| `/gdd:complete-cycle` | Archive cycle artifacts + write per-cycle EXPERIENCE.md |
| `/gdd:pause` / `/gdd:resume` | Numbered checkpoints - pause mid-stage, resume from any saved checkpoint |
| `/gdd:continue` | Alias for `/gdd:resume` (latest checkpoint) |
| `/gdd:timeline` | Narrative retrospective across cycles + git log |

### Iteration + Decisions

| Command | What it does |
|---------|--------------|
| `/gdd:discuss [topic]` | Adaptive design interview - `--all` for batch gray areas, `--spec` for ambiguity scoring |
| `/gdd:list-assumptions` | Surface hidden design assumptions before planning |
| `/gdd:sketch [idea]` | Multi-variant HTML mockup exploration - browser-openable directly |
| `/gdd:spike [idea]` | Timeboxed feasibility experiment with hypothesis + verdict |
| `/gdd:sketch-wrap-up` / `/gdd:spike-wrap-up` | Package findings into project-local skill |
| `/gdd:audit` | Wraps `design-verifier` + `design-auditor` + `design-reflector`. `--retroactive` audits the full cycle |
| `/gdd:reflect` | Run `design-reflector` on demand - produces `.design/reflections/<cycle-slug>.md` |
| `/gdd:apply-reflections` | Review and selectively apply reflector proposals - diff before apply |

### Memory + Knowledge Layer

| Command | What it does |
|---------|--------------|
| `/gdd:recall <query>` | FTS5-backed search across cycle archives, learnings, decisions, EXPERIENCE.md files |
| `/gdd:extract-learnings` | Mine cycle artifacts for patterns + decisions + lessons |
| `/gdd:note <text>` | Zero-friction idea capture - append, list, promote to todo |
| `/gdd:plant-seed <idea>` | Forward-looking idea with trigger condition - surfaces at the right cycle |
| `/gdd:analyze-dependencies` | Token fan-out, component call-graphs, decision traceability, circular dependency detection |
| `/gdd:skill-manifest` | List all GDD skills + agents from the intel store |
| `/gdd:graphify` | Build, query, inspect, diff the project knowledge graph |
| `/gdd:watch-authorities` | Diff the design-authority feed whitelist + classify into 5 buckets |

### Connections

| Command | What it does |
|---------|--------------|
| `/gdd:figma-write` | Write design decisions back to Figma (annotate / tokenize / roundtrip) |
| `/gdd:handoff <bundle>` | Import a Claude Design bundle and skip Stages 1–3 |
| `/gdd:darkmode` | Audit dark-mode implementation (CSS custom props / Tailwind dark: / JS class toggle) |
| `/gdd:compare` | Compute delta between DESIGN.md baseline and DESIGN-VERIFICATION.md result |
| `/gdd:style <Component>` | Generate component handoff doc (DESIGN-STYLE-[Component].md) |

### Diagnostic + Forensic

| Command | What it does |
|---------|--------------|
| `/gdd:scan` | Codebase design-system inventory (no STATE.md write) |
| `/gdd:map` | 5 parallel codebase mappers (tokens / components / a11y / motion / visual-hierarchy) |
| `/gdd:debug [desc]` | Symptom-driven design investigation with persistent state |
| `/gdd:health` | Reports `.design/` artifact health - staleness, missing files, token drift |
| `/gdd:progress` | Show pipeline position; `--forensic` runs 6-check integrity audit |
| `/gdd:stats` | Cycle stats - decisions made, tasks completed, commits, timeline, git metrics |
| `/gdd:optimize` | Rule-based cost analysis + tier-override recommendations |
| `/gdd:warm-cache` | Pre-warm Anthropic prompt cache across all agents that import shared-preamble |

### Distribution + Update

| Command | What it does |
|---------|--------------|
| `/gdd:update` | Update GDD with changelog preview |
| `/gdd:reapply-patches` | Restitch local `reference/` modifications after structural updates |
| `/gdd:check-update` | Manual update check - `--refresh` bypasses 24h TTL, `--dismiss` hides nudge |
| `/gdd:settings` | Configure `.design/config.json` - profile / parallelism / cleanup |
| `/gdd:set-profile <profile>` | Switch model profile (quality / balanced / budget / inherit) |
| `/gdd:undo` | Safe design change revert - uses git log + dependency check |
| `/gdd:pr-branch` | Create clean PR branch by filtering out `.design/` and `.planning/` commits |

### Backlog + Notes

| Command | What it does |
|---------|--------------|
| `/gdd:todo` | Add / list / pick design tasks |
| `/gdd:add-backlog <idea>` | Park a design idea for a future cycle |
| `/gdd:review-backlog` | Review parked items + promote to active cycle todo |

### Help

| Command | What it does |
|---------|--------------|
| `/gdd:help` | Full command list + usage |
| `/gdd:bandit-reset` | Reset adaptive-layer posterior on Anthropic model release |

---

## Connections

GDD ships with 42 tool connections. All are optional; the pipeline degrades gracefully to fallbacks when any connection is unavailable. Configure with `/gdd:connections`.

| Connection | Purpose | Probe |
|------------|---------|-------|
| **Figma** | Read tokens, components, screenshots; write annotations, Code Connect, implementation status | `mcp__figma__get_metadata` + `use_figma` |
| **Refero** | Design reference search across catalogued sources | `mcp__refero__search` |
| **Pinterest** | Visual reference grounding for brand-voice + style | OAuth + MCP |
| **Claude Design** | Handoff bundle import (`/gdd:handoff`) - skip Stages 1–3 | URL or local file |
| **Storybook** | Component-spec lookup at port 6006 | HTTP probe |
| **Chromatic** | Visual regression baseline diff | API key |
| **Preview** | Playwright + Claude Preview MCP runtime screenshots | `mcp__Claude_Preview__preview_*` |
| **paper.design** | MCP canvas read/write for canvas → code → verify → canvas round-trip | `mcp__paper__use_paper` |
| **pencil.dev** | Git-tracked `.pen` spec files (no MCP required) | `.pen` files in repo |
| **Graphify** | Knowledge-graph export | `mcp__graphify__*` |
| **21st.dev Magic** | Prior-art component search before greenfield builds | `mcp__magic__search` |
| **Magic Patterns** | DS-aware component generation with `preview_url` | `mcp__magic-patterns__generate` |

For full connection details and probe patterns, see [`connections/connections.md`](connections/connections.md).

---

## Configuration

GDD stores project settings in `.design/config.json`. Configure during `/gdd:new-project` or update with `/gdd:settings`.

### Model Profiles

Control which Claude model each agent uses. Balance quality vs token spend.

| Profile | Planning | Execution | Verification |
|---------|----------|-----------|--------------|
| `quality` | Opus | Opus | Sonnet |
| `balanced` (default) | Opus | Sonnet | Sonnet |
| `budget` | Sonnet | Sonnet | Haiku |
| `inherit` | Inherit | Inherit | Inherit |

Switch profiles:

```
/gdd:set-profile budget
```

Use `inherit` when using non-Anthropic providers or to follow the runtime's current model selection.

### Adaptive Mode

`.design/budget.json#adaptive_mode` ladder (v1.23.5):

| Mode | What it does |
|------|--------------|
| `static` (default) | Phase 10.1 behavior - static D-13 tier map |
| `hedge` | AdaNormalHedge ensemble + MMR rerank engaged. Bandit router still reads static map. Safest intro. |
| `full` | Bandit router + Hedge + MMR all active, reading/writing `.design/telemetry/posterior.json` |

### Parallelism

| Setting | Default | What it controls |
|---------|---------|------------------|
| `parallelism.enabled` | `true` | Run independent tasks in worktrees |
| `parallelism.min_estimated_savings_seconds` | `30` | Skip parallelization below this threshold |
| `parallelism.max_concurrent_workers` | `4` | Hard cap on simultaneous worktrees |

### Quality Gates

| Setting | Default | What it controls |
|---------|---------|------------------|
| `solidify.rollback_mode` | `"stash"` | `stash` / `hard` / `none` - how to revert on validation failure |
| `solidify.commands` | autodetect | Override typecheck / build / test commands |
| `verify.iterations_max` | `3` | Cap on verify→fix loop iterations |
| `connection.figma_writeback` | `proposal` | `proposal` / `auto` - confirm before writing |

---

## Security

### Built-in Hardening

GDD ships defense-in-depth security since Phase 14.5:

- **`hooks/gdd-bash-guard.js`** - PreToolUse:Bash blocks ~50 dangerous patterns (`rm -rf /`, `chmod 777`, `curl | sh`, `git reset --hard`, fork bombs) after Unicode NFKC + ANSI normalization.
- **`hooks/gdd-protected-paths.js`** - PreToolUse:Edit/Write/Bash enforces `protected_paths` glob list (defaults: `reference/**`, `.design/archive/**`, `skills/**`, `commands/**`, `hooks/**`, `.design/config.json`, `.design/telemetry/**`).
- **`hooks/gdd-risk-gate.js`** - PreToolUse:Write/Edit/MultiEdit/Bash scores each writer action via the pure `scripts/lib/risk/compute-risk.cjs` (tool x file-sensitivity x input shape), emits a `risk_assessment` event, and blocks only actions at or above 0.85; `allow` is silent, `review` / `require_confirmation` attach advisory context. Clear a block with `/gdd:override`.
- **`hooks/gdd-fact-force.js`** - PreToolUse:Edit/Write/MultiEdit holds the first write to a file until its DesignContext consumers and recorded decisions have been Read this session; soft block, softens to a warning when the graph is absent, cleared with `/gdd:override factforce <path>`.
- **`hooks/gdd-read-injection-scanner.ts`** - scans inbound Read content for invisible-Unicode (zero-width, word-joiner, BOM, bidi overrides) + HTML-comment + secret-exfil patterns.
- **`scripts/lib/blast-radius.cjs`** - `design-executor` preflight refuses tasks above `max_files_per_task: 10` / `max_lines_per_task: 400`.
- **`hooks/gdd-mcp-circuit-breaker.js`** - breaks consecutive-timeout loops on `use_figma` / `use_paper` / `use_pencil`.

### Protecting Sensitive Files

Add sensitive paths to your runtime's deny list:

```json
{
  "permissions": {
    "deny": [
      "Read(.env)",
      "Read(.env.*)",
      "Read(**/secrets/*)",
      "Read(**/*credential*)",
      "Read(**/*.pem)",
      "Read(**/*.key)"
    ]
  }
}
```

> [!IMPORTANT]
> Because GDD generates markdown files that become LLM system prompts, any user-controlled text flowing into `.design/` artifacts is a potential indirect prompt-injection vector. The injection scanner catches such vectors at multiple layers - but defense-in-depth is best practice.

---

## Troubleshooting

**Commands not found after install?**
- Restart your runtime to reload commands/skills
- Verify files exist at `~/.claude/skills/get-design-done/` for global Claude Code installs
- For local installs, verify `./.claude/skills/get-design-done/`
- Run `/gdd:help` to confirm registration

**Pipeline stuck mid-stage?**
- `/gdd:resume` - restore from the most recent numbered checkpoint
- `/gdd:health` - diagnose `.design/` artifact issues
- `/gdd:progress --forensic` - 6-check integrity audit

**Cost overruns?**
- `/gdd:optimize` - rule-based recommendations
- `/gdd:set-profile budget` - switch to budget tier
- Set `adaptive_mode: "full"` in `.design/budget.json` - bandit will learn cheap-and-correct tier per agent over 5–10 cycles

**Updating to the latest version?**
```bash
npx @hegemonart/get-design-done@latest
```

**Using Docker / containers?**

```bash
CLAUDE_CONFIG_DIR=/workspace/.claude npx @hegemonart/get-design-done
```

### Uninstalling

```bash
# Global installs (per-runtime)
npx @hegemonart/get-design-done --claude --global --uninstall
npx @hegemonart/get-design-done --opencode --global --uninstall
npx @hegemonart/get-design-done --gemini --global --uninstall
npx @hegemonart/get-design-done --kilo --global --uninstall
npx @hegemonart/get-design-done --codex --global --uninstall
npx @hegemonart/get-design-done --copilot --global --uninstall
npx @hegemonart/get-design-done --cursor --global --uninstall
npx @hegemonart/get-design-done --windsurf --global --uninstall
npx @hegemonart/get-design-done --antigravity --global --uninstall
npx @hegemonart/get-design-done --augment --global --uninstall
npx @hegemonart/get-design-done --trae --global --uninstall
npx @hegemonart/get-design-done --qwen --global --uninstall
npx @hegemonart/get-design-done --codebuddy --global --uninstall
npx @hegemonart/get-design-done --cline --global --uninstall

# Multi-select interactive uninstall (no runtime flag)
npx @hegemonart/get-design-done --uninstall

# Local installs (current project)
npx @hegemonart/get-design-done --claude --local --uninstall
# ... same flags as above with --local
```

This removes all GDD commands, agents, hooks, and settings while preserving other configurations.

---

## Feedback Channel (v1.30.0+)

GDD now ships a consent-first GitHub issue reporter via the `/gdd:report-issue` slash command.

- **What it does.** Walks you through reporting an issue or a capability gap, with a payload preview before submission. Local-first, consent-gated, no auto-mode. Triages against `reference/known-failure-modes.md` first - many failures resolve without filing.
- **Pseudonymization, NOT anonymization.** Direct identifiers (your username, hostname, absolute paths, git identity, env-var values, emails, IPs) are replaced with stable pseudonyms - but internal correlation is preserved so maintainers can debug. Side-channel data (writing style, code patterns, repo fingerprints) may still re-identify. You see the full payload before submission and explicitly consent per-issue.
- **Kill-switch.** Set `GDD_DISABLE_ISSUE_REPORTER=1` (env) or add `{ "issue_reporter": false }` to `.design/config.json` to halt submission before any network call. `gsd-health` surfaces the disable line.
- **Hardcoded destination.** The reporter cannot be redirected at runtime; the destination repo is a frozen constant in `scripts/lib/issue-reporter/destination.cjs`.
- **`gh`-absent fallback.** If the GitHub CLI isn't installed, the payload is written to `.design/issue-drafts/` and the issue-template URL is copied to your clipboard (xclip / pbcopy / clip).

See [`reference/pseudonymization-rules.md`](reference/pseudonymization-rules.md) for the R1..R8 rule catalog and [`reference/known-failure-modes.md`](reference/known-failure-modes.md) for known anti-patterns the reporter detects.

**v1.30.5 update** - the catalogue now ships 22 entries (was 10 in v1.30.0), and a new deterministic fuzzy matcher (`scripts/lib/failure-mode-matcher.cjs`, top-N + threshold + confidence) returns ranked candidates for ambiguous symptoms. The reflector + authority-watcher can propose new entries via `/gdd:apply-reflections` (6th proposal class) - strictly proposal-only, every entry passes through user review.

---

## License

MIT License. See [LICENSE](LICENSE) for details.

---

<div align="center">

**Claude Code ships code. Get Design Done makes sure it ships design.**

</div>
