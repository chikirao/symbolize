/**
 * Decoding of animated sources — video files and animated GIF / WebP / APNG /
 * AVIF — into a flat list of `ImageBitmap` frames.
 *
 * Everything happens locally: the file is read with `File.arrayBuffer()` or an
 * object URL, decoded by the browser, and drawn into canvases we own. Nothing
 * is uploaded, same as still images.
 *
 * Frames are decoded at a capped size on purpose. The grid lives in source
 * coordinates and symbols are vector, so a 800px-wide decode still exports a
 * sharp 3200px frame — but 240 full-resolution frames would not fit in memory.
 */

import { decodeGifFrames } from './gifDecode'

export type MediaKind = 'video' | 'image'

export interface DecodedFrame {
  bitmap: ImageBitmap
  /** how long this frame is shown, in milliseconds, as authored */
  delay: number
}

export interface DecodedMedia {
  name: string
  kind: MediaKind
  width: number
  height: number
  /** frames per second the timeline should adopt */
  fps: number
  frames: DecodedFrame[]
  /** true when the source had more frames than `maxFrames` allowed */
  truncated: boolean
}

export interface DecodeOptions {
  /** longest side of a decoded frame, in px */
  maxSide?: number
  maxFrames?: number
  /** video only: frames per second to sample, or 0 to match the source */
  fps?: number
  /** video only: seconds to skip at the start */
  trimStart?: number
  /** video only: seconds to stop at, 0 for the end of the clip */
  trimEnd?: number
  signal?: AbortSignal
  onProgress?: (progress: number, label: string) => void
}

export const DEFAULT_MAX_SIDE = 800
export const DEFAULT_MAX_FRAMES = 240
export const DEFAULT_VIDEO_FPS = 12

export const SEQUENCE_SIZES: { value: string; label: string; side: number }[] = [
  { value: '480', label: 'SMALL 480', side: 480 },
  { value: '800', label: 'MEDIUM 800', side: 800 },
  { value: '1280', label: 'LARGE 1280', side: 1280 },
]

const VIDEO_EXT = /\.(mp4|m4v|webm|mov|ogv|ogg|mkv|avi|3gp)$/i
const ANIMATED_EXT = /\.(gif|webp|apng|avif|png)$/i

export function isVideoFile(file: File): boolean {
  const type = (file.type || '').toLowerCase()
  if (type.startsWith('video/')) return true
  return VIDEO_EXT.test(file.name)
}

/** Files that *may* hold more than one frame. A still PNG simply decodes to one. */
export function isAnimatedImageFile(file: File): boolean {
  const type = (file.type || '').toLowerCase()
  if (type === 'image/gif' || type === 'image/webp' || type === 'image/avif' || type === 'image/apng')
    return true
  if (type === 'image/png') return true
  return ANIMATED_EXT.test(file.name)
}

export function isMediaFile(file: File): boolean {
  return isVideoFile(file) || isAnimatedImageFile(file)
}

/**
 * Narrower than `isAnimatedImageFile`: the formats worth *routing* through the
 * sequence decoder. A plain PNG or JPEG stays on the still-image path so a
 * normal photo never pays for a WebCodecs round trip.
 */
export function looksAnimated(file: File): boolean {
  if (isVideoFile(file)) return true
  const type = (file.type || '').toLowerCase()
  if (type === 'image/gif' || type === 'image/webp' || type === 'image/avif' || type === 'image/apng')
    return true
  return /\.(gif|webp|avif|apng)$/i.test(file.name)
}

export function fitInside(w: number, h: number, maxSide: number): [number, number] {
  const long = Math.max(w, h)
  if (long <= maxSide) return [Math.max(1, Math.round(w)), Math.max(1, Math.round(h))]
  const s = maxSide / long
  return [Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s))]
}

function aborted(signal?: AbortSignal): boolean {
  return !!signal?.aborted
}

function throwIfAborted(signal?: AbortSignal): void {
  if (aborted(signal)) throw new Error('DECODE CANCELLED')
}

/* ------------------------------------------------------------------ */
/* video                                                               */
/* ------------------------------------------------------------------ */

function once(el: EventTarget, event: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let timer = 0
    const ok = () => {
      window.clearTimeout(timer)
      el.removeEventListener(event, ok)
      el.removeEventListener('error', bad)
      resolve()
    }
    const bad = () => {
      window.clearTimeout(timer)
      el.removeEventListener(event, ok)
      el.removeEventListener('error', bad)
      reject(new Error('VIDEO DECODE FAILED'))
    }
    el.addEventListener(event, ok, { once: true })
    el.addEventListener('error', bad, { once: true })
    timer = window.setTimeout(() => {
      el.removeEventListener(event, ok)
      el.removeEventListener('error', bad)
      reject(new Error('VIDEO TIMED OUT ON ' + event.toUpperCase()))
    }, timeoutMs)
  })
}

