# Game UI & HUD Design Patterns

This pack covers UI, HUD, and interaction patterns specific to games and interactive entertainment: the diegetic-UI taxonomy, high-motion accessibility, age-rating gates, multi-input (controller / touch / keyboard-mouse) interaction models, and game-feel feedback. GDD loads this domain automatically when it detects a game, HUD, or interactive-entertainment project (see Detection signals). The auditor agent runs the Audit checklist against the project's UI.

## HUD / diegetic UI taxonomy

The canonical model is the four-quadrant scheme from Fagerholt & Lorentzon ("Beyond the HUD", 2009), classified on two axes: whether the element exists in the game's **story (fiction)** and whether it exists in the **3D geometry of the game space**.

| Type | In the fiction? | In 3D space? | Example | Use when |
|------|-----------------|--------------|---------|----------|
| **Non-diegetic** | No | No | Classic flat overlay: health bar, minimap, ammo counter | Information must be instantly legible regardless of camera; competitive or fast-twitch genres |
| **Diegetic** | Yes | Yes | Dead Space health spine, Metro 2033 wrist watch, in-world ammo on the gun | Immersion-first single-player; the readout can plausibly belong to a character/object |
| **Spatial** | No | Yes | Floating waypoint markers, enemy outlines, footstep VFX rendered in-world | Guidance anchored to a location/entity but not justified by the story |
| **Meta** | Yes | No | Blood/cracked-glass screen splatter, rain on the "lens", damage-direction vignette | Conveying character state via the presentation layer / 4th-wall surface |

Guidance:

- Default competitive and twitch genres (shooters, MOBAs, fighting) to **non-diegetic** for raw readability; reserve diegetic/meta for ambience.
- Diegetic elements must degrade gracefully - if the player can't see the gun, they can't see the ammo, so pair with an accessibility fallback (toggleable non-diegetic readout).
- **Minimalist / no-HUD trends**: contextual fade (show on change, fade when idle), HUD-on-demand (hold a button to reveal), and full no-HUD modes (Journey, photo modes). Always make HUD density a player setting rather than a hard removal.
- Never encode critical state in a single channel that a player may have disabled (color, a diegetic-only readout, an audio-only cue).

## High-motion accessibility

### Vestibular / motion triggers

Provide **in-game toggles** for each of the following AND honor the OS / platform "reduce motion" signal (`prefers-reduced-motion` on web, the equivalent OS accessibility flag on console/mobile). The in-game control overrides, but reduced-motion should set the safe default.

- Camera shake (combat, explosions, footsteps) - slider 0–100%, not just on/off.
- Parallax and large background motion in menus and HUD.
- Head-bob / weapon-sway / view-bob during locomotion.
- Screen-wide motion: speed lines, motion blur, chromatic aberration, full-screen zoom/punch.
- Field-of-view (FOV) slider; narrow FOV is a common nausea trigger in first-person.

### Photosensitive epilepsy (PSE)

- No more than **three general flashes per second** over any one-second window (WCAG 2.3.1 *Three Flashes or Below Threshold*; aligns with the Harding/ITU broadcast limit).
- Apply extra caution to **saturated red** flashes - red flashing is disproportionately provocative and has a stricter threshold than general luminance flashes.
- Avoid large high-contrast rapidly-alternating patterns (stripes, checkerboards) covering a large area of the screen.
- Surface a PSE warning at first launch and document risky effects; offer a "reduce flashing" toggle that caps strobe effects.

### Motion-sickness comfort (esp. VR)

- Comfort vignette / tunneling that narrows peripheral vision during fast movement or turns.
- **Snap-turn** (discrete angular increments) as an alternative to smooth turning; teleport locomotion as an alternative to smooth movement.
- Fixed visual reference (cockpit, nose, horizon line) and a static-world option.

## ESRB / PEGI age-gates & content disclosure

- **Neutral date-of-birth gate**: collect day/month/year with **no pre-filled default** and no shortcut. Do **not** use a "Are you 18?" yes/no toggle or any single-tap affirmation - these are non-compliant gates. The gate should not telegraph the passing answer.
- Display the **correct regional rating**: ESRB (North America, esrb.org), PEGI (Europe, pegi.info), plus regional bodies where shipped (USK in Germany, CERO in Japan, ACB in Australia, GRAC in Korea, ClassInd in Brazil).
- Show **content descriptors** alongside the rating mark (e.g., Violence, Blood, Strong Language, Sexual Content, Use of Drugs) and **interactive elements** notices.
- Disclose **in-game purchases** and the **"Includes Random Items"** / loot-box descriptor when paid randomized rewards exist; honor regional loot-box and odds-disclosure rules (e.g., published drop-rate odds where required).
- See ESRB ratings guide: https://www.esrb.org/ratings-guide/ and PEGI: https://pegi.info/.

## Input model - controller-first vs touch-first vs KB/M

Detect the **active** input device and adapt; never assume mouse hover exists.

