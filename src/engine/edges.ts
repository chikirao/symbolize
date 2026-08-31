import type { SourceMaps } from '../types/editor'

/**
 * Sobel gradient magnitude over the analysis luminance map, normalised to 0..1.
 * Cached on the SourceMaps object; independent of level / threshold settings.
 */
export function buildEdgeMap(maps: SourceMaps): Float32Array {
  if (maps.edge) return maps.edge
  const { width: w, height: h, lum, alpha } = maps
  const out = new Float32Array(w * h)
  // Combine luminance with alpha so cut-out PNGs produce a silhouette contour.
  const src = new Float32Array(w * h)
  for (let i = 0; i < src.length; i++) src[i] = lum[i] * alpha[i] + (1 - alpha[i]) * 0
  let max = 0
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const tl = src[i - w - 1]
      const t = src[i - w]
      const tr = src[i - w + 1]
      const l = src[i - 1]
      const r = src[i + 1]
      const bl = src[i + w - 1]
      const b = src[i + w]
      const br = src[i + w + 1]
      const gx = tr + 2 * r + br - (tl + 2 * l + bl)
      const gy = bl + 2 * b + br - (tl + 2 * t + tr)
      const m = Math.sqrt(gx * gx + gy * gy)
      out[i] = m
      if (m > max) max = m
    }
  }
  if (max > 0) {
    const inv = 1 / max
    for (let i = 0; i < out.length; i++) out[i] *= inv
  }
  maps.edge = out
  return out
}

/** Local luminance gradient direction (central differences) at analysis coords. */
export function gradientAngleAt(maps: SourceMaps, ax: number, ay: number, step: number): number {
  const { width: w, height: h, lum } = maps
  const s = Math.max(1, Math.round(step))
  const x = Math.min(w - 1, Math.max(0, Math.round(ax)))
  const y = Math.min(h - 1, Math.max(0, Math.round(ay)))
  const xm = Math.max(0, x - s)
  const xp = Math.min(w - 1, x + s)
  const ym = Math.max(0, y - s)
  const yp = Math.min(h - 1, y + s)
  const gx = lum[y * w + xp] - lum[y * w + xm]
  const gy = lum[yp * w + x] - lum[ym * w + x]
  return Math.atan2(gy, gx)
}
