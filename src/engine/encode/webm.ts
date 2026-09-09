/**
 * WebM export: WebCodecs `VideoEncoder` for the pictures, a small EBML muxer
 * here for the container.
 *
 * WebCodecs hands back encoded chunks, not a file — something has to wrap them
 * in Matroska/WebM, and pulling in a muxer library would break the no-runtime-
 * dependency rule this project keeps. The subset needed for one video track is
 * small: a header, one Info, one Tracks, and clusters of SimpleBlocks.
 */

import { ByteWriter } from './bytes'

/* --- WebCodecs, typed just enough (not in lib.dom for this TS version) --- */

interface EncodedChunkLike {
  type: 'key' | 'delta'
  timestamp: number
  byteLength: number
  copyTo: (target: Uint8Array) => void
}

interface VideoEncoderLike {
  configure: (config: VideoEncoderConfigLike) => void
  encode: (frame: VideoFrameLike, options?: { keyFrame?: boolean }) => void
  flush: () => Promise<void>
  close: () => void
  readonly encodeQueueSize: number
}

interface VideoEncoderConfigLike {
  codec: string
  width: number
  height: number
  bitrate?: number
  framerate?: number
  latencyMode?: 'quality' | 'realtime'
}

interface VideoFrameLike {
  close: () => void
}

type VideoEncoderCtor = {
  new (init: {
    output: (chunk: EncodedChunkLike) => void
    error: (error: DOMException) => void
  }): VideoEncoderLike
  isConfigSupported: (config: VideoEncoderConfigLike) => Promise<{ supported?: boolean }>
}

type VideoFrameCtor = new (
  source: CanvasImageSource,
  init: { timestamp: number; duration?: number },
) => VideoFrameLike

function encoderCtor(): VideoEncoderCtor | null {
  const w = window as unknown as { VideoEncoder?: VideoEncoderCtor }
  return typeof w.VideoEncoder === 'function' ? w.VideoEncoder : null
}

function frameCtor(): VideoFrameCtor | null {
  const w = window as unknown as { VideoFrame?: VideoFrameCtor }
  return typeof w.VideoFrame === 'function' ? w.VideoFrame : null
}

export function hasWebCodecs(): boolean {
  return encoderCtor() !== null && frameCtor() !== null
}

/** VP9 first, VP8 as the fallback. Resolved once and reused. */
const CANDIDATES: { codec: string; matroska: string }[] = [
  { codec: 'vp09.00.10.08', matroska: 'V_VP9' },
  { codec: 'vp8', matroska: 'V_VP8' },
]

let resolved: { codec: string; matroska: string } | null = null

export async function pickWebmCodec(
  width: number,
  height: number,
): Promise<{ codec: string; matroska: string }> {
  const Ctor = encoderCtor()
  if (!Ctor || !frameCtor()) throw new Error('WEBM NEEDS WEBCODECS :: TRY GIF OR PNG SEQUENCE')
  if (resolved) return resolved
  for (const candidate of CANDIDATES) {
    try {
      const support = await Ctor.isConfigSupported({
        codec: candidate.codec,
        width,
        height,
      })
      if (support?.supported) {
        resolved = candidate
        return candidate
      }
    } catch {
      /* try the next one */
    }
  }
  throw new Error('NO WEBM CODEC AVAILABLE :: TRY GIF OR PNG SEQUENCE')
}

/* ------------------------------------------------------------------ */
/* EBML                                                                */
/* ------------------------------------------------------------------ */

