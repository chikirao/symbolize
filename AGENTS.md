# AGENTS.md

Instructions for AI coding agents working in this repo. Human-facing docs (how to run, algorithm,
export, limitations, hotkeys — in Russian) live in [README.md](README.md); read that first for
product behaviour. This file is about how to change the code safely.

## Commands

```bash
npm install       # Node 18+
npm run dev        # http://localhost:5173
npm run build       # tsc -b && vite build — the real check, run before calling anything done
npm run typecheck    # tsc --noEmit, faster loop while iterating
```

There is no test suite and no lint script. `npm run build` is the only gate — it must pass with
zero TypeScript errors before a change is considered finished. Prefer it over `typecheck` alone
right before wrapping up, since it also catches Vite/asset-resolution errors `typecheck` won't.

## GitHub Pages deployment

The production site is [https://chikirao.github.io/symbolize/](https://chikirao.github.io/symbolize/)
and is deployed from the `main` branch by
[`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml). Every push to `main`
starts the workflow automatically; it can also be run manually with `workflow_dispatch`.

The workflow uses Node 20, runs `npm ci` and `npm run build`, uploads `dist/`, and deploys it with
the official GitHub Pages actions. Do not commit generated `dist/` files or add a separate
`gh-pages` branch unless the deployment strategy is deliberately being replaced.

This is a project Pages site, so [`vite.config.ts`](vite.config.ts) must keep
`base: '/symbolize/'`. Use base-aware or relative asset paths; root-absolute asset paths such as
`/image.png` bypass the repository prefix and will break in production. If the GitHub repository
is renamed, update the Vite base and the production URL in this file together.

Before pushing a deploy-related change:

1. Run `npm run build` and require a clean exit.
2. Optionally run `npm run preview` and open `/symbolize/` to test the production build locally.
3. After pushing to `main`, confirm that the **Deploy to GitHub Pages** workflow succeeds and that
   the production URL loads without missing JS, CSS, or image assets.

## Hard constraints — do not violate

* **No backend, no network calls, no third-party APIs.** Everything — image decode, rendering,
  export — runs in the browser. Don't add a fetch/XHR to any external host, don't add analytics,
  don't introduce a server component. This is a product requirement, not an oversight.
* **User images never leave the browser.** They're read with `FileReader`/`<img>`/Clipboard API and
  drawn into `<canvas>`; nothing is uploaded anywhere. Keep it that way.
* **No emoji/Unicode glyphs in the built-in symbol library.** The 73 built-in symbols — the
  neutral core in [symbols.ts](src/engine/symbols.ts) plus the SOFT / SHARP vibe sets in
  [symbolSets.ts](src/engine/symbolSets.ts), sharing the helpers in
  [symbolPrimitives.ts](src/engine/symbolPrimitives.ts) — are Canvas drawing functions
  specifically because glyph appearance depends on the viewer's system font. User-supplied Unicode symbols
  ([textSymbols.ts](src/engine/textSymbols.ts)) are a separate, explicitly opt-in feature — don't
  conflate the two.
* **Determinism.** All randomness in the render path (jitter, symbol choice, colour variation)
  must come from the seeded PRNG in [random.ts](src/engine/random.ts) (`mulberry32` + `hash3(seed,
  col, row)`), never `Math.random()`. Same seed + same settings must always render pixel-identical
  output. If you add a new random-ish parameter, thread it through the existing per-cell generator
  rather than pulling a fresh `Math.random()` — and keep the existing draw order of random calls
  intact (toggling one feature shouldn't reshuffle values consumed by another).
* **`getImageData` is called once per image load**, in `buildSourceMaps()`
  ([luminance.ts](src/engine/luminance.ts)), producing `Float32Array` lum/alpha and
  `Uint8ClampedArray` rgb maps capped at 1800px on the long side. Every per-cell sample
  ([sampling.ts](src/engine/sampling.ts)) reads from those typed arrays — never call
  `getImageData`/`getPixel` per element. This is the single biggest perf invariant in the codebase.

## Architecture

React only owns UI and state. Everything else — grid layout, sampling, colour, rendering, export —
is plain TypeScript in `src/engine/` with zero React imports, so it could be retargeted to WebGL
later without touching components.

```
src/
  components/     UI: toolbar, canvas viewport, side panels, ASCII primitives
  engine/         pure TS render pipeline (see below)
  store/          Zustand store (editorStore.ts) + dotted-path get/set helpers (path.ts)
  types/editor.ts EditorSettings — the one interface that shapes the whole UI + engine
  ui/             text-scramble + boot/intro animation utilities (also React-free)
```

Pipeline, in order: `loadImage()` → `buildSourceMaps()` (engine/luminance.ts) → `buildGrid()`
(engine/grid.ts, image-space coordinates) → `calculateElements()` (engine/renderer.ts: sampling →
levels → mask → threshold → edges → density → symbol → size → rotation → opacity → colour, written
into a structure-of-arrays buffer — `x/y/size/rot/a/r/g/b/sym`, not one object per symbol) →
`drawElements()` → `renderComposite()` (background → silhouette → original-with-clip → pattern).

The grid is built **in source-image coordinates**; output resolution is applied only via
`ctx.setTransform`. This is why preview and export are guaranteed to be the same composition at
different scale — never bake a resolution-dependent value into grid/cell math.

`EditorSettings` ([types/editor.ts](src/types/editor.ts)) is the single source of truth for every
tunable parameter. UI controls read/write it through dotted string paths (`setParam('grid.cellSize',
n)`, via `getPath`/`setPath` in [store/path.ts](src/store/path.ts)) rather than per-field setters —
follow that pattern for any new setting instead of adding a bespoke store action.

## Conventions

* **UI is a monochrome ASCII/terminal skin; the rendered artwork is not.** `src/components/*` and
  `src/ui/*` stay black/white/grey (see the colour tokens in `src/index.css`); never let engine
  output or its colour system leak into chrome, and never add non-ASCII UI chrome (rounded modal
  cards, drop shadows, colour accents) to match a "normal SaaS" look — that's explicitly the thing
  this app is not.
* Respect `prefers-reduced-motion` in any new animation (scramble, glitch overlay, boot/intro wave)
  — every existing animation utility already checks it; match that.
* Symbols are drawn via Canvas path functions (`paint: 'fill' | 'stroke'` per symbol in
  symbols.ts / symbolSets.ts), not CSS/SVG-in-DOM, to keep them inside the single canvas render.
  New symbols append to the end of the library so existing ids keep their pool order; a symbol
  whose stroke needs non-round caps/joins must set and restore them itself (`drawElements` sets
  `lineCap`/`lineJoin` to `round` once per frame) — see `withMiter` in symbolSets.ts.
* A vibe set is a `SymbolSet` entry in `SYMBOL_SETS` (symbolSets.ts): its `ids` drive a group in
  the ELEMENTS panel (with its own `ADD` / `REMOVE` header buttons), and `starter` +
  `strokeWeight` are what the one-click `SET` button loads.
* `GLYPH_PACKS` ([textSymbols.ts](src/engine/textSymbols.ts)) are curated Unicode sets added in
  bulk through the existing `addTextSymbols` store action — they stay the opt-in glyph feature and
  must never be merged into the vector library.
* Sliders have a fixed character width (`BAR_CHARS` in
  [SliderControl.tsx](src/components/SliderControl.tsx)) — don't reintroduce per-element width
  measurement (`ResizeObserver`/`clientWidth`), that was a deliberate fix for jittery layout.
* Windows dev environment: **write new/rewritten files with the Write tool, not a Bash heredoc.**
  Git Bash on this machine has been observed to mangle backslashes inside quoted heredocs (e.g.
  `\\` collapsing to `\`), which silently corrupted a JS string literal once. Edit/Write don't have
  this problem.

## Before finishing a change

1. `npm run build` — zero errors.
2. If you touched rendering, sampling, or the grid, sanity-check visually: `npm run dev`, load the
   demo image (or drag one in), and confirm the canvas still renders and responds to a couple of
   slider changes. There's no automated visual test, so this is the only check.
3. If you touched the seeded-random path, verify same-seed-same-output still holds (flip
   `RANDOMIZE SEED` and back, or compare two renders with an unchanged seed).
