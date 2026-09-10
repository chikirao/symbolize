import type { AnimationProject } from '../types/anim'
import type {
  CustomSymbolDef,
  EditorSettings,
  SourceMaps,
  TextSymbolDef,
} from '../types/editor'
import { renderCompositeAsync } from './renderer'
import { evaluateFrame } from './animation'
import { frameSource, type SourceSequence } from './sequence'
import { clampExportSize } from './export'
import { GifWriter, buildGlobalPalette, sampleColors } from './encode/gif'
import type { Palette } from './encode/quantize'
import { ApngWriter, canWriteApng } from './encode/apng'
import { ZipWriter } from './encode/zip'
import { WebmWriter, pickWebmCodec } from './encode/webm'

export type AnimFormat = 'gif' | 'apng' | 'webm' | 'zip'

/**
 * An animated export multiplies a still export by the frame count, so it gets
 * its own ceiling on top of the per-frame one in `export.ts`. These are the
 * limits at which a laptop still finishes in a sane time rather than swapping.
 */
export const MAX_ANIM_FRAMES = 600
export const MAX_ANIM_PIXELS = 240_000_000

/** frames sampled to build a shared GIF palette, and pixels taken from each */
const PALETTE_PROBE_FRAMES = 8
const PALETTE_PROBE_SAMPLES = 12_000

export interface AnimExportRequest {
  settings: EditorSettings
  project: AnimationProject
  /** null for a still image with keyframe tracks */
  sequence: SourceSequence | null
  /** used when there is no sequence */
  maps: SourceMaps
  original: CanvasImageSource | null
  customSymbols: CustomSymbolDef[]
  textSymbols?: TextSymbolDef[]
  width: number
  height: number
  format: AnimFormat
  fps: number
  /** inclusive frame range on the timeline */
  from: number
  to: number
  dither: boolean
  transparent: boolean
  maxColors: number
  /** one colour table for the whole GIF instead of one per frame */
  globalPalette: boolean
  /** webm only, bits per second */
  bitrate: number
  signal?: AbortSignal
  onProgress?: (progress: number, label: string) => void
}

export interface AnimExportResult {
  blob: Blob
  width: number
  height: number
  frames: number
  ms: number
  filename: string
}

export function animFrameCount(from: number, to: number): number {
  return Math.max(1, Math.min(MAX_ANIM_FRAMES, Math.round(to) - Math.round(from) + 1))
}

/** What an export will cost, so the panel can warn before it starts. */
export function estimateAnimCost(
  width: number,
  height: number,
  frames: number,
): { pixels: number; overBudget: boolean } {
  const [w, h] = clampExportSize(width, height)
  const pixels = w * h * frames
  return { pixels, overBudget: pixels > MAX_ANIM_PIXELS }
}

export function animExtension(format: AnimFormat): string {
  return format === 'apng' ? 'png' : format === 'zip' ? 'zip' : format
}

function stamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return (
    d.getFullYear() +
    '-' +
    p(d.getMonth() + 1) +
    '-' +
    p(d.getDate()) +
    '-' +
    p(d.getHours()) +
    p(d.getMinutes())
  )
}

export function buildAnimFilename(format: AnimFormat): string {
  return `symbolize-${stamp()}.${animExtension(format)}`
}

/* ------------------------------------------------------------------ */

interface Sink {
  add: (rgba: Uint8ClampedArray, canvas: HTMLCanvasElement, delayMs: number, index: number) => Promise<void> | void
  finish: () => Blob | Promise<Blob>
  /** true when the sink reads pixels, so the frame loop must pull ImageData */
  needsPixels: boolean
}

async function canvasPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('PNG ENCODE FAILED')
  return new Uint8Array(await blob.arrayBuffer())
}

function makeSink(
  req: AnimExportRequest,
  w: number,
  h: number,
  frames: number,
  globalPalette: Palette | null,
): Sink {
  switch (req.format) {
    case 'gif': {
      const gif = new GifWriter({
        width: w,
        height: h,
        dither: req.dither,
        transparent: req.transparent,
        maxColors: req.maxColors,
        globalPalette,
      })
      return {
        needsPixels: true,
        add: (rgba, _canvas, delay) => gif.addFrame(rgba, delay),
        finish: () => gif.finish(),
      }
    }
    case 'apng': {
      if (!canWriteApng()) throw new Error('APNG NEEDS COMPRESSIONSTREAM')
      const png = new ApngWriter({ width: w, height: h, frameCount: frames })
      return {
        needsPixels: true,
        add: (rgba, _canvas, delay) => png.addFrame(rgba, delay),
        finish: () => png.finish(),
      }
    }
    case 'zip': {
      const zip = new ZipWriter()
      return {
        needsPixels: false,
        add: async (_rgba, canvas, _delay, index) => {
          zip.add('frame-' + String(index).padStart(4, '0') + '.png', await canvasPng(canvas))
        },
        finish: () => zip.finish(),
      }
    }
    case 'webm': {
      const webm = new WebmWriter({
        width: w,
        height: h,
        fps: req.fps,
        bitrate: req.bitrate,
      })
      return {
        needsPixels: false,
        add: (_rgba, canvas, _delay, index) => webm.addFrame(canvas, index),
        finish: () => webm.finish(),
      }
    }
  }
}

