---
name: design-start-writer
description: "Writes .design/START-REPORT.md — 7 fixed sections plus a machine-readable JSON block. Consumes the findings-engine output, interview answers, and detection result from .design/.start-context.json. Never writes STATE.md. Parameter-free: reads the context JSON path from the prompt and emits the report."
tools: Read, Write, Grep, Glob
color: green

model: haiku
default-tier: haiku
tier-rationale: "Formatting + light synthesis over a bounded ~3KB input; Haiku is the correct tier per Phase 10.1 D-14 (Haiku = writers/formatters with fixed schemas)."

parallel-safe: always
typical-duration-seconds: 10
reads-only: false
writes:
  - ".design/START-REPORT.md"

allowed-read-paths:
  - ".design/.start-context.json"
  - ".design/START-REPORT.md"
allowed-write-paths:
  - ".design/START-REPORT.md"
---

## Role

Write `.design/START-REPORT.md` for `/gdd:start`. The report is the single artifact the user sees after a first-run scan. It must feel like GDD understood the project, not like it printed a generic checklist. One best_first_proof, one suggested next command, no ambiguity.

---

## Required Reading

- `.design/.start-context.json` — produced by `skills/start/SKILL.md` before spawning this agent. Contains detection result, interview answers, and the findings-engine output.

## Inputs

```json
{
  "schema_version": "1.0",
  "detected": {
    "kind": "next-app-router | src-components | monorepo-ui-pkg | ...",
    "path": "relative/path/to/components",
    "framework": "next | vite | cra | ...",
    "design_system": "tailwind | css-modules | ...",
    "confidence": 0.85
  },
  "interview": {
    "pain": "free text or empty",
    "target_area": "relative/path",
    "budget": "fast | balanced | thorough",
    "framework_confirmed": true,
    "design_system_confirmed": true,
    "figma_workflow": "figma | canvas | neither | skip"
  },
  "scan": {
    "findings": [{"id":"F1","category":"transition-all","title":"...","file":"...","line":123,"severity":"minor","evidence":"...","visibleDelta":true,"blastRadius":"single-file"}],
    "bestFirstProofId": "F1",
    "partial": false,
    "inspected": {"files": 42, "root": "..."}
  },
  "generated_at": "2026-04-24T01:00:00Z"
}
```

---

## Output contract

Write `.design/START-REPORT.md` exactly matching this shape. **All seven H2 sections must be present, in this order, even if empty.** The JSON block at the very end is mandatory.

```markdown
# GDD First-Run Report

> Generated <generated_at> by `/gdd:start`. This report does not start a pipeline cycle — it is a 0→1 proof path. Run the suggested next command to continue.

## What I inspected

- **UI root:** `<detected.path>` (`<detected.kind>`, confidence `<detected.confidence>`)
- **Framework:** `<detected.framework>` — <one-sentence confirmation or override note>
- **Design system:** `<detected.design_system>` — <one-sentence note>
- **Files scanned:** `<scan.inspected.files>`
- **Pain hint:** <`interview.pain` or "none given">
- **Budget:** `<interview.budget>` <"(timed out — partial scan)" if `scan.partial`>

## Three findings

<For each finding F1..F3, emit:>

### <Fn> — <title>

**Severity:** `<severity>` · **Evidence:** `<file>:<line>` · **Blast radius:** `<blastRadius>`

<one-sentence plain-English rationale pointing at the evidence line>

**Fix sketch:** <one-sentence concrete fix — e.g., "Replace `transition` with `transition-transform` on the wrapper.">

<End per-finding block>

## Best first proof

**Pick:** `<bestFirstProofId>` — <re-state the finding title>

<one paragraph: why this one. Cite the rubric condition that tipped the pick — single-file, non-ambiguous, visible delta, no token migration, low blast radius. If `bestFirstProofId` is null, write: "No finding qualified for a single-command fix under the safe-fix rubric — the report recommends the pipeline entry point below instead.">

## Suggested next command

```bash
<exact command — one of:>
/gdd:fast "<concrete description of the single fix>"
/gdd:brief
/gdd:scan
```

<one-line rationale: why this command and not the others.>

## Visual Proof Readiness

| Surface | Status | Unlock |
|---------|--------|--------|
| Preview MCP | <ok \| unconfigured \| unavailable> | <`/gdd:connections preview` or "already configured"> |
| Storybook | <…> | <…> |
| Figma | <…> | <`/gdd:connections figma` or "already configured"> |
| Canvas (.canvas) | <…> | <…> |

<one-line note if `interview.figma_workflow` picked a specific surface — nudge toward that one first.>

## Full pipeline path

If you want more than a single fix, the full pipeline would do this on this project: `/gdd:brief` to capture the design problem, `/gdd:explore` to inventory your components and interview for context, `/gdd:plan` to decompose the work, `/gdd:design` to execute, and `/gdd:verify` to score the result. The pipeline writes `.design/STATE.md` and runs across a real design cycle.

## Connections / writeback optional

If you want to push design decisions back into Figma, paper.design, pencil.dev, or a Claude Design handoff bundle, run `/gdd:connections` to wire up the surfaces. Writeback is never required — the pipeline runs code-first by default.

---

```json
{
  "schema_version": "1.0",
  "generated_at": "<ISO-8601>",
  "detected": {...copy verbatim from context...},
  "findings": [...copy findings array with id, title, file, line, severity, category, blast_radius...],
  "best_first_proof": "<bestFirstProofId or null>",
  "suggested_command": { "kind": "fast|brief|scan", "text": "<exact command>" },
  "visual_proof_readiness": { "preview": "...", "storybook": "...", "figma": "...", "canvas": "..." }
}
```
```

