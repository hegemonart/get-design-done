# Storybook — Connection Specification

This file is the connection specification for Storybook within the hone pipeline. It lives in `connections/` alongside other connection specs. See `connections/connections.md` for the full connection index and capability matrix.

---

Storybook is a local or CI dev server probed via HTTP `GET /index.json`. Its role is to serve as the **authoritative component inventory** for the discover stage (replacing grep-based enumeration) and to provide per-story a11y test output for the verify stage. No dedicated Storybook MCP is required — the probe is HTTP-based, using `curl` directly from Bash. For the full connection index see `connections/connections.md`.

---

## Setup

**Prerequisites:**

- Storybook installed as a dev dependency:
  ```bash
  npm install --save-dev storybook @storybook/react @storybook/addon-a11y
  ```
- Project configured in `.storybook/` (run `npx storybook init` for first-time setup — this is a one-time developer step, not a probe step)

**Start command:**

```bash
npx storybook dev -p 6006
```

**Verification:**

```bash
curl -sf http://localhost:6006/index.json | head -1
```

Expect JSON with `"v": 5` as the first field. If this returns empty, the dev server is not running — start it with the command above.

**Note on versions:** Storybook 8 serves `/index.json`. Storybook 7 serves `/stories.json`. The probe tries both (see Availability Probe section). When Storybook 8 is confirmed, always prefer `index.json`.

---

## Why Storybook is non-negotiable

Storybook declares every component state **explicitly and exhaustively**. A component with five variants (Primary, Disabled, Loading, WithIcon, Destructive) has five stories — not one component grep match.

Grep-based component inventory:
- Misses unnamed variants (a `<Button variant="ghost">` used inline is invisible to grep)
- Generates false positives from test files, storybook stories themselves, and import declarations
- Cannot enumerate story args or describe what states exist

`index.json` is the canonical, exhaustive component state register. It has zero false positives (every entry is a real, intentionally-declared story) and zero missed states (if a state is undeclared, it does not exist in Storybook either — which is itself a signal).

The verify stage iterates every declared story state to check a11y coverage. This is only possible because `index.json` enumerates them.

---

## When to use Storybook

**At the discover stage entry** (when the dev server is running) to build the authoritative component inventory. Replaces the grep-based component scan in `design-context-builder.md` Step 1.

**At the verify stage** after the design executor runs, to enumerate all story states for a11y coverage via `npx storybook test --ci`.

**At the design stage** (project detection only — dev server not required) to determine whether to emit `.stories.tsx` stubs alongside newly scaffolded components.

---

## Endpoints (HTTP GET — not MCP tools)

Storybook has no dedicated MCP. All integration is via HTTP GET to the running dev server or via Bash commands against the project files.

| Endpoint | Returns | Pipeline use |
|----------|---------|-------------|
| `GET /index.json` | Flat map of storyId → `{id, title, name, importPath, type, tags}` | Authoritative component inventory (Storybook 8) |
| `GET /stories.json` | Equivalent flat map in Storybook 7 format | Fallback for older Storybook versions |

**CRITICAL: Storybook 8 `index.json` does NOT include `parameters`.** Do NOT attempt to read `entry.parameters` from index.json entries — the field does not exist in Storybook 8. A11y configuration lives in `.storybook/preview.ts`, not in index.json. (See Caveats section.)

---

## index.json format (Storybook 8)

```json
{
  "v": 5,
  "entries": {
    "button--primary": {
      "id": "button--primary",
      "title": "Button",
      "name": "Primary",
      "importPath": "./src/components/Button.stories.tsx",
      "type": "story",
      "tags": ["autodocs"]
    },
    "button--disabled": {
      "id": "button--disabled",
      "title": "Button",
      "name": "Disabled",
      "importPath": "./src/components/Button.stories.tsx",
      "type": "story",
      "tags": []
    }
  }
}
```

**Key fields per entry:**

| Field | Description |
|-------|-------------|
| `id` | Kebab-case unique identifier: `{component-title}--{story-name}` |
| `title` | Component name / hierarchy path (e.g., `"Components/Button"` or `"Button"`) |
| `name` | Story variant name (e.g., `"Primary"`, `"Disabled"`, `"With Icon"`) |
| `importPath` | Relative path to the `.stories.tsx` file |
| `type` | `"story"` \| `"docs"` \| `"component"` — filter to `"story"` for variant enumeration |
| `tags` | Array of strings; `"autodocs"` marks auto-generated docs entries |

**Component inventory from index.json:** Group entries by `title` field to get the component list. Each unique `title` is one component; entries under it are its declared states. Example:

```
Title: "Button"
  States: Primary, Secondary, Disabled, Loading, WithIcon
  Stories file: ./src/components/Button.stories.tsx

Title: "Input"
  States: Default, Error, Disabled, WithHelperText
  Stories file: ./src/components/Input.stories.tsx
```

---

## Which Stages Use This Connection

| Stage | Agent | Endpoint / Command | Purpose |
|-------|-------|--------------------|---------|
| discover | `agents/design-context-builder.md` | `GET /index.json` | Component inventory (replaces grep) |
| verify | `agents/design-verifier.md` | `npx storybook test --ci` | Per-story a11y output for a11y gap analysis |
| design | `skills/design/SKILL.md` | `.storybook/` project detection (no server required) | `.stories.tsx` stub emission alongside new components |

---

## Availability Probe

