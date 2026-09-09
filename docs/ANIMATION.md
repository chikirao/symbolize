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
- [x] `src/engine/media.ts` — decode video (seek-based) + animated GIF/WebP/APNG (`ImageDecoder`)
- [x] `src/engine/sequence.ts` — `SourceSequence` + LRU cache of per-frame `SourceMaps`
- [x] store: `loadSequence` / `clearSequence`, `image` mirrors the current frame
- [x] `CanvasViewport` renders the sequence frame for the current playhead
- [x] `App.tsx` / `SourcePanel` accept video + animated image files (drop, picker, paste)
- [x] `src/engine/gifDecode.ts` — hand-written GIF fallback for browsers without `ImageDecoder`

### S3 — transport + timeline UI
- [x] `src/components/Timeline.tsx` — desktop panel, collapsible, ASCII transport
- [x] playback clock (rAF, integer target frame, drops frames when the renderer is behind)
- [x] draft quality while playing, full quality on pause
- [x] pause on tab hide; respect `prefers-reduced-motion` (no autoplay, manual PLAY is fine)

### S4 — keyframe tracks UI
- [x] keyframe marker + add/remove on `ParamSlider` / `ParamColor` / `ParamToggle` / `ParamSelect`
- [x] AUTO KEY behaviour (first edit also writes the base value at frame 0)
- [x] track rows in the timeline with per-frame markers, click to scrub, drag to move keys

### S5 — export
- [x] `src/engine/encode/gif.ts` — palette quantisation + Floyd–Steinberg + LZW, zero deps
- [x] `src/engine/encode/apng.ts` — reuse the browser PNG encoder, re-chunk into APNG
- [x] `src/engine/encode/zip.ts` — stored (uncompressed) ZIP of a PNG sequence
- [x] `src/engine/encode/webm.ts` — `VideoEncoder` + minimal EBML muxer, when WebCodecs exists
- [x] `src/engine/animExport.ts` — offline frame loop, progress, cancel, budget guard
- [x] `ExportPanel` — ANIMATION section (format, size, fps, range, estimate, cancel)

### S6 — new animatable parameters
- [x] `color.gradientOffset` — rotate the gradient LUT
- [x] `symbols.noisePhase` — loop-safe temporal noise for symbol choice
- [x] `density.softness` — fade cells in instead of popping them
- [x] `reveal.*` — independent reveal stage (x / y / radial / luminance / noise)
- [x] `motion.*` — post-sampling wave/radial/noise displacement + rotation cycles

### S7 — polish
- [x] mobile `ANIM` dock section
- [x] grid cache keyed on grid signature (sequence playback rebuilds the same grid every frame)
- [x] README + AGENTS documentation for the new subsystem
- [x] save/load animation with presets (decide: separate `.symbolanim` json)

## Round two — what to build next

S1-S7 shipped: animated sources, timeline, keyframes, four export formats, the new motion /
reveal parameters, mobile. This is the queue after that, roughly in value order. Same rule as
above: one item at a time, `npm run build` clean, commit, tick the box.

### R1 — animation presets
- [x] `ANIM_PRESETS` in a new `src/engine/animPresets.ts`: HUE LOOP, BREATHE, WIPE IN, SWIRL,
      DRIFT, DISSOLVE — each a small set of tracks over a stated duration
- [x] one-click apply from the timeline footer, scaling key frames to the current duration
- [x] presets must only touch registry paths, and must read sensibly on a video source too

### R2 — per-frame render cost
- [ ] `patternTarget()` allocates a full-size canvas per frame when a blend or opacity is set —
      reuse one across frames instead
- [ ] `allocBuffer` allocates nine typed arrays per frame; keep and grow a buffer instead
- [ ] silhouette / mask-alpha canvases are keyed on `SourceMaps`, so an animated source misses
      the cache every frame — key them per frame or cache a small ring
- [ ] measure before and after on a 200-frame sequence and put the numbers in the commit

### R3 — video import robustness
- [ ] test a real camera mp4 (H.264, variable frame rate) rather than only our own WebM
- [ ] fall back to `requestVideoFrameCallback` playback capture when seeking stalls or returns
      duplicate frames — some encodes seek badly without an index
- [ ] in / out trim points at decode time, so a 3-minute clip does not need all 240 frames
- [ ] report decoded memory in the SOURCE panel and warn before a huge decode

### R4 — GIF quality
- [ ] optional global palette built from a sample of every frame: bigger first pass, but no
      palette flicker between frames on gradients
- [ ] per-pixel transparency for unchanged pixels inside the diff rectangle
- [ ] a quality readout: palette size actually used, bytes per frame

### R5 — timeline UX
- [ ] onion skin: draw the previous and next keyed frame faintly under the current one
- [ ] loop region (play a sub-range) separate from the export range
- [ ] copy / paste a key, and nudge a key with the arrow keys when a track row has focus

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
