/**
 * Stored (uncompressed) ZIP writer, for exporting a PNG sequence.
 *
 * The entries are PNGs the browser already compressed, so deflating them again
 * would cost time and save nothing — STORE is the right method here and keeps
 * the writer to one screen of code.
 */

import { ByteWriter, crc32 } from './bytes'

interface Entry {
  name: string
  data: Uint8Array
  crc: number
  offset: number
}

function dosTime(date: Date): { time: number; date: number } {
  const time =
    ((date.getHours() & 0x1f) << 11) |
    ((date.getMinutes() & 0x3f) << 5) |
    ((date.getSeconds() / 2) & 0x1f)
  const day =
    (((date.getFullYear() - 1980) & 0x7f) << 9) |
    (((date.getMonth() + 1) & 0x0f) << 5) |
    (date.getDate() & 0x1f)
  return { time, date: day }
}

export class ZipWriter {
  private readonly out = new ByteWriter(1 << 20)
  private readonly entries: Entry[] = []
  private readonly stamp = dosTime(new Date())

  add(name: string, data: Uint8Array): void {
    const crc = crc32(data)
    const offset = this.out.length
    const nameBytes = new TextEncoder().encode(name)

    this.out.u32be(0x504b0304) // written big-endian on purpose: the signature
    // is 'PK\3\4' in file order, which u32be reproduces directly
    this.out.u16(20) // version needed
    this.out.u16(0) // flags
    this.out.u16(0) // method: stored
    this.out.u16(this.stamp.time)
    this.out.u16(this.stamp.date)
    this.writeU32le(crc)
    this.writeU32le(data.length)
    this.writeU32le(data.length)
    this.out.u16(nameBytes.length)
    this.out.u16(0)
    this.out.bytes(nameBytes)
    this.out.bytes(data)

    this.entries.push({ name, data, crc, offset })
  }

  private writeU32le(value: number): void {
    this.out.u16(value & 0xffff)
    this.out.u16((value >>> 16) & 0xffff)
  }

  finish(): Blob {
    const start = this.out.length
    for (const entry of this.entries) {
      const nameBytes = new TextEncoder().encode(entry.name)
      this.out.u32be(0x504b0102) // central directory header
      this.out.u16(20) // version made by
      this.out.u16(20) // version needed
      this.out.u16(0)
      this.out.u16(0)
      this.out.u16(this.stamp.time)
      this.out.u16(this.stamp.date)
      this.writeU32le(entry.crc)
      this.writeU32le(entry.data.length)
      this.writeU32le(entry.data.length)
      this.out.u16(nameBytes.length)
      this.out.u16(0) // extra
      this.out.u16(0) // comment
      this.out.u16(0) // disk
      this.out.u16(0) // internal attrs
      this.writeU32le(0) // external attrs
      this.writeU32le(entry.offset)
      this.out.bytes(nameBytes)
    }
    const size = this.out.length - start

    this.out.u32be(0x504b0506) // end of central directory
    this.out.u16(0)
    this.out.u16(0)
    this.out.u16(this.entries.length)
    this.out.u16(this.entries.length)
    this.writeU32le(size)
    this.writeU32le(start)
    this.out.u16(0)

    return new Blob([this.out.take() as BlobPart], { type: 'application/zip' })
  }
}