- **Spatial focus navigation**: every interactive element must be reachable and selectable via D-pad / left-stick with a clearly visible focus highlight. Maintain a sane focus order and wrap/clamp logic; nothing should be reachable by pointer only.
- **Adaptive button-prompt glyphs**: on-screen prompts must swap to match the detected device (Xbox A/B/X/Y, PlayStation cross/circle/square/triangle, Nintendo A/B/X/Y, or KB/M key caps). Re-detect on device switch mid-session.
- **No hover-only affordances**: tooltips, reveals, and actions that only appear on mouse hover are invisible to controller and touch. Provide a focus/press equivalent.
- **Dead-zone & cursor-vs-stick**: expose stick dead-zone and sensitivity; if a virtual cursor is driven by a stick, tune acceleration; distinguish analog cursor from discrete focus navigation.
- **TV-safe area / overscan**: keep critical HUD and text inside a safe margin (target ~5% inset, the action-safe region) so nothing is clipped on overscanning TVs; offer a HUD-bounds/safe-area adjustment screen.
- **Touch-first**: minimum touch target ~44–48 px; thumb-reach zones; avoid placing controls under resting thumbs; provide on-screen stick/buttons that can be repositioned and resized.
- **Remappable controls as accessibility**: full rebinding for every action (including toggle-vs-hold options and the ability to remap sprint/crouch/aim) is an accessibility requirement, not a luxury.

## Feedback & game-feel

- **Juice, used deliberately**: hit-stop (brief freeze on impact), screen-shake, particle bursts, and squash/stretch sell impact - but screen-shake and heavy effects must be **sparing and toggleable** (ties into the vestibular sliders above).
- **Readable damage / state feedback without color alone**: pair damage-direction indicators with shape/position, low-health with a non-color cue (audio heartbeat, vignette + icon), and status effects with distinct icons + text, not just a tint. This satisfies the color-independence requirement (WCAG 1.4.1 *Use of Color* as a design north star).
- **Latency budgets**: target end-to-end input-to-photon responsiveness - roughly under ~100 ms feels responsive, under ~50 ms feels tight; competitive/rhythm titles need the tightest budgets. Never debounce or animation-gate a core action input so heavily that it adds perceptible lag.
- **Multi-channel confirmation**: important events (pickup, hit-confirm, objective complete) should land on at least two of {visual, audio, haptic} so a player with one channel disabled still gets feedback.

## Detection signals

GDD activates this domain when it sees these signals in the repo or brief.

**Keywords** (prose, file names, route/scene names): `game`, `HUD`, `player`, `level`, `multiplayer`, `leaderboard`, `inventory`, `quest`, `sprite`, `gamepad`, `controller`, `respawn`, `loot`.

**`package.json` dependencies** (any one is a strong signal):

| Dependency | Engine / role |
|------------|---------------|
| `phaser` | 2D HTML5 game framework |
| `three` | WebGL 3D renderer |
| `@react-three/fiber` | React renderer for three.js |
| `@react-three/drei` | Helpers for react-three-fiber |
| `pixi.js` | 2D WebGL rendering |
| `babylonjs` / `@babylonjs/core` | 3D game engine |
| `colyseus` | Authoritative multiplayer server |
| `playcanvas` | 3D/WebGL game engine |
| `excalibur` | TypeScript 2D game engine |
| `matter-js` | 2D physics engine |

The presence of a game engine dep plus any HUD/player keyword should auto-route the project into this domain.

## Audit checklist

1. Every motion effect (camera shake, parallax, head-bob, motion blur, screen-wide zoom) respects the OS reduced-motion setting AND exposes an in-game slider (not just on/off).
2. No visual effect flashes more than **three times per second**, and saturated-red flashing is specifically avoided (WCAG 2.3.1); a PSE warning is shown at first launch.
3. An FOV slider and a motion-sickness comfort option (vignette/tunneling; snap-turn or teleport in VR) are present where the camera is first/close-third person.
4. The age gate is a **neutral date-of-birth entry** with no pre-filled default - not an "Are you 18?" yes/no toggle.
5. The correct regional rating mark, content descriptors, and an in-game-purchase / loot-box ("Includes Random Items") disclosure are displayed.
6. Every interactive element is reachable via D-pad / stick focus navigation with a visible focus highlight; nothing is pointer-only.
7. On-screen button prompts adapt to the active input device (Xbox / PlayStation / Nintendo / KB-M) and re-detect on device switch; nothing relies on mouse hover.
8. Critical HUD and text sit inside a TV-safe / action-safe margin (~5% inset) and survive overscan; a HUD-bounds adjustment exists where relevant.
9. All gameplay controls are fully remappable (with toggle-vs-hold options) as an accessibility provision.
10. No critical state is encoded by color alone - damage, low-health, and status effects use shape, position, icon+text, or audio in addition to color.
11. Screen-shake and other "juice" are sparing and toggleable; core action inputs are not animation-gated into perceptible lag (input-to-response budget honored).
12. Important events (hit-confirm, pickup, objective) are confirmed on at least two of visual / audio / haptic channels.
