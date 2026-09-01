import type { EditorSettings, SourceMaps } from '../types/editor'
import { hexToRgb, rgbToHex } from './gradients'

/**
 * Colour-based selection.
 *
 * Two classic tools, both running on the analysis maps:
 *  - COLOR RANGE: every pixel close enough to any picked colour, anywhere in
 *    the image;
 *  - CONTIGUOUS (magic wand): a scanline flood fill from each pick, so only the
 *    region actually touching the click is kept.
 *
 * Neither is semantic segmentation — there is no model here — but for flat
 * artwork, logos and cut-outs they do the job "select that object" usually means.
 */

const MAX_DIST = Math.sqrt(9 * 255 * 255)

/** Redmean distance: cheap, and much closer to perception than plain RGB. */
function colourDistance(
  r1: number,
  g1: number,
  b1: number,
  r2: number,
  g2: number,
  b2: number,
): number {
  const rmean = (r1 + r2) * 0.5
  const dr = r1 - r2
  const dg = g1 - g2
  const db = b1 - b2
  return (
    Math.sqrt(
      (2 + rmean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rmean) / 256) * db * db,
    ) / MAX_DIST
  )
}

function falloff(distance: number, tolerance: number): number {
  if (distance >= tolerance) return 0
  const t = 1 - distance / tolerance
  return t * t * (3 - 2 * t)
}

/** Small average so a pick is not at the mercy of one noisy pixel. */
export function sampleColourAt(maps: SourceMaps, nx: number, ny: number): string {
  const px = Math.min(maps.width - 1, Math.max(0, Math.round(nx * (maps.width - 1))))
  const py = Math.min(maps.height - 1, Math.max(0, Math.round(ny * (maps.height - 1))))
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (let dy = -1; dy <= 1; dy++) {
    const y = Math.min(maps.height - 1, Math.max(0, py + dy))
    for (let dx = -1; dx <= 1; dx++) {
      const x = Math.min(maps.width - 1, Math.max(0, px + dx))
      const i = (y * maps.width + x) * 3
      r += maps.rgb[i]
      g += maps.rgb[i + 1]
      b += maps.rgb[i + 2]
      n++
    }
  }
  return rgbToHex(r / n, g / n, b / n)
}

/* ------------------------------------------------------------------ */

function buildColourRange(maps: SourceMaps, mask: EditorSettings['mask']): Uint8Array {
  const n = maps.width * maps.height
  const out = new Uint8Array(n)
  const targets = mask.picks.map((p) => hexToRgb(p.color))
  const tol = Math.max(0.002, mask.tolerance)

  for (let i = 0; i < n; i++) {
    if (maps.alpha[i] <= 0.02) continue
    const p = i * 3
    const r = maps.rgb[p]
    const g = maps.rgb[p + 1]
    const b = maps.rgb[p + 2]
    let best = 1
    for (let t = 0; t < targets.length; t++) {
      const d = colourDistance(r, g, b, targets[t][0], targets[t][1], targets[t][2])
      if (d < best) best = d
      if (best === 0) break
    }
    out[i] = falloff(best, tol) * 255
  }
  return out
}

function buildWand(maps: SourceMaps, mask: EditorSettings['mask']): Uint8Array {
  const w = maps.width
  const h = maps.height
  const out = new Uint8Array(w * h)
  const visited = new Uint8Array(w * h)
  const tol = Math.max(0.002, mask.tolerance)
  const stack: number[] = []

  for (const pick of mask.picks) {
    const [tr, tg, tb] = hexToRgb(pick.color)
    const sx = Math.min(w - 1, Math.max(0, Math.round(pick.x * (w - 1))))
    const sy = Math.min(h - 1, Math.max(0, Math.round(pick.y * (h - 1))))

    const scoreAt = (idx: number): number => {
      if (maps.alpha[idx] <= 0.02) return 0
      const p = idx * 3
      return falloff(colourDistance(maps.rgb[p], maps.rgb[p + 1], maps.rgb[p + 2], tr, tg, tb), tol)
    }

    if (scoreAt(sy * w + sx) <= 0) continue

    stack.length = 0
    stack.push(sy * w + sx)

    // scanline flood fill: walk each row's span, then seed the rows above/below
    while (stack.length > 0) {
      const start = stack.pop() as number
      if (visited[start]) continue
      const y = (start / w) | 0
      const rowStart = y * w

      let x = start - rowStart
      while (x > 0 && !visited[rowStart + x - 1] && scoreAt(rowStart + x - 1) > 0) x--

      let spanUp = false
      let spanDown = false
      for (; x < w; x++) {
        const idx = rowStart + x
        if (visited[idx]) break
        const score = scoreAt(idx)
        if (score <= 0) break
        visited[idx] = 1
        out[idx] = score * 255

        if (y > 0) {
          const up = idx - w
          const okUp = !visited[up] && scoreAt(up) > 0
          if (okUp && !spanUp) {
            stack.push(up)
            spanUp = true
          } else if (!okUp) spanUp = false
        }
        if (y < h - 1) {
          const down = idx + w
          const okDown = !visited[down] && scoreAt(down) > 0
          if (okDown && !spanDown) {
            stack.push(down)
            spanDown = true
          } else if (!okDown) spanDown = false
        }
      }
    }
  }
  return out
}

/* ------------------------------------------------------------------ */

let cache: { key: string; maps: SourceMaps; data: Uint8Array } | null = null

function signature(mask: EditorSettings['mask']): string {
  return [
    mask.tolerance.toFixed(4),
    mask.contiguous ? 'w' : 'g',
    mask.picks.map((p) => p.color + '@' + p.x.toFixed(4) + ',' + p.y.toFixed(4)).join(';'),
  ].join('|')
}

export function invalidateSelectionCache(): void {
  cache = null
}

/**
 * 0..255 selection field at analysis resolution, or null when the mask does
 * not use colour selection. Cached: rebuilding it on every slider tick would
 * cost a full pass over the analysis maps.
 */
export function getSelectionMask(
  maps: SourceMaps,
  mask: EditorSettings['mask'],
): Uint8Array | null {
  if (mask.source !== 'color' || mask.picks.length === 0) return null
  const key = signature(mask)
  if (cache && cache.maps === maps && cache.key === key) return cache.data
  const data = mask.contiguous ? buildWand(maps, mask) : buildColourRange(maps, mask)
  cache = { key, maps, data }
  return data
}

/** Averages the selection field over a cell footprint, like every other sample. */
export function sampleSelection(
  maps: SourceMaps,
  sel: Uint8Array,
  x: number,
  y: number,
  cw: number,
  ch: number,
): number {
  const s = maps.scale
  const w = maps.width
  const h = maps.height
  const fw = cw * s
  const fh = ch * s
  const k = Math.max(1, Math.min(4, Math.round(Math.min(fw, fh) / 1.6)))
  const ax = x * s
  const ay = y * s

  let total = 0
  let n = 0
  for (let j = 0; j < k; j++) {
    const py = Math.min(
      h - 1,
      Math.max(0, Math.round(k === 1 ? ay : ay + ((j + 0.5) / k - 0.5) * fh)),
    )
    for (let i = 0; i < k; i++) {
      const px = Math.min(
        w - 1,
        Math.max(0, Math.round(k === 1 ? ax : ax + ((i + 0.5) / k - 0.5) * fw)),
      )
      total += sel[py * w + px]
      n++
    }
  }
  return total / n / 255
}
