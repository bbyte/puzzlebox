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
(`file://`), email it, drop it on a USB stick, or host it anywhere — no server required. Asset paths
are relative (`base: './'` in `vite.config.ts`), so it also works from a subpath (e.g.
`username.github.io/PuzzleBox/`).

## Deploying

For every host below the recipe is the same: **build command `npm run build`**, **output/publish
directory `dist`**. Because the output is one self-contained file, the absolute simplest option is to
take **`dist/index.html`** and drop it wherever you serve static files.

### Vercel

- **Dashboard:** import the repo → Framework Preset **Vite** → Build Command `npm run build` →
  Output Directory `dist` → Deploy.
- **CLI:**
  ```bash
  npm i -g vercel
  npm run build
  vercel deploy --prebuilt        # or: vercel  (and let it build)
  ```
- Optional `vercel.json` to pin settings:
  ```json
  {
    "buildCommand": "npm run build",
    "outputDirectory": "dist"
  }
  ```

### Netlify

- **Drag-and-drop:** run `npm run build`, then drag the **`dist`** folder (or just
  `dist/index.html`) onto <https://app.netlify.com/drop>.
- **Git/CLI:** connect the repo, or:
  ```bash
  npm i -g netlify-cli
  npm run build
  netlify deploy --prod --dir=dist
  ```
- Optional `netlify.toml`:
  ```toml
  [build]
    command = "npm run build"
    publish = "dist"
  ```

### GitHub Pages

Commit this workflow as `.github/workflows/deploy.yml`, push to `main`, then in the repo go to
**Settings → Pages → Build and deployment → Source: GitHub Actions**.

```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

Your site appears at `https://<user>.github.io/<repo>/`. The relative `base` already handles the
`/<repo>/` subpath, so no config change is needed.

### Cloudflare Pages

Create a Pages project from the repo with **Build command `npm run build`** and **Build output
directory `dist`**. (Framework preset: Vite, or "None".)

### Surge.sh

```bash
npm i -g surge
npm run build
surge dist
```

### Any other static host

Render, Firebase Hosting, GitLab Pages, Amazon S3 + CloudFront, nginx/Apache, etc. all work the same
way: run `npm run build` and serve the contents of **`dist/`** (or just `dist/index.html`) as static
files.

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
