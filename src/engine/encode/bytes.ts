/** Small byte-writing helpers shared by the GIF, PNG/APNG and WebM writers. */

export class ByteWriter {
  private buf: Uint8Array
  private len = 0

  constructor(capacity = 1 << 16) {
    this.buf = new Uint8Array(capacity)
  }

  private ensure(extra: number): void {
    if (this.len + extra <= this.buf.length) return
    let size = this.buf.length * 2
    while (size < this.len + extra) size *= 2
    const next = new Uint8Array(size)
    next.set(this.buf.subarray(0, this.len))
    this.buf = next
  }

  get length(): number {
    return this.len
  }

  u8(value: number): void {
    this.ensure(1)
    this.buf[this.len++] = value & 0xff
  }

  /** little-endian, as GIF wants it */
  u16(value: number): void {
    this.ensure(2)
    this.buf[this.len++] = value & 0xff
    this.buf[this.len++] = (value >> 8) & 0xff
  }

  /** big-endian, as PNG wants it */
  u16be(value: number): void {
    this.ensure(2)
    this.buf[this.len++] = (value >> 8) & 0xff
    this.buf[this.len++] = value & 0xff
  }

  u32be(value: number): void {
    this.ensure(4)
    this.buf[this.len++] = (value >>> 24) & 0xff
    this.buf[this.len++] = (value >>> 16) & 0xff
    this.buf[this.len++] = (value >>> 8) & 0xff
    this.buf[this.len++] = value & 0xff
  }

  bytes(data: Uint8Array): void {
    this.ensure(data.length)
    this.buf.set(data, this.len)
    this.len += data.length
  }

  ascii(text: string): void {
    this.ensure(text.length)
    for (let i = 0; i < text.length; i++) this.buf[this.len++] = text.charCodeAt(i) & 0xff
  }

  /** A view of what has been written. Valid until the next write. */
  view(): Uint8Array {
    return this.buf.subarray(0, this.len)
  }

  take(): Uint8Array {
    return this.buf.slice(0, this.len)
  }
}

/* ------------------------------------------------------------------ */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

export function crc32(data: Uint8Array, seed = 0): number {
  let c = (seed ^ 0xffffffff) >>> 0
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/* ------------------------------------------------------------------ */

/**
 * zlib-compresses with the platform's `CompressionStream`. Every browser this
 * app targets has it; the caller decides what to do when it does not.
 */
export function hasDeflate(): boolean {
  return typeof CompressionStream === 'function'
}

export async function deflate(data: Uint8Array): Promise<Uint8Array> {
  if (!hasDeflate()) throw new Error('COMPRESSIONSTREAM UNAVAILABLE')
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'))
  const out = await new Response(stream).arrayBuffer()
  return new Uint8Array(out)
}
