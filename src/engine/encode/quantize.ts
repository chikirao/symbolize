/**
 * Colour reduction for the GIF writer: median-cut palette, nearest-colour
 * mapping with a 15-bit cache, and optional Floyd–Steinberg dithering.
 *
 * Median cut is deterministic, which matters here — the rest of the render
 * path is, and two exports of the same project should be byte-identical.
 */

export interface Palette {
  /** 3 bytes per entry */
  rgb: Uint8Array
  size: number
}

interface Box {
  /** indices into the sample list */
  start: number
  end: number
  rMin: number
  rMax: number
  gMin: number
  gMax: number
  bMin: number
  bMax: number
}

function boundsOf(samples: Uint8Array, start: number, end: number): Box {
  let rMin = 255
  let rMax = 0
  let gMin = 255
  let gMax = 0
  let bMin = 255
  let bMax = 0
  for (let i = start; i < end; i++) {
    const p = i * 3
    const r = samples[p]
    const g = samples[p + 1]
    const b = samples[p + 2]
    if (r < rMin) rMin = r
    if (r > rMax) rMax = r
    if (g < gMin) gMin = g
    if (g > gMax) gMax = g
    if (b < bMin) bMin = b
    if (b > bMax) bMax = b
  }
  return { start, end, rMin, rMax, gMin, gMax, bMin, bMax }
}

function longestAxis(box: Box): 0 | 1 | 2 {
  // weighted the way the eye sees it, so greens get more resolution
  const r = (box.rMax - box.rMin) * 0.9
  const g = (box.gMax - box.gMin) * 1.2
  const b = (box.bMax - box.bMin) * 0.7
  if (g >= r && g >= b) return 1
  return r >= b ? 0 : 2
}

function sortRange(samples: Uint8Array, start: number, end: number, axis: 0 | 1 | 2): void {
  const count = end - start
  const view = new Array<number>(count)
  for (let i = 0; i < count; i++) {
    const p = (start + i) * 3
    view[i] = (samples[p] << 16) | (samples[p + 1] << 8) | samples[p + 2]
  }
  const shift = axis === 0 ? 16 : axis === 1 ? 8 : 0
  view.sort((a, b) => ((a >> shift) & 0xff) - ((b >> shift) & 0xff))
  for (let i = 0; i < count; i++) {
    const p = (start + i) * 3
    const v = view[i]
    samples[p] = (v >> 16) & 0xff
    samples[p + 1] = (v >> 8) & 0xff
    samples[p + 2] = v & 0xff
  }
}

/**
 * Collects up to `maxSamples` RGB triples from an RGBA buffer, skipping pixels
 * the caller will treat as transparent.
 */
export function sampleColors(
  rgba: Uint8ClampedArray,
  maxSamples: number,
  alphaCutoff: number,
): Uint8Array {
  const pixels = rgba.length >> 2
  const step = Math.max(1, Math.floor(pixels / Math.max(1, maxSamples)))
  const out = new Uint8Array(Math.ceil(pixels / step) * 3)
  let n = 0
  for (let i = 0; i < pixels; i += step) {
    const p = i * 4
    if (rgba[p + 3] < alphaCutoff) continue
    out[n * 3] = rgba[p]
    out[n * 3 + 1] = rgba[p + 1]
    out[n * 3 + 2] = rgba[p + 2]
    n++
  }
  return out.subarray(0, n * 3)
}

export function medianCut(samples: Uint8Array, maxColors: number): Palette {
  const count = samples.length / 3
  const rgb = new Uint8Array(maxColors * 3)
  if (count === 0) return { rgb, size: 1 }

  const work = samples.slice()
  const boxes: Box[] = [boundsOf(work, 0, count)]

  while (boxes.length < maxColors) {
    // split whatever box currently covers the widest range of colour
    let best = -1
    let bestSpan = 0
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i]
      if (box.end - box.start < 2) continue
      const span = Math.max(box.rMax - box.rMin, box.gMax - box.gMin, box.bMax - box.bMin)
      if (span > bestSpan) {
        bestSpan = span
        best = i
      }
    }
    if (best < 0 || bestSpan === 0) break

    const box = boxes[best]
    const axis = longestAxis(box)
    sortRange(work, box.start, box.end, axis)
    const mid = (box.start + box.end) >> 1
    boxes[best] = boundsOf(work, box.start, mid)
    boxes.push(boundsOf(work, mid, box.end))
  }

  for (let i = 0; i < boxes.length; i++) {
    const box = boxes[i]
    let r = 0
    let g = 0
    let b = 0
    const n = Math.max(1, box.end - box.start)
    for (let j = box.start; j < box.end; j++) {
      const p = j * 3
      r += work[p]
      g += work[p + 1]
      b += work[p + 2]
    }
    rgb[i * 3] = Math.round(r / n)
    rgb[i * 3 + 1] = Math.round(g / n)
    rgb[i * 3 + 2] = Math.round(b / n)
  }
  return { rgb, size: Math.max(1, boxes.length) }
}

