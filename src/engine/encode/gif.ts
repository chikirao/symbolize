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
import { mapToIndices, medianCut, sampleColors } from './quantize'

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
}

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

/* ------------------------------------------------------------------ */

export class GifWriter {
  private readonly out = new ByteWriter(1 << 20)
  private readonly width: number
  private readonly height: number
  private readonly dither: boolean
  private readonly transparent: boolean
  private readonly maxColors: number
  private readonly alphaCutoff: number
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

    this.out.ascii('GIF89a')
    this.out.u16(this.width)
    this.out.u16(this.height)
    // no global colour table: every frame carries its own
    this.out.u8(0x70)
    this.out.u8(0)
    this.out.u8(0)

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
    if (!this.transparent && this.prev) {
      const changed = changedRect(this.prev, rgba, this.width, this.height)
      // an identical frame still has to occupy its slice of time: store a
      // single pixel rather than the whole picture again
      rect = changed ?? { x: 0, y: 0, w: 1, h: 1 }
    }

    const region = cropRgba(rgba, this.width, rect)
    const reserveTransparent = this.transparent
    const colors = Math.max(2, this.maxColors - (reserveTransparent ? 1 : 0))
    const palette = medianCut(
      sampleColors(region, PALETTE_SAMPLES, reserveTransparent ? this.alphaCutoff : 0),
      colors,
    )

    const transparentIndex = reserveTransparent ? palette.size : -1
    const entries = palette.size + (reserveTransparent ? 1 : 0)

    let exponent = 0
    while (1 << (exponent + 1) < entries) exponent++
    const tableSize = 1 << (exponent + 1)
    const minCodeSize = Math.max(2, exponent + 1)

    const indices = mapToIndices(region, palette, {
      width: rect.w,
      height: rect.h,
      alphaCutoff: this.alphaCutoff,
      transparentIndex,
      dither: this.dither,
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

    // --- image descriptor + local colour table ---
    this.out.u8(0x2c)
    this.out.u16(rect.x)
    this.out.u16(rect.y)
    this.out.u16(rect.w)
    this.out.u16(rect.h)
    this.out.u8(0x80 | exponent)
    for (let i = 0; i < tableSize; i++) {
      if (i < palette.size) {
        this.out.u8(palette.rgb[i * 3])
        this.out.u8(palette.rgb[i * 3 + 1])
        this.out.u8(palette.rgb[i * 3 + 2])
      } else {
        this.out.u8(0)
        this.out.u8(0)
        this.out.u8(0)
      }
    }

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
