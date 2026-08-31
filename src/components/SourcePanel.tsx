import React, { useEffect, useRef } from 'react'
import { useEditor } from '../store/editorStore'
import { AsciiBox, Scramble } from './Primitives'
import { buildDemoImage } from '../engine/demo'

function Thumb(props: { canvas: HTMLCanvasElement | null; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    const W = 120
    const H = 90
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    c.width = W * dpr
    c.height = H * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)
    if (!props.canvas) return
    const s = Math.min(W / props.canvas.width, H / props.canvas.height)
    const w = props.canvas.width * s
    const h = props.canvas.height * s
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(props.canvas, (W - w) / 2, (H - h) / 2, w, h)
  }, [props.canvas])
  return (
    <canvas
      ref={ref}
      style={{ width: 120, height: 90 }}
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
    const W = 120
    const H = 90
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    c.width = W * dpr
    c.height = H * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, W, H)
    if (!maps) return

    const s = Math.min(W / maps.imageWidth, H / maps.imageHeight)
    const w = Math.max(1, Math.round(maps.imageWidth * s))
    const h = Math.max(1, Math.round(maps.imageHeight * s))
    const off = document.createElement('canvas')
    off.width = w
    off.height = h
    const octx = off.getContext('2d')
    if (!octx) return
    const img = octx.createImageData(w, h)
    const d = img.data
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
    ctx.drawImage(off, (W - w) / 2, (H - h) / 2, w, h)
  }, [maps, mask])

  return <canvas ref={ref} style={{ width: 120, height: 90 }} className="border border-line" />
}

export function SourcePanel(props: { onPickFile: () => void }) {
  const image = useEditor((s) => s.image)
  const maps = useEditor((s) => s.maps)
  const clearImage = useEditor((s) => s.clearImage)
  const loadImageSource = useEditor((s) => s.loadImageSource)
  const maskEnabled = useEditor((s) => s.settings.mask.enabled)
  const setParam = useEditor((s) => s.setParam)

  return (
    <div className="space-y-4">
      <AsciiBox title="SOURCE" bodyClassName="p-2 pt-1">
        <div className="flex gap-2">
          <Thumb canvas={image?.canvas ?? null} />
          <div className="text-xxs text-fg2 leading-snug min-w-0 flex-1">
            <div className="text-fg truncate" title={image?.name}>
              <Scramble text={image ? image.name : 'NO SOURCE'} token={image?.name} />
            </div>
            <div>
              {image ? `${image.width} x ${image.height}` : '— x —'}
            </div>
            <div>{maps ? `MAP ${maps.width}x${maps.height}` : 'MAP —'}</div>
            <div className="text-fg3 mt-1">LOCAL ONLY :: NO UPLOAD</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          <button type="button" className="btn text-xxs" onClick={props.onPickFile}>
            LOAD
          </button>
          <button
            type="button"
            className="btn text-xxs"
            onClick={() => loadImageSource(buildDemoImage(), 'DEMO_BUST.PROC')}
          >
            DEMO
          </button>
          <button
            type="button"
            className="btn text-xxs btn-danger"
            disabled={!image}
            onClick={clearImage}
          >
            ! CLEAR
          </button>
        </div>
      </AsciiBox>

      <AsciiBox
        title="MASK"
        right={<span>{maskEnabled ? 'ON' : 'OFF'}</span>}
        bodyClassName="p-2 pt-1"
      >
        <div className="flex gap-2">
          <MaskPreview />
          <div className="text-xxs text-fg2 leading-snug flex-1 min-w-0">
            <div className="text-fg3">WHITE = SYMBOLS ALLOWED</div>
            <button
              type="button"
              className="tog text-xxs mt-1 block"
              role="checkbox"
              aria-checked={maskEnabled}
              onClick={() => setParam('mask.enabled', !maskEnabled)}
            >
              {maskEnabled ? '[x]' : '[ ]'} ENABLE MASK
            </button>
            <div className="text-fg3 mt-1">TUNE IN THE MASK SECTION →</div>
          </div>
        </div>
      </AsciiBox>
    </div>
  )
}
