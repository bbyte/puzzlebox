# PuzzleBox

A browser-only, mobile-first **Three.js** replica of a physical handheld puzzle box. The puzzle is
a game of **Mastermind**: set five colored lights to guess a secret code, press **CHECK** for
feedback, and crack it within six tries. Solve it and the box rotates around, slides out an inner
tray, and reveals a hidden folded note.

Everything runs **client-side** — no server, no backend, no network calls. The production build is a
single self-contained HTML file you can open straight from disk.

## Requirements

- [Node.js](https://nodejs.org/) 18+ (developed on Node 24)
- npm (ships with Node)

## Getting started

```bash
npm install      # install dependencies
npm run dev      # start the dev server with hot reload
```

Open the printed URL. The dev server binds `0.0.0.0`, so to play on your phone, browse to
`http://<this-machine-ip>:5173` from a device on the same Wi-Fi (the "Network" URL Vite prints).

## How to play

1. Each of the **5 lights** has a button under it. Tap a button to cycle that light:
   `off → red → green → blue → white → magenta → cyan → off`.
2. Set **all five** lights (an unset/`off` light isn't allowed) to form your guess.
3. Press **CHECK**. The two indicator lights above report your result and repeat every ~3s:
   - **Right** indicator flashes once per peg that is the **right color in the right position**.
   - **Left** indicator flashes once per peg that is the **right color in the wrong position**.
4. CHECK only counts if the combination **changed** since your last check. You get **6 checks**;
   then the code resets (the lights play a rainbow flash) and a new round begins.
5. Guess the code exactly and the box **opens**: it turns to show its back and slides out the inner
   tray with its contents — including a folded note. **Tap the note** to unfold and read it;
   **tap the tray** to slide it back in and start a new round.

### Controls

- **Tap** a button/light/note to interact.
- **Drag** to rotate the box (works while open too).
- **Scroll wheel** (desktop) or **pinch** (touch) to zoom.

## Building the static page

```bash
npm run build    # type-check + bundle to dist/
npm run preview  # serve the built dist/ locally
```

The build inlines all JS/CSS into a single **`dist/index.html`**. You can double-click it
(`file://`), email it, drop it on a USB stick, or host it on any static host (e.g. GitHub Pages) —
no server required.

## Tests

The game logic is pure and framework-free, so it's unit-tested without a browser:

```bash
npm test                                   # run once
npm run test:watch                         # watch mode
npx vitest run src/game/mastermind.test.ts # a single file
```

## Configuration

Edit [`src/config.ts`](src/config.ts):

- `debug.masterCode` — when `enabled`, entering this exact code and pressing CHECK always opens the
  box regardless of the secret (handy for testing the open animation). **Disable before shipping.**
- `debug.revealSecret` — logs each round's secret code to the browser console.
- `note.encoded` — the hidden note's message, stored obfuscated (XOR + base64) so it isn't clear
  text in the source. To change it, run `encodeNote('your text')` from
  [`src/note.ts`](src/note.ts) and paste the result.

## Project layout

| Path | What it is |
|------|------------|
| `src/game/` | Pure Mastermind logic (`mastermind.ts`) + tests — no Three.js, no DOM |
| `src/scene/` | Three.js box geometry, materials, textures (`box.ts`, `constants.ts`) |
| `src/main.ts` | Wires logic ↔ scene: input, animation, open/close, render loop |
| `src/note.ts` | Note text obfuscation + the unfolding-paper overlay |
| `src/config.ts` | Debug flags and the note message |
| `Images/` | Reference photos of the real box |

See [`CLAUDE.md`](CLAUDE.md) for deeper architecture notes.
