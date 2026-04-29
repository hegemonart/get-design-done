# Runtime Models — Per-Runtime Tier→Model Adapter Map

**Phase 26 source-of-truth (D-01).** Single canonical map from canonical Anthropic tier names (`opus|sonnet|haiku`) and runtime-neutral reasoning-class aliases (`high|medium|low`, D-10) to concrete model identifiers for each of the 14 runtimes the multi-runtime installer ships to (Phase 24 D-02).

This file is parsed by `scripts/lib/install/parse-runtime-models.cjs` and consumed by:

- `scripts/lib/tier-resolver.cjs` (26-02) — runtime tier resolution (`resolve(runtime, tier) → model`).
- `scripts/lib/install/installer.cjs` (26-03) — emits `models.json` per runtime config-dir at install time.
- `hooks/budget-enforcer.ts` + `scripts/lib/budget-enforcer.cjs` (26-05) — concrete model name for cost lookup.

**Strict schema** (D-03): each runtime block is a fenced `json` code block validated against `reference/schemas/runtime-models.schema.json`. Schema version is locked at `1` until a breaking change forces a version bump.

**Provenance discipline** (D-01): every row carries a `source_url` (runtime-author docs), `retrieved_at` (ISO timestamp), and `last_validated_cycle` (current GDD cycle ID). Placeholder URLs are tagged `<TODO: confirm at <runtime-author-docs-url>>` and validated by Phase 13.2 authority-watcher on later cycles.

**Single-tier runtimes** (D-02): if a runtime exposes only one model, that model maps to all three tiers and the entry carries `"single_tier": true`. Downstream consumers (router, budget-enforcer) may render a UI affordance noting tier selection has no cost effect for that runtime.

**Cycle ID:** `2026-04-29-v1.26` (rows validated in this cycle carry this string in `last_validated_cycle`).

---

## Schema version

```json
{ "$schema_version": 1 }
```

---

## claude — Claude Code

Anthropic's first-party runtime. Public tier docs at https://docs.anthropic.com/en/docs/about-claude/models. Seed picks per CONTEXT.md D-02.

```json
{
  "id": "claude",
  "tier_to_model": {
    "opus":   { "model": "claude-opus-4-7" },
    "sonnet": { "model": "claude-sonnet-4-6" },
    "haiku":  { "model": "claude-haiku-4-5" }
  },
  "reasoning_class_to_model": {
    "high":   { "model": "claude-opus-4-7" },
    "medium": { "model": "claude-sonnet-4-6" },
    "low":    { "model": "claude-haiku-4-5" }
  },
  "provenance": [
    {
      "source_url": "https://docs.anthropic.com/en/docs/about-claude/models",
      "retrieved_at": "2026-04-29T00:00:00.000Z",
      "last_validated_cycle": "2026-04-29-v1.26",
      "note": "Anthropic public model catalog — first-party runtime."
    }
  ]
}
```

---

## codex — OpenAI Codex CLI

OpenAI's Codex CLI runtime. Public tier docs at https://platform.openai.com/docs/models. Seed picks per CONTEXT.md D-02.

```json
{
  "id": "codex",
  "tier_to_model": {
    "opus":   { "model": "gpt-5" },
    "sonnet": { "model": "gpt-5-mini" },
    "haiku":  { "model": "gpt-5-nano" }
  },
  "reasoning_class_to_model": {
    "high":   { "model": "gpt-5" },
    "medium": { "model": "gpt-5-mini" },
    "low":    { "model": "gpt-5-nano" }
  },
  "provenance": [
    {
      "source_url": "https://platform.openai.com/docs/models",
      "retrieved_at": "2026-04-29T00:00:00.000Z",
      "last_validated_cycle": "2026-04-29-v1.26",
      "note": "OpenAI public model catalog."
    }
  ]
}
```

---

## gemini — Gemini CLI

Google's Gemini CLI runtime. Public tier docs at https://ai.google.dev/gemini-api/docs/models. Seed picks per CONTEXT.md D-02.