/**
 * The source's own frame rate, measured by playing a moment of it and asking
 * `requestVideoFrameCallback` how many frames went past.
 *
 * Sampling a clip faster than it was shot does not invent detail, it just
 * decodes the same picture twice: a real 320x180 stock clip sampled at 12fps
 * came back with 30 frames of which only 20 were distinct. Matching the source
 * is both truer and cheaper. Returns 0 when the browser cannot tell us.
 */
async function probeFrameRate(video: HTMLVideoElement, windowMs = 700): Promise<number> {
  if (typeof video.requestVideoFrameCallback !== 'function') return 0
  return new Promise<number>((resolve) => {
    let first: VideoFrameCallbackMetadata | null = null
    let last: VideoFrameCallbackMetadata | null = null
    let handle = 0
    let done = false

    const step = (_now: number, meta: VideoFrameCallbackMetadata) => {
      if (!first) first = meta
      else last = meta
      if (!done) handle = video.requestVideoFrameCallback(step)
    }
    handle = video.requestVideoFrameCallback(step)
    void video.play().catch(() => undefined)

    window.setTimeout(() => {
      done = true
      video.cancelVideoFrameCallback(handle)
      video.pause()
      if (!first || !last) return resolve(0)
      const dt = last.mediaTime - first.mediaTime
      const df = last.presentedFrames - first.presentedFrames
      resolve(dt > 0.05 && df > 1 ? df / dt : 0)
    }, windowMs)
  })
}

/**
 * Some WebM files report `duration === Infinity` until the browser has scanned
 * to the end. Seeking past the end forces the real duration to appear.
 */
async function resolveDuration(video: HTMLVideoElement): Promise<number> {
  if (Number.isFinite(video.duration) && video.duration > 0) return video.duration
  video.currentTime = 1e6
  try {
    await once(video, 'timeupdate', 4000)
  } catch {
    /* fall through — we take whatever duration ended up reported */
  }
  video.currentTime = 0
  return Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0
}

/**
 * Playback capture: the fallback for files that seek badly.
 *
 * Seeking is exact and random-access, which is why it is the main path. But
 * some encodes have no seek index and a `currentTime` write can stall for
 * seconds or land on the wrong keyframe. Playing the clip and taking whatever
 * the compositor presents always works — it just costs real time, and drops
 * frames if the tab is busy, so it is not the default.
 */
async function captureByPlayback(
  video: HTMLVideoElement,
  ctx: CanvasRenderingContext2D,
  scratch: HTMLCanvasElement,
  opts: {
    width: number
    height: number
    fps: number
    total: number
    start: number
    end: number
    signal?: AbortSignal
    onProgress?: (progress: number, label: string) => void
  },
): Promise<DecodedFrame[]> {
  const frames: DecodedFrame[] = []
  const step = 1 / opts.fps
  let nextAt = opts.start

  video.currentTime = opts.start
  await once(video, 'seeked', 20_000).catch(() => undefined)
  await video.play()

  try {
    while (frames.length < opts.total) {
      if (opts.signal?.aborted) throw new Error('DECODE CANCELLED')
      if (video.currentTime >= opts.end || video.ended) break
      if (video.currentTime + 0.0005 >= nextAt) {
        ctx.clearRect(0, 0, opts.width, opts.height)
        ctx.drawImage(video, 0, 0, opts.width, opts.height)
        frames.push({ bitmap: await createImageBitmap(scratch), delay: 1000 / opts.fps })
        opts.onProgress?.(
          frames.length / opts.total,
          'CAPTURING FRAME ' + frames.length + '/' + opts.total,
        )
        nextAt += step
      } else {
        await new Promise((r) => window.setTimeout(r, 8))
      }
    }
  } finally {
    video.pause()
  }
  return frames
}