/* ------------------------------------------------------------------ */

/**
 * Renders every frame offline and feeds it to the chosen encoder.
 *
 * Unlike preview playback this never drops a frame: a heavy frame simply takes
 * longer. `renderCompositeAsync` yields between chunks, so the tab keeps
 * responding and CANCEL stays clickable throughout.
 */
export async function renderAnimation(req: AnimExportRequest): Promise<AnimExportResult> {
  const t0 = performance.now()
  const [w, h] = clampExportSize(req.width, req.height)
  const from = Math.max(0, Math.round(req.from))
  const to = Math.max(from, Math.round(req.to))
  const frames = animFrameCount(from, to)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: req.format === 'gif' || req.format === 'apng' })
  if (!ctx) throw new Error('CANVAS CONTEXT UNAVAILABLE')

  if (req.format === 'webm') await pickWebmCodec(w, h)

  const drawFrame = async (
    frame: number,
    onProgress?: (p: number) => void,
  ): Promise<void> => {
    const settings = evaluateFrame(req.settings, req.project, frame)
    const source = req.sequence ? frameSource(req.sequence, frame) : null
    const maps = source ? source.maps : req.maps
    const original: CanvasImageSource | null = source ? source.canvas : req.original
    await renderCompositeAsync(
      {
        ctx,
        outputWidth: w,
        outputHeight: h,
        scale: w / maps.imageWidth,
        maps,
        settings,
        original,
        customSymbols: req.customSymbols,
        textSymbols: req.textSymbols,
      },
      onProgress,
    )
  }

  /**
   * A shared colour table has to exist before the first frame is written, so
   * it needs a look at the animation first. Rendering everything twice would
   * double the export; a handful of frames spread across the clip describes
   * its palette well enough and costs a few per cent.
   */
  let globalPalette: Palette | null = null
  if (req.format === 'gif' && req.globalPalette) {
    const probes = Math.min(frames, PALETTE_PROBE_FRAMES)
    const samples: Uint8Array[] = []
    for (let i = 0; i < probes; i++) {
      if (req.signal?.aborted) throw new Error('EXPORT CANCELLED')
      const frame = from + Math.round((i * (frames - 1)) / Math.max(1, probes - 1))
      await drawFrame(frame)
      samples.push(
        sampleColors(
          ctx.getImageData(0, 0, w, h).data,
          PALETTE_PROBE_SAMPLES,
          req.transparent ? 128 : 0,
        ),
      )
      req.onProgress?.((0.06 * (i + 1)) / probes, `READING COLOURS ${i + 1}/${probes}`)
    }
    globalPalette = buildGlobalPalette(
      samples,
      Math.max(2, req.maxColors - (req.transparent ? 1 : 0)),
    )
  }

  const sink = makeSink(req, w, h, frames, globalPalette)
  const delay = 1000 / Math.max(1, req.fps)
  const head = globalPalette ? 0.06 : 0

  for (let i = 0; i < frames; i++) {
    if (req.signal?.aborted) throw new Error('EXPORT CANCELLED')
    const frame = from + i

    const base = head + (i / frames) * (1 - head)
    const span = (1 / frames) * (1 - head)
    await drawFrame(frame, (p) =>
      req.onProgress?.(base + p * span * 0.85, `FRAME ${i + 1}/${frames}`),
    )

    if (req.signal?.aborted) throw new Error('EXPORT CANCELLED')
    const rgba = sink.needsPixels
      ? ctx.getImageData(0, 0, w, h).data
      : (undefined as unknown as Uint8ClampedArray)
    await sink.add(rgba, canvas, delay, i)
    req.onProgress?.(base + span, `FRAME ${i + 1}/${frames}`)
  }

  req.onProgress?.(0.99, 'WRITING ' + req.format.toUpperCase() + '...')
  const blob = await sink.finish()

  // free the backing store early: a 4K frame buffer is worth reclaiming
  canvas.width = 1
  canvas.height = 1

  req.onProgress?.(1, 'DONE')
  return {
    blob,
    width: w,
    height: h,
    frames,
    ms: performance.now() - t0,
    filename: buildAnimFilename(req.format),
  }
}
