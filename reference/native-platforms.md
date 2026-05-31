# Native Platforms — Token-Bridge Spec

This reference is the **token→native-code bridge**: it specifies how the canonical
CSS-token form produced by the Phase-23 token engine
(`scripts/lib/design-tokens/`) maps onto the three native theme systems —
SwiftUI, Jetpack Compose, and Flutter — and pins down the **precision contract**
that defines what "token identity preserved" means for the deterministic
round-trip (`reference/native-platforms.md` is the authority that
`test/suite/native-token-bridge.test.cjs` asserts against).

It is the sibling of [`reference/platforms.md`](./platforms.md). Those two files
have distinct jobs and must not be confused:

| File | Job |
| --- | --- |
| `reference/platforms.md` (Phase 19) | Interaction **conventions** — navigation, safe areas, gestures, native typography, haptics. *Behavioral* knowledge the executors reference when laying out a screen. |
| `reference/native-platforms.md` (Phase 34.1, this file) | The token→theme **bridge** — how a design token (`#3B82F6`, `16px`, `Inter`) becomes a SwiftUI `Color` / Compose `Color(0x…)` / Flutter `Color(0x…)`, plus the precision contract for the round-trip. *Structural* knowledge the emitters implement. |

Per **D-02** the bridge **extends** the Phase-23 engine with three new emitters
(`scripts/lib/design-tokens/{swift,compose,flutter}.cjs`) rather than forking a
separate native IR. There is one canonical token form (below) and one set of
readers; the native emitters are additional *sinks* on the same facade. Per
**D-10** the round-trip operates at the **token level** — deterministic emit +
re-extract with documented precision — never full-view parsing and never a live
simulator, so the default `npm test` stays green on any machine.

---

## 1. Purpose

Phase 19 shipped platform *references* but zero generators; Phase 23 shipped a
multi-source token reader (`css-vars` / `js-const` / `tailwind` / `figma`) that
all normalise to a single flat `{ tokens: Record<string, string> }` map. Phase
34.1 crosses from platform-knowledge into platform-execution: instead of each
native executor re-deriving "how does `#3B82F6` become a SwiftUI `Color`", the
mapping lives once here (the spec) and once in the emitters (the
implementation), and the executors consume it. This amortizes the Phase-23 token
investment across SwiftUI / Compose / Flutter.

The canonical CSS-token form is the **single input** to all three native
emitters. This spec maps that one input to three native theme systems and states
the precision each mapping preserves.

---

## 2. Canonical input shape

The emitters consume the exact map shape the Phase-23 readers return: a **flat
`{ tokens: Record<string, string> }` object** whose keys are the design-token
names with the leading `--` stripped (exactly as `css-vars.cjs` returns) and
whose values are the raw token values as strings.

```js
{ tokens: { "color-primary": "#3B82F6", "space-4": "16px", "font-family-body": "Inter, system-ui" } }
```

Each emitter accepts either the full Phase-23 `TokenSet`
(`{ tokens, source?, format? }`) **or** a bare `{ tokens }` object — it reads
`tokenSet.tokens` and throws a `TypeError` only when no `.tokens` object is
present.

### Prefix → category inference

Token **category** is inferred from the key prefix. The emitters use this table
to decide whether a value is a color, a dimension, or a string:

| Key prefix | Category | Native treatment |
| --- | --- | --- |
| `color-` | color | hex → native channel form (§3–§5, §6 COLOR) |
| `space-`, `spacing-` | dimension | px → pt / dp / logical px (§6 DIMENSION) |
| `radius-` | dimension | px → pt / dp / logical px |
| `size-` | dimension | px → pt / dp / logical px |
| `font-`, `text-` | typography | string pass-through (family / weight / named size) |
| `shadow-` | other | string pass-through (composite values are non-mappable) |
| *(anything else)* | other | value-sniffed: a `#…` value is treated as color, an `Npx` value as dimension, otherwise string pass-through |

A value is **always** re-sniffed regardless of prefix, so a `#…` value under a
non-color prefix is still emitted as a color and a `Npx` value under a non-space
prefix is still emitted as a dimension. The prefix is the hint; the value is the
authority. This keeps the bridge robust against arbitrary token-naming schemes.

---

## 3. SwiftUI mapping

Target: a Swift source string exposing an `enum` of static theme constants
(`enum GDDTheme { … }`) — colors as `Color`, dimensions as `CGFloat` points,
typography families as `String` (and an optional `Font` helper).

