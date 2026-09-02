/**
 * Built-in symbol library. Every symbol is a Canvas drawing routine centred on
 * the origin and fitting a size x size box, so the same code path works for a
 * 4 px preview cell and a 400 px export cell. No Unicode glyphs: the output must
 * not depend on the user's installed fonts.
 *
 * This file holds the neutral core set; the three vibe sets (SOFT / SHARP /
 * Y2K) live in [symbolSets.ts](symbolSets.ts) and are concatenated in below.
 */

import { arrowHead, polygonPath, roundRectPath, type SymbolDef } from './symbolPrimitives'
import { SYMBOL_SETS, VIBE_SYMBOLS } from './symbolSets'

export type { SymbolCategory, SymbolDef } from './symbolPrimitives'
export { SYMBOL_SETS, type SymbolSet } from './symbolSets'

const CORE_SYMBOLS: SymbolDef[] = [
  {
    id: 'circle',
    label: 'CIRCLE',
    category: 'basic',
    paint: 'stroke',
    draw: (ctx, s, sw) => {
      const r = Math.max(sw * 0.5, s / 2 - sw / 2)
      ctx.lineWidth = sw
      ctx.beginPath()
      ctx.arc(0, 0, r, 0, Math.PI * 2)
      ctx.stroke()
    },
  },
  {
    id: 'dot',
    label: 'DOT FILLED',
    category: 'basic',
    paint: 'fill',
    draw: (ctx, s) => {
      ctx.beginPath()
      ctx.arc(0, 0, s / 2, 0, Math.PI * 2)
      ctx.fill()
    },
  },
  {
    id: 'square',
    label: 'SQUARE',
    category: 'basic',
    paint: 'stroke',
    draw: (ctx, s, sw) => {
      ctx.lineWidth = sw
      const h = Math.max(sw * 0.5, s / 2 - sw / 2)
      ctx.beginPath()
      ctx.rect(-h, -h, h * 2, h * 2)
      ctx.stroke()
    },
  },
  {
    id: 'squareFilled',
    label: 'SQUARE FILLED',
    category: 'basic',
    paint: 'fill',
    draw: (ctx, s) => {
      ctx.fillRect(-s / 2, -s / 2, s, s)
    },
  },
  {
    id: 'roundedSquare',
    label: 'ROUNDED SQUARE',
    category: 'basic',
    paint: 'fill',
    draw: (ctx, s) => {
      roundRectPath(ctx, -s / 2, -s / 2, s, s, s * 0.28)
      ctx.fill()
    },
  },
  {
    id: 'triangle',
    label: 'TRIANGLE',
    category: 'basic',
    paint: 'fill',
    draw: (ctx, s) => {
      const h = s / 2
      ctx.beginPath()
      ctx.moveTo(0, -h)
      ctx.lineTo(h * 0.9, h * 0.75)
      ctx.lineTo(-h * 0.9, h * 0.75)
      ctx.closePath()
      ctx.fill()
    },
  },
  {
    id: 'diamond',
    label: 'DIAMOND',
    category: 'basic',
    paint: 'fill',
    draw: (ctx, s) => {
      const h = s / 2
      ctx.beginPath()
      ctx.moveTo(0, -h)
      ctx.lineTo(h, 0)
      ctx.lineTo(0, h)
      ctx.lineTo(-h, 0)
      ctx.closePath()
      ctx.fill()
    },
  },
  {
    id: 'line',
    label: 'LINE',
    category: 'basic',
    paint: 'stroke',
    draw: (ctx, s, sw) => {
      ctx.lineWidth = sw
      ctx.beginPath()
      ctx.moveTo(-s / 2, 0)
      ctx.lineTo(s / 2, 0)
      ctx.stroke()
    },
  },

  {
    id: 'arrowRight',
    label: 'ARROW RIGHT',
    category: 'directional',
    paint: 'stroke',
    draw: (ctx, s, sw) => {
      ctx.lineWidth = sw
      const h = s / 2
      ctx.beginPath()
      ctx.moveTo(-h, 0)
      ctx.lineTo(h * 0.72, 0)
      ctx.stroke()
      arrowHead(ctx, h * 0.86, 0, 0, s * 0.34)
    },
  },
  {
    id: 'arrowUpRight',
    label: 'ARROW UP-RIGHT',
    category: 'directional',
    paint: 'stroke',
    draw: (ctx, s, sw) => {
      ctx.lineWidth = sw
      const h = s / 2
      ctx.beginPath()
      ctx.moveTo(-h * 0.82, h * 0.82)
      ctx.lineTo(h * 0.55, -h * 0.55)
      ctx.stroke()
      arrowHead(ctx, h * 0.78, -h * 0.78, -Math.PI / 4, s * 0.34)
    },
  },
  {
    id: 'chevron',
    label: 'CHEVRON',
    category: 'directional',
    paint: 'stroke',
    draw: (ctx, s, sw) => {
      ctx.lineWidth = sw
      const h = s / 2
      ctx.beginPath()
      ctx.moveTo(-h * 0.45, -h * 0.85)
      ctx.lineTo(h * 0.5, 0)
      ctx.lineTo(-h * 0.45, h * 0.85)
      ctx.stroke()
    },
  },
  {
    id: 'doubleChevron',
    label: 'DOUBLE CHEVRON',
    category: 'directional',
    paint: 'stroke',
    draw: (ctx, s, sw) => {
      ctx.lineWidth = sw
      const h = s / 2
      const offsets = [-h * 0.5, h * 0.28]
      for (let i = 0; i < offsets.length; i++) {
        const off = offsets[i]
        ctx.beginPath()
        ctx.moveTo(off - h * 0.05, -h * 0.75)
        ctx.lineTo(off + h * 0.6, 0)
        ctx.lineTo(off - h * 0.05, h * 0.75)
        ctx.stroke()
      }
    },
  },

  {
    id: 'cross',
    label: 'X CROSS',
    category: 'graphic',
    paint: 'stroke',
    draw: (ctx, s, sw) => {
      ctx.lineWidth = sw
      const h = Math.max(sw * 0.5, s / 2 - sw / 2)
      ctx.beginPath()
      ctx.moveTo(-h, -h)
      ctx.lineTo(h, h)
      ctx.moveTo(h, -h)
      ctx.lineTo(-h, h)
      ctx.stroke()
    },
  },
  {
    id: 'plus',
    label: 'PLUS',
    category: 'graphic',
    paint: 'stroke',
    draw: (ctx, s, sw) => {
      ctx.lineWidth = sw
      const h = s / 2
      ctx.beginPath()
      ctx.moveTo(-h, 0)
      ctx.lineTo(h, 0)
      ctx.moveTo(0, -h)
      ctx.lineTo(0, h)
      ctx.stroke()
    },
  },
  {
    id: 'ring',
    label: 'RING',
    category: 'graphic',
    paint: 'stroke',
    draw: (ctx, s) => {
      const w = Math.max(s * 0.2, 0.35)
      ctx.lineWidth = w
      ctx.beginPath()
      ctx.arc(0, 0, Math.max(w * 0.5, s / 2 - w / 2), 0, Math.PI * 2)
      ctx.stroke()
    },
  },
  {
    id: 'crosshair',
    label: 'CROSSHAIR',
    category: 'graphic',
    paint: 'stroke',
    draw: (ctx, s, sw) => {
      ctx.lineWidth = sw
      const h = s / 2
      const r = h * 0.52
      ctx.beginPath()
      ctx.arc(0, 0, r, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(-h, 0)
      ctx.lineTo(-r * 0.75, 0)
      ctx.moveTo(r * 0.75, 0)
      ctx.lineTo(h, 0)
      ctx.moveTo(0, -h)
      ctx.lineTo(0, -r * 0.75)
      ctx.moveTo(0, r * 0.75)
      ctx.lineTo(0, h)
      ctx.stroke()
    },
  },
  {
    id: 'fourDots',
    label: 'FOUR DOTS',
    category: 'graphic',
    paint: 'fill',
    draw: (ctx, s) => {
      const o = s * 0.26
      const r = s * 0.15
      const pts = [
        [-o, -o],
        [o, -o],
        [-o, o],
        [o, o],
      ]
      for (let i = 0; i < pts.length; i++) {
        ctx.beginPath()
        ctx.arc(pts[i][0], pts[i][1], r, 0, Math.PI * 2)
        ctx.fill()
      }
    },
  },
  {
    id: 'checker',
    label: 'CHECKER',
    category: 'graphic',
    paint: 'fill',
    draw: (ctx, s) => {
      const q = s / 2
      ctx.fillRect(-q, -q, q, q)
      ctx.fillRect(0, 0, q, q)
    },
  },
  {
    id: 'star',
    label: 'STAR',
    category: 'graphic',
    paint: 'fill',
    draw: (ctx, s) => {
      const R = s / 2
      const r = R * 0.44
      ctx.beginPath()
      for (let i = 0; i < 10; i++) {
        const rad = i % 2 === 0 ? R : r
        const a = -Math.PI / 2 + (i * Math.PI) / 5
        const x = Math.cos(a) * rad
        const y = Math.sin(a) * rad
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.closePath()
      ctx.fill()
    },
  },
  {
    id: 'slash',
    label: 'SLASH',
    category: 'graphic',
    paint: 'stroke',
    draw: (ctx, s, sw) => {
      ctx.lineWidth = sw
      const h = s / 2
      ctx.beginPath()
      ctx.moveTo(-h * 0.7, h)
      ctx.lineTo(h * 0.7, -h)
      ctx.stroke()
    },
  },
  {
    id: 'brackets',
    label: 'BRACKETS',
    category: 'graphic',
    paint: 'stroke',
    draw: (ctx, s, sw) => {
      ctx.lineWidth = sw
      const h = s / 2
      const w = h * 0.42
      ctx.beginPath()
      ctx.moveTo(-h * 0.3, -h)
      ctx.lineTo(-h * 0.3 - w, -h)
      ctx.lineTo(-h * 0.3 - w, h)
      ctx.lineTo(-h * 0.3, h)
      ctx.moveTo(h * 0.3, -h)
      ctx.lineTo(h * 0.3 + w, -h)
      ctx.lineTo(h * 0.3 + w, h)
      ctx.lineTo(h * 0.3, h)
      ctx.stroke()
    },
  },

  /* ---- extra basics ---- */
  {
    id: 'hexagon',
    label: 'HEXAGON',
    category: 'basic',
    paint: 'fill',
    draw: (ctx, s) => {
      polygonPath(ctx, 6, s / 2, -Math.PI / 2)
      ctx.fill()
    },
  },
  {
    id: 'hexagonOutline',
    label: 'HEXAGON OUTLINE',
    category: 'basic',
    paint: 'stroke',
    draw: (ctx, s, sw) => {
      ctx.lineWidth = sw
      polygonPath(ctx, 6, Math.max(sw, s / 2 - sw / 2), -Math.PI / 2)
      ctx.stroke()
    },
  },
  {
    id: 'pentagon',
    label: 'PENTAGON',
    category: 'basic',
    paint: 'fill',
    draw: (ctx, s) => {
      polygonPath(ctx, 5, s / 2, -Math.PI / 2)
      ctx.fill()
    },
  },
  {
    id: 'capsule',
    label: 'CAPSULE',
    category: 'basic',
    paint: 'fill',
    draw: (ctx, s) => {
      const h = s * 0.36
      roundRectPath(ctx, -s / 2, -h / 2, s, h, h / 2)
      ctx.fill()
    },
  },
  {
    id: 'halfCircle',
    label: 'HALF CIRCLE',
    category: 'basic',
    paint: 'fill',
    draw: (ctx, s) => {
      ctx.beginPath()
      ctx.arc(0, s * 0.14, s / 2, Math.PI, Math.PI * 2)
      ctx.closePath()
      ctx.fill()
    },
  },
  {
    id: 'triangleOutline',
    label: 'TRIANGLE OUTLINE',
    category: 'basic',
    paint: 'stroke',
    draw: (ctx, s, sw) => {
      ctx.lineWidth = sw
      const h = Math.max(sw, s / 2 - sw / 2)
      ctx.beginPath()
      ctx.moveTo(0, -h)
      ctx.lineTo(h * 0.9, h * 0.75)
      ctx.lineTo(-h * 0.9, h * 0.75)
      ctx.closePath()
      ctx.stroke()
    },
  },
  {
    id: 'diamondOutline',
    label: 'DIAMOND OUTLINE',
    category: 'basic',
    paint: 'stroke',
    draw: (ctx, s, sw) => {
      ctx.lineWidth = sw
      const h = Math.max(sw, s / 2 - sw / 2)
      ctx.beginPath()
      ctx.moveTo(0, -h)
      ctx.lineTo(h, 0)
      ctx.lineTo(0, h)
      ctx.lineTo(-h, 0)
      ctx.closePath()
      ctx.stroke()
    },
  },

  /* ---- extra directional ---- */
  {
    id: 'caret',
    label: 'CARET',
    category: 'directional',
    paint: 'fill',
    draw: (ctx, s) => {
      const h = s / 2
      ctx.beginPath()
      ctx.moveTo(h, 0)
      ctx.lineTo(-h * 0.65, -h * 0.9)
      ctx.lineTo(-h * 0.65, h * 0.9)
      ctx.closePath()
      ctx.fill()
    },
  },
  {
    id: 'arrowBlock',
    label: 'ARROW BLOCK',
    category: 'directional',
    paint: 'fill',
    draw: (ctx, s) => {
      const h = s / 2
      const t = s * 0.17
      ctx.beginPath()
      ctx.moveTo(h, 0)
      ctx.lineTo(h * 0.15, -h * 0.72)
      ctx.lineTo(h * 0.15, -t)
      ctx.lineTo(-h, -t)
      ctx.lineTo(-h, t)
      ctx.lineTo(h * 0.15, t)
      ctx.lineTo(h * 0.15, h * 0.72)
      ctx.closePath()
      ctx.fill()
    },
  },
  {
    id: 'arrowDouble',
    label: 'ARROW DOUBLE',
    category: 'directional',
    paint: 'stroke',
    draw: (ctx, s, sw) => {
      ctx.lineWidth = sw
      const h = s / 2
      ctx.beginPath()
      ctx.moveTo(-h * 0.7, 0)
      ctx.lineTo(h * 0.7, 0)
      ctx.stroke()
      arrowHead(ctx, h * 0.86, 0, 0, s * 0.3)
      arrowHead(ctx, -h * 0.86, 0, Math.PI, s * 0.3)
    },
  },
  {
    id: 'tick',
    label: 'TICK',
    category: 'directional',
    paint: 'stroke',
    draw: (ctx, s, sw) => {
      ctx.lineWidth = sw
      const h = s / 2
      ctx.beginPath()
      ctx.moveTo(-h * 0.9, 0)
      ctx.lineTo(-h * 0.2, h * 0.7)
      ctx.lineTo(h * 0.9, -h * 0.75)
      ctx.stroke()
    },
  },
  {
    id: 'zigzag',
    label: 'ZIGZAG',
    category: 'directional',
    paint: 'stroke',
    draw: (ctx, s, sw) => {
      ctx.lineWidth = sw
      const h = s / 2
      ctx.beginPath()
      ctx.moveTo(-h, h * 0.5)
      ctx.lineTo(-h / 3, -h * 0.5)
      ctx.lineTo(h / 3, h * 0.5)
      ctx.lineTo(h, -h * 0.5)
      ctx.stroke()
    },
  },

  /* ---- extra graphic ---- */
  {
    id: 'asterisk',
    label: 'ASTERISK',
    category: 'graphic',
    paint: 'stroke',
    draw: (ctx, s, sw) => {
      ctx.lineWidth = sw
      const h = s / 2
      ctx.beginPath()
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI) / 3
        ctx.moveTo(-Math.cos(a) * h, -Math.sin(a) * h)
        ctx.lineTo(Math.cos(a) * h, Math.sin(a) * h)
      }
      ctx.stroke()
    },
  },
  {
    id: 'burst',
    label: 'BURST',
    category: 'graphic',
    paint: 'stroke',
    draw: (ctx, s, sw) => {
      ctx.lineWidth = sw
      const h = s / 2
      ctx.beginPath()
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4
        ctx.moveTo(Math.cos(a) * h * 0.42, Math.sin(a) * h * 0.42)
        ctx.lineTo(Math.cos(a) * h, Math.sin(a) * h)
      }
      ctx.stroke()
    },
  },
  {
    id: 'target',
    label: 'TARGET',
    category: 'graphic',
    paint: 'stroke',
    draw: (ctx, s, sw) => {
      ctx.lineWidth = sw
      const h = s / 2
      ctx.beginPath()
      ctx.arc(0, 0, Math.max(sw, h - sw / 2), 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(0, 0, Math.max(sw * 0.5, h * 0.5), 0, Math.PI * 2)
      ctx.stroke()
      ctx.lineWidth = Math.max(sw, h * 0.3)
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(0.01, 0)
      ctx.stroke()
    },
  },
  {
    id: 'hatch',
    label: 'HATCH',
    category: 'graphic',
    paint: 'stroke',
    draw: (ctx, s, sw) => {
      ctx.lineWidth = sw
      const h = s / 2
      ctx.beginPath()
      for (let i = -1; i <= 1; i++) {
        const o = i * s * 0.32
        ctx.moveTo(-h + o * 0.5, h)
        ctx.lineTo(h + o * 0.5, -h)
      }
      ctx.stroke()
    },
  },
  {
    id: 'dotGrid',
    label: 'DOT GRID',
    category: 'graphic',
    paint: 'fill',
    draw: (ctx, s) => {
      const o = s * 0.33
      const r = s * 0.09
      for (let j = -1; j <= 1; j++) {
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath()
          ctx.arc(i * o, j * o, r, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    },
  },
  {
    id: 'cornerMarks',
    label: 'CORNER MARKS',
    category: 'graphic',
    paint: 'stroke',
    draw: (ctx, s, sw) => {
      ctx.lineWidth = sw
      const h = s / 2
      const a = s * 0.3
      ctx.beginPath()
      ctx.moveTo(-h, -h + a)
      ctx.lineTo(-h, -h)
      ctx.lineTo(-h + a, -h)
      ctx.moveTo(h - a, -h)
      ctx.lineTo(h, -h)
      ctx.lineTo(h, -h + a)
      ctx.moveTo(h, h - a)
      ctx.lineTo(h, h)
      ctx.lineTo(h - a, h)
      ctx.moveTo(-h + a, h)
      ctx.lineTo(-h, h)
      ctx.lineTo(-h, h - a)
      ctx.stroke()
    },
  },
  {
    id: 'wave',
    label: 'WAVE',
    category: 'graphic',
    paint: 'stroke',
    draw: (ctx, s, sw) => {
      ctx.lineWidth = sw
      const h = s / 2
      ctx.beginPath()
      ctx.moveTo(-h, 0)
      ctx.quadraticCurveTo(-h * 0.5, -h * 0.9, 0, 0)
      ctx.quadraticCurveTo(h * 0.5, h * 0.9, h, 0)
      ctx.stroke()
    },
  },
  {
    id: 'dashes',
    label: 'DASHES',
    category: 'graphic',
    paint: 'stroke',
    draw: (ctx, s, sw) => {
      ctx.lineWidth = sw
      const h = s / 2
      ctx.beginPath()
      for (let i = -1; i <= 1; i++) {
        ctx.moveTo(-h, i * s * 0.32)
        ctx.lineTo(h, i * s * 0.32)
      }
      ctx.stroke()
    },
  },
  {
    id: 'squareDot',
    label: 'SQUARE + DOT',
    category: 'graphic',
    paint: 'stroke',
    draw: (ctx, s, sw) => {
      ctx.lineWidth = sw
      const h = Math.max(sw, s / 2 - sw / 2)
      ctx.beginPath()
      ctx.rect(-h, -h, h * 2, h * 2)
      ctx.stroke()
      ctx.lineWidth = Math.max(sw, s * 0.24)
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(0.01, 0)
      ctx.stroke()
    },
  },
]

export const BUILTIN_SYMBOLS: SymbolDef[] = [...CORE_SYMBOLS, ...VIBE_SYMBOLS]

export const SYMBOL_MAP: Record<string, SymbolDef> = Object.fromEntries(
  BUILTIN_SYMBOLS.map((s) => [s.id, s]),
)

export const ALL_SYMBOL_IDS: string[] = BUILTIN_SYMBOLS.map((s) => s.id)

/** Ids that belong to a vibe set, in set order — used for grouping in the UI. */
export const SET_SYMBOL_IDS: string[] = SYMBOL_SETS.flatMap((s) => s.ids)
