/**
 * Minimal GIF87a/89a reader — the fallback for browsers without `ImageDecoder`.
 *
 * Chrome decodes animated GIFs natively through WebCodecs, which is the path
 * `media.ts` prefers. Everywhere else this parses the blocks by hand: LZW
 * decompression, interlace, per-frame disposal and transparency. Zero
 * dependencies, and the file never leaves the page.
 */

import type { DecodeOptions, DecodedFrame, DecodedMedia } from './media'

interface GifFrame {
  left: number
  top: number
  width: number
  height: number
  disposal: number
  transparentIndex: number
  delay: number // ms
  palette: Uint8Array | null // 3 bytes per entry
  indices: Uint8Array
}

class Reader {
  pos = 0
  constructor(readonly data: Uint8Array) {}

  byte(): number {
    if (this.pos >= this.data.length) throw new Error('GIF ENDED EARLY')
    return this.data[this.pos++]
  }

  short(): number {
    const lo = this.byte()
    const hi = this.byte()
    return lo | (hi << 8)
  }

  bytes(n: number): Uint8Array {
    if (this.pos + n > this.data.length) throw new Error('GIF ENDED EARLY')
    const out = this.data.subarray(this.pos, this.pos + n)
    this.pos += n
    return out
  }

  /** Reads a chain of length-prefixed sub-blocks into one buffer. */
  subBlocks(): Uint8Array {
    const parts: Uint8Array[] = []
    let total = 0
    for (;;) {
      const size = this.byte()
      if (size === 0) break
      const part = this.bytes(size)
      parts.push(part)
      total += part.length
    }
    const out = new Uint8Array(total)
    let at = 0
    for (const part of parts) {
      out.set(part, at)
      at += part.length
    }
    return out
  }

  skipSubBlocks(): void {
    for (;;) {
      const size = this.byte()
      if (size === 0) break
      this.pos += size
    }
  }
}

/* ------------------------------------------------------------------ */
/* LZW                                                                 */
/* ------------------------------------------------------------------ */

function lzwDecode(input: Uint8Array, minCodeSize: number, pixelCount: number): Uint8Array {
  const MAX_CODES = 4096
  const clearCode = 1 << minCodeSize
  const eoiCode = clearCode + 1

  const prefix = new Int32Array(MAX_CODES)
  const suffix = new Uint8Array(MAX_CODES)
  const stack = new Uint8Array(MAX_CODES + 1)
  const out = new Uint8Array(pixelCount)

  for (let i = 0; i < clearCode; i++) {
    prefix[i] = 0
    suffix[i] = i
  }

  let codeSize = minCodeSize + 1
  let codeMask = (1 << codeSize) - 1
  let available = clearCode + 2
  let previous = -1
  let first = 0

  let bits = 0
  let datum = 0
  let ip = 0
  let op = 0
  let top = 0

  while (op < pixelCount) {
    if (top === 0) {
      if (bits < codeSize) {
        if (ip >= input.length) break
        datum |= input[ip++] << bits
        bits += 8
        continue
      }
      let code = datum & codeMask
      datum >>= codeSize
      bits -= codeSize

      if (code === eoiCode) break
      if (code === clearCode) {
        codeSize = minCodeSize + 1
        codeMask = (1 << codeSize) - 1
        available = clearCode + 2
        previous = -1
        continue
      }
      if (previous === -1) {
        stack[top++] = suffix[code]
        previous = code
        first = code
        continue
      }

      const current = code
      if (code >= available) {
        stack[top++] = first
        code = previous
      }
      while (code >= clearCode) {
        stack[top++] = suffix[code]
        code = prefix[code]
      }
      first = suffix[code] & 0xff
      stack[top++] = first

      if (available < MAX_CODES) {
        prefix[available] = previous
        suffix[available] = first
        available++
        if ((available & codeMask) === 0 && available < MAX_CODES) {
          codeSize++
          codeMask += available
        }
      }
      previous = current
    }
    out[op++] = stack[--top]
  }
  return out
}

/** GIF interlacing writes rows in four passes; put them back in order. */
function deinterlace(src: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(src.length)
  const passes = [
    { start: 0, step: 8 },
    { start: 4, step: 8 },
    { start: 2, step: 4 },
    { start: 1, step: 2 },
  ]
  let from = 0
  for (const pass of passes) {
    for (let row = pass.start; row < height; row += pass.step) {
      out.set(src.subarray(from * width, (from + 1) * width), row * width)
      from++
    }
  }
  return out
}

/* ------------------------------------------------------------------ */
/* parsing                                                             */
/* ------------------------------------------------------------------ */

interface ParsedGif {
  width: number
  height: number
  globalPalette: Uint8Array | null
  frames: GifFrame[]
}