The probe is two-phase. Run both steps in sequence at stage entry.

### Step B1 — Project detection

```bash
ls .storybook/ 2>/dev/null || grep '"storybook"' package.json 2>/dev/null
```

- **Found** → `storybook_project: true` → proceed to Step B2
- **Not found** → `storybook: not_configured` — skip all Storybook steps

### Step B2 — Dev server detection

```bash
curl -sf http://localhost:6006/index.json 2>/dev/null | head -1
```

- **Returns JSON** → `storybook: available` (Storybook 8 endpoint confirmed)
- **Fails (empty / connection refused)** → try the Storybook 7 compat endpoint:

```bash
curl -sf http://localhost:6006/stories.json 2>/dev/null | head -1
```

  - **Returns JSON** → `storybook: available` (using `stories.json` compat endpoint — log which was used)
  - **Fails** → `storybook: unavailable` (project detected but dev server not running)

### Three-value result

| Status | Meaning |
|--------|---------|
| `available` | Dev server running; `index.json` (or `stories.json` compat) confirmed |
| `unavailable` | Project has Storybook (`.storybook/` present) but dev server is not running |
| `not_configured` | No `.storybook/` directory and no `"storybook"` in `package.json` |

Write the resulting status to `.design/STATE.md` `<connections>`.

---

## Fallback Behavior

**discover stage:**

- `storybook: available` → read `index.json`, group entries by `title`, use as authoritative component list
- `storybook: unavailable` → fall back to grep-based component inventory; note in output: "component inventory via grep (storybook server not running)"
- `storybook: not_configured` → grep inventory only; no Storybook-specific steps

**verify stage:**

- `storybook: available` → run `npx storybook test --ci 2>&1 | tee .design/storybook-a11y-report.txt`; pass report to design-verifier
- `storybook: unavailable` → skip per-story a11y loop; run standard WCAG grep-based a11y checks only
- `storybook: not_configured` → skip; emit no note (this is an opt-in feature)

**design stage:**

- `storybook_project: true` (B1 found — dev server irrelevant) → emit `.stories.tsx` stubs alongside all new components
- `storybook: not_configured` (B1 not found) → skip `.stories.tsx` stub emission

Note: design stage uses **only Step B1** (project detection). Whether the dev server is running (B2) does not affect `.stories.tsx` stub emission — if the project has Storybook configured, new components need stories regardless.

---

## STATE.md Integration

Every stage that probes Storybook writes the result to `.design/STATE.md` under the `<connections>` section:

```xml
<connections>
figma: available
refero: not_configured
storybook: available
</connections>
```

**Status value table:**

| Value | Meaning |
|-------|---------|
| `available` | HTTP GET confirmed; `index.json` (or stories.json) returned valid JSON |
| `unavailable` | Project has Storybook configured but dev server is not running |
| `not_configured` | No `.storybook/` directory and no storybook dependency in `package.json` |

The scan stage writes the initial status at pipeline startup. Subsequent stages (discover, verify) re-read from STATE.md without re-probing unless they explicitly re-probe as part of their own stage entry.

---

## .stories.tsx CSF Stub Template

When `storybook_project: true`, the design stage emits this stub alongside every new component file:

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { ComponentName } from './ComponentName';

const meta: Meta<typeof ComponentName> = {
  title: 'Components/ComponentName',
  component: ComponentName,
  parameters: { a11y: { test: 'error' } },
};
export default meta;

type Story = StoryObj<typeof ComponentName>;

export const Default: Story = { args: {} };
export const Primary: Story = { args: { variant: 'primary' } };
export const Disabled: Story = { args: { disabled: true } };
```

Adjust `title` to match the component's directory structure:
- `src/components/Button.tsx` → `title: 'Components/Button'`
- `src/features/auth/LoginForm.tsx` → `title: 'Features/Auth/LoginForm'`

The `parameters.a11y.test = 'error'` setting makes axe-core a11y violations fail the Vitest test run, surfacing accessibility issues as CI failures.

---

## Caveats and Pitfalls

**1. Storybook 8 `index.json` does NOT contain `parameters`**

Storybook 7's `stories.json` included a `parameters` field per story (used by some tooling to detect addon config). Storybook 8 removed this from `index.json`. Never read `entry.parameters.a11y` from index.json — it does not exist and will return `undefined` for all entries, making a11y integration appear unconfigured even when it is. A11y configuration lives in `.storybook/preview.ts` — read that file to determine if `@storybook/addon-a11y` is enabled.

**2. Group by `title` to get component list**

Each unique `title` is one component. Each entry under that title is a declared story state. Iterating entries without grouping gives stories, not components. For a component inventory, iterate unique titles.

**3. Filter out `type: "docs"` entries**

Auto-generated docs entries (`type: "docs"`, often tagged `"autodocs"`) are not story states. Filter to `type: "story"` when building the variant list.

**4. First-time Storybook setup requires `npx storybook init`**

This is a one-time developer setup step, not part of the probe. The probe only detects whether Storybook is already configured in the project — it does not initialize Storybook.

**5. Chromatic dependency**

Chromatic requires Storybook. If `storybook: not_configured`, Chromatic cannot function even if its API token is present. See `connections/chromatic.md` for details.

**6. `stories.json` vs `index.json` version split**

Always probe `index.json` first. Only fall back to `stories.json` if `index.json` returns 404 or an error. Log which endpoint was used so downstream steps know the Storybook version.