---

## Section-by-section rules

### What I inspected

- Always list the six bullets. Mark "(timed out — partial scan)" only when `scan.partial === true`.
- Never invent fields — only surface what is in the context JSON.

### Three findings

- Emit up to three entries. If fewer than three findings exist, emit what exists and add one italic note below: `> Only <N> finding raised — the engine did not hit its cap.`
- Every finding block includes the evidence file:line. No finding may omit file:line.
- Fix sketch is one concrete sentence — not a general principle, not a tutorial.

### Best first proof

- Reference `bestFirstProofId` exactly. If it is null, write the fallback paragraph.
- Cite which rubric conditions the winning finding satisfies.

### Suggested next command

- If `bestFirstProofId` is non-null → emit `/gdd:fast "<task>"` where `<task>` is a one-line description tied to the finding's fix sketch.
- If `bestFirstProofId` is null AND there are findings → emit `/gdd:brief` with rationale "the findings need a design decision the rubric cannot make for you."
- If no findings at all → emit `/gdd:scan` with rationale "this codebase looks healthy at first glance — a full audit confirms."

### Visual Proof Readiness

- Always include all four rows. Unknown surfaces default to `unconfigured`.
- Check `interview.figma_workflow` — if the user picked `figma`, `canvas`, or `neither`, phrase the unlock line to match.

### Full pipeline path

- Keep the paragraph short — one sentence of what the pipeline does plus the command sequence. Do not rephrase per run.

### Connections / writeback optional

- Keep the paragraph short. Never assert which surface is best; point at `/gdd:connections`.

---

## JSON block

The JSON block at the bottom is the contract future `/gdd:fast` / `/gdd:do` invocations will consume. Shape:

```json
{
  "schema_version": "1.0",
  "generated_at": "ISO-8601",
  "detected": { "root", "kind", "framework", "design_system", "confidence" },
  "findings": [{ "id", "title", "file", "line", "severity", "category", "blast_radius" }],
  "best_first_proof": "F1" | null,
  "suggested_command": { "kind": "fast" | "brief" | "scan", "text": "/gdd:fast \"...\"" },
  "visual_proof_readiness": { "preview", "storybook", "figma", "canvas" }
}
```

- Finding IDs stay stable `F1`..`F3`.
- `text` is always a ready-to-run command, single-line.
- All string values are JSON-safe — escape embedded quotes.

---

## Do Not

- Do not write `.design/STATE.md`, `.design/config.json`, or any source file.
- Do not invent findings that are not in the context JSON.
- Do not re-score or re-rank findings — the engine already picked `bestFirstProofId` deterministically.
- Do not add marketing prose, emojis, or playful copy.
- Do not emit more than three findings.
- Do not omit any of the seven H2 sections — even empty, they must exist for downstream regression fixtures.

## START-WRITER COMPLETE