| Token | SwiftUI form |
| --- | --- |
| color `#RRGGBB` | `Color(red: R/255.0, green: G/255.0, blue: B/255.0, opacity: A/255.0)` from the 8-bit channels |
| dimension `Npx` | `CGFloat` point literal — integer `N` (pt) |
| font-family | `String` literal (`"Inter, system-ui"`) |

Illustrative (2-line) snippet:

```swift
static let colorPrimary = Color(red: 59.0/255.0, green: 130.0/255.0, blue: 246.0/255.0, opacity: 255.0/255.0)
static let space4: CGFloat = 16
```

SwiftUI uses normalized `0.0…1.0` channel fractions; to keep the round-trip
**exact** the emitter writes each channel as the 8-bit numerator over `255.0`
(e.g. `59.0/255.0`) rather than a pre-divided decimal — the re-extractor reads
the numerator back as the integer channel, avoiding float drift. The `Color` /
`Font` / `ViewModifier` consumption pattern (applying the constants to views) is
the executor's job; this emitter produces the *constants*.

---

## 4. Jetpack Compose mapping

Target: a Kotlin source string with `Color` vals, a `Shapes` block (from
`radius-` tokens), a `Typography` block (from `font-`/`text-` tokens), and a
`MaterialTheme` wiring (`object GDDTheme { val Colors… ; val Shapes… ; val Typography… }`).

| Token | Compose form |
| --- | --- |
| color `#RRGGBB` | `Color(0xAARRGGBB)` long literal (alpha-first, 8 hex digits) |
| dimension `Npx` | `N.dp` (integer dp) |
| radius `Npx` | `RoundedCornerShape(N.dp)` inside `Shapes` |
| typography family | `String` (fed into a `TextStyle.fontFamily` slot / `Typography`) |

Illustrative (2-line) snippet:

```kotlin
val colorPrimary = Color(0xFF3B82F6)
val space4 = 16.dp
```

Compose packs ARGB into a single `0xAARRGGBB` long; alpha is the high byte. The
re-extractor reads the 8 hex digits straight back to the channels.

---

## 5. Flutter mapping

Target: a Dart source string building a `ThemeData` whose `colorScheme`
(`ColorScheme`) carries the color tokens and whose `textTheme` (`TextTheme`)
carries the typography tokens, plus a constants class
(`class GDDTheme { … }`).

| Token | Flutter form |
| --- | --- |
| color `#RRGGBB` | `Color(0xAARRGGBB)` (alpha-first, 8 hex digits) |
| dimension `Npx` | logical-px **double** — `N.0` |
| typography family | `String` (`fontFamily: 'Inter'`) |

Illustrative (2-line) snippet:

```dart
static const colorPrimary = Color(0xFF3B82F6);
static const space4 = 16.0;
```

Flutter measures in logical pixels and keeps the value as a `double` (`16.0`),
so — unlike pt/dp — Flutter dimensions are **not** rounded to integers; the
fractional part survives.

---

## 6. PRECISION CONTRACT

This section is the crux. It defines, per value category, exactly what
information the emit → re-extract round-trip preserves. The test asserts token
identity **within this precision** — not bit-exact floats, not lossy
approximation. An emitter is correct **iff** `reextract(emit({tokens}))`
reproduces every token in the identity set under these rules.

### COLOR — 8-bit-per-channel, EXACT

- Accepted input forms: `#RGB`, `#RRGGBB`, `#RGBA`, `#RRGGBBAA` (case-insensitive).
- `#RGB` / `#RGBA` shorthand **expands** to `#RRGGBB` / `#RRGGBBAA` by
  duplicating each nibble (`#3af` → `#33aaff`). This expansion is part of the
  contract: the re-extractor recovers the **expanded** `#RRGGBB(AA)` form, so
  `#3af` round-trips to `#33aaff` (canonically equal, the documented identity).
- Each channel is an 8-bit integer (0–255) and is preserved **exactly** — no
  channel may be off by one. SwiftUI stores channels as `N.0/255.0` numerators;
  Compose/Flutter store them in a `0xAARRGGBB` literal. Both forms recover the
  identical 8-bit channels.
