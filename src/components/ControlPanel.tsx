import React, { useCallback, useState } from 'react'
import { useEditor } from '../store/editorStore'
import { Section } from './Primitives'
import { ParamColor, ParamRadio, ParamSelect, ParamSlider, ParamToggle } from './ParamControls'
import { GradientEditor } from './GradientEditor'
import { ExportPanel } from './ExportPanel'
import { SeedControl } from './SeedControl'
import { SelectionPicker } from './SelectionPicker'

const DEFAULT_OPEN = ['grid', 'size', 'color']

export function ControlPanel() {
  const [open, setOpen] = useState<string[]>(DEFAULT_OPEN)
  const toggle = useCallback((id: string) => {
    setOpen((cur) => (cur.includes(id) ? cur.filter((c) => c !== id) : [...cur, id]))
  }, [])
  const isOpen = (id: string) => open.includes(id)

  const settings = useEditor((s) => s.settings)
  const setParam = useEditor((s) => s.setParam)

  const colorMode = settings.color.mode
  const usesGradient =
    colorMode === 'luminance-gradient' ||
    colorMode === 'x-gradient' ||
    colorMode === 'y-gradient' ||
    colorMode === 'radial'

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden">
      {/* ---------------- SOURCE ---------------- */}
      <Section id="source" title="SOURCE" open={isOpen('source')} onToggle={toggle}>
        <ParamSelect
          path="source.mode"
          label="MODE"
          hint="Which channel drives the effect."
          options={[
            { value: 'luminance', label: 'LUMINANCE' },
            { value: 'alpha', label: 'ALPHA' },
            { value: 'combined', label: 'LUM x ALPHA' },
          ]}
        />
        <ParamToggle path="source.invert" label="INVERT" />
        <ParamSlider path="source.brightness" label="BRIGHTNESS" min={-1} max={1} step={0.01} decimals={2} />
        <ParamSlider path="source.contrast" label="CONTRAST" min={-1} max={1} step={0.01} decimals={2} />
        <ParamSlider path="source.gamma" label="GAMMA" min={0.1} max={4} step={0.01} decimals={2} />
      </Section>

      {/* ---------------- GRID ---------------- */}
      <Section id="grid" title="GRID" open={isOpen('grid')} onToggle={toggle}>
        <ParamSelect
          path="grid.mode"
          label="MODE"
          options={[
            { value: 'square', label: 'SQUARE' },
            { value: 'staggered', label: 'STAGGERED' },
            { value: 'hex', label: 'HEXAGONAL' },
            { value: 'random', label: 'RANDOM' },
            { value: 'adaptive', label: 'ADAPTIVE' },
          ]}
        />
        <ParamSlider
          path="grid.cellSize"
          label={settings.grid.mode === 'adaptive' ? 'MAX CELL' : 'CELL SIZE'}
          min={2}
          max={160}
          step={1}
          decimals={0}
          suffix="px"
          hint={
            settings.grid.mode === 'adaptive'
              ? 'Coarsest cell. Flat areas keep this size.'
              : undefined
          }
        />
        {settings.grid.mode === 'adaptive' && (
          <>
            <ParamSlider
              path="grid.minCellSize"
              label="MIN CELL"
              min={1}
              max={64}
              step={1}
              decimals={0}
              suffix="px"
              hint="Finest cell the split may reach."
            />
            <ParamSlider
              path="grid.detail"
              label="DETAIL"
              min={0.01}
              max={1}
              step={0.01}
              decimals={2}
              hint="Local contrast above which a cell splits into four. Lower = more small symbols."
            />
            <ParamSlider
              path="grid.maxDepth"
              label="MAX DEPTH"
              min={0}
              max={7}
              step={1}
              decimals={0}
            />
            <div className="pl-3 text-xxs text-fg3 leading-snug">
              FLAT AREAS = ONE BIG SYMBOL. BUSY AREAS SPLIT INTO FOUR.
            </div>
          </>
        )}
        <ParamSlider
          path="grid.spacingX"
          label="X SPACING"
          min={0.1}
          max={4}
          step={0.01}
          decimals={2}
          disabled={settings.grid.mode === 'adaptive'}
        />
        <ParamSlider
          path="grid.spacingY"
          label="Y SPACING"
          min={0.1}
          max={4}
          step={0.01}
          decimals={2}
          disabled={settings.grid.mode === 'adaptive'}
        />
        <ParamSlider path="grid.offsetX" label="OFFSET X" min={-1} max={1} step={0.01} decimals={2} />
        <ParamSlider path="grid.offsetY" label="OFFSET Y" min={-1} max={1} step={0.01} decimals={2} />
        <ParamSlider path="grid.rotation" label="GRID ROTATION" min={-180} max={180} step={1} decimals={0} suffix="d" />
        <ParamSlider path="grid.jitterX" label="JITTER X" min={0} max={1} step={0.01} decimals={2} />
        <ParamSlider path="grid.jitterY" label="JITTER Y" min={0} max={1} step={0.01} decimals={2} />
      </Section>

      {/* ---------------- LEVELS ---------------- */}
      <Section id="levels" title="LEVELS / THRESHOLD" open={isOpen('levels')} onToggle={toggle}>
        <ParamSlider path="source.blackPoint" label="BLACK POINT" min={0} max={1} step={0.01} decimals={2} />
        <ParamSlider path="source.whitePoint" label="WHITE POINT" min={0} max={1} step={0.01} decimals={2} />
        <div className="hr text-xxs my-1 select-none">── THRESHOLD {'─'.repeat(40)}</div>
        <ParamSlider
          path="threshold.min"
          label="MIN THRESHOLD"
          min={0}
          max={1}
          step={0.01}
          decimals={2}
          hint="Cells below this value are skipped."
        />
        <ParamSlider path="threshold.max" label="MAX THRESHOLD" min={0} max={1} step={0.01} decimals={2} />
        <ParamSlider
          path="threshold.soft"
          label="SOFT / FEATHER"
          min={0}
          max={0.5}
          step={0.005}
          decimals={3}
          hint="Fade symbols out near the cut-off instead of a hard edge."
        />
        <ParamToggle path="threshold.invert" label="INVERT RULE" />
      </Section>

      {/* ---------------- SYMBOLS ---------------- */}
      <Section id="symbols" title="SYMBOLS" open={isOpen('symbols')} onToggle={toggle}>
        <ParamSelect
          path="symbols.selectMode"
          label="SELECTION"
          width={11}
          options={[
            { value: 'random', label: 'RANDOM' },
            { value: 'luminance', label: 'LUMINANCE' },
            { value: 'sequential', label: 'SEQUENTIAL' },
            { value: 'noise', label: 'NOISE' },
          ]}
        />
        <ParamSlider
          path="symbols.strokeWeight"
          label="STROKE WEIGHT"
          min={0.02}
          max={0.5}
          step={0.005}
          decimals={3}
        />
        <ParamSlider
          path="symbols.noiseScale"
          label="NOISE SCALE"
          min={0.001}
          max={0.2}
          step={0.001}
          decimals={3}
          disabled={settings.symbols.selectMode !== 'noise'}
        />
        <div className="pl-3 text-xxs text-fg3 mt-1">
          POOL + WEIGHTS LIVE IN THE ELEMENTS PANEL ON THE LEFT.
        </div>
      </Section>

      {/* ---------------- SIZE ---------------- */}
      <Section id="size" title="SIZE" open={isOpen('size')} onToggle={toggle}>
        <ParamRadio
          path="size.mode"
          columns={1}
          options={[
            { value: 'dark-large', label: 'DARK -> LARGE' },
            { value: 'light-large', label: 'LIGHT -> LARGE' },
            { value: 'constant', label: 'CONSTANT' },
          ]}
        />
        <ParamSlider
          path="size.min"
          label="MIN SIZE"
          min={0}
          max={2}
          step={0.01}
          decimals={2}
          suffix="x"
          hint="Multiplier of the cell size."
        />
        <ParamSlider path="size.max" label="MAX SIZE" min={0} max={3} step={0.01} decimals={2} suffix="x" />
        <ParamSlider path="size.gamma" label="SIZE CURVE" min={0.1} max={4} step={0.01} decimals={2} />
        <ParamSlider path="size.jitter" label="SIZE JITTER" min={0} max={1} step={0.01} decimals={2} />
        <ParamToggle path="size.clamp" label="CLAMP TO CELL" />
      </Section>

      {/* ---------------- ROTATION ---------------- */}
      <Section id="rotation" title="ROTATION" open={isOpen('rotation')} onToggle={toggle}>
        <ParamSelect
          path="rotation.mode"
          label="MODE"
          options={[
            { value: 'fixed', label: 'FIXED' },
            { value: 'random', label: 'RANDOM' },
            { value: 'luminance', label: 'LUMINANCE' },
            { value: 'gradient', label: 'IMAGE GRADIENT' },
          ]}
        />
        <ParamSlider path="rotation.base" label="BASE ROTATION" min={-180} max={180} step={1} decimals={0} suffix="d" />
        <ParamSlider
          path="rotation.min"
          label="MIN ROTATION"
          min={-360}
          max={360}
          step={1}
          decimals={0}
          suffix="d"
          disabled={settings.rotation.mode === 'fixed' || settings.rotation.mode === 'gradient'}
        />
        <ParamSlider
          path="rotation.max"
          label="MAX ROTATION"
          min={-360}
          max={360}
          step={1}
          decimals={0}
          suffix="d"
          disabled={settings.rotation.mode === 'fixed' || settings.rotation.mode === 'gradient'}
        />
        <ParamSlider path="rotation.jitter" label="ROTATION JITTER" min={0} max={180} step={1} decimals={0} suffix="d" />
        {settings.rotation.mode === 'gradient' && (
          <ParamRadio
            path="rotation.gradientDir"
            columns={2}
            options={[
              { value: 'along', label: 'ALONG' },
              { value: 'perpendicular', label: 'PERPEND.' },
            ]}
          />
        )}
      </Section>

      {/* ---------------- COLOR ---------------- */}
      <Section id="color" title="COLOR" open={isOpen('color')} onToggle={toggle}>
        <ParamSelect
          path="color.mode"
          label="MODE"
          width={15}
          options={[
            { value: 'solid', label: 'SOLID' },
            { value: 'source', label: 'ORIGINAL AVG' },
            { value: 'source-dominant', label: 'ORIGINAL MAIN' },
            { value: 'source-image', label: 'ORIGINAL PIXELS' },
            { value: 'luminance-gradient', label: 'GRAD/LUMINANCE' },
            { value: 'x-gradient', label: 'GRAD/POSITION X' },
            { value: 'y-gradient', label: 'GRAD/POSITION Y' },
            { value: 'radial', label: 'GRAD/RADIAL' },
          ]}
        />
        {colorMode === 'solid' && <ParamColor path="color.solid" label="COLOR" />}
        {colorMode === 'source' && (
          <div className="pl-3 text-xxs text-fg3 leading-snug">
            AVERAGE RGB OF THE CELL. ONE FLAT COLOR PER SYMBOL, SOFT BLENDS.
          </div>
        )}
        {colorMode === 'source-dominant' && (
          <div className="pl-3 text-xxs text-fg3 leading-snug">
            MOST COMMON COLOR OF THE CELL, NOT THE AVERAGE.
            <br />
            ONE FLAT COLOR PER SYMBOL, KEEPS HUES CLEAN.
          </div>
        )}
        {colorMode === 'source-image' && (
          <div className="pl-3 text-xxs text-fg3 leading-snug">
            THE SOURCE IMAGE SHOWS THROUGH EACH SYMBOL.
            <br />
            HUE / SAT / BRIGHT BELOW DO NOT APPLY HERE.
          </div>
        )}
        {usesGradient && (
          <GradientEditor
            stops={settings.color.stops}
            reverse={settings.color.reverse}
            onChange={(stops) => setParam('color.stops', stops)}
            onReverse={(v) => setParam('color.reverse', v)}
          />
        )}
        <ParamSlider path="color.hueShift" label="HUE SHIFT" min={-180} max={180} step={1} decimals={0} suffix="d" />
        <ParamSlider path="color.saturation" label="SATURATION" min={-1} max={1} step={0.01} decimals={2} />
        <ParamSlider path="color.brightness" label="BRIGHTNESS" min={-1} max={1} step={0.01} decimals={2} />
        <ParamSlider path="color.jitter" label="COLOR JITTER" min={0} max={1} step={0.01} decimals={2} />
      </Section>

      {/* ---------------- OPACITY ---------------- */}
      <Section id="opacity" title="OPACITY" open={isOpen('opacity')} onToggle={toggle}>
        <ParamSelect
          path="opacity.mode"
          label="MODE"
          options={[
            { value: 'constant', label: 'CONSTANT' },
            { value: 'luminance', label: 'FROM LUMINANCE' },
            { value: 'alpha', label: 'FROM ALPHA' },
          ]}
          width={14}
        />
        <ParamSlider
          path="opacity.min"
          label="MIN OPACITY"
          min={0}
          max={1}
          step={0.01}
          decimals={2}
          disabled={settings.opacity.mode === 'constant'}
          hint="Set MIN above MAX to reverse the mapping."
        />
        <ParamSlider path="opacity.max" label="MAX OPACITY" min={0} max={1} step={0.01} decimals={2} />
        <ParamSlider
          path="opacity.gamma"
          label="OPACITY GAMMA"
          min={0.1}
          max={4}
          step={0.01}
          decimals={2}
          disabled={settings.opacity.mode === 'constant'}
        />
        <ParamSlider path="opacity.jitter" label="OPACITY JITTER" min={0} max={1} step={0.01} decimals={2} />
      </Section>

      {/* ---------------- MASK ---------------- */}
      <Section id="mask" title="MASK / SILHOUETTE" open={isOpen('mask')} onToggle={toggle}>
        <ParamToggle path="mask.enabled" label="MASK ENABLED" />
        <ParamSelect
          path="mask.source"
          label="MASK SOURCE"
          options={[
            { value: 'alpha', label: 'SOURCE ALPHA' },
            { value: 'luminance', label: 'LUMINANCE' },
            { value: 'combined', label: 'LUM x ALPHA' },
            { value: 'color', label: 'COLOR RANGE' },
          ]}
          width={13}
        />
        {settings.mask.source === 'color' && (
          <>
            <SelectionPicker />
            <ParamSlider
              path="mask.tolerance"
              label="TOLERANCE"
              min={0.01}
              max={1}
              step={0.005}
              decimals={3}
              hint="How far a pixel may sit from a picked colour and still be selected."
            />
          </>
        )}
        <ParamSlider path="mask.threshold" label="MASK THRESHOLD" min={0} max={1} step={0.01} decimals={2} />
        <ParamSlider path="mask.feather" label="MASK FEATHER" min={0} max={0.5} step={0.005} decimals={3} />
        <ParamToggle
          path="mask.invert"
          label="INVERT MASK"
          hint="Flip it to knock the selected colour out instead of keeping only it."
        />
        <div className="hr text-xxs my-1 select-none">── SILHOUETTE {'─'.repeat(40)}</div>
        <ParamToggle path="mask.silhouette.enabled" label="SHOW FILL" />
        <ParamColor path="mask.silhouette.color" label="FILL COLOR" />
        <ParamSlider path="mask.silhouette.opacity" label="FILL OPACITY" min={0} max={1} step={0.01} decimals={2} />
      </Section>

      {/* ---------------- EDGES ---------------- */}
      <Section id="edges" title="EDGES" open={isOpen('edges')} onToggle={toggle}>
        <ParamToggle path="edges.enabled" label="EDGE MODE" />
        <ParamRadio
          path="edges.mode"
          columns={3}
          options={[
            { value: 'inside', label: 'INSIDE' },
            { value: 'edges', label: 'EDGES' },
            { value: 'both', label: 'BOTH' },
          ]}
        />
        <ParamSlider
          path="edges.threshold"
          label="EDGE THRESHOLD"
          min={0}
          max={1}
          step={0.01}
          decimals={2}
          disabled={!settings.edges.enabled}
        />
        <ParamSlider
          path="edges.thickness"
          label="EDGE THICKNESS"
          min={0}
          max={24}
          step={0.5}
          decimals={1}
          suffix="px"
          disabled={!settings.edges.enabled}
        />
        <ParamSlider
          path="edges.contrast"
          label="EDGE CONTRAST"
          min={0.1}
          max={4}
          step={0.01}
          decimals={2}
          disabled={!settings.edges.enabled}
        />
        <ParamSlider
          path="edges.boost"
          label="EDGE BOOST"
          min={0}
          max={2}
          step={0.01}
          decimals={2}
          disabled={!settings.edges.enabled}
        />
      </Section>

      {/* ---------------- RANDOM / DENSITY ---------------- */}
      <Section id="random" title="RANDOM / DENSITY" open={isOpen('random')} onToggle={toggle}>
        <SeedControl />
        <div className="hr text-xxs my-1 select-none">── DENSITY {'─'.repeat(40)}</div>
        <ParamSlider path="density.value" label="DENSITY" min={0} max={100} step={1} decimals={0} suffix="%" />
        <ParamRadio
          path="density.mode"
          columns={3}
          options={[
            { value: 'constant', label: 'FLAT' },
            { value: 'dark', label: 'DARK+' },
            { value: 'light', label: 'LIGHT+' },
          ]}
        />
        <div className="pl-3 text-xxs text-fg3 mt-1 leading-snug">
          SAME SEED + SAME SETTINGS = SAME IMAGE.
        </div>
      </Section>

      {/* ---------------- BACKGROUND / LAYERS ---------------- */}
      <Section id="background" title="BACKGROUND / LAYERS" open={isOpen('background')} onToggle={toggle}>
        <ParamSelect
          path="layers.background.mode"
          label="BACKGROUND"
          options={[
            { value: 'transparent', label: 'TRANSPARENT' },
            { value: 'black', label: 'BLACK' },
            { value: 'white', label: 'WHITE' },
            { value: 'custom', label: 'CUSTOM' },
          ]}
          width={12}
        />
        {settings.layers.background.mode === 'custom' && (
          <ParamColor path="layers.background.color" label="BG COLOR" />
        )}
        <div className="hr text-xxs my-1 select-none">── ORIGINAL {'─'.repeat(40)}</div>
        <ParamToggle path="layers.original.visible" label="SHOW ORIGINAL" />
        <ParamSlider
          path="layers.original.opacity"
          label="ORIGINAL OPACITY"
          min={0}
          max={1}
          step={0.01}
          decimals={2}
          disabled={!settings.layers.original.visible}
        />
        <ParamSelect
          path="layers.original.blend"
          label="ORIGINAL BLEND"
          options={BLEND_OPTIONS}
          width={9}
        />
        <ParamSelect
          path="layers.original.clip"
          label="ORIGINAL CLIP"
          width={12}
          options={[
            { value: 'none', label: 'FULL' },
            { value: 'outside-mask', label: 'CUT MASK OUT' },
            { value: 'inside-mask', label: 'MASK ONLY' },
          ]}
          hint="Cut the masked area out of the photo so the background shows through it."
        />
        <div className="pl-3 text-xxs text-fg3 leading-snug">
          {settings.layers.original.clip === 'outside-mask'
            ? 'PHOTO MINUS THE MASK. THE HOLE SHOWS THE BACKGROUND COLOR.'
            : settings.layers.original.clip === 'inside-mask'
              ? 'ONLY THE MASKED PART OF THE PHOTO IS KEPT.'
              : 'PHOTO UNDER THE PATTERN, UNTOUCHED.'}
        </div>
        <div className="hr text-xxs my-1 select-none">── PATTERN {'─'.repeat(40)}</div>
        <ParamToggle path="layers.pattern.visible" label="SHOW PATTERN" />
        <ParamSlider
          path="layers.pattern.opacity"
          label="PATTERN OPACITY"
          min={0}
          max={1}
          step={0.01}
          decimals={2}
        />
        <ParamSelect
          path="layers.pattern.blend"
          label="PATTERN BLEND"
          options={BLEND_OPTIONS}
          width={9}
        />
      </Section>

      {/* ---------------- EXPORT ---------------- */}
      <Section id="export" title="EXPORT" open={isOpen('export')} onToggle={toggle}>
        <ExportPanel />
      </Section>

      <div className="h-10" />
    </div>
  )
}

const BLEND_OPTIONS = [
  { value: 'normal' as const, label: 'NORMAL' },
  { value: 'multiply' as const, label: 'MULTIPLY' },
  { value: 'screen' as const, label: 'SCREEN' },
  { value: 'overlay' as const, label: 'OVERLAY' },
  { value: 'lighten' as const, label: 'LIGHTEN' },
  { value: 'darken' as const, label: 'DARKEN' },
]
