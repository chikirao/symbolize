/**
 * Shared types and path helpers for the built-in symbol library.
 *
 * Lives in its own module so the core set ([symbols.ts](symbols.ts)) and the
 * vibe sets ([symbolSets.ts](symbolSets.ts)) can reuse the same geometry
 * helpers without importing each other in a cycle.
 */

export type SymbolCategory = 'basic' | 'directional' | 'graphic' | 'soft' | 'sharp' | 'y2k'

export interface SymbolDef {
  id: string
  label: string
  category: SymbolCategory
  /** Which canvas style the routine uses, so the renderer only sets that one. */
  paint: 'fill' | 'stroke'
  draw: (ctx: CanvasRenderingContext2D, s: number, sw: number) => void
}

export function roundRectPath(
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

export function polygonPath(
  ctx: CanvasRenderingContext2D,
  sides: number,
  r: number,
  rot: number,
) {
  ctx.beginPath()
  for (let i = 0; i < sides; i++) {
    const a = rot + (i * Math.PI * 2) / sides
    const x = Math.cos(a) * r
    const y = Math.sin(a) * r
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
}

export function arrowHead(
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

/** Fill a closed polygon from a flat list of [x, y] pairs scaled by `s / 2`. */
export function polyPath(ctx: CanvasRenderingContext2D, pts: number[][], h: number) {
  ctx.beginPath()
  for (let i = 0; i < pts.length; i++) {
    const x = pts[i][0] * h
    const y = pts[i][1] * h
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
}
