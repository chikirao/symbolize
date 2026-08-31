import type { GradientStop } from '../types/editor'

export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.trim().replace('#', '')
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  const n = parseInt(h, 16)
  if (Number.isNaN(n)) return [255, 255, 255]
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return '#' + c(r) + c(g) + c(b)
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  const d = max - min
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
    else if (max === g) h = ((b - r) / d + 2) / 6
    else h = ((r - g) / d + 4) / 6
  }
  return [h, s, l]
}

function hue2rgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1
  if (t > 1) t -= 1
  if (t < 1 / 6) return p + (q - p) * 6 * t
  if (t < 1 / 2) return q
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
  return p
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = l * 255
    return [v, v, v]
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return [hue2rgb(p, q, h + 1 / 3) * 255, hue2rgb(p, q, h) * 255, hue2rgb(p, q, h - 1 / 3) * 255]
}

export interface ColorAdjust {
  hueShift: number // degrees
  saturation: number // -1..1
  brightness: number // -1..1
}

export function applyAdjust(
  r: number,
  g: number,
  b: number,
  adj: ColorAdjust,
  out: [number, number, number],
): void {
  if (adj.hueShift === 0 && adj.saturation === 0 && adj.brightness === 0) {
    out[0] = r
    out[1] = g
    out[2] = b
    return
  }
  let [h, s, l] = rgbToHsl(r, g, b)
  h = (h + adj.hueShift / 360 + 1) % 1
  s = Math.max(0, Math.min(1, s * (1 + adj.saturation)))
  l = Math.max(0, Math.min(1, l + adj.brightness * (adj.brightness > 0 ? 1 - l : l)))
  const c = hslToRgb(h, s, l)
  out[0] = c[0]
  out[1] = c[1]
  out[2] = c[2]
}

export const LUT_SIZE = 256

/**
 * 256-entry RGB lookup table for a gradient. Interpolation happens in sRGB,
 * which is what the reference tools do and is enough here.
 */
export function buildGradientLUT(
  stops: GradientStop[],
  reverse: boolean,
  adj: ColorAdjust,
): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(LUT_SIZE * 3)
  const sorted = [...stops].sort((a, b) => a.pos - b.pos)
  if (sorted.length === 0) {
    lut.fill(255)
    return lut
  }
  const parsed = sorted.map((s) => ({ pos: Math.max(0, Math.min(1, s.pos)), rgb: hexToRgb(s.color) }))
  const tmp: [number, number, number] = [0, 0, 0]

  for (let i = 0; i < LUT_SIZE; i++) {
    let t = i / (LUT_SIZE - 1)
    if (reverse) t = 1 - t
    let r: number
    let g: number
    let b: number
    if (t <= parsed[0].pos) {
      ;[r, g, b] = parsed[0].rgb
    } else if (t >= parsed[parsed.length - 1].pos) {
      ;[r, g, b] = parsed[parsed.length - 1].rgb
    } else {
      let k = 0
      while (k < parsed.length - 1 && parsed[k + 1].pos < t) k++
      const a = parsed[k]
      const c = parsed[Math.min(parsed.length - 1, k + 1)]
      const span = c.pos - a.pos
      const f = span <= 0 ? 0 : (t - a.pos) / span
      r = a.rgb[0] + (c.rgb[0] - a.rgb[0]) * f
      g = a.rgb[1] + (c.rgb[1] - a.rgb[1]) * f
      b = a.rgb[2] + (c.rgb[2] - a.rgb[2]) * f
    }
    applyAdjust(r, g, b, adj, tmp)
    lut[i * 3] = tmp[0]
    lut[i * 3 + 1] = tmp[1]
    lut[i * 3 + 2] = tmp[2]
  }
  return lut
}

export function cssGradient(stops: GradientStop[], reverse: boolean): string {
  const sorted = [...stops].sort((a, b) => a.pos - b.pos)
  const parts = sorted.map((s) => {
    const p = reverse ? 1 - s.pos : s.pos
    return { p, c: s.color }
  })
  parts.sort((a, b) => a.p - b.p)
  if (parts.length === 0) return 'linear-gradient(90deg,#fff,#fff)'
  if (parts.length === 1) return `linear-gradient(90deg,${parts[0].c},${parts[0].c})`
  return `linear-gradient(90deg,${parts.map((p) => `${p.c} ${(p.p * 100).toFixed(1)}%`).join(',')})`
}

export const DEFAULT_STOPS: GradientStop[] = [
  { id: 's0', pos: 0, color: '#26C6FF' },
  { id: 's1', pos: 0.25, color: '#5D7CFF' },
  { id: 's2', pos: 0.5, color: '#8A3FFC' },
  { id: 's3', pos: 0.75, color: '#D500F9' },
  { id: 's4', pos: 1, color: '#41FFD1' },
]
