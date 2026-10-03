# INTERFACE — language, descriptions, panel layout, walkthrough

What was built after the animation mode shipped, and the rules that came with it. Read
[AGENTS.md](../AGENTS.md) first; [ANIMATION.md](ANIMATION.md) is the record of the mode this round
was reacting to.

## Why

The animation work added a timeline, a zone section and two export panels to a screen that was
already full, and the owner named three things:

1. the interface should be available in Russian, with the switch at the top, before every menu;
2. the animation mode is hard to *start* — it needs a walkthrough;
3. every parameter should explain itself on hover, in both languages;
4. there is no room left on a desktop screen: panels should fold and every seam should resize.

## Translation

`src/i18n/` — `dict.ts` is one flat map, **keyed on the English string itself**.

```tsx
<ParamSlider path="grid.cellSize" label="CELL SIZE" … />   // the literal is the key
```

* No invented key namespace to keep in sync with the components.
* A string nobody has translated renders in English, not blank. That is the safe failure mode.
* Most of the interface never calls `t` directly: `Row`, `SliderControl`, `Section`, `Toggle`,
  `SelectControl`, `RadioRow`, `AsciiBox` and `Divider` translate their own labels, so a control
  declared once is translated once.
* `translate()` carries one extra rule: a `Z1 ` / `Z2 ` / `Z3 ` prefix is stripped and the
  remainder looked up, so three copies of eighteen zone parameters share one set of entries.
* `translateMessage()` handles status lines. They are assembled in `engine/`, which has no React
  and no business importing a store, so they arrive in English with numbers glued on
  (`EXPORT :: FRAME 12/48`). It splits on the `::` the status bar already uses and translates the
  longest leading phrase of each part it recognises, keeping the tail verbatim.
* The boot overlay in `index.html` runs before React and reads the saved language straight out of
  the same `localStorage` key `uiStore` writes.

Two renames were needed so one key could not mean two things: the symbol category `BASIC` became
`CORE` (AGENTS.md already calls it the neutral core) so it cannot collide with the panel's
BASIC/ADVANCED switch, and the export panels say `OUTPUT` rather than `OUT`, which the timeline
uses for the loop region's end.

**Russian labels are terse on purpose.** The parameter column is a fixed width and truncates, and
Russian runs about a third longer than English. The short word goes on the control; the sentence
goes in the hover description.

## Hover descriptions

`src/i18n/paramDocs.ts` — one entry per settings path, `{ en, ru }`.

* Keyed on the **path**, not the label: a label can be reworded, a path cannot without the engine
  noticing. `zone.list.0.hueShift`, `.1.` and `.2.` collapse to one `zone.hueShift` entry.
* `HoverDoc` portals the box to `document.body`. The parameter panel scrolls and clips, and a
  description cut off at the panel edge is worse than none. It is measured once on screen and
  flipped above the label when there is no room below.
* Hover opens after 380ms; tap opens immediately (a phone has no hover); Escape, a click elsewhere
  or a scroll closes it.
* A path with no entry has no description. Nothing breaks, nothing is invented, and the gap is
  visible to whoever adds the next parameter.
* The old ASCII `Hint` bubble is gone; its one-line text now feeds the same component as a
  `fallback` wherever a path has no entry yet.

## Panel layout

`src/components/Panel.tsx` + `src/store/uiStore.ts`.

* `PanelBox` folds to a labelled rule; `ColumnStrip` is a whole column folded to a 20px strip with
  its title set vertically, a letter per line.
* `ResizeHandle` **is** the gutter. The seams used to be a flex `gap`, so the space between two
  panels did nothing; now the spacing is unchanged and there is no dead strip anywhere.
* The drag reads the current size at pointer-down rather than keeping it in state — a panel with no
  stored size is whatever height its content made it, and the drag has to continue from what is on
  screen.
* The drag listens on the **window**, not a captured pointer. A seam is a few pixels wide, the
  pointer leaves it immediately, and this survives that as well as a panel remounting mid-drag.
* A dragged timeline **reserves** its height (`height`) rather than capping it (`max-height`):
  someone who just made room for eight tracks wants the room now, not once the tracks exist.
* A column may never exceed 42% of the window, so a layout saved on a wide screen cannot squeeze
  the canvas out on a narrow one.
* Everything persists under `symbolize.ui.v1`, separate from presets. `VIEW > RESET PANEL LAYOUT`.

Measured on a 1600x950 window: folding both columns takes the canvas from 1000px to 1528px.
With `PRESETS` folded by default, `ELEMENTS` starts at 512px instead of sharing the column three
ways.

## Walkthrough

`src/i18n/guide.ts` (content) + `src/components/GuideOverlay.tsx` (chrome).

Seven steps, in the order you do them, each naming its control exactly as the interface spells it.
Step four is the one that matters — picking a colour range and letting it drive parameters inside
its own area — because that is the whole reason the mode exists and the easiest thing to walk past.

It opens by itself the **first time a clip finishes decoding**: that is the moment this stops being
a still-image editor and the moment nothing on screen says so. Once, remembered in `uiStore`, never
again. After that it is in `HELP` and behind a `[?]` in the timeline footer.

## Rules for the next change

* A new user-facing string goes through `t()` — or, better, through a primitive that already
  translates its own label — and gets a `dict.ts` entry. Leaving it untranslated is visible, not
  broken.
* A new parameter gets a `paramDocs.ts` entry alongside its `EditorSettings` field and its
  `animatable.ts` registration.
* Nothing about panel geometry or language belongs in `editorStore`: a saved preset must not carry
  someone's panel widths, and none of it should re-render the canvas.
* `npm run build` and `npm test` must both exit clean. Browser checks cover first entry,
  replay, parameter search, history, and media round trips.