```json
{
  "id": "gemini",
  "tier_to_model": {
    "opus":   { "model": "gemini-2.5-pro" },
    "sonnet": { "model": "gemini-2.5-flash" },
    "haiku":  { "model": "gemini-2.5-flash-lite" }
  },
  "reasoning_class_to_model": {
    "high":   { "model": "gemini-2.5-pro" },
    "medium": { "model": "gemini-2.5-flash" },
    "low":    { "model": "gemini-2.5-flash-lite" }
  },
  "provenance": [
    {
      "source_url": "https://ai.google.dev/gemini-api/docs/models",
      "retrieved_at": "2026-04-29T00:00:00.000Z",
      "last_validated_cycle": "2026-04-29-v1.26",
      "note": "Google Gemini API public model catalog."
    }
  ]
}
```

---

## qwen — Qwen Code

Alibaba's Qwen Code runtime. Public tier docs at https://github.com/QwenLM/qwen-code. Seed picks per CONTEXT.md D-02.

```json
{
  "id": "qwen",
  "tier_to_model": {
    "opus":   { "model": "qwen3-max" },
    "sonnet": { "model": "qwen3-plus" },
    "haiku":  { "model": "qwen3-flash" }
  },
  "reasoning_class_to_model": {
    "high":   { "model": "qwen3-max" },
    "medium": { "model": "qwen3-plus" },
    "low":    { "model": "qwen3-flash" }
  },
  "provenance": [
    {
      "source_url": "https://github.com/QwenLM/qwen-code",
      "retrieved_at": "2026-04-29T00:00:00.000Z",
      "last_validated_cycle": "2026-04-29-v1.26",
      "note": "Qwen Code public model catalog."
    }
  ]
}
```

---

## kilo — Kilo Code

Kilo Code adapter — multi-provider, Anthropic-default fill until runtime-author docs confirm. Researcher fill needed (CONTEXT.md D-02).

```json
{
  "id": "kilo",
  "tier_to_model": {
    "opus":   { "model": "claude-opus-4-7" },
    "sonnet": { "model": "claude-sonnet-4-6" },
    "haiku":  { "model": "claude-haiku-4-5" }
  },
  "reasoning_class_to_model": {
    "high":   { "model": "claude-opus-4-7" },
    "medium": { "model": "claude-sonnet-4-6" },
    "low":    { "model": "claude-haiku-4-5" }
  },
  "provenance": [
    {
      "source_url": "<TODO: confirm at https://kilocode.ai/docs/models>",
      "retrieved_at": "2026-04-29T00:00:00.000Z",
      "last_validated_cycle": "2026-04-29-v1.26",
      "note": "TODO: confirm at runtime-author docs. Anthropic-default placeholder fill — Kilo's BYOK model means the user-configured provider may differ; researcher follow-up Phase 26 tail."
    }
  ]
}
```

---

## copilot — GitHub Copilot CLI

GitHub Copilot CLI — multi-provider routing under the hood. Researcher fill needed (CONTEXT.md D-02).

```json
{
  "id": "copilot",
  "tier_to_model": {
    "opus":   { "model": "gpt-5" },
    "sonnet": { "model": "gpt-5-mini" },
    "haiku":  { "model": "gpt-4o-mini" }
  },
  "reasoning_class_to_model": {
    "high":   { "model": "gpt-5" },
    "medium": { "model": "gpt-5-mini" },
    "low":    { "model": "gpt-4o-mini" }
  },
  "provenance": [
    {
      "source_url": "<TODO: confirm at https://docs.github.com/en/copilot/github-copilot-in-the-cli>",
      "retrieved_at": "2026-04-29T00:00:00.000Z",
      "last_validated_cycle": "2026-04-29-v1.26",
      "note": "TODO: confirm at runtime-author docs. Copilot CLI routes through GitHub's model gateway; concrete tier names may differ from underlying OpenAI IDs — researcher follow-up Phase 26 tail."
    }
  ]
}
```

---

## cursor — Cursor

Cursor IDE/CLI — multi-provider routing. Researcher fill needed (CONTEXT.md D-02).

