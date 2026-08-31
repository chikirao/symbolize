/**
 * Built-in symbol library. Every symbol is a Canvas drawing routine centred on
 * the origin and fitting a size x size box, so the same code path works for a
 * 4 px preview cell and a 400 px export cell. No Unicode glyphs: the output must
 * not depend on the user's installed fonts.
 */

export type SymbolCategory = 'basic' | 'directional' | 'graphic'

export interface SymbolDef {
  id: string
  label: string
  category: SymbolCategory
  /** Which canvas style the routine uses, so the renderer only sets that one. */
  paint: 'fill' | 'stroke'
  draw: (ctx: CanvasRenderingContext2D, s: number, sw: number) => void
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.lineTo(x + w - rr, y)
  ctx.arcTo(x + w, y, x + w, y + rr, rr)
  ctx.lineTo(x + w, y + h - rr)
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr)
  ctx.lineTo(x + rr, y + h)
  ctx.arcTo(x, y + h, x, y + h - rr, rr)
  ctx.lineTo(x, y + rr)
  ctx.arcTo(x, y, x + rr, y, rr)
  ctx.closePath()
}

function arrowHead(
  ctx: CanvasRenderingContext2D,
  tipX: number,
  tipY: number,
  ang: number,
  len: number,
) {
  const a1 = ang + Math.PI * 0.78
  const a2 = ang - Math.PI * 0.78
  ctx.beginPath()
  ctx.moveTo(tipX + Math.cos(a1) * len, tipY + Math.sin(a1) * len)
  ctx.lineTo(tipX, tipY)
  ctx.lineTo(tipX + Math.cos(a2) * len, tipY + Math.sin(a2) * len)
  ctx.stroke()
}

export const BUILTIN_SYMBOLS: SymbolDef[] = [
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
]

export const SYMBOL_MAP: Record<string, SymbolDef> = Object.fromEntries(
  BUILTIN_SYMBOLS.map((s) => [s.id, s]),
)

export const ALL_SYMBOL_IDS: string[] = BUILTIN_SYMBOLS.map((s) => s.id)