const ID = {
  EBML: [0x1a, 0x45, 0xdf, 0xa3],
  EBMLVersion: [0x42, 0x86],
  EBMLReadVersion: [0x42, 0xf7],
  EBMLMaxIDLength: [0x42, 0xf2],
  EBMLMaxSizeLength: [0x42, 0xf3],
  DocType: [0x42, 0x82],
  DocTypeVersion: [0x42, 0x87],
  DocTypeReadVersion: [0x42, 0x85],
  Segment: [0x18, 0x53, 0x80, 0x67],
  Info: [0x15, 0x49, 0xa9, 0x66],
  TimecodeScale: [0x2a, 0xd7, 0xb1],
  MuxingApp: [0x4d, 0x80],
  WritingApp: [0x57, 0x41],
  Duration: [0x44, 0x89],
  Tracks: [0x16, 0x54, 0xae, 0x6b],
  TrackEntry: [0xae],
  TrackNumber: [0xd7],
  TrackUID: [0x73, 0xc5],
  TrackType: [0x83],
  FlagLacing: [0x9c],
  CodecID: [0x86],
  DefaultDuration: [0x23, 0xe3, 0x83],
  Video: [0xe0],
  PixelWidth: [0xb0],
  PixelHeight: [0xba],
  Cluster: [0x1f, 0x43, 0xb6, 0x75],
  Timecode: [0xe7],
  SimpleBlock: [0xa3],
}

/** EBML's self-describing length prefix: a marker bit plus big-endian bytes. */
function vintSize(value: number): Uint8Array {
  for (let len = 1; len <= 8; len++) {
    const max = Math.pow(2, 7 * len) - 1
    if (value < max) {
      const out = new Uint8Array(len)
      let v = value
      for (let i = len - 1; i >= 0; i--) {
        out[i] = v & 0xff
        v = Math.floor(v / 256)
      }
      out[0] |= 1 << (8 - len)
      return out
    }
  }
  throw new Error('EBML ELEMENT TOO LARGE')
}

function uintBytes(value: number): Uint8Array {
  if (value === 0) return new Uint8Array([0])
  const bytes: number[] = []
  let v = value
  while (v > 0) {
    bytes.unshift(v & 0xff)
    v = Math.floor(v / 256)
  }
  return new Uint8Array(bytes)
}

function element(id: number[], body: Uint8Array): Uint8Array {
  const size = vintSize(body.length)
  const out = new Uint8Array(id.length + size.length + body.length)
  out.set(id, 0)
  out.set(size, id.length)
  out.set(body, id.length + size.length)
  return out
}

const uintElement = (id: number[], value: number) => element(id, uintBytes(value))
const stringElement = (id: number[], value: string) =>
  element(id, new TextEncoder().encode(value))

function floatElement(id: number[], value: number): Uint8Array {
  const body = new Uint8Array(8)
  new DataView(body.buffer).setFloat64(0, value, false)
  return element(id, body)
}

function concat(parts: Uint8Array[]): Uint8Array {
  let total = 0
  for (const part of parts) total += part.length
  const out = new Uint8Array(total)
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}

/* ------------------------------------------------------------------ */

export interface WebmOptions {
  width: number
  height: number
  fps: number
  bitrate: number
  /** force a keyframe every N frames */
  keyframeInterval?: number
}

interface Sample {
  data: Uint8Array
  /** milliseconds from the start */
  time: number
  key: boolean
}

/** SimpleBlock timecodes are a signed 16-bit offset from their cluster. */
const MAX_CLUSTER_MS = 30_000

export class WebmWriter {
  private readonly encoder: VideoEncoderLike
  private readonly VideoFrameImpl: VideoFrameCtor
  private readonly samples: Sample[] = []
  private readonly opts: WebmOptions
  private readonly codec: { codec: string; matroska: string }
  private failure: Error | null = null

  constructor(opts: WebmOptions) {
    const Ctor = encoderCtor()
    const Frame = frameCtor()
    if (!Ctor || !Frame) throw new Error('WEBM NEEDS WEBCODECS :: TRY GIF OR PNG SEQUENCE')
    if (!resolved) throw new Error('WEBM CODEC NOT RESOLVED :: CALL pickWebmCodec FIRST')

    this.opts = opts
    this.codec = resolved
    this.VideoFrameImpl = Frame
    this.encoder = new Ctor({
      output: (chunk) => {
        const data = new Uint8Array(chunk.byteLength)
        chunk.copyTo(data)
        this.samples.push({
          data,
          time: Math.round(chunk.timestamp / 1000),
          key: chunk.type === 'key',
        })
      },
      error: (error) => {
        this.failure = new Error('VIDEO ENCODER: ' + error.message)
      },
    })
    this.encoder.configure({
      codec: this.codec.codec,
      width: opts.width,
      height: opts.height,
      bitrate: opts.bitrate,
      framerate: opts.fps,
      latencyMode: 'quality',
    })
  }

