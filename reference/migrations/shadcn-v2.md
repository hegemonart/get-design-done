# shadcn/ui v1 → v2 — Migration Rule Library

This library encodes the concrete, mechanical changes a project must make when moving a shadcn/ui codebase from the v1 era (Tailwind v3, HSL CSS variables, Radix `forwardRef`) to the v2 era (Tailwind v4 CSS-first theming, OKLCH variables, React 19 ref-as-prop). It is consumed by `agents/ds-migration-planner.md` to scope a migration and by `scripts/lib/migration/codemod-gen.cjs` to emit jscodeshift / ast-grep templates.

Every rule below is **proposal-only**. GDD never auto-applies a migration: the codemod generator emits reviewable templates, and the user inspects and runs each one before it touches the working tree. Treat the rules as a checklist the planner reasons over, not an executable patch — the planner's job is to scope, order, and impact-score, not to mutate code.

## Detection

shadcn/ui is **CLI-managed copy-in source**, not a versioned runtime dependency — the component code lives in the repo (`components/ui/*`), so there is no `shadcn` line in `dependencies` to read a version from. The planner therefore infers the era from `package.json` plus the project's `components.json`.

Primary boundary signals, strongest first:

- **`tailwindcss` major in `package.json`** is the single strongest signal: `^3.x` → v1 era; `^4.x` → v2 era. Almost everything else follows from this.
- **`components.json` shape** — its presence confirms a shadcn project. A non-empty `tailwind.config` key (a path to a JS/TS config) signals v1; an empty `tailwind.config` string plus a `tailwind.css` pointing at a file that opens with `@import "tailwindcss"` signals v2.
- **`react` / `react-dom` major** — `^19` indicates the project can use ref-as-prop and is on the v2 track; `^18` means `forwardRef` shims in the component source are still load-bearing.

Supporting (corroborating, not decisive) signals:

- **`@radix-ui/*` versions** — v1 pins per-primitive packages (e.g. `@radix-ui/react-dialog`); late-v2 projects often consolidate onto the unified `radix-ui` package. Either pattern is acceptable; the version floor matters more than the package name.
- **Animation dep** — `tailwindcss-animate` present → v1; `tw-animate-css` → v2.
- **`tailwind-merge` major** — `^2` → v1; `^3` → v2.
- **Neutral deps** — `next-themes`, `lucide-react`, `class-variance-authority`, `clsx` appear in both eras and are **not** boundary signals.

Version detection is **from `package.json` only** — never execute the shadcn CLI, hit a network registry, or shell out to resolve versions. If `tailwindcss` is absent or unparseable, the planner reports "era undetermined" rather than guessing.

## Migration rules

Each row is one codemod target. `Kind` is drawn from the `codemod-gen.cjs` enum: `rename-class` | `rename-prop` | `remove-component` | `token-rename` | `new-default`. Rule IDs are stable — the planner references them in its impact report and the generator names emitted templates after them.

