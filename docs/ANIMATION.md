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
reveal parameters, mobile.

**Priority, stated by the owner:** the point of this mode is *picking a zone out of a photo or a
video — by colour range or whatever works — and animating that zone*, juicy and modern. Wipes,
fades and whole-frame intros are the least interesting part of it and should not eat the queue.
Everything below is ordered against that.

### Z — zones (the actual feature)

The selection machinery already exists: `mask.picks` + tolerance + contiguous in
[selection.ts](../src/engine/selection.ts) already produce a per-pixel field, and
`calculateElements` already samples it into `maskF`. Today that field can only do one thing —
delete the cells outside it. The whole feature is letting the same field *drive* parameters
instead of only gating them. One selection, two uses, no second picker UI.

- [x] `mask.mode: 'gate' | 'select'` — `select` keeps every cell and only defines the zone
- [x] `zone.*`: `strength`, `sizeScale`, `opacityScale`, `rotate`, `hueShift`, `gradientOffset`,
      `densityScale`, `motionScale`, `outside`, plus `enabled`
- [x] renderer folds `zoneF` into size / opacity / rotation / colour / density / motion, all of it
      weighted by the same soft field, so a feathered selection gives a feathered effect
- [x] every one of those in the animatable registry — animating `zone.hueShift` 0 -> 360 while the
      rest of the frame stays put is the headline shot
- [x] ZONE panel in the parameter list, next to the picker that already exists
- [x] zone-driven animation presets: ZONE PULSE, ZONE HUE, ZONE RIPPLE, ZONE ONLY
### Z2 — zones on video, which is where they get expensive
- [ ] `getSelectionMask` is cached on the `SourceMaps` identity, so an animated source misses the
      cache on every single frame. Measure it first, then cache per frame index or narrow the
      recompute to the picks that changed.
- [ ] contiguous (magic-wand) selection re-floods per frame; consider seeding the flood from the
      previous frame's result
- [ ] a colour picked on frame 0 drifts as the video changes — decide whether tolerance should
      widen automatically, or leave that to a keyframe on `mask.tolerance`

### Z3 — more zones, once video zones are cheap
- [ ] zone edge as its own thing: outline the selection with symbols, animate the outline
- [ ] second and third zone (`zones[]` rather than one `zone`), each with its own picks and its
      own overrides. One zone works end to end, so this is unblocked — it is just a bigger build
      than the video work above it.

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

### R6 — density

The terminal skin is right, but the panel count has grown and the interface reads as busy. Rule
for this group: never remove a capability, only change what is *drawn by default*, and anything
hidden must be one obvious click away.

Already done (in the jump-fix commit): rate/length/loop/auto-key moved out of the collapsed
transport, and the empty `[ ]` keyframe marker only appears while the timeline is open.

- [ ] ADD TRACK menu is a wall of 74 items — collapse to group headers, one group open at a time
- [ ] look for readouts printed twice (timeline header vs status bar vs canvas footer), keep one

#### BASIC / ADVANCED — how to do it without a second list

The trap is maintaining "which controls are basic" as a list somewhere, because it drifts the
moment anyone adds a parameter. So: **no list.** Mark the exceptions at the single place the
control is already declared, and let everything else be basic by default.

```tsx
<Section id="grid" title="GRID">
  <ParamSlider path="grid.cellSize" label="CELL SIZE" ... />
  <ParamSlider path="grid.detail" label="DETAIL" ... advanced />   // <- the only new thing
</Section>
<Section id="edges" title="EDGES" advanced>...</Section>           // whole section
```

* `advanced` is a boolean prop on `Section`, `ParamSlider`, `ParamToggle`, `ParamSelect`,
  `ParamColor` and `Row`. One flag, at the declaration, next to the thing it describes.
* A control with no flag is basic. That is the safe failure mode: forget the flag on something new
  and it *appears*, rather than silently vanishing.
* A `Section` marked `advanced` hides wholesale; a section with only advanced children left
  visible hides itself too, so no empty headers.
* The switch lives in the existing `VIEW` menu as `[ ] ADVANCED`, persisted in localStorage next
  to the presets. No new panel, no new chrome.
* The panel foot always shows `N ADVANCED CONTROLS HIDDEN :: [SHOW]` when anything is hidden —
  that is what keeps it from feeling lossy, and it doubles as the discovery path.
* Counting comes from the same flags (walk the rendered tree once), not from a hand-kept number.

- [ ] implement the `advanced` flag plumbing above
- [ ] tag the genuinely advanced controls: adaptive-grid trio, edge contrast/boost, mask
      tolerance/contiguous, blend modes, original clip, opacity and size gammas, jitters
- [ ] **the default is the owner's call** — it only helps if ADVANCED starts off, and that changes
      what he sees on open. Build it defaulting to off, tell him, make it one click to flip.

### R4 — GIF quality
- [ ] optional global palette built from a sample of every frame: bigger first pass, but no
      palette flicker between frames on gradients
- [ ] per-pixel transparency for unchanged pixels inside the diff rectangle

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