```json
{
  "id": "cursor",
  "tier_to_model": {
    "opus":   { "model": "claude-opus-4-7" },
    "sonnet": { "model": "claude-sonnet-4-6" },
    "haiku":  { "model": "claude-haiku-4-5" }
  },
  "reasoning_class_to_model": {
    "high":   { "model": "claude-opus-4-7" },
    "medium": { "model": "claude-sonnet-4-6" },
    "low":    { "model": "claude-haiku-4-5" }
  },
  "provenance": [
    {
      "source_url": "<TODO: confirm at https://docs.cursor.com/models>",
      "retrieved_at": "2026-04-29T00:00:00.000Z",
      "last_validated_cycle": "2026-04-29-v1.26",
      "note": "TODO: confirm at runtime-author docs. Cursor's user-selectable model dropdown means the resolved tier depends on user config; Anthropic-default fill is the closest published equivalent — researcher follow-up Phase 26 tail."
    }
  ]
}
```

---

## windsurf — Windsurf

Windsurf (formerly Codeium) — multi-provider Cascade router. Researcher fill needed (CONTEXT.md D-02).

```json
{
  "id": "windsurf",
  "tier_to_model": {
    "opus":   { "model": "claude-opus-4-7" },
    "sonnet": { "model": "claude-sonnet-4-6" },
    "haiku":  { "model": "claude-haiku-4-5" }
  },
  "reasoning_class_to_model": {
    "high":   { "model": "claude-opus-4-7" },
    "medium": { "model": "claude-sonnet-4-6" },
    "low":    { "model": "claude-haiku-4-5" }
  },
  "provenance": [
    {
      "source_url": "<TODO: confirm at https://docs.windsurf.com/cascade/models>",
      "retrieved_at": "2026-04-29T00:00:00.000Z",
      "last_validated_cycle": "2026-04-29-v1.26",
      "note": "TODO: confirm at runtime-author docs. Cascade routes among multiple providers — Anthropic-default fill is the closest published equivalent. Researcher follow-up Phase 26 tail."
    }
  ]
}
```

---

## antigravity — Antigravity

Antigravity — Google's agentic coding platform. Researcher fill needed (CONTEXT.md D-02).

```json
{
  "id": "antigravity",
  "tier_to_model": {
    "opus":   { "model": "gemini-2.5-pro" },
    "sonnet": { "model": "gemini-2.5-flash" },
    "haiku":  { "model": "gemini-2.5-flash-lite" }
  },
  "reasoning_class_to_model": {
    "high":   { "model": "gemini-2.5-pro" },
    "medium": { "model": "gemini-2.5-flash" },
    "low":    { "model": "gemini-2.5-flash-lite" }
  },
  "provenance": [
    {
      "source_url": "<TODO: confirm at https://antigravity.google/docs/models>",
      "retrieved_at": "2026-04-29T00:00:00.000Z",
      "last_validated_cycle": "2026-04-29-v1.26",
      "note": "TODO: confirm at runtime-author docs. Antigravity is Gemini-native; gemini-2.5 tier alignment is the closest published equivalent. Researcher follow-up Phase 26 tail."
    }
  ]
}
```

---

## augment — Augment

Augment Code — multi-provider agentic IDE. Researcher fill needed (CONTEXT.md D-02).

```json
{
  "id": "augment",
  "tier_to_model": {
    "opus":   { "model": "claude-opus-4-7" },
    "sonnet": { "model": "claude-sonnet-4-6" },
    "haiku":  { "model": "claude-haiku-4-5" }
  },
  "reasoning_class_to_model": {
    "high":   { "model": "claude-opus-4-7" },
    "medium": { "model": "claude-sonnet-4-6" },
    "low":    { "model": "claude-haiku-4-5" }
  },
  "provenance": [
    {
      "source_url": "<TODO: confirm at https://docs.augmentcode.com/models>",
      "retrieved_at": "2026-04-29T00:00:00.000Z",
      "last_validated_cycle": "2026-04-29-v1.26",
      "note": "TODO: confirm at runtime-author docs. Augment routes among providers — Anthropic-default fill. Researcher follow-up Phase 26 tail."
    }
  ]
}
```

---

## trae — Trae

Trae — single-model session runtime per CONTEXT.md D-02 example. `single_tier: true` annotates the row. Researcher fill needed.

