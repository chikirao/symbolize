/**
 * GIF89a writer — no dependencies, no network, everything in the page.
 *
 * Frames are written one at a time so an export never has to hold the whole
 * animation in memory: each frame is quantised to its own local colour table,
 * LZW-compressed and appended. Opaque exports also get frame differencing —
 * only the rectangle that actually changed is stored, with disposal "do not
 * dispose", which is a large win for the usual case of a still background.
 */

import { ByteWriter } from './bytes'
import { mapToIndices, medianCut, sampleColors, type Palette } from './quantize'

export interface GifOptions {
  width: number
  height: number
  /** 0 = loop forever (the default), 1 = play once */
  loop?: number
  dither?: boolean
  /** keep alpha; disables frame differencing because it needs the same index */
  transparent?: boolean
  /** palette size per frame, 2..256 */
  maxColors?: number
  alphaCutoff?: number
  /**
   * One table for the whole animation instead of one per frame.
   *
   * Per-frame palettes track each frame exactly, which is usually better — but
   * on a gradient the chosen colours shift slightly from frame to frame and
   * the whole field shimmers. A shared table cannot shimmer. Build it with
   * `buildGlobalPalette` from a handful of frames spread across the clip.
   */
  globalPalette?: Palette | null
}

/** Median cut over colours sampled from several frames at once. */
export function buildGlobalPalette(samples: Uint8Array[], maxColors: number): Palette {
  let total = 0
  for (const part of samples) total += part.length
  const merged = new Uint8Array(total)
  let at = 0
  for (const part of samples) {
    merged.set(part, at)
    at += part.length
  }
  return medianCut(merged, Math.max(2, Math.min(256, maxColors)))
}

export { sampleColors }

const PALETTE_SAMPLES = 24_000

/* ------------------------------------------------------------------ */
/* LZW                                                                 */
/* ------------------------------------------------------------------ */

function lzwEncode(indices: Uint8Array, minCodeSize: number): Uint8Array {
  const clearCode = 1 << minCodeSize
  const eoiCode = clearCode + 1
  const out = new ByteWriter(indices.length >> 1 || 64)

  let codeSize = minCodeSize + 1
  let nextCode = eoiCode + 1
  let table = new Map<number, number>()

  let bits = 0
  let acc = 0
  const emit = (code: number) => {
    acc |= code << bits
    bits += codeSize
    while (bits >= 8) {
      out.u8(acc & 0xff)
      acc >>= 8
      bits -= 8
    }
  }

  emit(clearCode)
  if (indices.length === 0) {
    emit(eoiCode)
    if (bits > 0) out.u8(acc & 0xff)
    return out.take()
  }

  let prefix = indices[0]
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i]
    const key = (prefix << 8) | k
    const known = table.get(key)
    if (known !== undefined) {
      prefix = known
      continue
    }
    emit(prefix)
    if (nextCode === 4096) {
      emit(clearCode)
      table = new Map()
      codeSize = minCodeSize + 1
      nextCode = eoiCode + 1
    } else {
      // widen *before* handing out the code that no longer fits, which is
      // exactly where the decoder widens too
      if (nextCode >= 1 << codeSize) codeSize++
      table.set(key, nextCode++)
    }
    prefix = k
  }
  emit(prefix)
  emit(eoiCode)
  if (bits > 0) out.u8(acc & 0xff)
  return out.take()
}

/** GIF carries LZW output as a chain of length-prefixed sub-blocks. */
function writeSubBlocks(out: ByteWriter, data: Uint8Array): void {
  let at = 0
  while (at < data.length) {
    const size = Math.min(255, data.length - at)
    out.u8(size)
    out.bytes(data.subarray(at, at + size))
    at += size
  }
  out.u8(0)
}

/* ------------------------------------------------------------------ */

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

