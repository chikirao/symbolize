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

## Hard constraints — do not violate

* **No backend, no network calls, no third-party APIs.** Everything — image decode, rendering,
  export — runs in the browser. Don't add a fetch/XHR to any external host, don't add analytics,
  don't introduce a server component. This is a product requirement, not an oversight.
* **User images never leave the browser.** They're read with `FileReader`/`<img>`/Clipboard API and
  drawn into `<canvas>`; nothing is uploaded anywhere. Keep it that way.
* **No emoji/Unicode glyphs in the built-in symbol library.** The 42 built-in symbols
  ([symbols.ts](src/engine/symbols.ts)) are Canvas drawing functions specifically because glyph
  appearance depends on the viewer's system font. User-supplied Unicode symbols
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
  symbols.ts), not CSS/SVG-in-DOM, to keep them inside the single canvas render.
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