export async function decodeVideoFile(file: File, opts: DecodeOptions = {}): Promise<DecodedMedia> {
  const maxSide = opts.maxSide ?? DEFAULT_MAX_SIDE
  const maxFrames = opts.maxFrames ?? DEFAULT_MAX_FRAMES

  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.preload = 'auto'
  video.muted = true
  video.playsInline = true
  video.crossOrigin = 'anonymous'
  video.src = url

  const frames: DecodedFrame[] = []
  let width = 0
  let height = 0
  let truncated = false
  let rate = DEFAULT_VIDEO_FPS

  try {
    await once(video, 'loadedmetadata', 20_000)
    throwIfAborted(opts.signal)

    const nativeW = video.videoWidth
    const nativeH = video.videoHeight
    if (!nativeW || !nativeH) throw new Error('VIDEO HAS NO PICTURE TRACK')
    ;[width, height] = fitInside(nativeW, nativeH, maxSide)

    const duration = await resolveDuration(video)
    if (!duration) throw new Error('VIDEO DURATION UNKNOWN')

    // 0 means "match the source"; a probe failure falls back to the old default
    let fps = Math.round(opts.fps ?? DEFAULT_VIDEO_FPS)
    if (fps <= 0) {
      opts.onProgress?.(0, 'READING FRAME RATE...')
      const native = await probeFrameRate(video)
      fps = native > 0 ? Math.round(native) : DEFAULT_VIDEO_FPS
      video.currentTime = 0
    }
    fps = Math.max(1, Math.min(60, fps))
    rate = fps

    const start = Math.max(0, Math.min(duration - 0.05, opts.trimStart ?? 0))
    const end = opts.trimEnd && opts.trimEnd > start ? Math.min(duration, opts.trimEnd) : duration
    const span = Math.max(1 / fps, end - start)

    const wanted = Math.max(1, Math.floor(span * fps))
    const total = Math.min(maxFrames, wanted)
    truncated = wanted > total

    // A scratch canvas is the reliable path: createImageBitmap(video) is not
    // supported everywhere, and drawImage after 'seeked' is exact.
    const scratch = document.createElement('canvas')
    scratch.width = width
    scratch.height = height
    const ctx = scratch.getContext('2d')
    if (!ctx) throw new Error('CANVAS CONTEXT UNAVAILABLE')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    const lastSafe = Math.max(0, end - 1 / (fps * 4))
    try {
      for (let i = 0; i < total; i++) {
        throwIfAborted(opts.signal)
        video.currentTime = Math.min(lastSafe, start + i / fps)
        await once(video, 'seeked', 8000)
        ctx.clearRect(0, 0, width, height)
        ctx.drawImage(video, 0, 0, width, height)
        frames.push({ bitmap: await createImageBitmap(scratch), delay: 1000 / fps })
        opts.onProgress?.((i + 1) / total, 'DECODING FRAME ' + (i + 1) + '/' + total)
      }
    } catch (err) {
      // A stalled seek is not fatal: play the clip instead and take what the
      // compositor presents. Anything already decoded is thrown away so the
      // two paths never interleave into an uneven timeline.
      if (opts.signal?.aborted || !/TIMED OUT/.test(String((err as Error).message))) throw err
      releaseFrames(frames)
      frames.length = 0
      opts.onProgress?.(0, 'SEEK STALLED :: CAPTURING BY PLAYBACK...')
      frames.push(
        ...(await captureByPlayback(video, ctx, scratch, {
          width,
          height,
          fps,
          total,
          start,
          end,
          signal: opts.signal,
          onProgress: opts.onProgress,
        })),
      )
    }
  } finally {
    video.pause()
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(url)
  }

  if (frames.length === 0) throw new Error('NO FRAMES DECODED')
  return {
    name: (file.name || 'VIDEO').toUpperCase(),
    kind: 'video',
    width,
    height,
    fps: rate,
    frames,
    truncated,
  }
}

/* ------------------------------------------------------------------ */
/* animated images                                                     */
/* ------------------------------------------------------------------ */

/* `ImageDecoder` is not in lib.dom for this TypeScript version yet. */
interface DecodedImageResult {
  image: {
    displayWidth: number
    displayHeight: number
    duration: number | null
    close: () => void
  }
  complete: boolean
}
interface ImageDecoderLike {
  tracks: {
    ready: Promise<void>
    selectedTrack: { frameCount: number; animated: boolean; repetitionCount: number } | null
  }
  completed: Promise<void>
  decode: (init: { frameIndex: number; completeFramesOnly?: boolean }) => Promise<DecodedImageResult>
  close: () => void
}
type ImageDecoderCtor = new (init: {
  data: ArrayBuffer | Uint8Array
  type: string
  preferAnimation?: boolean
}) => ImageDecoderLike

function imageDecoderCtor(): ImageDecoderCtor | null {
  const w = window as unknown as { ImageDecoder?: ImageDecoderCtor }
  return typeof w.ImageDecoder === 'function' ? w.ImageDecoder : null
}

