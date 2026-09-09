/**
 * APNG writer: true colour, full alpha, loops natively in every current
 * browser. Frames are written one at a time, each as its own zlib stream, so
 * memory stays flat over a long export.
 *
 * Compression is the platform's `CompressionStream('deflate')` — the same
 * deflate the browser uses for its own PNGs — with per-row adaptive filtering
 * in front of it, which is where most of the saving on flat symbol art comes
 * from.
 */

import { ByteWriter, crc32, deflate, hasDeflate } from './bytes'

const SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function chunk(out: ByteWriter, type: string, body: Uint8Array): void {
  out.u32be(body.length)
  const typed = new Uint8Array(4 + body.length)
  for (let i = 0; i < 4; i++) typed[i] = type.charCodeAt(i)
  typed.set(body, 4)
  out.bytes(typed)
  out.u32be(crc32(typed))
}

/* ------------------------------------------------------------------ */
/* scanline filtering                                                  */
/* ------------------------------------------------------------------ */

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  return pb <= pc ? b : c
}

/**
 * Turns RGBA rows into PNG's filtered byte stream. Each row is tried with all
 * five filters and the one with the smallest sum of absolute differences wins
 * — the heuristic the PNG spec itself suggests.
 */
function filterRows(rgba: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const bpp = 4
  const stride = width * bpp
  const out = new Uint8Array((stride + 1) * height)
  const candidates = [
    new Uint8Array(stride),
    new Uint8Array(stride),
    new Uint8Array(stride),
    new Uint8Array(stride),
    new Uint8Array(stride),
  ]
  const prevRow = new Uint8Array(stride)

  for (let y = 0; y < height; y++) {
    const rowStart = y * stride
    const row = rgba.subarray(rowStart, rowStart + stride)
    const sums = [0, 0, 0, 0, 0]

    for (let i = 0; i < stride; i++) {
      const raw = row[i]
      const left = i >= bpp ? row[i - bpp] : 0
      const up = prevRow[i]
      const upLeft = i >= bpp ? prevRow[i - bpp] : 0

      const none = raw
      const sub = (raw - left) & 0xff
      const upF = (raw - up) & 0xff
      const avg = (raw - ((left + up) >> 1)) & 0xff
      const pae = (raw - paeth(left, up, upLeft)) & 0xff

      candidates[0][i] = none
      candidates[1][i] = sub
      candidates[2][i] = upF
      candidates[3][i] = avg
      candidates[4][i] = pae

      // signed magnitude: bytes above 127 are negative deltas
      sums[0] += none < 128 ? none : 256 - none
      sums[1] += sub < 128 ? sub : 256 - sub
      sums[2] += upF < 128 ? upF : 256 - upF
      sums[3] += avg < 128 ? avg : 256 - avg
      sums[4] += pae < 128 ? pae : 256 - pae
    }

    let best = 0
    for (let f = 1; f < 5; f++) if (sums[f] < sums[best]) best = f

    const at = y * (stride + 1)
    out[at] = best
    out.set(candidates[best], at + 1)
    prevRow.set(row)
  }
  return out
}

/* ------------------------------------------------------------------ */

export interface ApngOptions {
  width: number
  height: number
  frameCount: number
  /** 0 = loop forever */
  loop?: number
}

export function canWriteApng(): boolean {
  return hasDeflate()
}

export class ApngWriter {
  private readonly out = new ByteWriter(1 << 20)
  private readonly width: number
  private readonly height: number
  private sequence = 0
  private frames = 0
  /* same trick as the GIF writer: fcTL delays are integers, so accumulate the
     wanted time and write the difference rather than rounding each frame */
  private clockMs = 0
  private writtenMs = 0

  constructor(opts: ApngOptions) {
    if (!hasDeflate()) throw new Error('APNG NEEDS COMPRESSIONSTREAM')
    this.width = Math.max(1, Math.round(opts.width))
    this.height = Math.max(1, Math.round(opts.height))

    this.out.bytes(SIGNATURE)

    const ihdr = new ByteWriter(13)
    ihdr.u32be(this.width)
    ihdr.u32be(this.height)
    ihdr.u8(8) // bit depth
    ihdr.u8(6) // colour type: RGBA
    ihdr.u8(0) // compression
    ihdr.u8(0) // filter
    ihdr.u8(0) // interlace
    chunk(this.out, 'IHDR', ihdr.take())

    const actl = new ByteWriter(8)
    actl.u32be(Math.max(1, opts.frameCount))
    actl.u32be(opts.loop ?? 0)
    chunk(this.out, 'acTL', actl.take())
  }

  private writeFcTL(delayMs: number): void {
    this.clockMs += delayMs
    const delay = Math.max(1, Math.round(this.clockMs) - this.writtenMs)
    this.writtenMs += delay
    const fctl = new ByteWriter(26)
    fctl.u32be(this.sequence++)
    fctl.u32be(this.width)
    fctl.u32be(this.height)
    fctl.u32be(0) // x offset
    fctl.u32be(0) // y offset
    fctl.u16be(Math.min(65535, delay))
    fctl.u16be(1000)
    fctl.u8(0) // dispose: none
    fctl.u8(0) // blend: source
    chunk(this.out, 'fcTL', fctl.take())
  }

  async addFrame(rgba: Uint8ClampedArray, delayMs: number): Promise<void> {
    const filtered = filterRows(rgba, this.width, this.height)
    const compressed = await deflate(filtered)

    this.writeFcTL(delayMs)
    if (this.frames === 0) {
      chunk(this.out, 'IDAT', compressed)
    } else {
      const body = new Uint8Array(4 + compressed.length)
      const seq = this.sequence++
      body[0] = (seq >>> 24) & 0xff
      body[1] = (seq >>> 16) & 0xff
      body[2] = (seq >>> 8) & 0xff
      body[3] = seq & 0xff
      body.set(compressed, 4)
      chunk(this.out, 'fdAT', body)
    }
    this.frames++
  }

  finish(): Blob {
    chunk(this.out, 'IEND', new Uint8Array(0))
    return new Blob([this.out.take() as BlobPart], { type: 'image/png' })
  }
}
