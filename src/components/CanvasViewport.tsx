import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useEditor } from '../store/editorStore'
import { useT } from '../i18n'
import { useAnim } from '../store/animStore'
import type { RenderStats } from '../types/editor'
import { renderComposite, renderCompositeAsync } from '../engine/renderer'
import { evaluateFrame, neighbourKeyFrames } from '../engine/animation'
import { frameSource } from '../engine/sequence'
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

/** Onion frames are a reference, not a picture: render them small. */
const ONION_SCALE = 0.5

export function CanvasViewport(props: { onPickFile: () => void }) {
  const t = useT()
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const origRef = useRef<HTMLCanvasElement>(null)
  const glitchRef = useRef<HTMLCanvasElement>(null)
  const onionPrevRef = useRef<HTMLCanvasElement>(null)
  const onionNextRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const jobRef = useRef(0)

  const settings = useEditor((s) => s.settings)
  const maps = useEditor((s) => s.maps)
  const image = useEditor((s) => s.image)
  const sequence = useEditor((s) => s.sequence)
  const customSymbols = useEditor((s) => s.customSymbols)
  const textSymbols = useEditor((s) => s.textSymbols)
  const view = useEditor((s) => s.view)
  const interacting = useEditor((s) => s.interacting)
  const glitchToken = useEditor((s) => s.glitchToken)
  const setStats = useEditor((s) => s.setStats)
  const setView = useEditor((s) => s.setView)
  const project = useAnim((s) => s.project)
  const frame = useAnim((s) => s.frame)
  const playing = useAnim((s) => s.playing)
  const onionSkin = useAnim((s) => s.onionSkin)

  const [renderMs, setRenderMs] = useState(0)
  const [renderRes, setRenderRes] = useState<[number, number]>([0, 0])
  const [sourceFrame, setSourceFrame] = useState(0)

  /* ---------------- render ---------------- */

  const doRender = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !maps || !image) return

    // With an animated source the renderer reads the frame straight out of the
    // sequence cache: playback must not write to the editor store.
    const source = sequence ? frameSource(sequence, frame) : null
    const activeMaps = source ? source.maps : maps
    const original: CanvasImageSource = source ? source.canvas : image.canvas
    const active = evaluateFrame(settings, project, frame)

    const quality = interacting || playing ? 'low' : view.quality
    const budget = QUALITY_BUDGET[quality]
    const px = activeMaps.imageWidth * activeMaps.imageHeight
    const scale = Math.max(0.08, Math.min(2, Math.sqrt(budget / px)))
    const w = Math.max(1, Math.round(activeMaps.imageWidth * scale))
    const h = Math.max(1, Math.round(activeMaps.imageHeight * scale))

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
      scale: w / activeMaps.imageWidth,
      maps: activeMaps,
      settings: active,
      original,
      customSymbols,
      textSymbols,
    }

    // Heavy grids would freeze the tab for a second or more: draw those in
    // chunks so the UI keeps responding and the status bar can report progress.
    // Mid-playback that would tear instead — two jobs painting one canvas — so
    // while playing we stay synchronous and simply drop frames.
    const heavy =
      !playing &&
      estimateCellCount(active, activeMaps.imageWidth, activeMaps.imageHeight) > HEAVY_CELLS
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
        octx.drawImage(original, 0, 0, w, h)
      }
    }

    const finish = (stats: RenderStats) => {
      setStats(stats)
      setRenderMs(stats.ms)
      setRenderRes([w, h])
      if (source) setSourceFrame(source.index)
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

    /* Onion skin: the keyed frames either side, faint and underneath. Two
       extra renders, so it is off while playing and drawn small — it is a
       reference, not a picture. */
    const onionOn = onionSkin && !playing && !interacting
    const { prev, next } = onionOn
      ? neighbourKeyFrames(project, frame)
      : { prev: null, next: null }

    const paintOnion = (target: HTMLCanvasElement | null, at: number | null) => {
      if (!target) return
      const octx = target.getContext('2d')
      if (!octx) return
      if (!onionOn || at === null) {
        if (target.width > 1) {
          target.width = 1
          target.height = 1
        }
        return
      }
      const ow = Math.max(1, Math.round(w * ONION_SCALE))
      const oh = Math.max(1, Math.round(h * ONION_SCALE))
      if (target.width !== ow || target.height !== oh) {
        target.width = ow
        target.height = oh
      }
      const onionSource = sequence ? frameSource(sequence, at) : null
      const onionMaps = onionSource ? onionSource.maps : maps
      renderComposite({
        ctx: octx,
        outputWidth: ow,
        outputHeight: oh,
        scale: ow / onionMaps.imageWidth,
        maps: onionMaps,
        settings: evaluateFrame(settings, project, at),
        original: onionSource ? onionSource.canvas : image.canvas,
        customSymbols,
        textSymbols,
      })
    }
    paintOnion(onionPrevRef.current, prev)
    paintOnion(onionNextRef.current, next)
  }, [
    maps,
    image,
    sequence,
    settings,
    project,
    frame,
    playing,
    customSymbols,
    textSymbols,
    interacting,
    onionSkin,
    view.quality,
    setStats,
  ])

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
    if (el.clientWidth < 80 || el.clientHeight < 80) return
    const mobile = window.matchMedia(
      '(max-width: 899px), (pointer: coarse) and (max-width: 1199px)',
    ).matches
    const pad = mobile ? 20 : 40
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
    let width = el.clientWidth
    let height = el.clientHeight
    const ro = new ResizeObserver(([entry]) => {
      const nextWidth = entry.contentRect.width
      const nextHeight = entry.contentRect.height
      const changedOrientation = (width > height) !== (nextWidth > nextHeight)
      const changedWidth = Math.abs(nextWidth - width) > 48
      width = nextWidth
      height = nextHeight
      if (changedOrientation || changedWidth) requestAnimationFrame(fit)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [fit])

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

  type Point = { x: number; y: number }
  type Gesture =
    | { kind: 'pan'; pointerId: number; start: Point; panX: number; panY: number }
    | {
        kind: 'pinch'
        pointerIds: [number, number]
        distance: number
        imageX: number
        imageY: number
        zoom: number
      }

  const pointers = useRef(new Map<number, Point>())
  const gesture = useRef<Gesture | null>(null)

  /** Screen point -> normalised image coordinates, or null when outside. */
  const toImageUV = (clientX: number, clientY: number): [number, number] | null => {
    const el = containerRef.current
    if (!el || !image) return null
    const rect = el.getBoundingClientRect()
    const fw = image.width * view.zoom
    const fh = image.height * view.zoom
    const left = rect.width / 2 + view.panX - fw / 2
    const top = rect.height / 2 + view.panY - fh / 2
    const u = (clientX - rect.left - left) / fw
    const v = (clientY - rect.top - top) / fh
    if (u < 0 || u > 1 || v < 0 || v > 1) return null
    return [u, v]
  }

  const beginPinch = () => {
    const el = containerRef.current
    if (!el || !image || pointers.current.size < 2) return
    const [[idA, a], [idB, b]] = Array.from(pointers.current.entries())
    const rect = el.getBoundingClientRect()
    const midpoint = { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top }
    const distance = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y))
    const current = useEditor.getState().view
    gesture.current = {
      kind: 'pinch',
      pointerIds: [idA, idB],
      distance,
      imageX: (midpoint.x - rect.width / 2 - current.panX) / current.zoom + image.width / 2,
      imageY: (midpoint.y - rect.height / 2 - current.panY) / current.zoom + image.height / 2,
      zoom: current.zoom,
    }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return
    if (view.tool === 'pick' && e.button === 0) {
      const uv = toImageUV(e.clientX, e.clientY)
      if (uv) {
        useEditor.getState().addPick(uv[0], uv[1])
        return
      }
    }
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size >= 2) {
      beginPinch()
      return
    }
    const current = useEditor.getState().view
    gesture.current = {
      kind: 'pan',
      pointerId: e.pointerId,
      start: { x: e.clientX, y: e.clientY },
      panX: current.panX,
      panY: current.panY,
    }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pointers.current.size >= 2) {
      if (gesture.current?.kind !== 'pinch') beginPinch()
      const pinch = gesture.current
      const el = containerRef.current
      if (!el || !image || pinch?.kind !== 'pinch') return
      const a = pointers.current.get(pinch.pointerIds[0])
      const b = pointers.current.get(pinch.pointerIds[1])
      if (!a || !b) {
        beginPinch()
        return
      }
      const rect = el.getBoundingClientRect()
      const midpoint = { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top }
      const distance = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y))
      const zoom = Math.max(0.02, Math.min(24, pinch.zoom * (distance / pinch.distance)))
      setView({
        zoom,
        panX: midpoint.x - rect.width / 2 - (pinch.imageX - image.width / 2) * zoom,
        panY: midpoint.y - rect.height / 2 - (pinch.imageY - image.height / 2) * zoom,
      })
      return
    }

    const pan = gesture.current
    if (pan?.kind !== 'pan' || pan.pointerId !== e.pointerId) return
    setView({
      panX: pan.panX + (e.clientX - pan.start.x),
      panY: pan.panY + (e.clientY - pan.start.y),
    })
  }
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size === 1) {
      const [[pointerId, point]] = Array.from(pointers.current.entries())
      const current = useEditor.getState().view
      gesture.current = {
        kind: 'pan',
        pointerId,
        start: point,
        panX: current.panX,
        panY: current.panY,
      }
    } else {
      gesture.current = null
    }
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

  /**
   * With a colour mask armed and nothing picked yet the pattern is empty, so the
   * viewport is just the background — nothing to aim the eyedropper at. While the
   * picker is active the source sits underneath at full strength and the pattern
   * is faded over it, so you can see both what you are sampling and what it does.
   */
  const picking = view.tool === 'pick' && !view.showOriginal && !view.beforeAfter
  const onionVisible = onionSkin && !playing

  const frameW = image ? image.width * view.zoom : 0
  const frameH = image ? image.height * view.zoom : 0
  const zoomPct = Math.round(view.zoom * 100)

  const zoomBy = (factor: number) => {
    const current = useEditor.getState().view
    setView({ zoom: Math.max(0.02, Math.min(24, current.zoom * factor)) })
  }

  return (
    <AsciiBox
      className="flex-1 min-w-0 flex flex-col"
      bodyClassName="flex-1 min-h-0 flex"
      title={<span className="text-fg">{t('CANVAS')}</span>}
      /* Source size, zoom, render time and quality all live in the status bar
         directly below this box. What is left here is what the status bar does
         not know: the resolution the preview is actually drawn at, and which
         source frame is on screen. */
      right={view.tool === 'pick' ? <span className="text-fg">{t('PICK')}</span> : undefined}
      footerLeft={
        <span>
          {t('PREVIEW')} {renderRes[0]}x{renderRes[1]}
          {sequence && ` :: ${t('SRC')} ${sourceFrame + 1}/${sequence.frames.length}`}
        </span>
      }
    >
      <div
        ref={containerRef}
        className="relative flex-1 min-h-0 w-full overflow-hidden select-none"
        style={{
          cursor: !image ? 'default' : view.tool === 'pick' ? 'crosshair' : 'grab',
          touchAction: 'none',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => view.tool === 'pan' && fit()}
      >
        <div
          className="mobile-canvas-controls"
          onPointerDown={(e) => e.stopPropagation()}
          onPointerMove={(e) => e.stopPropagation()}
        >
          <button type="button" aria-label={t('zoom out')} onClick={() => zoomBy(0.8)}>
            [-]
          </button>
          <button type="button" aria-label={t('fit image to screen')} onClick={fit}>
            [{t('FIT')}]
          </button>
          <button type="button" aria-label={t('zoom in')} onClick={() => zoomBy(1.25)}>
            [+]
          </button>
          <button
            type="button"
            aria-label={t('toggle before and after')}
            aria-pressed={view.beforeAfter}
            className={view.beforeAfter ? 'is-active' : ''}
            onClick={() => setView({ beforeAfter: !view.beforeAfter, showOriginal: false })}
          >
            [A/B]
          </button>
        </div>
        <div className="mobile-gesture-hint" aria-hidden="true">
          {t('1F PAN // 2F ZOOM // DOUBLE TAP FIT')}
        </div>
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
              ref={onionPrevRef}
              className="absolute inset-0 w-full h-full pointer-events-none"
              style={{ opacity: onionSkin && !playing ? 0.28 : 0, zIndex: 0 }}
            />
            <canvas
              ref={onionNextRef}
              className="absolute inset-0 w-full h-full pointer-events-none"
              style={{ opacity: onionSkin && !playing ? 0.28 : 0, zIndex: 0 }}
            />
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full"
              style={{
                imageRendering: view.zoom > 3 ? 'pixelated' : 'auto',
                // the onion layers sit under this one, so it has to let them
                // through when they are on
                opacity: view.showOriginal ? 0 : picking ? 0.38 : onionVisible ? 0.85 : 1,
                zIndex: 1,
              }}
            />
            <canvas
              ref={origRef}
              className="absolute inset-0 w-full h-full pointer-events-none"
              style={{
                display: view.showOriginal || view.beforeAfter || picking ? 'block' : 'none',
                // under the pattern while sampling, over it in before/after
                zIndex: picking ? 0 : 2,
                clipPath: view.beforeAfter && !view.showOriginal
                  ? `inset(0 ${(1 - view.split) * 100}% 0 0)`
                  : undefined,
              }}
            />
            {view.beforeAfter && !view.showOriginal && (
              <div
                className="absolute top-0 bottom-0 w-[9px] -ml-[4px] cursor-ew-resize flex flex-col items-center"
                style={{ left: `${view.split * 100}%`, zIndex: 3 }}
                onPointerDown={onSplitDown}
                onPointerMove={onSplitMove}
                onPointerUp={() => (splitDrag.current = false)}
                role="separator"
                aria-label={t('before after split')}
              >
                <div className="w-px h-full bg-white/80" />
              </div>
            )}
            <canvas
              ref={glitchRef}
              className="absolute inset-0 w-full h-full pointer-events-none"
              style={{ width: '100%', height: '100%', zIndex: 4 }}
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
  const t = useT()
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
        <span className="block text-fg3">{'┌' + '─'.repeat(36) + '┐'}</span>
        <span className="block py-2 text-fg tracking-widest">{t('DROP IMAGE HERE')}</span>
        <span className="block text-xs2">JPG / PNG / WEBP / GIF / MP4</span>
        <span className="block pt-2 text-xs2">{t('CLICK  OR  PRESS CTRL+V')}</span>
        <span className="block text-fg3 pt-2">{'└' + '─'.repeat(36) + '┘'}</span>
      </button>
    </div>
  )
}