- **Alpha:** when the input has no alpha (`#RGB`/`#RRGGBB`) the emitted color is
  **opaque** — alpha byte `0xFF` (Compose/Flutter) / `opacity: 255.0/255.0`
  (SwiftUI). The re-extractor emits an alpha channel **only when the original
  had one**: a 6-digit input round-trips to a 6-digit `#RRGGBB` (the implied
  opaque alpha is dropped on the way back); an 8-digit input round-trips to the
  8-digit `#RRGGBBAA`. This keeps `#3B82F6 → #3B82F6` an exact identity.

### DIMENSION — integer pt/dp, logical-px double

- Accepted input: `Npx` or a bare unit-less number (`16px`, `16`). The unit is
  normalised to `px` on the canonical side.
- **iOS (pt) / Android (dp):** rounded to the nearest integer, **round-half-up**
  (`15.5px` → `16`). Because rounding is lossy for non-integers, the round-trip
  **identity set** is restricted to integer-px dimensions (e.g. `16px`), which
  recover exactly: `16px → 16 (pt/dp) → 16px`.
- **Flutter (logical px):** kept as a `double` (`16px` → `16.0`), so Flutter
  does **not** round and a fractional dimension survives. The re-extractor
  recovers `Npx` by stripping the trailing `.0` for whole numbers.
- The re-extractor always recovers the canonical `Npx` string form, so the
  emit→re-extract identity for an integer dimension is `"16px" === "16px"`.

### `rem` / `em` — passed through verbatim (non-mappable)

`rem`/`em` values depend on a root/element font-size that the token map does not
carry, so they are **not** converted. They are treated as **non-mappable**
(below): emitted verbatim into a raw slot and **excluded** from the round-trip
identity set. (A future plan may add an explicit base-size option; until then,
verbatim pass-through is the stated, deterministic behavior.)

### TYPOGRAPHY / NAMED VALUES — string pass-through

`font-family`, `font-weight`, named sizes, and any other string token are
emitted **verbatim** as a string literal and recovered **string-equal**
(`"Inter, system-ui" → "Inter, system-ui"`). No normalisation, no quoting
changes that alter the recovered string.

### NON-MAPPABLE — verbatim, EXCLUDED from the identity set

Values the emitter cannot represent as a native primitive — CSS `var(--x)`
references, `calc(…)` expressions, gradients (`linear-gradient(…)`), and `rem`/
`em` dimensions — are **passed through verbatim** into a raw-string slot
(a trailing comment such as `// non-mappable: <name> = <value>` or the language
equivalent) so no information is lost, and are **explicitly excluded** from the
round-trip identity assertion. The contract documents them as
"verbatim / not round-tripped": the test asserts the verbatim value appears in
the emitted source, and does **not** assert it survives re-extraction as a typed
token.

---

## 7. The round-trip (what the test locks)

For each emitter the bridge guarantees:

1. **Determinism.** `emit(x) === emit(x)` byte-for-byte. Keys are iterated in a
   stable sorted order; no `Date`, no `process.env`, no filesystem, no network in
   the emit path (D-10).
2. **Identity within precision.** For the identity set (color + integer
   dimension + typography), `reextract(emit({tokens}))` deep-equals `{tokens}`
   under the precision rules above (8-bit color channels exact with `#RGB`
   expansion; integer pt/dp; logical-px double; family/weight string-equal).
3. **Verbatim exclusion.** Non-mappable values appear verbatim in the source and
   are not part of the identity assertion.

Each emitter module exports a symmetric re-extractor
(`reextractSwift` / `reextractCompose` / `reextractFlutter`) that parses the
emitted native source back into a `{ tokens }` map, so the round-trip is
deterministic and bijective on the identity set and reusable by the Phase-34.1
regression baseline.

---

## 8. Registration

This reference is registered in
[`reference/registry.json`](./registry.json) as the `native-platforms` entry
(type `heuristic`, phase `34.1`) so the registry round-trip test
(`test/suite/reference-registry.test.cjs`) stays green — every `reference/*.md`
must be registered and resolve (D-05, the 33.5-01 lesson).

---

## 9. Cross-references

- [`reference/platforms.md`](./platforms.md) — the interaction-conventions
  sibling (navigation, safe areas, gestures, native typography). Executors read
  **both**: this file for the token→theme bridge, that file for layout/behavior.
- `scripts/lib/design-tokens/` — the Phase-23 token engine this bridge extends
  (`index.cjs` facade + `css-vars` / `js-const` / `tailwind` / `figma` readers +
  the new `swift` / `compose` / `flutter` emitters).
- `test/fixtures/mapper-outputs/tokens.json` — the canonical token fixture the
  round-trip test derives its map from.