function changedRect(
  prev: Uint8ClampedArray,
  next: Uint8ClampedArray,
  width: number,
  height: number,
): Rect | null {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    const row = y * width
    for (let x = 0; x < width; x++) {
      const p = (row + x) * 4
      if (
        prev[p] !== next[p] ||
        prev[p + 1] !== next[p + 1] ||
        prev[p + 2] !== next[p + 2] ||
        prev[p + 3] !== next[p + 3]
      ) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return null
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}

function cropRgba(
  src: Uint8ClampedArray,
  width: number,
  rect: Rect,
): Uint8ClampedArray {
  if (rect.x === 0 && rect.y === 0 && rect.w === width) {
    return src.subarray(0, rect.w * rect.h * 4)
  }
  const out = new Uint8ClampedArray(rect.w * rect.h * 4)
  for (let y = 0; y < rect.h; y++) {
    const from = ((rect.y + y) * width + rect.x) * 4
    out.set(src.subarray(from, from + rect.w * 4), y * rect.w * 4)
  }
  return out
}

/** Smallest power-of-two table that holds `entries`, as GIF's size exponent. */
function tableExponent(entries: number): number {
  let exponent = 0
  while (1 << (exponent + 1) < entries) exponent++
  return exponent
}

function writeTable(out: ByteWriter, palette: Palette, exponent: number): void {
  const size = 1 << (exponent + 1)
  for (let i = 0; i < size; i++) {
    if (i < palette.size) {
      out.u8(palette.rgb[i * 3])
      out.u8(palette.rgb[i * 3 + 1])
      out.u8(palette.rgb[i * 3 + 2])
    } else {
      out.u8(0)
      out.u8(0)
      out.u8(0)
    }
  }
}

/* ------------------------------------------------------------------ */

export class GifWriter {
  private readonly out = new ByteWriter(1 << 20)
  private readonly width: number
  private readonly height: number
  private readonly dither: boolean
  private readonly transparent: boolean
  private readonly maxColors: number
  private readonly alphaCutoff: number
  private readonly global: Palette | null
  private prev: Uint8ClampedArray | null = null
  private frames = 0
  private done = false
  /* GIF times frames in hundredths of a second, which cannot express 12fps
     exactly. Accumulating the wanted time and writing the difference keeps the
     *average* rate right instead of drifting 4% slow over a long clip. */
  private clockMs = 0
  private writtenCs = 0

  constructor(opts: GifOptions) {
    this.width = Math.max(1, Math.round(opts.width))
    this.height = Math.max(1, Math.round(opts.height))
    this.dither = opts.dither ?? true
    this.transparent = opts.transparent ?? false
    this.maxColors = Math.max(2, Math.min(256, Math.round(opts.maxColors ?? 256)))
    this.alphaCutoff = opts.alphaCutoff ?? 128
    this.global = opts.globalPalette ?? null

    this.out.ascii('GIF89a')
    this.out.u16(this.width)
    this.out.u16(this.height)
    if (this.global) {
      // one table up front; frames then carry no table of their own
      const exponent = tableExponent(this.global.size + 1)
      this.out.u8(0xf0 | exponent)
      this.out.u8(0)
      this.out.u8(0)
      writeTable(this.out, this.global, exponent)
    } else {
      // no global colour table: every frame carries its own
      this.out.u8(0x70)
      this.out.u8(0)
      this.out.u8(0)
    }

    const loop = opts.loop ?? 0
    this.out.u8(0x21)
    this.out.u8(0xff)
    this.out.u8(0x0b)
    this.out.ascii('NETSCAPE2.0')
    this.out.u8(0x03)
    this.out.u8(0x01)
    this.out.u16(loop)
    this.out.u8(0)
  }

  get frameCount(): number {
    return this.frames
  }

  get byteLength(): number {
    return this.out.length
  }

  /** `rgba` must be the full canvas, `width * height * 4` bytes. */
  addFrame(rgba: Uint8ClampedArray, delayMs: number): void {
    if (this.done) throw new Error('GIF ALREADY FINISHED')

    let rect: Rect = { x: 0, y: 0, w: this.width, h: this.height }
    const diffing = !this.transparent && this.prev !== null
    if (diffing) {
      const changed = changedRect(this.prev!, rgba, this.width, this.height)
      // an identical frame still has to occupy its slice of time: store a
      // single pixel rather than the whole picture again
      rect = changed ?? { x: 0, y: 0, w: 1, h: 1 }
    }

    const region = cropRgba(rgba, this.width, rect)

    // Inside the changed rectangle most pixels are still identical to the last
    // frame. Marking those transparent leaves the previous frame showing
    // through and gives LZW long runs of one code to chew on.
    let skip: Uint8Array | null = null
    if (diffing) {
      skip = new Uint8Array(rect.w * rect.h)
      const prev = this.prev!
      let unchanged = 0
      for (let y = 0; y < rect.h; y++) {
        for (let x = 0; x < rect.w; x++) {
          const src = ((rect.y + y) * this.width + rect.x + x) * 4
          if (
            prev[src] === rgba[src] &&
            prev[src + 1] === rgba[src + 1] &&
            prev[src + 2] === rgba[src + 2] &&
            prev[src + 3] === rgba[src + 3]
          ) {
            skip[y * rect.w + x] = 1
            unchanged++
          }
        }
      }
      // every pixel changed: the mask would cost a palette slot for nothing
      if (unchanged === 0) skip = null
    }

    const reserveTransparent = this.transparent || skip !== null
    const colors = Math.max(2, this.maxColors - (reserveTransparent ? 1 : 0))
    const palette =
      this.global ??
      medianCut(
        sampleColors(region, PALETTE_SAMPLES, this.transparent ? this.alphaCutoff : 0),
        colors,
      )

    const transparentIndex = reserveTransparent ? palette.size : -1
    const exponent = tableExponent(palette.size + (reserveTransparent ? 1 : 0))
    const minCodeSize = Math.max(2, exponent + 1)

    const indices = mapToIndices(region, palette, {
      width: rect.w,
      height: rect.h,
      alphaCutoff: this.alphaCutoff,
      transparentIndex,
      dither: this.dither,
      skip,
    })

    // --- graphic control extension ---
    this.clockMs += delayMs
    const target = Math.round(this.clockMs / 10)
    const delay = Math.max(2, target - this.writtenCs)
    this.writtenCs += delay
    this.out.u8(0x21)
    this.out.u8(0xf9)
    this.out.u8(0x04)
    this.out.u8(((this.transparent ? 2 : 1) << 2) | (transparentIndex >= 0 ? 1 : 0))
    this.out.u16(delay)
    this.out.u8(transparentIndex >= 0 ? transparentIndex : 0)
    this.out.u8(0)

    // --- image descriptor, plus a local table when there is no global one ---
    this.out.u8(0x2c)
    this.out.u16(rect.x)
    this.out.u16(rect.y)
    this.out.u16(rect.w)
    this.out.u16(rect.h)
    this.out.u8(this.global ? 0x00 : 0x80 | exponent)
    if (!this.global) writeTable(this.out, palette, exponent)

    this.out.u8(minCodeSize)
    writeSubBlocks(this.out, lzwEncode(indices, minCodeSize))

    this.prev = this.transparent ? null : rgba.slice()
    this.frames++
  }

  finish(): Blob {
    if (!this.done) {
      this.out.u8(0x3b)
      this.done = true
    }
    return new Blob([this.out.take() as BlobPart], { type: 'image/gif' })
  }
}