export function hasImageDecoder(): boolean {
  return imageDecoderCtor() !== null
}

function mimeFor(file: File): string {
  const type = (file.type || '').toLowerCase()
  if (type.startsWith('image/')) return type === 'image/apng' ? 'image/png' : type
  const ext = (file.name.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase()
  if (ext === 'gif') return 'image/gif'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'avif') return 'image/avif'
  return 'image/png'
}

async function decodeWithImageDecoder(
  file: File,
  buffer: ArrayBuffer,
  opts: DecodeOptions,
): Promise<DecodedMedia | null> {
  const Ctor = imageDecoderCtor()
  if (!Ctor) return null

  const maxSide = opts.maxSide ?? DEFAULT_MAX_SIDE
  const maxFrames = opts.maxFrames ?? DEFAULT_MAX_FRAMES
  const decoder = new Ctor({ data: buffer, type: mimeFor(file), preferAnimation: true })

  const frames: DecodedFrame[] = []
  let width = 0
  let height = 0
  let truncated = false
  let rate = DEFAULT_VIDEO_FPS

  try {
    await decoder.tracks.ready
    // With the whole buffer in hand this settles immediately and makes
    // frameCount final rather than "however much has been parsed so far".
    await decoder.completed.catch(() => undefined)
    const track = decoder.tracks.selectedTrack
    const count = Math.max(1, track?.frameCount ?? 1)
    const total = Math.min(maxFrames, count)
    truncated = count > total

    const scratch = document.createElement('canvas')
    const ctx = scratch.getContext('2d')
    if (!ctx) throw new Error('CANVAS CONTEXT UNAVAILABLE')

    for (let i = 0; i < total; i++) {
      throwIfAborted(opts.signal)
      const { image } = await decoder.decode({ frameIndex: i, completeFramesOnly: true })
      if (!width || !height) {
        ;[width, height] = fitInside(image.displayWidth, image.displayHeight, maxSide)
        scratch.width = width
        scratch.height = height
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
      }
      ctx.clearRect(0, 0, width, height)
      // VideoFrame is a valid CanvasImageSource; TS just does not know it here.
      ctx.drawImage(image as unknown as CanvasImageSource, 0, 0, width, height)
      const delay = image.duration ? image.duration / 1000 : 100
      image.close()
      frames.push({ bitmap: await createImageBitmap(scratch), delay: delay > 0 ? delay : 100 })
      opts.onProgress?.((i + 1) / total, 'DECODING FRAME ' + (i + 1) + '/' + total)
    }
  } finally {
    try {
      decoder.close()
    } catch {
      /* already closed */
    }
  }

  if (frames.length === 0) return null
  return {
    name: (file.name || 'ANIMATION').toUpperCase(),
    kind: 'image',
    width,
    height,
    fps: fpsFromDelays(frames),
    frames,
    truncated,
  }
}

/** Frame delays are per-frame in GIF; the timeline needs one rate. */
export function fpsFromDelays(frames: DecodedFrame[]): number {
  if (frames.length === 0) return DEFAULT_VIDEO_FPS
  const total = frames.reduce((sum, f) => sum + (f.delay > 0 ? f.delay : 100), 0)
  const mean = total / frames.length
  const fps = Math.round(1000 / Math.max(10, mean))
  return Math.max(1, Math.min(60, fps))
}

export async function decodeAnimatedImageFile(
  file: File,
  opts: DecodeOptions = {},
): Promise<DecodedMedia> {
  const buffer = await file.arrayBuffer()
  throwIfAborted(opts.signal)

  const viaDecoder = await decodeWithImageDecoder(file, buffer, opts).catch(() => null)
  if (viaDecoder) return viaDecoder

  // Fallback path: our own GIF reader for browsers without WebCodecs.
  if (mimeFor(file) === 'image/gif') {
    const decoded = await decodeGifFrames(new Uint8Array(buffer), opts)
    if (decoded.frames.length > 0) {
      return { ...decoded, name: (file.name || 'ANIMATION').toUpperCase() }
    }
  }

  throw new Error('COULD NOT DECODE ANIMATION :: TRY A GIF OR MP4')
}

/* ------------------------------------------------------------------ */

export async function decodeMediaFile(file: File, opts: DecodeOptions = {}): Promise<DecodedMedia> {
  if (isVideoFile(file)) return decodeVideoFile(file, opts)
  return decodeAnimatedImageFile(file, opts)
}

export function releaseFrames(frames: DecodedFrame[]): void {
  for (const f of frames) {
    try {
      f.bitmap.close()
    } catch {
      /* already closed */
    }
  }
}
