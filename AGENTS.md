# AGENTS.md

Instructions for AI coding agents working in this repo. Human-facing docs (how to run, algorithm,
export, limitations, hotkeys — in Russian) live in [README.md](README.md); read that first for
product behaviour. [docs/ANIMATION.md](docs/ANIMATION.md) and [docs/UI.md](docs/UI.md) are the
build records for the animation mode and the interface work that followed it. This file is about how to change the code safely.

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
  An animated source adds a per-frame axis to this and nothing else: `engine/sequence.ts` builds
  one `SourceMaps` per decoded frame, behind an LRU, and hands the render path a cached pair.
* **No runtime dependencies for encoding or decoding.** The GIF/APNG/WebM/ZIP writers and the GIF
  reader in `engine/encode/` and `engine/gifDecode.ts` are hand-written against platform APIs
  (`CompressionStream`, WebCodecs). Do not add gif.js, mp4box, or a muxer package — the no-network,
  no-third-party rule covers build-time dependencies that ship to the browser too.

## Architecture

React only owns UI and state. Everything else — grid layout, sampling, colour, rendering, export —
is plain TypeScript in `src/engine/` with zero React imports, so it could be retargeted to WebGL
later without touching components.

```
src/
  components/     UI: toolbar, canvas viewport, side panels, timeline, ASCII primitives
  engine/         pure TS render pipeline (see below)
    encode/       GIF / APNG / WebM / ZIP writers, no dependencies
  i18n/           dict.ts (RU strings), paramDocs.ts (hover descriptions), guide.ts (walkthrough)
  store/          Zustand stores (editorStore.ts, animStore.ts, uiStore.ts) + path.ts
  types/editor.ts EditorSettings — the one interface that shapes the whole UI + engine
  types/anim.ts   AnimationProject — tracks, keyframes, transport
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

### Animation

Animation is a layer *on top of* the still pipeline, not a fork of it.

```
BASE SETTINGS  +  TRACKS @ FRAME  ->  EVALUATED SETTINGS
SOURCE MEDIA   @  FRAME           ->  SOURCE MAPS (cached)   -> the usual pipeline
```

* [types/anim.ts](src/types/anim.ts) holds `AnimationProject` / `AnimationTrack` / `Keyframe`;
  [store/animStore.ts](src/store/animStore.ts) owns the timeline. Tracks are **never** written back
  into `EditorSettings` — `evaluateFrame()` ([engine/animation.ts](src/engine/animation.ts))
  derives a settings object per frame using `setPath`, which shares untouched branches.
* Playback must not write to the editor store. The playhead lives in `animStore`; `CanvasViewport`
  pulls the frame's canvas + maps straight from `engine/sequence.ts`. Putting per-frame state in
  `editorStore` would re-render every panel 24 times a second.
* Only paths in the registry ([engine/animatable.ts](src/engine/animatable.ts)) are animatable. It
  carries kind (number / angle / color / step), range and render cost. Add the parameter there when
  you add it to `EditorSettings`, or the timeline will not offer it.
* Time is **integer frames**. Don't reintroduce float seconds: the same project must evaluate the
  same frame every time, including in export.
* Preview drops frames deliberately (`TransportClock` targets `floor(elapsed * fps)`); the offline
  export in [engine/animExport.ts](src/engine/animExport.ts) never does.
* `renderCompositeAsync` yields through a `MessageChannel` when the tab is hidden. `setTimeout` is
  clamped to ~1s in a background tab, which used to make a backgrounded export twenty times slower;
  keep that branch.
* Anything cached on a `SourceMaps` must be keyed on the **object**, not on a signature built
  from its dimensions. A still image has one `SourceMaps`; a video has one per frame with
  identical dimensions, so a dimension-derived key silently serves frame 0's result for the whole
  clip. `engine/selection.ts` and the three mask caches in `renderer.ts` use `WeakMap<SourceMaps,
  …>` for exactly this reason.
* New animation parameters must be **neutral at their defaults** so existing presets are unchanged,
  and must not consume new values from the per-cell PRNG — the draw order in `calculateElements` is
  an invariant (see Determinism above).

### Interface chrome: language, descriptions, layout

Full notes in [docs/UI.md](docs/UI.md). The rules that bite:

* **Translation is keyed on the English string itself** — `t('CELL SIZE')`, with `src/i18n/dict.ts`
  mapping that literal to Russian. There is no key namespace to keep in sync, and an untranslated
  string renders in English rather than blank. Do not invent a key that is not an exact UI literal.
* Translate at the **primitive**, not the call site: `Row`, `SliderControl`, `Section`, `Toggle`,
  `SelectControl`, `RadioRow`, `AsciiBox` and `Divider` already translate their own labels. A new
  control that goes through them needs a dictionary entry and nothing else.
* Two dictionary entries may not share a key with different meanings. When that happens, rename one
  of the *English* strings rather than fudging the translation (that is why the symbol category is
  `CORE` and the export panels say `OUTPUT`).
* `engine/` has no React and must not import a store, so status labels are built in English and
  translated where they are drawn, by `translateMessage` in `src/i18n/index.ts`.
* **A new parameter needs three registrations, not two:** the field in `EditorSettings`, the entry
  in `engine/animatable.ts` if it should be animatable, and a `{ en, ru }` entry in
  `src/i18n/paramDocs.ts` keyed on its settings path. The description is keyed on the path, not the
  label, and zone paths collapse (`zone.list.N.x` -> `zone.x`).
* **`uiStore.ts` holds language, hover-description opt-in and panel geometry — never put any of it
  in `editorStore`.** A saved preset must not carry someone's panel widths, and none of it should
  re-render the canvas. It persists under its own `symbolize.ui.v1` key.
* The desktop panel seams in `components/Panel.tsx` *are* the gutters; do not reintroduce a flex
  `gap` between panels. A resize drag reads its starting size at pointer-down (an unsized panel is
  whatever height its content made it) and listens on the window rather than capturing the pointer.

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
4. If you touched an encoder or a decoder, round-trip it in the browser rather than trusting the
   spec: encode a few frames, read them back with our own reader *and* with the platform
   (`<img>` for GIF/APNG, `<video>` for WebM), and compare pixels. There is no test suite, and a
   container that is subtly wrong still produces a file.