```json
{
  "id": "trae",
  "single_tier": true,
  "tier_to_model": {
    "opus":   { "model": "trae-builder" },
    "sonnet": { "model": "trae-builder" },
    "haiku":  { "model": "trae-builder" }
  },
  "reasoning_class_to_model": {
    "high":   { "model": "trae-builder" },
    "medium": { "model": "trae-builder" },
    "low":    { "model": "trae-builder" }
  },
  "provenance": [
    {
      "source_url": "<TODO: confirm at https://docs.trae.ai/models>",
      "retrieved_at": "2026-04-29T00:00:00.000Z",
      "last_validated_cycle": "2026-04-29-v1.26",
      "note": "TODO: confirm at runtime-author docs. Trae exposes a single managed-model session per CONTEXT.md D-02; tier selection has no cost effect — UI may surface this. Researcher follow-up Phase 26 tail."
    }
  ]
}
```

---

## codebuddy — CodeBuddy

CodeBuddy (Tencent) — multi-provider routing. Researcher fill needed (CONTEXT.md D-02).

```json
{
  "id": "codebuddy",
  "tier_to_model": {
    "opus":   { "model": "claude-opus-4-7" },
    "sonnet": { "model": "claude-sonnet-4-6" },
    "haiku":  { "model": "claude-haiku-4-5" }
  },
  "reasoning_class_to_model": {
    "high":   { "model": "claude-opus-4-7" },
    "medium": { "model": "claude-sonnet-4-6" },
    "low":    { "model": "claude-haiku-4-5" }
  },
  "provenance": [
    {
      "source_url": "<TODO: confirm at https://copilot.tencent.com/docs/models>",
      "retrieved_at": "2026-04-29T00:00:00.000Z",
      "last_validated_cycle": "2026-04-29-v1.26",
      "note": "TODO: confirm at runtime-author docs. CodeBuddy routes among providers — Anthropic-default fill. Researcher follow-up Phase 26 tail."
    }
  ]
}
```

---

## cline — Cline

Cline (formerly Claude Dev) — multi-provider VS Code agent. Researcher fill needed (CONTEXT.md D-02).

```json
{
  "id": "cline",
  "tier_to_model": {
    "opus":   { "model": "claude-opus-4-7" },
    "sonnet": { "model": "claude-sonnet-4-6" },
    "haiku":  { "model": "claude-haiku-4-5" }
  },
  "reasoning_class_to_model": {
    "high":   { "model": "claude-opus-4-7" },
    "medium": { "model": "claude-sonnet-4-6" },
    "low":    { "model": "claude-haiku-4-5" }
  },
  "provenance": [
    {
      "source_url": "<TODO: confirm at https://docs.cline.bot/models>",
      "retrieved_at": "2026-04-29T00:00:00.000Z",
      "last_validated_cycle": "2026-04-29-v1.26",
      "note": "TODO: confirm at runtime-author docs. Cline is BYOK-multi-provider; Anthropic-default fill is the namesake provider. Researcher follow-up Phase 26 tail."
    }
  ]
}
```

---

## opencode — OpenCode

OpenCode — open-source AI coding agent, BYOK multi-provider. Researcher fill needed (CONTEXT.md D-02).

```json
{
  "id": "opencode",
  "tier_to_model": {
    "opus":   { "model": "claude-opus-4-7" },
    "sonnet": { "model": "claude-sonnet-4-6" },
    "haiku":  { "model": "claude-haiku-4-5" }
  },
  "reasoning_class_to_model": {
    "high":   { "model": "claude-opus-4-7" },
    "medium": { "model": "claude-sonnet-4-6" },
    "low":    { "model": "claude-haiku-4-5" }
  },
  "provenance": [
    {
      "source_url": "<TODO: confirm at https://opencode.ai/docs/models>",
      "retrieved_at": "2026-04-29T00:00:00.000Z",
      "last_validated_cycle": "2026-04-29-v1.26",
      "note": "TODO: confirm at runtime-author docs. OpenCode is BYOK — user-configured provider may differ. Anthropic-default fill is a sensible baseline. Researcher follow-up Phase 26 tail."
    }
  ]
}
```