/* ------------------------------------------------------------------ */

/**
 * Nearest palette entry for an RGB triple, cached on the top 5 bits of each
 * channel. Exact for flat-coloured art and close enough for photographs.
 */
export class PaletteMapper {
  private cache = new Int16Array(32768).fill(-1)

  constructor(private readonly palette: Palette) {}

  nearest(r: number, g: number, b: number): number {
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)
    const hit = this.cache[key]
    if (hit >= 0) return hit

    const { rgb, size } = this.palette
    let best = 0
    let bestDist = Infinity
    for (let i = 0; i < size; i++) {
      const p = i * 3
      const dr = r - rgb[p]
      const dg = g - rgb[p + 1]
      const db = b - rgb[p + 2]
      const dist = dr * dr * 0.9 + dg * dg * 1.2 + db * db * 0.7
      if (dist < bestDist) {
        bestDist = dist
        best = i
        if (dist === 0) break
      }
    }
    this.cache[key] = best
    return best
  }
}

/* ------------------------------------------------------------------ */

export interface MapOptions {
  width: number
  height: number
  alphaCutoff: number
  /** index reserved for transparent pixels, or -1 when the frame is opaque */
  transparentIndex: number
  dither: boolean
}

/**
 * RGBA -> palette indices. With dithering on, the error of each pixel is
 * pushed into its neighbours (Floyd–Steinberg), which is what keeps gradients
 * from banding into stripes once they are down to 256 colours.
 */
export function mapToIndices(
  rgba: Uint8ClampedArray,
  palette: Palette,
  opts: MapOptions,
): Uint8Array {
  const { width, height, alphaCutoff, transparentIndex, dither } = opts
  const mapper = new PaletteMapper(palette)
  const out = new Uint8Array(width * height)

  if (!dither) {
    for (let i = 0; i < out.length; i++) {
      const p = i * 4
      if (transparentIndex >= 0 && rgba[p + 3] < alphaCutoff) {
        out[i] = transparentIndex
        continue
      }
      out[i] = mapper.nearest(rgba[p], rgba[p + 1], rgba[p + 2])
    }
    return out
  }

  // one row of error ahead is enough for the serpentine-free classic kernel
  const errR = new Float32Array((width + 2) * 2)
  const errG = new Float32Array((width + 2) * 2)
  const errB = new Float32Array((width + 2) * 2)
  let cur = 0

  const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v)

  for (let y = 0; y < height; y++) {
    const next = 1 - cur
    const curBase = cur * (width + 2)
    const nextBase = next * (width + 2)
    errR.fill(0, nextBase, nextBase + width + 2)
    errG.fill(0, nextBase, nextBase + width + 2)
    errB.fill(0, nextBase, nextBase + width + 2)

    for (let x = 0; x < width; x++) {
      const i = y * width + x
      const p = i * 4
      if (transparentIndex >= 0 && rgba[p + 3] < alphaCutoff) {
        out[i] = transparentIndex
        continue
      }
      const slot = curBase + x + 1
      const r = clamp(rgba[p] + errR[slot])
      const g = clamp(rgba[p + 1] + errG[slot])
      const b = clamp(rgba[p + 2] + errB[slot])
      const index = mapper.nearest(r, g, b)
      out[i] = index

      const q = index * 3
      const dr = r - palette.rgb[q]
      const dg = g - palette.rgb[q + 1]
      const db = b - palette.rgb[q + 2]

      // 7/16 right, 3/16 below-left, 5/16 below, 1/16 below-right
      errR[slot + 1] += (dr * 7) / 16
      errG[slot + 1] += (dg * 7) / 16
      errB[slot + 1] += (db * 7) / 16
      errR[nextBase + x] += (dr * 3) / 16
      errG[nextBase + x] += (dg * 3) / 16
      errB[nextBase + x] += (db * 3) / 16
      errR[nextBase + x + 1] += (dr * 5) / 16
      errG[nextBase + x + 1] += (dg * 5) / 16
      errB[nextBase + x + 1] += (db * 5) / 16
      errR[nextBase + x + 2] += dr / 16
      errG[nextBase + x + 2] += dg / 16
      errB[nextBase + x + 2] += db / 16
    }
    cur = next
  }
  return out
}
