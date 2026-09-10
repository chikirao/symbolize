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
- [x] `getSelectionMask` cached per `SourceMaps` (WeakMap) instead of one global slot, and the
      frame cache sized by a memory budget instead of a fixed six entries. Measured on a 24-frame
      320x240 clip, walking every frame three times: **3.87ms -> 0.001ms** per frame of combined
      source-map + selection preparation, 1/72 cache hits -> 72/72.
- [x] contiguous flood seeding — **measured and dropped.** The cold wand costs 0.22ms per frame
      against 1.84ms for a cold colour range: the flood only visits the region it fills, so it was
      never the expensive one. Seeding from the previous frame would make a frame's result depend
      on the order frames were visited in, which breaks same-project-same-frame determinism, and it
      would buy nothing measurable.
- [x] colour drift on a moving clip — **left to a keyframe.** `mask.tolerance` is already in the
      animatable registry, so widening it over time is a two-key track and stays visible and
      reversible. Widening it automatically would silently change what a pick means halfway
      through a clip, which is the wrong kind of clever for a tool with no undo of its own.

### Z3 — more zones, once video zones are cheap
- [x] zone edge as its own thing: outline the selection with symbols, animate the outline
- [x] second and third zone: `zone.list[3]`, each with its own picks, tolerance, feather and
      overrides. Zones no longer ride on the mask — the mask went back to being purely a gate.
      The panel shows one zone at a time behind a `[1](2)(3)` selector, and the ADD TRACK menu
      hides the groups of zones nobody has picked a colour for, so neither grew.

### R2 — per-frame render cost
- [x] `patternTarget()` and the original-layer clip stencil borrow from a canvas pool instead of
      allocating two full-size canvases every frame
- [x] `allocBuffer` replaced by a borrow/return buffer pool that grows and never shrinks; a pool
      rather than one module buffer, because a preview and an export can be in flight at once
- [x] silhouette / mask-alpha canvases — already fixed in the Z2 commit, where they became
      `WeakMap<SourceMaps, …>`; that was a correctness bug as much as a cost one
- [x] measured on a 99-frame clip, 3417 elements per frame, 1280x960 output, three passes:
      **5.79 -> 4.27 ms/frame** on the average, and 6.44 -> 3.59 on the last pass, where the
      allocation pressure used to show up. Pixel-identical before and after.

### R3 — video import robustness
- [x] tested against a real H.264 mp4 (320x180, 3.08s) rather than only our own WebM: decodes,
      seeks at ~10ms per frame, renders. **A duplicate-frame finding here was a misdiagnosis** —
      12 of 36 sampled frames were identical, but both an rVFC probe and a fine-stepping probe
      put the clip at a true 12fps, so the repeats are the clip's own static tail, not
      over-sampling.
- [x] `requestVideoFrameCallback` used two ways: to measure the source's own frame rate (the new
      RATE AUTO default), and as a playback-capture fallback when a seek stalls. Verified the
      rate probe on purpose-built clips: a 6fps source reads as 6, a 24fps source as 24, where
      both used to be forced to 12 — over-sampling one and halving the motion of the other.
- [x] in / out trim at decode time. Verified on a 4s 24fps clip: trimming to 1.0-2.0s yields
      exactly 24 frames and the moving bar sits at the quarter-to-half of its travel.
- [x] SOURCE panel reports the decode settings and what the last import cost
      ("8 MB DECODED :: 36/36 FRAMES STAY PREPARED")

### R6 — density

The terminal skin is right, but the panel count has grown and the interface reads as busy. Rule
for this group: never remove a capability, only change what is *drawn by default*, and anything
hidden must be one obvious click away.

Already done (in the jump-fix commit): rate/length/loop/auto-key moved out of the collapsed
transport, and the empty `[ ]` keyframe marker only appears while the timeline is open.

- [x] ADD TRACK menu collapsed to group headers, one group open at a time: 14 headers and zero
      items until you open one, against roughly ninety items in a single wall before
- [x] the canvas box was reprinting the status bar sitting directly under it — source size, zoom,
      render time and quality. It now shows only what the status bar does not know: the preview's
      own render resolution, which source frame is up, and the PICK state

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

- [x] `advanced` flag plumbed through `Section`, `Row`, `SliderControl` and every `Param*`; one
      CSS class, one switch in the VIEW menu, and a `[+] SHOW ADVANCED CONTROLS` foot on the panel
- [x] tagged: grid jitters, size curve/jitter/clamp, rotation jitter, colour jitter, opacity
      curve/jitter, mask tolerance, edge contrast/boost, both blend modes, original clip. Fourteen
      controls, verified: 71 sliders visible becomes 61, and flipping back restores exactly 71
- [ ] **the default is the owner's call, still open.** Built and left defaulting to ON, so nothing
      about the panel changed without him asking. Flipping it is one line: `showAdvanced: true` in
      the `view` block of `store/editorStore.ts`.

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
