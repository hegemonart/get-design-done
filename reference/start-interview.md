# /gdd:start — Locked 5-Question Interview

**Purpose:** collect the minimum signal needed to steer the findings engine without slowing first-run completion past 30 seconds of interview wall-clock. Autodetectable dimensions collapse to a one-key confirmation; genuinely non-derivable dimensions are asked explicitly.

**Hard constraint:** v1.14.7 ships this fixed question set. Do not branch, re-order, or insert new questions without an explicit `/gsd-discuss-phase` override captured in a future DISCUSSION.md.

---

## Q1 — Pain point *(required, free text)*

**Prompt:**

> What's the one design issue you'd most like to see fixed first? One line, ≤120 chars. Examples: "buttons feel jittery on hover", "colors are inconsistent across forms", "mobile nav breaks on the hero", "a11y on our modal".

**Default when `--skip-interview`:** empty string (pain hint disabled; scorer runs without boost).

**Validation:** max 120 chars; trim leading/trailing whitespace. No charset restrictions — the hint is free text.

**Failure posture:** if the user aborts at Q1, abort the whole skill with a one-line pointer to `/gdd:scan`.

---

## Q2 — Target area confirmation *(autodetected, single select)*

**Prompt:**

> I detected your UI code at `<detected.path>` (`<detected.kind>`, confidence=`<detected.confidence>`). Use this surface? [Yes / choose another path / skip demo]

**Default when `--skip-interview`:** accept detected path as-is.

**Validation:** if the user picks "choose another path", ask for a repo-relative path and validate that at least one UI-extension file (.tsx/.jsx/.ts/.js/.svelte/.vue) exists inside. Re-prompt on failure. Two rejections → fall back to detected path with a warning.

**Failure posture:** if the user picks "skip demo", exit clean with `## START COMPLETE` and no `.design/` footprint.

---

## Q3 — Budget / latency preference *(enum, default=balanced)*

**Prompt:**

> Report speed vs thoroughness? [fast (≤90s, tokens-only) / balanced (≤3min, default) / thorough (≤5min, includes a11y + motion checks)]

**Default when `--skip-interview`:** `balanced`.

**Validation:** must be one of `fast | balanced | thorough`. Any other input → re-prompt once, then default to `balanced`.

**Failure posture:** n/a — this is non-blocking; defaulting is safe.

---

## Q4 — Framework + design-system confirmation *(autodetected, combined)*

**Prompt:**

> Detected framework=`<framework>`, design-system=`<design_system>`. Correct? [Yes / override framework / override design-system / skip (use detected)]

**Default when `--skip-interview`:** accept both detected values.

**Validation:** "override framework" → ask for a free-text label (`next | remix | vite | cra | svelte | vue | astro | solid | unknown`). "override design-system" → same, values (`tailwind | css-modules | vanilla-extract | styled | linaria | emotion | panda | unknown`). Invalid → default to `unknown`.

**Failure posture:** n/a — detection output is always available even if the user skips.

---

## Q5 — Figma / canvas workflow *(enum, non-blocking)*

**Prompt:**

> Do you work with visual references? [Figma / .canvas file / neither / skip]

**Default when `--skip-interview`:** `skip`.

**Validation:** enum; any other → `skip`.

**Effect:** result steers the `Visual Proof Readiness` section only — never gates the happy path or the findings engine. The writer uses this to decide whether to surface `/gdd:connections figma` or `.canvas` guidance.

---

## Do Not

- Do not ask for email, org name, team size, or any identity data.
- Do not ask more than five questions.
- Do not branch based on Q1 content (adaptive branching is explicitly deferred per the ROADMAP).
- Do not write STATE.md, config.json, or any source file as a side effect of the interview.