| Rule ID | Kind | From → To | Note |
|---|---|---|---|
| SHADCN-01 | new-default | `tailwind.config.{js,ts}` `theme.extend` colors → `@theme` block in the CSS entry (after `@import "tailwindcss"`) | Tailwind v4 is CSS-first: theme tokens move out of JS config into an `@theme` directive. Structural move; the JS config is largely retired (only kept for plugins/content edge cases). |
| SHADCN-02 | token-rename | HSL triplet vars `--background: 0 0% 100%` → OKLCH `--background: oklch(1 0 0)` | Default theme variables switch from space-separated HSL channels to complete `oklch()` values across `:root` and `.dark`. Color values change representation, not (intended) appearance. |
| SHADCN-03 | rename-class | `hsl(var(--token))` wrappers & channel-opacity `bg-background/[alpha]` hacks → direct `var(--token)` / `bg-background` | v1 wrapped every var in `hsl(var(--x))`; v2 stores complete color functions, so the `hsl(...)` wrapper and the channel-based opacity workaround are removed. |
| SHADCN-04 | new-default | hand-rolled `@layer base { :root { … } }` tokens → `@theme inline { --color-*: var(--*) }` mapping | v2 exposes semantic tokens to the utility namespace via `@theme inline`, bridging raw `--background` vars to the `--color-background` utility Tailwind generates classes from. |
| SHADCN-05 | rename-prop | `React.forwardRef<T, P>((props, ref) => …)` → ref-as-prop `({ ref, ...props }: P & { ref?: Ref<T> })` | React 19 passes `ref` as a normal prop. v2 component source drops `forwardRef`; the trailing `Component.displayName = …` assignments become unnecessary. Mechanical, but touches every primitive file. |
| SHADCN-06 | new-default | component part JSX → add `data-slot="<component-part>"` attribute on each rendered element | v2 tags every primitive part with a stable `data-slot` for styling/targeting (e.g. `data-slot="card-header"`). Net-new attribute across every component file; near-zero visual delta. |
| SHADCN-07 | remove-component | `components/ui/toast.tsx` + `hooks/use-toast.ts` + Radix `<Toaster/>` → `sonner` `<Toaster/>` + `toast` import | The Radix-based toast and the `useToast` hook are removed in favor of Sonner. Imports of `useToast` / `@/components/ui/use-toast` must be rewritten to `import { toast } from "sonner"`. Behavioral + public-API change. |
| SHADCN-08 | rename-prop | `useToast()` call sites `toast({ title, description, variant })` → sonner `toast(title, { description })` / `toast.error(…)` | Sonner's signature differs from the v1 hook object form; `variant: "destructive"` maps to `toast.error`. Every call site needs reshaping. Pairs with SHADCN-07. |
| SHADCN-09 | token-rename | `tailwindcss-animate` plugin + dep → `tw-animate-css` via `@import "tw-animate-css"` in the CSS entry | The animation-utilities package is renamed. Remove the old devDependency and its plugin entry, add the new CSS import. Utility class names (`animate-in`, `fade-in-0`, `zoom-in-95`) are preserved. |
| SHADCN-10 | new-default | `components.json` `"style": "default"` → `"style": "new-york"` | The `default` style is removed in v2; `new-york` is the only remaining style, so any re-added component pulls new-york source. Some spacing, border, and icon-size defaults shift — moderate visual delta. |
| SHADCN-11 | rename-class | paired `h-4 w-4`, `h-6 w-6` icon sizing → `size-4`, `size-6` | v2 source adopts the `size-*` shorthand (Tailwind ≥3.4). Safe equivalent of matched `h-*`/`w-*`; mechanical, no visual delta. Only collapse pairs where the two values are equal. |
| SHADCN-12 | rename-prop | `cn()` relying on `tailwind-merge@^2` → `^3` | `tailwind-merge` v3 changes some merge-conflict resolution internals. Bump the dependency and re-verify `cn()` output where custom classes overlap component defaults. The `lib/utils.ts` `cn` body itself is unchanged. |
| SHADCN-13 | remove-component | per-primitive `@radix-ui/react-*` imports → unified `radix-ui` namespace imports | Optional in v2: `import * as DialogPrimitive from "@radix-ui/react-dialog"` → `import { Dialog as DialogPrimitive } from "radix-ui"`. Removes many small deps; not required for correctness, so flag as opt-in only. |
| SHADCN-14 | rename-class | `focus:ring-2 ring-offset-2` focus styles → `focus-visible:ring-[3px] focus-visible:ring-ring/50` | v2 components standardize on `focus-visible` plus a softened ring (`ring/50`, 3px). Visible focus-state change — moderate visual delta, and accessibility-relevant, so it cannot be silently dropped. |
| SHADCN-15 | token-rename | add v2 chart + sidebar tokens (`--chart-1..5`, `--sidebar`, `--sidebar-foreground`, …) absent in v1 themes | v2 ships extra semantic variables. If the project uses the Chart or Sidebar components, the `@theme` / `:root` block must gain these tokens or those components render unstyled. No-op for projects that use neither. |
| SHADCN-16 | new-default | `tailwind.config` `darkMode: ["class"]` → CSS `@custom-variant dark (&:is(.dark *))` | v4 expresses the dark variant in CSS rather than JS config; the `darkMode` array key is dropped and replaced by a `@custom-variant` declaration in the stylesheet entry. |

## Impact notes

The planner scores each rule as **visual-delta × usage × tests** to order the migration and decide what needs human eyes before the user runs the codemod.

**High visual-delta — review with screenshots / visual diff:**

- SHADCN-02 + SHADCN-03 — the whole HSL→OKLCH color move. Intended to be visually neutral, but it rewrites every color value, so it must be *proven* neutral against a baseline, not assumed.
- SHADCN-10 — `default`→`new-york` shifts spacing, radius, and icon defaults across the component set.
- SHADCN-14 — the focus-ring restyle changes a visible interaction state.
- SHADCN-15 — missing chart/sidebar tokens make those components render wrong (unstyled), which reads as a large visual delta where they're used.

**High behavioral / API delta — manual review required:**

- SHADCN-07 + SHADCN-08 — toast → Sonner changes a public API and runtime behavior. Call-site reshaping cannot be fully mechanical (variant mapping, return values), so every notification flow should be re-tested by hand.
- SHADCN-12 — `tailwind-merge` v3 can silently change which class wins in a merge. Review anywhere custom classes are layered over component defaults.

**Structural, low visual-delta — codemod-friendly, light review:**

- SHADCN-01, SHADCN-04, SHADCN-16 relocate theming from JS config into CSS. Mechanical once the target `@theme` shape is fixed, but they touch the build entry — a single broken import fails the whole stylesheet, so verify the app boots rather than diffing pixels.

**Purely mechanical — auto-generatable templates, spot-check only:**

- SHADCN-05 (`forwardRef`→ref-as-prop), SHADCN-06 (`data-slot`), SHADCN-09 (`tailwindcss-animate`→`tw-animate-css`), SHADCN-11 (`h-*/w-*`→`size-*`). Deterministic AST rewrites with no intended visual change. Weight **usage** (file count) heavily here, since these fan out across every component file and dominate the diff size.

**Opt-in — never blocking:**

- SHADCN-13 (Radix package consolidation) is dependency hygiene only. Gate it behind explicit user opt-in; never hold up a migration on it.

**Test signal:** rules touching files that already have component tests (often the primitives in SHADCN-05/06/11) score lower review-risk, because the suite catches regressions. Rules touching theme/CSS (SHADCN-01/02/04/15/16) are rarely unit-tested, score higher, and must lean on visual verification instead of the test gate.