export function parseGif(data: Uint8Array, maxFrames: number): ParsedGif {
  const r = new Reader(data)
  const signature = String.fromCharCode(...Array.from(r.bytes(6)))
  if (!signature.startsWith('GIF')) throw new Error('NOT A GIF FILE')

  const width = r.short()
  const height = r.short()
  const packed = r.byte()
  r.byte() // background colour index
  r.byte() // pixel aspect ratio

  let globalPalette: Uint8Array | null = null
  if (packed & 0x80) {
    const size = 1 << ((packed & 0x07) + 1)
    globalPalette = r.bytes(size * 3).slice()
  }

  const frames: GifFrame[] = []
  let delay = 100
  let disposal = 0
  let transparentIndex = -1

  for (;;) {
    if (r.pos >= data.length) break
    const block = r.byte()

    if (block === 0x3b) break // trailer

    if (block === 0x21) {
      const label = r.byte()
      if (label === 0xf9) {
        r.byte() // block size, always 4
        const flags = r.byte()
        disposal = (flags >> 2) & 0x07
        const hasTransparent = (flags & 0x01) !== 0
        const raw = r.short()
        const tIndex = r.byte()
        r.byte() // terminator
        // a zero delay means "as fast as possible"; browsers clamp it to 100ms
        delay = (raw || 10) * 10
        transparentIndex = hasTransparent ? tIndex : -1
      } else {
        r.skipSubBlocks()
      }
      continue
    }

    if (block !== 0x2c) continue // unknown block, skip the byte

    const left = r.short()
    const top = r.short()
    const fw = r.short()
    const fh = r.short()
    const fPacked = r.byte()
    let palette: Uint8Array | null = null
    if (fPacked & 0x80) {
      const size = 1 << ((fPacked & 0x07) + 1)
      palette = r.bytes(size * 3).slice()
    }
    const interlaced = !!(fPacked & 0x40)
    const minCodeSize = r.byte()
    const lzw = r.subBlocks()

    let indices = lzwDecode(lzw, minCodeSize, fw * fh)
    if (interlaced) indices = deinterlace(indices, fw, fh)

    frames.push({
      left,
      top,
      width: fw,
      height: fh,
      disposal,
      transparentIndex,
      delay,
      palette,
      indices,
    })

    // reset the graphic control block for the next frame
    delay = 100
    disposal = 0
    transparentIndex = -1

    if (frames.length >= maxFrames) break
  }

  if (frames.length === 0) throw new Error('GIF HAS NO FRAMES')
  return { width, height, globalPalette, frames }
}

/* ------------------------------------------------------------------ */
/* composition                                                         */
/* ------------------------------------------------------------------ */

function fit(w: number, h: number, maxSide: number): [number, number] {
  const long = Math.max(w, h)
  if (long <= maxSide) return [Math.max(1, w), Math.max(1, h)]
  const s = maxSide / long
  return [Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s))]
}

/**
 * Walks the frames applying GIF disposal rules and hands back one complete
 * `ImageBitmap` per frame at the requested size.
 */
export async function decodeGifFrames(
  data: Uint8Array,
  opts: DecodeOptions = {},
): Promise<DecodedMedia> {
  const maxSide = opts.maxSide ?? 800
  const maxFrames = opts.maxFrames ?? 240

  const parsed = parseGif(data, maxFrames + 1)
  const total = Math.min(maxFrames, parsed.frames.length)
  const truncated = parsed.frames.length > total

  const { width, height } = parsed
  const canvasFull = document.createElement('canvas')
  canvasFull.width = width
  canvasFull.height = height
  const full = canvasFull.getContext('2d', { willReadFrequently: true })
  if (!full) throw new Error('CANVAS CONTEXT UNAVAILABLE')

  const [outW, outH] = fit(width, height, maxSide)
  const scaled = document.createElement('canvas')
  scaled.width = outW
  scaled.height = outH
  const sctx = scaled.getContext('2d')
  if (!sctx) throw new Error('CANVAS CONTEXT UNAVAILABLE')
  sctx.imageSmoothingEnabled = true
  sctx.imageSmoothingQuality = 'high'

  // Composition buffer, RGBA at native size.
  const buffer = new Uint8ClampedArray(width * height * 4)
  let saved: Uint8ClampedArray | null = null
  const out: DecodedFrame[] = []

  for (let i = 0; i < total; i++) {
    if (opts.signal?.aborted) throw new Error('DECODE CANCELLED')
    const frame = parsed.frames[i]
    const palette = frame.palette ?? parsed.globalPalette
    if (!palette) throw new Error('GIF FRAME HAS NO PALETTE')

    if (frame.disposal === 3) saved = buffer.slice()

    for (let y = 0; y < frame.height; y++) {
      const dy = frame.top + y
      if (dy < 0 || dy >= height) continue
      for (let x = 0; x < frame.width; x++) {
        const dx = frame.left + x
        if (dx < 0 || dx >= width) continue
        const index = frame.indices[y * frame.width + x]
        if (index === frame.transparentIndex) continue
        const p = (dy * width + dx) * 4
        const c = index * 3
        buffer[p] = palette[c]
        buffer[p + 1] = palette[c + 1]
        buffer[p + 2] = palette[c + 2]
        buffer[p + 3] = 255
      }
    }

    const image = new ImageData(buffer.slice(), width, height)
    full.putImageData(image, 0, 0)
    sctx.clearRect(0, 0, outW, outH)
    sctx.drawImage(canvasFull, 0, 0, outW, outH)
    out.push({ bitmap: await createImageBitmap(scaled), delay: frame.delay })
    opts.onProgress?.((i + 1) / total, 'DECODING FRAME ' + (i + 1) + '/' + total)

    // apply this frame's disposal before compositing the next one
    if (frame.disposal === 2) {
      for (let y = 0; y < frame.height; y++) {
        const dy = frame.top + y
        if (dy < 0 || dy >= height) continue
        const rowStart = (dy * width + Math.max(0, frame.left)) * 4
        const count = Math.min(frame.width, width - Math.max(0, frame.left)) * 4
        buffer.fill(0, rowStart, rowStart + count)
      }
    } else if (frame.disposal === 3 && saved) {
      buffer.set(saved)
    }
  }

  const meanDelay = out.reduce((s, f) => s + f.delay, 0) / out.length
  return {
    name: 'ANIMATION',
    kind: 'image',
    width: outW,
    height: outH,
    fps: Math.max(1, Math.min(60, Math.round(1000 / Math.max(10, meanDelay)))),
    frames: out,
    truncated,
  }
}
