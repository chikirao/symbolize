import type { SourceMaps } from '../types/editor'
import type { DecodedMedia, MediaKind } from './media'
import { releaseFrames } from './media'
import { buildSourceMaps } from './luminance'

/**
 * A decoded animated source, plus the small cache that turns one of its frames
 * into the pair the renderer needs: a canvas to draw as the ORIGINAL layer and
 * the `SourceMaps` every per-cell sample reads from.
 *
 * Frames are kept as `ImageBitmap` (compact, GPU-side) and converted lazily.
 * `getImageData` therefore still runs once per frame *use*, never per element —
 * the invariant in AGENTS.md holds, it just now has a per-frame axis.
 */
export interface SourceSequence {
  id: number
  name: string
  kind: MediaKind
  width: number
  height: number
  /** rate the source was decoded at, used as the timeline default */
  fps: number
  frames: ImageBitmap[]
  /** authored display time per frame, ms — kept for GIF re-export */
  delays: number[]
  /** the source had more frames than the decode limit allowed */
  truncated: boolean
}

let nextId = 1

export function createSequence(media: DecodedMedia): SourceSequence {
  return {
    id: nextId++,
    name: media.name,
    kind: media.kind,
    width: media.width,
    height: media.height,
    fps: media.fps,
    frames: media.frames.map((f) => f.bitmap),
    delays: media.frames.map((f) => f.delay),
    truncated: media.truncated,
  }
}

export function disposeSequence(seq: SourceSequence | null): void {
  if (!seq) return
  dropSequenceCache(seq.id)
  releaseFrames(seq.frames.map((bitmap) => ({ bitmap, delay: 0 })))
}

/**
 * Timeline frame -> source frame. The timeline is the master clock: a source
 * shorter than the timeline repeats, a longer one is trimmed. That makes
 * "loop the clip twice while the hue track runs once" a duration change and
 * nothing else.
 */
export function sequenceFrameIndex(seq: SourceSequence, timelineFrame: number): number {
  const count = seq.frames.length
  if (count <= 0) return 0
  const f = Math.round(timelineFrame)
  return ((f % count) + count) % count
}

/* ------------------------------------------------------------------ */
/* frame cache                                                         */
/* ------------------------------------------------------------------ */

interface CacheEntry {
  canvas: HTMLCanvasElement
  maps: SourceMaps
}

const CACHE_LIMIT = 6
/** insertion-ordered, so the first key is the least recently used */
const cache = new Map<string, CacheEntry>()

function cacheKey(seq: SourceSequence, index: number): string {
  return seq.id + ':' + index
}

/**
 * Evicted entries are only dropped from the map, never resized to 1x1: an
 * export in flight may still be holding the canvas it was handed.
 */
function touch(key: string, entry: CacheEntry): void {
  cache.delete(key)
  cache.set(key, entry)
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}

function entryFor(seq: SourceSequence, index: number): CacheEntry {
  const key = cacheKey(seq, index)
  const hit = cache.get(key)
  if (hit) {
    touch(key, hit)
    return hit
  }

  const bitmap = seq.frames[index]
  const canvas = document.createElement('canvas')
  canvas.width = seq.width
  canvas.height = seq.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('CANVAS CONTEXT UNAVAILABLE')
  ctx.clearRect(0, 0, seq.width, seq.height)
  if (bitmap) ctx.drawImage(bitmap, 0, 0, seq.width, seq.height)

  const entry: CacheEntry = { canvas, maps: buildSourceMaps(canvas) }
  touch(key, entry)
  return entry
}

export function frameCanvas(seq: SourceSequence, index: number): HTMLCanvasElement {
  return entryFor(seq, index).canvas
}

export function frameMaps(seq: SourceSequence, index: number): SourceMaps {
  return entryFor(seq, index).maps
}

/** Both halves at once — the render path always wants the pair. */
export function frameSource(
  seq: SourceSequence,
  timelineFrame: number,
): { canvas: HTMLCanvasElement; maps: SourceMaps; index: number } {
  const index = sequenceFrameIndex(seq, timelineFrame)
  const entry = entryFor(seq, index)
  return { canvas: entry.canvas, maps: entry.maps, index }
}

export function dropSequenceCache(id: number): void {
  const prefix = id + ':'
  for (const key of Array.from(cache.keys())) {
    if (key.startsWith(prefix)) cache.delete(key)
  }
}

export function clearSequenceCache(): void {
  cache.clear()
}

/** Rough decoded footprint, for the SOURCE panel readout. */
export function sequenceBytes(seq: SourceSequence): number {
  return seq.frames.length * seq.width * seq.height * 4
}