  async addFrame(source: CanvasImageSource, index: number): Promise<void> {
    if (this.failure) throw this.failure
    const interval = this.opts.keyframeInterval ?? Math.max(1, Math.round(this.opts.fps * 2))
    const duration = Math.round(1_000_000 / Math.max(1, this.opts.fps))
    const frame = new this.VideoFrameImpl(source, {
      timestamp: index * duration,
      duration,
    })
    this.encoder.encode(frame, { keyFrame: index % interval === 0 })
    frame.close()

    // let the encoder drain instead of queueing the whole animation at once
    while (this.encoder.encodeQueueSize > 4) {
      await new Promise((resolve) => setTimeout(resolve, 4))
      if (this.failure) throw this.failure
    }
  }

  async finish(): Promise<Blob> {
    await this.encoder.flush()
    this.encoder.close()
    if (this.failure) throw this.failure
    if (this.samples.length === 0) throw new Error('NO VIDEO FRAMES ENCODED')

    const header = element(
      ID.EBML,
      concat([
        uintElement(ID.EBMLVersion, 1),
        uintElement(ID.EBMLReadVersion, 1),
        uintElement(ID.EBMLMaxIDLength, 4),
        uintElement(ID.EBMLMaxSizeLength, 8),
        stringElement(ID.DocType, 'webm'),
        uintElement(ID.DocTypeVersion, 2),
        uintElement(ID.DocTypeReadVersion, 2),
      ]),
    )

    const last = this.samples[this.samples.length - 1]
    const durationMs = last.time + 1000 / Math.max(1, this.opts.fps)

    const info = element(
      ID.Info,
      concat([
        uintElement(ID.TimecodeScale, 1_000_000), // one tick = 1ms
        stringElement(ID.MuxingApp, 'symbolize'),
        stringElement(ID.WritingApp, 'symbolize'),
        floatElement(ID.Duration, durationMs),
      ]),
    )

    const tracks = element(
      ID.Tracks,
      element(
        ID.TrackEntry,
        concat([
          uintElement(ID.TrackNumber, 1),
          uintElement(ID.TrackUID, 1),
          uintElement(ID.TrackType, 1), // video
          uintElement(ID.FlagLacing, 0),
          stringElement(ID.CodecID, this.codec.matroska),
          uintElement(ID.DefaultDuration, Math.round(1e9 / Math.max(1, this.opts.fps))),
          element(
            ID.Video,
            concat([
              uintElement(ID.PixelWidth, this.opts.width),
              uintElement(ID.PixelHeight, this.opts.height),
            ]),
          ),
        ]),
      ),
    )

    const clusters: Uint8Array[] = []
    let blocks: Uint8Array[] = []
    let clusterTime = 0

    const flushCluster = () => {
      if (blocks.length === 0) return
      clusters.push(
        element(ID.Cluster, concat([uintElement(ID.Timecode, clusterTime), ...blocks])),
      )
      blocks = []
    }

    for (const sample of this.samples) {
      if (blocks.length === 0) clusterTime = sample.time
      else if (sample.key || sample.time - clusterTime > MAX_CLUSTER_MS) {
        flushCluster()
        clusterTime = sample.time
      }

      const relative = sample.time - clusterTime
      const body = new Uint8Array(4 + sample.data.length)
      body[0] = 0x81 // track number 1 as a vint
      body[1] = (relative >> 8) & 0xff
      body[2] = relative & 0xff
      body[3] = sample.key ? 0x80 : 0x00
      body.set(sample.data, 4)
      blocks.push(element(ID.SimpleBlock, body))
    }
    flushCluster()

    const segmentBody = concat([info, tracks, ...clusters])
    const segment = element(ID.Segment, segmentBody)

    const out = new ByteWriter(header.length + segment.length)
    out.bytes(header)
    out.bytes(segment)
    return new Blob([out.take() as BlobPart], { type: 'video/webm' })
  }
}
