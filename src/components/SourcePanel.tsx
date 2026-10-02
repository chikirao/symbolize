import React, { useEffect, useRef } from 'react'
import { useEditor } from '../store/editorStore'
import { AsciiBox, Divider, NumberField, Row, Scramble, SelectControl } from './Primitives'
import { useAnim } from '../store/animStore'
import { SEQUENCE_SIZES } from '../engine/media'
import { residentFrames, sequenceBytes } from '../engine/sequence'
import { loadDemoImage } from '../engine/demo'
import { getSelectionMask } from '../engine/selection'
import { useT } from '../i18n'
import { useHistory } from '../store/historyStore'

const THUMB_W = 108
const THUMB_H = 78

function Thumb(props: { canvas: HTMLCanvasElement | null; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    c.width = THUMB_W * dpr
    c.height = THUMB_H * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, THUMB_W, THUMB_H)
    if (!props.canvas) return
    const s = Math.min(THUMB_W / props.canvas.width, THUMB_H / props.canvas.height)
    const w = props.canvas.width * s
    const h = props.canvas.height * s
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(props.canvas, (THUMB_W - w) / 2, (THUMB_H - h) / 2, w, h)
  }, [props.canvas])
  return (
    <canvas
      ref={ref}
      style={{ width: THUMB_W, height: THUMB_H }}
      className={'checker border border-line ' + (props.className || '')}
    />
  )
}

/** Live preview of which pixels the mask lets through. */
function MaskPreview() {
  const maps = useEditor((s) => s.maps)
  const mask = useEditor((s) => s.settings.mask)
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const c = ref.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    c.width = THUMB_W * dpr
    c.height = THUMB_H * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, THUMB_W, THUMB_H)
    if (!maps) return

    const s = Math.min(THUMB_W / maps.imageWidth, THUMB_H / maps.imageHeight)
    const w = Math.max(1, Math.round(maps.imageWidth * s))
    const h = Math.max(1, Math.round(maps.imageHeight * s))
    const off = document.createElement('canvas')
    off.width = w
    off.height = h
    const octx = off.getContext('2d')
    if (!octx) return
    const img = octx.createImageData(w, h)
    const d = img.data
    const selection = getSelectionMask(maps, mask)
    for (let y = 0; y < h; y++) {
      const sy = Math.min(maps.height - 1, Math.floor((y / h) * maps.height))
      for (let x = 0; x < w; x++) {
        const sx = Math.min(maps.width - 1, Math.floor((x / w) * maps.width))
        const i = sy * maps.width + sx
        const mv =
          mask.source === 'luminance'
            ? maps.lum[i]
            : mask.source === 'combined'
              ? maps.lum[i] * maps.alpha[i]
              : mask.source === 'color'
                ? selection
                  ? selection[i] / 255
                  : 0
                : maps.alpha[i]
        let f: number
        if (mask.feather <= 0.0005) f = mv >= mask.threshold ? 1 : 0
        else {
          const t = (mv - (mask.threshold - mask.feather)) / (2 * mask.feather)
          const c2 = t < 0 ? 0 : t > 1 ? 1 : t
          f = c2 * c2 * (3 - 2 * c2)
        }
        if (mask.invert) f = 1 - f
        const p = (y * w + x) * 4
        const v = Math.round(f * 255)
        d[p] = v
        d[p + 1] = v
        d[p + 2] = v
        d[p + 3] = 255
      }
    }
    octx.putImageData(img, 0, 0)
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(off, (THUMB_W - w) / 2, (THUMB_H - h) / 2, w, h)
  }, [maps, mask])

  return (
    <canvas
      ref={ref}
      style={{ width: THUMB_W, height: THUMB_H }}
      className="border border-line"
    />
  )
}

