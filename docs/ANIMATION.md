# ANIMATION MODE — working plan

Living document for the animated-output feature. Agents picking this work up mid-flight: read
[AGENTS.md](../AGENTS.md) first, then the **Status board** below, then continue with the first
unchecked task. Tick boxes as you go and keep this file honest — it is the hand-off state.

## Goal

Two things, sharing one timeline:

1. **Animated source** — drop a video or an animated GIF/WebP in and let every frame run through
   the existing symbolize pipeline (colour, mask, symbols, everything), then export the result as
   GIF / WebM / APNG / PNG sequence.
2. **Animated parameters** — keyframe tracks on top of a still image, so a photo can breathe, spin,
   hue-cycle or reveal itself.

Both stay fully local. No backend, no network, no third-party runtime services — same hard
constraint as the rest of the app (see AGENTS.md).

## Shape

```
BASE SETTINGS  +  TRACKS @ FRAME  ->  EVALUATED SETTINGS
SOURCE MEDIA   @  FRAME           ->  SOURCE MAPS (cached)
                                      |
                                      v
                          GRID / ELEMENTS / COMPOSITE
                                      |
                        +-------------+-------------+
                        v                           v
                  PREVIEW PLAYBACK           OFFLINE ENCODE
                  (drops frames)             (never drops a frame)
```

Key decisions:

* Tracks live in a **separate store** (`animStore`) and are never written back into
  `EditorSettings`. Playback must not push 24 objects/second through the settings store or every
  panel re-renders.
* Time is **integer frames**, not float seconds. Same project always evaluates the same frame.
* A registry (`engine/animatable.ts`) is the allowlist of animatable paths — it carries kind,
  range, interpolation and render cost. Arbitrary dotted-path interpolation is not allowed.
* Enums / booleans / symbol sets are `hold` tracks only (step, no interpolation).
* Preview is allowed to drop frames; export renders every frame offline and takes as long as it
  takes.
* Determinism is unchanged: `random.seed` stays constant across frames by default, so symbols do
  not flicker. Temporal movement comes from explicit phase parameters, not from reseeding.

## Status board

### S1 — core model
- [x] `src/types/anim.ts` — `AnimationProject`, `AnimationTrack`, `Keyframe`, `FrameContext`
- [x] `src/engine/animatable.ts` — registry of animatable paths + cost/kind metadata
- [x] `src/engine/animation.ts` — easing, keyframe lookup, `evaluateFrame()`, loop/pingpong mapping
- [x] `src/store/animStore.ts` — project state, playhead, transport flags, track edit actions

### S2 — animated source
- [ ] `src/engine/media.ts` — decode video (seek-based) + animated GIF/WebP/APNG (`ImageDecoder`)
- [ ] `src/engine/sequence.ts` — `SourceSequence` + LRU cache of per-frame `SourceMaps`
- [ ] store: `loadSequence` / `clearSequence`, `image` mirrors the current frame
- [ ] `CanvasViewport` renders the sequence frame for the current playhead
- [ ] `App.tsx` / `SourcePanel` accept video + animated image files (drop, picker, paste)
- [ ] `src/engine/gifDecode.ts` — hand-written GIF fallback for browsers without `ImageDecoder`

### S3 — transport + timeline UI
- [ ] `src/components/Timeline.tsx` — desktop panel, collapsible, ASCII transport
- [ ] playback clock (rAF, integer target frame, drops frames when the renderer is behind)
- [ ] draft quality while playing, full quality on pause
- [ ] pause on tab hide; respect `prefers-reduced-motion` (no autoplay, manual PLAY is fine)

### S4 — keyframe tracks UI
- [ ] keyframe marker + add/remove on `ParamSlider` / `ParamColor` / `ParamToggle` / `ParamSelect`
- [ ] AUTO KEY behaviour (first edit also writes the base value at frame 0)
- [ ] track rows in the timeline with per-frame markers, click to scrub, drag to move keys

### S5 — export
- [ ] `src/engine/encode/gif.ts` — palette quantisation + Floyd–Steinberg + LZW, zero deps
- [ ] `src/engine/encode/apng.ts` — reuse the browser PNG encoder, re-chunk into APNG
- [ ] `src/engine/encode/zip.ts` — stored (uncompressed) ZIP of a PNG sequence
- [ ] `src/engine/encode/webm.ts` — `VideoEncoder` + minimal EBML muxer, when WebCodecs exists
- [ ] `src/engine/animExport.ts` — offline frame loop, progress, cancel, budget guard
- [ ] `ExportPanel` — ANIMATION section (format, size, fps, range, estimate, cancel)

### S6 — new animatable parameters
- [ ] `color.gradientOffset` — rotate the gradient LUT
- [ ] `symbols.noisePhase` — loop-safe temporal noise for symbol choice
- [ ] `density.softness` — fade cells in instead of popping them
- [ ] `reveal.*` — independent reveal stage (x / y / radial / luminance / noise)
- [ ] `motion.*` — post-sampling wave/radial/noise displacement + rotation cycles

### S7 — polish
- [ ] mobile `ANIM` dock section
- [ ] grid cache keyed on grid signature (sequence playback rebuilds the same grid every frame)
- [ ] README + AGENTS documentation for the new subsystem
- [ ] save/load animation with presets (decide: separate `.symbolanim` json)

## Constraints worth repeating

* `getImageData` stays **one call per decoded frame**, in `buildSourceMaps`. Never per element.
* All randomness through `random.ts` (`mulberry32` / `hash3`). No `Math.random()` in the render path.
* UI chrome stays monochrome ASCII. The timeline is drawn with box characters, not a "player" widget.
* `npm run build` must exit clean before any stage is called done.

## Frame budget guard

An animated export multiplies the still-image cost by the frame count. Guards:

* per-frame pixel limits stay the ones in `engine/export.ts`
* total budget `frames x width x height` capped, with a warning before a long job
* the frame loop is cancellable and reports `FRAME 037/120`
