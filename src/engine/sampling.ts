import type { SourceMaps } from '../types/editor'

export interface CellSample {
  lum: number
  alpha: number
  r: number
  g: number
  b: number
  /** most common colour in the cell, not the average — only filled on request */
  dr: number
  dg: number
  db: number
}

const tmp: CellSample = { lum: 0, alpha: 0, r: 0, g: 0, b: 0, dr: 0, dg: 0, db: 0 }

/* Histogram scratch reused across cells: 4 bits per channel = 4096 buckets.
   Only the buckets a cell actually touched get cleared, so this stays O(taps). */
const HIST_BUCKETS = 4096
const histCount = new Uint16Array(HIST_BUCKETS)
const histR = new Float32Array(HIST_BUCKETS)
const histG = new Float32Array(HIST_BUCKETS)
const histB = new Float32Array(HIST_BUCKETS)
const histTouched = new Int32Array(64)

/**
 * Average of a small stratified grid of taps inside the cell footprint.
 * Never a single centre pixel: that makes the output flicker on tiny cells.
 * Returns a shared object; copy fields out before the next call.
 */
export function sampleCell(
  maps: SourceMaps,
  x: number,
  y: number,
  cw: number,
  ch: number,
  wantDominant = false,
): CellSample {
  const s = maps.scale
  const w = maps.width
  const h = maps.height
  const fw = cw * s
  const fh = ch * s
  // large adaptive cells need more taps to average honestly; small cells stay cheap
  const k = Math.max(1, Math.min(6, Math.round(Math.min(fw, fh) / 1.6)))

  const ax = x * s
  const ay = y * s

  let lum = 0
  let alpha = 0
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  let touched = 0

  for (let j = 0; j < k; j++) {
    const fy = k === 1 ? ay : ay + ((j + 0.5) / k - 0.5) * fh
    const py = Math.min(h - 1, Math.max(0, Math.round(fy)))
    for (let i = 0; i < k; i++) {
      const fx = k === 1 ? ax : ax + ((i + 0.5) / k - 0.5) * fw
      const px = Math.min(w - 1, Math.max(0, Math.round(fx)))
      const idx = py * w + px
      const a = maps.alpha[idx]
      const pr = maps.rgb[idx * 3]
      const pg = maps.rgb[idx * 3 + 1]
      const pb = maps.rgb[idx * 3 + 2]
      lum += maps.lum[idx]
      alpha += a
      r += pr
      g += pg
      b += pb
      n++

      if (wantDominant && a > 0.5 && touched < histTouched.length) {
        const bucket = ((pr >> 4) << 8) | ((pg >> 4) << 4) | (pb >> 4)
        if (histCount[bucket] === 0) histTouched[touched++] = bucket
        histCount[bucket]++
        histR[bucket] += pr
        histG[bucket] += pg
        histB[bucket] += pb
      }
    }
  }

  const inv = 1 / n
  tmp.lum = lum * inv
  tmp.alpha = alpha * inv
  tmp.r = r * inv
  tmp.g = g * inv
  tmp.b = b * inv

  if (wantDominant) {
    if (touched === 0) {
      tmp.dr = tmp.r
      tmp.dg = tmp.g
      tmp.db = tmp.b
    } else {
      // first bucket wins ties, and tap order is fixed, so this stays deterministic
      let best = histTouched[0]
      for (let i = 1; i < touched; i++) {
        if (histCount[histTouched[i]] > histCount[best]) best = histTouched[i]
      }
      const c = histCount[best]
      tmp.dr = histR[best] / c
      tmp.dg = histG[best] / c
      tmp.db = histB[best] / c
      for (let i = 0; i < touched; i++) {
        const t = histTouched[i]
        histCount[t] = 0
        histR[t] = 0
        histG[t] = 0
        histB[t] = 0
      }
    }
  }
  return tmp
}

/** Max-pooled edge strength; the pooling radius acts as edge thickness. */
export function sampleEdge(
  maps: SourceMaps,
  edge: Float32Array,
  x: number,
  y: number,
  radiusImagePx: number,
): number {
  const s = maps.scale
  const w = maps.width
  const h = maps.height
  const rad = Math.max(0, radiusImagePx * s)
  const ax = x * s
  const ay = y * s
  if (rad < 0.75) {
    const px = Math.min(w - 1, Math.max(0, Math.round(ax)))
    const py = Math.min(h - 1, Math.max(0, Math.round(ay)))
    return edge[py * w + px]
  }
  const steps = Math.min(4, Math.max(1, Math.round(rad)))
  let max = 0
  for (let j = -steps; j <= steps; j++) {
    const py = Math.min(h - 1, Math.max(0, Math.round(ay + (j / steps) * rad)))
    for (let i = -steps; i <= steps; i++) {
      const px = Math.min(w - 1, Math.max(0, Math.round(ax + (i / steps) * rad)))
      const v = edge[py * w + px]
      if (v > max) max = v
    }
  }
  return max
}
