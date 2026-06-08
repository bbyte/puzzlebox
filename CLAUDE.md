# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

Scaffolded and building. The pure game logic (`src/game/`) is implemented and unit-tested; a
minimal Three.js scene (`src/scene/`, `src/main.ts`) renders the box to real dimensions with
working buttons, check feedback, and drag-to-rotate. `Images/` holds rendered reference art of the
physical box (not yet wired in as textures). Keep new code consistent with the architecture below.

## What this is

A browser-only, **mobile-first** Three.js replica of a physical handheld puzzle box. The puzzle is
a game of **Mastermind**: the player sets 5 colored lights to guess a randomly generated secret
code, and a Check button reveals how close the guess is. Everything runs **client-side in the
browser** — no backend, no network calls, no persistence required beyond the current session.

## Stack & commands

- **Vite + TypeScript + Three.js**, vanilla (no UI framework). Vite gives the dev server, HMR, and
  the production bundle; Three.js renders the box and lights. TypeScript is `strict` with
  `noUnusedLocals`/`noUnusedParameters` on — the build type-checks before bundling.
- `npm run dev` — Vite dev server with HMR (primary loop; open the printed URL on a phone or use
  mobile emulation in devtools).
- `npm run build` — `tsc --noEmit` type-check + production bundle to `dist/`.
- `npm run preview` — serve the built `dist/` locally to sanity-check the production build.
- `npm test` — Vitest once. Single file: `npx vitest run src/game/mastermind.test.ts`. Watch:
  `npm run test:watch`. The game logic is pure and framework-free specifically so it can be unit
  tested without a DOM or WebGL context — prefer testing it there, not through the 3D scene.

## Architecture

Keep a hard separation between **game logic** and **presentation**. The logic must not import
Three.js or touch the DOM; the scene reads logic state and renders it.

- **Game logic (pure module).** Owns the secret code, the player's current guess, the check
  history, and the win/lose/reset state machine. Deterministic and side-effect free so it is
  unit-testable in isolation. Exposes intent-level operations (cycle a light, run a check, reset)
  and emits state the renderer consumes.
- **Three.js scene/presentation.** Builds the box geometry, materials, and lighting; maps the 6
  light states to emissive colors; animates the two feedback indicators. Translates pointer/touch
  events on 3D buttons into game-logic operations via raycasting. This is the only layer allowed to
  know about WebGL, the canvas, or input devices.
- **Assets.** `Images/` holds the six face renders (`box_front`, `box_back`, `box_top`,
  `box_bottom`, `box_inside`, `box_inside_container`) used as reference and/or textures for the box
  faces and the inner container.

### Real dimensions & layout

The physical box is **145mm wide (x) × 100mm tall (y) × 110mm deep (z)**. The scene models this at
**1 unit = 1 metre** (see `BOX` in `src/scene/constants.ts`); keep new geometry to that scale. The
box is a **hollow shell** (five panels) with the back left open for a removable **back lid** (the
"cut", with tabs) and a **half-depth inner container** seated in the back half of the cavity.

Front (`+z`) face, top → bottom (matches `Images/box_front.png`): the **check button** flanked by
the two feedback indicators, a **"CHECK"** label, the row of **5 guess lights**, a **"?"** under
each light, then the row of **5 switches**. Text labels are canvas-texture planes (`makeLabel`),
not font geometry, so nothing is fetched at runtime.

**Surfaces** use a procedural **MDF/fibreboard** canvas texture (`drawMdf`) drawn in grayscale and
tinted per panel via material `color`; the front additionally gets an engraved laser-cut frame +
finger-joint ticks (`drawFrame` / `makeFrontTexture`). The grain texture is shared (`grain()`).

**Buttons** (`makeDomeButton`): a flush chrome collar (`RingGeometry`) with a rounded dark dome
(flattened `SphereGeometry`); the dome+symbol `cap` travels inward on click (`pressCap` in
`main.ts`), not a color flash. CHECK adds a power-symbol disc. **LEDs** are flat flush
`CircleGeometry` discs (`makeLamp`), half the button size. Vertical spacing uses one uniform `GAP`.

Files: `src/scene/constants.ts` (dimensions, light color hex), `src/scene/box.ts` (shell, lamps,
buttons, labels, back lid, inner box; raycast tags via `userData.tag`), `src/main.ts` (state↔scene
sync, pointer input, indicator-flash, **open/close animation**, render loop), `src/config.ts`
(debug flags).

### Opening the box (`main.ts` phase machine)

On a real solve (`exact === 5`) — or the **debug master code** — the sequence is: `revealing`
(box auto-rotates to present its back via a one-shot `orient` tween, then the tray slides out and
tips 90°) → `open` (tray out; the box **rotates freely** under user drag — not locked) → `hiding`
(clicking the tray slides it back in, the box turns to front, then the round resets). A loss just
pauses (`lossResetCountdown`) and resets with the box shut. `canManualRotate()` gates drag to the
`idle`/`open` phases so the scripted turns aren't fought.

### Tray contents

Inside the tray: a **permanent folded note** at the bottom-centre (clickable) plus **randomized
clutter** scattered toward the edges (3–6 random shapes, re-rolled each round via
`view.refillClutter()` in `box.ts`). Clicking the note opens the **note overlay**.

### Note overlay (`src/note.ts`, `.note-*` in `style.css`)

Clicking the 3D note hides it and shows a modal HTML overlay styled as an aged, unfolding sheet of
paper. It's **modal**: canvas input is suppressed while it's up; tap the backdrop (outside the
paper) to dismiss, which restores the 3D note. The text is **obfuscated** (XOR with a fixed key +
base64) so it isn't clear text in source — `encodeNote`/`decodeNote` in `note.ts`. This is
obfuscation, not security.

### Debug config (`src/config.ts`)

`CONFIG.debug.masterCode` — when `enabled`, entering this exact code and pressing Check always opens
the box regardless of the secret. **Turn `enabled` off before shipping.**
`CONFIG.debug.revealSecret` logs each round's secret to the console. `CONFIG.note.encoded` is the
obfuscated note message; to change it, run `encodeNote('new text')` and paste the result. The
master-code override lives in `main.ts` wiring, deliberately kept out of the pure logic module.

## Game rules (authoritative — encode exactly)

- **Lights.** 5 guess lights. Each cycles through **7 visual states**: `off` plus 6 colors —
  **red, green, blue, white, magenta, cyan**. Each light has its own button that advances it one
  step per press (`off → red → green → blue → white → magenta → cyan → off`).
- **Secret code.** 5 positions, each one of the **6 colors** (never `off`), generated randomly on
  reset. Default assumption: **colors may repeat** across positions (classic Mastermind) — confirm
  with the user if a no-repeat variant is wanted, since it changes the feedback math.
- **Check button + 2 feedback indicators.** Feedback is computed **only when Check is pressed**
  (never live):
  - **Right indicator** — flashes once per peg that is the **correct color in the correct
    position** ("exact" matches).
  - **Left indicator** — flashes once per peg that is the **correct color but in the wrong
    position**, computed the standard Mastermind way (per-color `min(guessCount, secretCount)`
    summed, then minus the exact matches). The two indicator counts never double-count a peg.
- **Rounds.** The player gets **6 checks**. After the 6th check — or on a win — the secret code
  **resets** (regenerates) for a new round.

When implementing the feedback, treat the standard two-count Mastermind algorithm as the contract
and cover it with unit tests (all-exact, all-wrong, all-color-wrong-place, and repeated-color
cases).