/** How a clip will be taken apart, and what the last one cost. */
function ImportSettings() {
  const t = useT()
  const sequence = useEditor((s) => s.sequence)
  const side = useAnim((s) => s.importSide)
  const fps = useAnim((s) => s.importFps)
  const maxFrames = useAnim((s) => s.importMaxFrames)
  const trimStart = useAnim((s) => s.importTrimStart)
  const trimEnd = useAnim((s) => s.importTrimEnd)
  const setImport = useAnim((s) => s.setImport)

  const mb = sequence ? Math.round(sequenceBytes(sequence) / 1048576) : 0
  const resident = sequence ? residentFrames(sequence) : 0

  return (
    <div className="mt-1">
      <Divider label="IMPORT" />
      <Row label="SIZE">
        <SelectControl
          value={String(side)}
          width={11}
          ariaLabel="decode size"
          options={SEQUENCE_SIZES.map((o) => ({ value: String(o.side), label: o.label }))}
          onChange={(v) => setImport({ importSide: Number(v) })}
        />
      </Row>
      <Row label="RATE" hint="0 reads the clip's own frame rate instead of guessing">
        <NumberField
          value={fps}
          min={0}
          max={60}
          step={1}
          decimals={0}
          width={46}
          ariaLabel="import frames per second, 0 for auto"
          onChange={(v) => setImport({ importFps: Math.max(0, Math.round(v)) })}
        />
        <span className="text-fg3 text-xxs">{fps === 0 ? t('AUTO') : 'FPS'}</span>
      </Row>
      <Row label="MAX FRAMES">
        <NumberField
          value={maxFrames}
          min={2}
          max={600}
          step={1}
          decimals={0}
          width={52}
          ariaLabel="maximum decoded frames"
          onChange={(v) => setImport({ importMaxFrames: Math.round(v) })}
        />
      </Row>
      <Row label="TRIM" hint="seconds: where to start, and where to stop (0 = the end)">
        <NumberField
          value={trimStart}
          min={0}
          max={3600}
          step={0.1}
          decimals={1}
          width={46}
          ariaLabel="trim start seconds"
          onChange={(v) => setImport({ importTrimStart: Math.max(0, v) })}
        />
        <NumberField
          value={trimEnd}
          min={0}
          max={3600}
          step={0.1}
          decimals={1}
          width={46}
          ariaLabel="trim end seconds"
          onChange={(v) => setImport({ importTrimEnd: Math.max(0, v) })}
        />
      </Row>

      <div className="text-fg3 text-xxs leading-snug mt-1">
        {sequence ? (
          <>
            {sequence.frames.length} {t('FRAMES')} :: {sequence.width}x{sequence.height} ::{' '}
            {sequence.fps} FPS
            <br />
            {mb} MB :: {resident}/{sequence.frames.length} {t('KEPT READY')}
            {sequence.truncated && <span className="text-fg2"> :: {t('TRUNCATED')}</span>}
          </>
        ) : (
          t('DROP A VIDEO OR AN ANIMATED GIF TO GET A TIMELINE.')
        )}
      </div>
    </div>
  )
}

/**
 * The panel's contents, without a frame around them.
 *
 * The desktop shell wraps this in a foldable, resizable `PanelBox`; the mobile
 * sheet wants a plain `AsciiBox`. Splitting the body out keeps one copy of the
 * controls and lets each shell own its own chrome.
 */
export function SourcePanelBody(props: { onPickFile: () => void; onPaste: () => void }) {
  const t = useT()
  const image = useEditor((s) => s.image)
  const maps = useEditor((s) => s.maps)
  const clearImage = useEditor((s) => s.clearImage)
  const loadImageSource = useEditor((s) => s.loadImageSource)
  const maskEnabled = useEditor((s) => s.settings.mask.enabled)
  const setParam = useEditor((s) => s.setParam)

  return (
    <>
      <div className="flex gap-2">
        <div>
          <Thumb canvas={image?.canvas ?? null} />
          <div className="text-fg3 text-xxs mt-[2px]">{t('SRC')}</div>
        </div>
        <div>
          <MaskPreview />
          <button
            type="button"
            role="checkbox"
            aria-checked={maskEnabled}
            className="tog text-xxs mt-[2px] block"
            title={t('white area receives symbols')}
            onClick={() => setParam('mask.enabled', !maskEnabled)}
          >
            {maskEnabled ? '[x]' : '[ ]'} {t('MASK')}
          </button>
        </div>
      </div>

      <div className="text-xxs text-fg2 leading-snug mt-1 min-w-0">
        <span className="text-fg block truncate" title={image?.name}>
          <Scramble text={image ? image.name : t('NO SOURCE')} token={image?.name} />
        </span>
        <span className="text-fg3">
          {maps
            ? `${t('MAP')} ${maps.width}x${maps.height} :: ${t('LOCAL ONLY, NO UPLOAD')}`
            : t('LOCAL ONLY')}
        </span>
      </div>

      <div className="flex flex-wrap gap-2 mt-1">
        <button type="button" className="btn text-xxs" onClick={props.onPickFile}>
          {t('LOAD')}
        </button>
        <button
          type="button"
          className="btn text-xxs"
          onClick={() => void loadDemoImage().then((c) => {
            loadImageSource(c, 'DEMO_BUNNY.JPG')
            useHistory.getState().reset()
          })}
        >
          {t('DEMO')}
        </button>
        <button
          type="button"
          className="btn text-xxs"
          title={t('paste an image from the clipboard (Ctrl+V works anywhere)')}
          onClick={props.onPaste}
        >
          {t('PASTE')}
        </button>
        <button
          type="button"
          className="btn text-xxs btn-danger"
          disabled={!image}
          onClick={clearImage}
        >
          {'! ' + t('CLEAR')}
        </button>
      </div>
      <div className="text-fg3 text-xxs mt-1">{t('DROP A FILE OR PRESS CTRL+V ANYWHERE')}</div>
      <ImportSettings />
    </>
  )
}

/** The size readout that sits on the panel's top rule. */
export function SourcePanelBadge() {
  const t = useT()
  const image = useEditor((s) => s.image)
  return <span>{image ? `${image.width}x${image.height}` : t('NO IMAGE')}</span>
}

export function SourcePanel(props: { onPickFile: () => void; onPaste: () => void }) {
  return (
    <AsciiBox title="SOURCE" right={<SourcePanelBadge />} bodyClassName="p-2 pt-1">
      <SourcePanelBody {...props} />
    </AsciiBox>
  )
}
