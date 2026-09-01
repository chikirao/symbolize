import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useEditor } from '../store/editorStore'
import type { RenderStats } from '../types/editor'
import { renderComposite, renderCompositeAsync } from '../engine/renderer'
import { estimateCellCount } from '../engine/grid'
import { runGlitchOverlay } from '../ui/glitch'
import { AsciiBox } from './Primitives'

const QUALITY_BUDGET: Record<string, number> = {
  low: 420_000,
  medium: 1_300_000,
  high: 3_600_000,
}

/** Above this many grid cells the preview switches to the chunked renderer. */
const HEAVY_CELLS = 26_000

export function CanvasViewport(props: { onPickFile: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const origRef = useRef<HTMLCanvasElement>(null)
  const glitchRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const jobRef = useRef(0)

  const settings = useEditor((s) => s.settings)
  const maps = useEditor((s) => s.maps)
  const image = useEditor((s) => s.image)
  const customSymbols = useEditor((s) => s.customSymbols)
  const textSymbols = useEditor((s) => s.textSymbols)
  const view = useEditor((s) => s.view)
  const interacting = useEditor((s) => s.interacting)
  const glitchToken = useEditor((s) => s.glitchToken)
  const setStats = useEditor((s) => s.setStats)
  const setView = useEditor((s) => s.setView)

  const [renderMs, setRenderMs] = useState(0)
  const [renderRes, setRenderRes] = useState<[number, number]>([0, 0])

  /* ---------------- render ---------------- */

  const doRender = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !maps || !image) return
    const quality = interacting ? 'low' : view.quality
    const budget = QUALITY_BUDGET[quality]
    const px = maps.imageWidth * maps.imageHeight
    const scale = Math.max(0.08, Math.min(2, Math.sqrt(budget / px)))
    const w = Math.max(1, Math.round(maps.imageWidth * scale))
    const h = Math.max(1, Math.round(maps.imageHeight * scale))

    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const req = {
      ctx,
      outputWidth: w,
      outputHeight: h,
      scale: w / maps.imageWidth,
      maps,
      settings,
      original: image.canvas,
      customSymbols,
      textSymbols,
    }

    // Heavy grids would freeze the tab for a second or more: draw those in
    // chunks so the UI keeps responding and the status bar can report progress.
    const heavy = estimateCellCount(settings, maps.imageWidth, maps.imageHeight) > HEAVY_CELLS
    const token = ++jobRef.current

    // original layer used by before/after + show-original
    const orig = origRef.current
    if (orig) {
      if (orig.width !== w || orig.height !== h) {
        orig.width = w
        orig.height = h
      }
      const octx = orig.getContext('2d')
      if (octx) {
        octx.setTransform(1, 0, 0, 1, 0, 0)
        octx.clearRect(0, 0, w, h)
        octx.imageSmoothingEnabled = true
        octx.imageSmoothingQuality = 'high'
        octx.drawImage(image.canvas, 0, 0, w, h)
      }
    }

    const finish = (stats: RenderStats) => {
      setStats(stats)
      setRenderMs(stats.ms)
      setRenderRes([w, h])
    }

    if (heavy) {
      const setStatus = useEditor.getState().setStatus
      setStatus({ kind: 'busy', message: 'RENDERING...', progress: 0 })
      void renderCompositeAsync(req, (p) => {
        if (jobRef.current !== token) return
        setStatus({ kind: 'busy', message: 'RENDERING...', progress: p })
      }).then((stats) => {
        if (jobRef.current !== token) return
        finish(stats)
        setStatus({ kind: 'ready', message: 'READY', progress: -1 })
      })
      return
    }

    finish(renderComposite(req))
  }, [maps, image, settings, customSymbols, textSymbols, interacting, view.quality, setStats])

  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0
      doRender()
    })
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [doRender])

  /* ---------------- fit to screen ---------------- */

  const fit = useCallback(() => {
    const el = containerRef.current
    if (!el || !image) return
    const pad = 40
    const zx = (el.clientWidth - pad) / image.width
    const zy = (el.clientHeight - pad) / image.height
    const z = Math.max(0.02, Math.min(zx, zy))
    setView({ zoom: z, panX: 0, panY: 0 })
  }, [image, setView])

  useLayoutEffect(() => {
    fit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.fitToken])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      /* keep the artwork visible when the window resizes */
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  /* ---------------- glitch overlay ---------------- */

  const firstGlitch = useRef(true)
  useEffect(() => {
    if (firstGlitch.current) {
      firstGlitch.current = false
      return
    }
    const c = glitchRef.current
    if (!c) return
    return runGlitchOverlay(c, 230, 26)
  }, [glitchToken])

  /* ---------------- pan / zoom ---------------- */

  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null)

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, px: view.panX, py: view.panY }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return
    setView({
      panX: drag.current.px + (e.clientX - drag.current.x),
      panY: drag.current.py + (e.clientY - drag.current.y),
    })
  }
  const onPointerUp = (e: React.PointerEvent) => {
    drag.current = null
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      /* pointer already released */
    }
  }

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!image) return
      e.preventDefault()
      const st = useEditor.getState().view
      const rect = el.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const cxFrame = rect.width / 2 + st.panX
      const cyFrame = rect.height / 2 + st.panY
      const ix = (mx - cxFrame) / st.zoom + image.width / 2
      const iy = (my - cyFrame) / st.zoom + image.height / 2
      const factor = Math.exp(-e.deltaY * 0.0016)
      const zoom = Math.max(0.02, Math.min(24, st.zoom * factor))
      useEditor.getState().setView({
        zoom,
        panX: mx - rect.width / 2 - (ix - image.width / 2) * zoom,
        panY: my - rect.height / 2 - (iy - image.height / 2) * zoom,
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [image])

  /* ---------------- before/after split drag ---------------- */

  const splitDrag = useRef(false)
  const onSplitDown = (e: React.PointerEvent) => {
    e.stopPropagation()
    splitDrag.current = true
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onSplitMove = (e: React.PointerEvent) => {
    if (!splitDrag.current) return
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const frameW = (image?.width || 1) * view.zoom
    const left = rect.width / 2 + view.panX - frameW / 2
    const t = (e.clientX - rect.left - left) / frameW
    setView({ split: Math.max(0, Math.min(1, t)) })
  }

  const frameW = image ? image.width * view.zoom : 0
  const frameH = image ? image.height * view.zoom : 0
  const zoomPct = Math.round(view.zoom * 100)

  return (
    <AsciiBox
      className="flex-1 min-w-0 flex flex-col"
      bodyClassName="flex-1 min-h-0 flex"
      title={<span className="text-fg">CANVAS</span>}
      right={
        <span>
          {image ? `${image.width}x${image.height}` : 'NO SOURCE'} :: {zoomPct}%
        </span>
      }
      footerLeft={
        <span>
          PREVIEW {renderRes[0]}x{renderRes[1]} :: {interacting ? 'DRAFT' : view.quality.toUpperCase()}
        </span>
      }
      footerRight={<span>{renderMs.toFixed(1)}ms</span>}
    >
      <div
        ref={containerRef}
        className="relative flex-1 min-h-0 w-full overflow-hidden select-none"
        style={{ cursor: image ? 'grab' : 'default', touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {image ? (
          <div
            className="absolute"
            style={{
              left: '50%',
              top: '50%',
              width: frameW,
              height: frameH,
              transform: `translate(calc(-50% + ${view.panX}px), calc(-50% + ${view.panY}px))`,
            }}
          >
            <div className="absolute inset-0 checker" />
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full"
              style={{
                imageRendering: view.zoom > 3 ? 'pixelated' : 'auto',
                opacity: view.showOriginal ? 0 : 1,
              }}
            />
            <canvas
              ref={origRef}
              className="absolute inset-0 w-full h-full pointer-events-none"
              style={{
                display: view.showOriginal || view.beforeAfter ? 'block' : 'none',
                clipPath: view.beforeAfter && !view.showOriginal
                  ? `inset(0 ${(1 - view.split) * 100}% 0 0)`
                  : undefined,
              }}
            />
            {view.beforeAfter && !view.showOriginal && (
              <div
                className="absolute top-0 bottom-0 w-[9px] -ml-[4px] cursor-ew-resize flex flex-col items-center"
                style={{ left: `${view.split * 100}%` }}
                onPointerDown={onSplitDown}
                onPointerMove={onSplitMove}
                onPointerUp={() => (splitDrag.current = false)}
                role="separator"
                aria-label="before after split"
              >
                <div className="w-px h-full bg-white/80" />
              </div>
            )}
            <canvas
              ref={glitchRef}
              className="absolute inset-0 w-full h-full pointer-events-none"
              style={{ width: '100%', height: '100%' }}
            />
          </div>
        ) : (
          <EmptyState onPickFile={props.onPickFile} />
        )}
      </div>
    </AsciiBox>
  )
}

/* ------------------------------------------------------------------ */

function EmptyState(props: { onPickFile: () => void }) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 900)
    return () => clearInterval(id)
  }, [])
  const noise = '.:+x'
  const line = (n: number) =>
    Array.from({ length: 34 }, (_, i) =>
      ((i * 7 + n * 13 + tick) % 29) === 0 ? noise[(i + n + tick) % noise.length] : ' ',
    ).join('')

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="text-fg3 text-xs2 leading-tight select-none absolute inset-0 flex flex-col justify-center items-center opacity-40">
        {Array.from({ length: 9 }, (_, i) => (
          <div key={i} className="whitespace-pre">
            {line(i)}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={props.onPickFile}
        className="ascii-art relative text-center text-fg2 hover:text-fg"
      >
        {`┌──────────────────────────────────┐
│                                  │
│          DROP IMAGE HERE         │
│                                  │
│        JPG / PNG / WEBP          │
│                                  │
│               [+]                │
│                                  │
└──────────────────────────────────┘`}
      </button>
    </div>
  )
}
