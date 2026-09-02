/**
 * Vibe sets — two curated symbol families with a deliberate visual character,
 * on top of the neutral core library in [symbols.ts](symbols.ts):
 *
 *   SOFT   round, organic, blobby — friendly halftone-ish output
 *   SHARP  angular, spiky, high-contrast — aggressive/industrial output
 *
 * Same rules as the core set: pure Canvas geometry centred on the origin inside
 * a size x size box, no glyphs, no external assets.
 */

import { polyPath, roundRectPath, type SymbolDef } from './symbolPrimitives'

/**
 * Sharp shapes need mitred joins and flat caps, but the renderer sets round
 * caps/joins once for the whole frame — so the few stroke-based sharp symbols
 * flip the state and put it back themselves.
 */
function withMiter(ctx: CanvasRenderingContext2D, fn: () => void) {
  ctx.lineJoin = 'miter'
  ctx.lineCap = 'butt'
  ctx.miterLimit = 8
  fn()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
}

function starPath(
  ctx: CanvasRenderingContext2D,
  points: number,
  R: number,
  r: number,
  rot = -Math.PI / 2,
) {
  ctx.beginPath()
  for (let i = 0; i < points * 2; i++) {
    const rad = i % 2 === 0 ? R : r
    const a = rot + (i * Math.PI) / points
    const x = Math.cos(a) * rad
    const y = Math.sin(a) * rad
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
}

/* ------------------------------------------------------------------ */
/* SOFT — round, organic                                               */
/* ------------------------------------------------------------------ */

export const SOFT_SYMBOLS: SymbolDef[] = [
  {
    id: 'blob',
    label: 'BLOB',
    category: 'soft',
    paint: 'fill',
    draw: (ctx, s) => {
      const h = s / 2
      ctx.beginPath()
      ctx.moveTo(0, -h * 0.94)
      ctx.bezierCurveTo(h * 0.72, -h * 0.94, h * 0.98, -h * 0.36, h * 0.86, h * 0.18)
      ctx.bezierCurveTo(h * 0.74, h * 0.78, h * 0.24, h * 0.98, -h * 0.24, h * 0.9)
      ctx.bezierCurveTo(-h * 0.84, h * 0.8, -h * 0.98, h * 0.12, -h * 0.8, -h * 0.4)
      ctx.bezierCurveTo(-h * 0.66, -h * 0.82, -h * 0.4, -h * 0.94, 0, -h * 0.94)
      ctx.closePath()
      ctx.fill()
    },
  },
  {
    id: 'squircle',
    label: 'SQUIRCLE',
    category: 'soft',
    paint: 'fill',
    draw: (ctx, s) => {
      roundRectPath(ctx, -s / 2, -s / 2, s, s, s * 0.42)
      ctx.fill()
    },
  },
  {
    id: 'squircleOutline',
    label: 'SQUIRCLE OUTLINE',
    category: 'soft',
    paint: 'stroke',
    draw: (ctx, s, sw) => {
      ctx.lineWidth = sw
      roundRectPath(ctx, -s / 2 + sw / 2, -s / 2 + sw / 2, s - sw, s - sw, s * 0.36)
      ctx.stroke()
    },
  },
  {
    id: 'donut',
    label: 'DONUT',
    category: 'soft',
    paint: 'stroke',
    draw: (ctx, s) => {
      const w = Math.max(s * 0.26, 0.35)
      ctx.lineWidth = w
      ctx.beginPath()
      ctx.arc(0, 0, Math.max(w * 0.5, s / 2 - w / 2), 0, Math.PI * 2)
      ctx.stroke()
    },
  },
  {
    id: 'lens',
    label: 'LENS',
    category: 'soft',
    paint: 'fill',
    draw: (ctx, s) => {
      const h = s / 2
      ctx.beginPath()
      ctx.moveTo(0, -h)
      ctx.quadraticCurveTo(h * 0.78, 0, 0, h)
      ctx.quadraticCurveTo(-h * 0.78, 0, 0, -h)
      ctx.closePath()
      ctx.fill()
    },
  },
  {
    id: 'quarterDisc',
    label: 'QUARTER DISC',
    category: 'soft',
    paint: 'fill',
    draw: (ctx, s) => {
      const h = s / 2
      ctx.beginPath()
      ctx.moveTo(-h, h)
      ctx.arc(-h, h, s * 0.96, -Math.PI / 2, 0)
      ctx.closePath()
      ctx.fill()
    },
  },
  {
    id: 'crescent',
    label: 'CRESCENT',
    category: 'soft',
    paint: 'fill',
    draw: (ctx, s) => {
      const h = s / 2
      // outer edge is the left half of the disc; the bite is an arc of a circle
      // centred to the right, so it cuts back through (-0.5h, 0)
      const cx = h * 0.75
      const r = Math.hypot(cx, h)
      const a = Math.PI - Math.atan2(h, cx)
      ctx.beginPath()
      ctx.arc(0, 0, h, Math.PI / 2, Math.PI * 1.5, false)
      ctx.arc(cx, 0, r, -a, a, true)
      ctx.closePath()
      ctx.fill()
    },
  },
  {
    id: 'lozenge',
    label: 'LOZENGE',
    category: 'soft',
    paint: 'fill',
    draw: (ctx, s) => {
      const h = s / 2
      const k = 0.52
      ctx.beginPath()
      ctx.moveTo(0, -h)
      ctx.quadraticCurveTo(h * k, -h * k, h, 0)
      ctx.quadraticCurveTo(h * k, h * k, 0, h)
      ctx.quadraticCurveTo(-h * k, h * k, -h, 0)
      ctx.quadraticCurveTo(-h * k, -h * k, 0, -h)
      ctx.closePath()
      ctx.fill()
    },
  },
  {
    id: 'roundedTriangle',
    label: 'ROUNDED TRIANGLE',
    category: 'soft',
    paint: 'fill',
    draw: (ctx, s) => {
      const h = s / 2
      const r = s * 0.13
      const p = [
        [0, -h * 0.98],
        [h * 0.92, h * 0.72],
        [-h * 0.92, h * 0.72],
      ]
      const mid = (a: number[], b: number[]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
      ctx.beginPath()
      const start = mid(p[2], p[0])
      ctx.moveTo(start[0], start[1])
      for (let i = 0; i < 3; i++) {
        const next = mid(p[i], p[(i + 1) % 3])
        ctx.arcTo(p[i][0], p[i][1], next[0], next[1], r)
      }
      ctx.closePath()
      ctx.fill()
    },
  },
  {
    id: 'quatrefoil',
    label: 'QUATREFOIL',
    category: 'soft',
    paint: 'fill',
    draw: (ctx, s) => {
      const h = s / 2
      const o = h * 0.5
      const r = h * 0.5
      ctx.beginPath()
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2
        const cx = Math.cos(a) * o
        const cy = Math.sin(a) * o
        ctx.moveTo(cx + r, cy)
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
      }
      ctx.rect(-o, -o, o * 2, o * 2)
      ctx.fill()
    },
  },
  {
    id: 'pillOutline',
    label: 'PILL OUTLINE',
    category: 'soft',
    paint: 'stroke',
    draw: (ctx, s, sw) => {
      ctx.lineWidth = sw
      const hgt = s * 0.44
      roundRectPath(ctx, -s / 2 + sw / 2, -hgt / 2, s - sw, hgt, hgt / 2)
      ctx.stroke()
    },
  },
  {
    id: 'petal',
    label: 'PETAL',
    category: 'soft',
    paint: 'fill',
    draw: (ctx, s) => {
      const h = s / 2
      ctx.beginPath()
      ctx.moveTo(0, -h)
      ctx.bezierCurveTo(h * 0.55, -h * 0.45, h * 0.78, h * 0.05, h * 0.6, h * 0.42)
      ctx.bezierCurveTo(h * 0.42, h * 0.8, -h * 0.42, h * 0.8, -h * 0.6, h * 0.42)
      ctx.bezierCurveTo(-h * 0.78, h * 0.05, -h * 0.55, -h * 0.45, 0, -h)
      ctx.closePath()
      ctx.fill()
    },
  },
  {
    id: 'bubbles',
    label: 'BUBBLES',
    category: 'soft',
    paint: 'fill',
    draw: (ctx, s) => {
      const h = s / 2
      const c = [
        [-h * 0.38, h * 0.34, h * 0.44],
        [h * 0.44, h * 0.02, h * 0.32],
        [-h * 0.06, -h * 0.56, h * 0.22],
      ]
      for (let i = 0; i < c.length; i++) {
        ctx.beginPath()
        ctx.arc(c[i][0], c[i][1], c[i][2], 0, Math.PI * 2)
        ctx.fill()
      }
    },
  },
  {
    id: 'ripple',
    label: 'RIPPLE',
    category: 'soft',
    paint: 'stroke',
    draw: (ctx, s, sw) => {
      ctx.lineWidth = sw
      const h = s / 2
      ctx.beginPath()
      ctx.arc(0, h * 0.42, h * 0.92, Math.PI * 1.15, Math.PI * 1.85)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(0, h * 0.42, h * 0.5, Math.PI * 1.15, Math.PI * 1.85)
      ctx.stroke()
    },
  },
  {
    id: 'waveSoft',
    label: 'WAVE SOFT',
    category: 'soft',
    paint: 'stroke',
    draw: (ctx, s, sw) => {
      ctx.lineWidth = Math.max(sw, s * 0.16)
      const h = s / 2
      ctx.beginPath()
      ctx.moveTo(-h * 0.92, h * 0.2)
      ctx.bezierCurveTo(-h * 0.4, -h * 0.9, h * 0.4, h * 0.9, h * 0.92, -h * 0.2)
      ctx.stroke()
    },
  },
  {
    id: 'arcSoft',
    label: 'ARC',
    category: 'soft',
    paint: 'stroke',
    draw: (ctx, s, sw) => {
      ctx.lineWidth = Math.max(sw, s * 0.18)
      const w = Math.max(sw, s * 0.18)
      const r = Math.max(w, s / 2 - w / 2)
      ctx.beginPath()
      ctx.arc(0, s * 0.2, r, Math.PI, Math.PI * 2)
      ctx.stroke()
    },
  },
]

/* ------------------------------------------------------------------ */
/* SHARP — angular, spiky                                              */
/* ------------------------------------------------------------------ */

export const SHARP_SYMBOLS: SymbolDef[] = [
  {
    id: 'blade',
    label: 'BLADE',
    category: 'sharp',
    paint: 'fill',
    draw: (ctx, s) => {
      polyPath(ctx, [[0.06, -1], [0.42, 0.3], [-0.02, 1], [-0.3, 0.12]], s / 2)
      ctx.fill()
    },
  },
  {
    id: 'spike',
    label: 'SPIKE',
    category: 'sharp',
    paint: 'fill',
    draw: (ctx, s) => {
      polyPath(ctx, [[0, -1], [0.24, 1], [-0.24, 1]], s / 2)
      ctx.fill()
    },
  },
  {
    id: 'shard',
    label: 'SHARD',
    category: 'sharp',
    paint: 'fill',
    draw: (ctx, s) => {
      polyPath(ctx, [[-0.18, -1], [0.82, -0.42], [0.34, 0.92], [-0.66, 0.44]], s / 2)
      ctx.fill()
    },
  },
  {
    id: 'bolt',
    label: 'BOLT',
    category: 'sharp',
    paint: 'fill',
    draw: (ctx, s) => {
      polyPath(
        ctx,
        [[0.28, -1], [-0.62, 0.1], [-0.06, 0.1], [-0.28, 1], [0.62, -0.1], [0.06, -0.1]],
        s / 2,
      )
      ctx.fill()
    },
  },
  {
    id: 'kite',
    label: 'KITE',
    category: 'sharp',
    paint: 'fill',
    draw: (ctx, s) => {
      polyPath(ctx, [[0, -1], [0.6, -0.18], [0, 1], [-0.6, -0.18]], s / 2)
      ctx.fill()
    },
  },
  {
    id: 'barb',
    label: 'BARB',
    category: 'sharp',
    paint: 'fill',
    draw: (ctx, s) => {
      starPath(ctx, 4, s / 2, s * 0.09, -Math.PI / 4)
      ctx.fill()
    },
  },
  {
    id: 'razor',
    label: 'RAZOR',
    category: 'sharp',
    paint: 'fill',
    draw: (ctx, s) => {
      polyPath(ctx, [[-0.12, -1], [0.5, -1], [0.12, 1], [-0.5, 1]], s / 2)
      ctx.fill()
    },
  },
  {
    id: 'wedge',
    label: 'WEDGE',
    category: 'sharp',
    paint: 'fill',
    draw: (ctx, s) => {
      polyPath(ctx, [[-0.95, -0.95], [0.95, 0.6], [-0.95, 0.95]], s / 2)
      ctx.fill()
    },
  },
  {
    id: 'trapezoid',
    label: 'TRAPEZOID',
    category: 'sharp',
    paint: 'fill',
    draw: (ctx, s) => {
      polyPath(ctx, [[-0.42, -0.86], [0.42, -0.86], [0.96, 0.86], [-0.96, 0.86]], s / 2)
      ctx.fill()
    },
  },
  {
    id: 'starSpike',
    label: 'STAR SPIKE',
    category: 'sharp',
    paint: 'fill',
    draw: (ctx, s) => {
      starPath(ctx, 8, s / 2, s * 0.14)
      ctx.fill()
    },
  },
  {
    id: 'arrowSharp',
    label: 'ARROW SHARP',
    category: 'sharp',
    paint: 'fill',
    draw: (ctx, s) => {
      polyPath(ctx, [[0, -1], [0.86, 0.78], [0, 0.26], [-0.86, 0.78]], s / 2)
      ctx.fill()
    },
  },
  {
    id: 'heavyChevron',
    label: 'HEAVY CHEVRON',
    category: 'sharp',
    paint: 'fill',
    draw: (ctx, s) => {
      polyPath(
        ctx,
        [[-0.92, -0.78], [0, 0.06], [0.92, -0.78], [0.92, -0.08], [0, 0.76], [-0.92, -0.08]],
        s / 2,
      )
      ctx.fill()
    },
  },
  {
    id: 'diagonalBars',
    label: 'DIAGONAL BARS',
    category: 'sharp',
    paint: 'fill',
    draw: (ctx, s) => {
      const h = s / 2
      for (let i = -1; i <= 1; i++) {
        const o = i * 0.62
        polyPath(
          ctx,
          [[o - 0.06, -0.95], [o + 0.24, -0.95], [o + 0.06, 0.95], [o - 0.24, 0.95]],
          h,
        )
        ctx.fill()
      }
    },
  },
  {
    id: 'saw',
    label: 'SAW',
    category: 'sharp',
    paint: 'stroke',
    draw: (ctx, s, sw) => {
      const h = s / 2
      withMiter(ctx, () => {
        ctx.lineWidth = sw
        ctx.beginPath()
        ctx.moveTo(-h, h * 0.7)
        for (let i = 0; i < 3; i++) {
          const x0 = -h + (i * s) / 3
          ctx.lineTo(x0 + s / 6, -h * 0.7)
          ctx.lineTo(x0 + s / 3, h * 0.7)
        }
        ctx.stroke()
      })
    },
  },
  {
    id: 'crossSpike',
    label: 'CROSS SPIKE',
    category: 'sharp',
    paint: 'fill',
    draw: (ctx, s) => {
      starPath(ctx, 4, s / 2, s * 0.16)
      ctx.fill()
    },
  },
]

export const VIBE_SYMBOLS: SymbolDef[] = [...SOFT_SYMBOLS, ...SHARP_SYMBOLS]

export interface SymbolSet {
  id: string
  label: string
  /** One-line hint shown in the library UI. */
  hint: string
  ids: string[]
  /** Sensible stroke weight for the set, applied when it is loaded as a whole. */
  strokeWeight: number
  /** Subset switched on by the one-click apply, so the result reads immediately. */
  starter: string[]
}

export const SYMBOL_SETS: SymbolSet[] = [
  {
    id: 'soft',
    label: 'SOFT',
    hint: 'ROUND / ORGANIC',
    ids: SOFT_SYMBOLS.map((s) => s.id),
    strokeWeight: 0.2,
    starter: ['blob', 'donut', 'lozenge', 'bubbles'],
  },
  {
    id: 'sharp',
    label: 'SHARP',
    hint: 'ANGULAR / SPIKED',
    ids: SHARP_SYMBOLS.map((s) => s.id),
    strokeWeight: 0.12,
    starter: ['shard', 'wedge', 'starSpike', 'heavyChevron'],
  },
]
