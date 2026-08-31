import type { CustomSymbolDef } from '../types/editor'

/**
 * Recolouring a custom PNG/SVG per element would mean a composite pass per
 * draw call. Instead we cache a tinted raster per (symbol, quantised colour).
 * Gradient colours come from a 256-entry LUT, so the cache stays small.
 */

const TINT_SIZE = 128
const MAX_ENTRIES = 512

const caches = new Map<string, Map<string, HTMLCanvasElement>>()

export function clearTintCache(id?: string): void {
  if (id) caches.delete(id)
  else caches.clear()
}

export function getTinted(def: CustomSymbolDef, color: string): CanvasImageSource | null {
  if (!def.image.complete || def.image.naturalWidth === 0) return null
  let cache = caches.get(def.id)
  if (!cache) {
    cache = new Map()
    caches.set(def.id, cache)
  }
  const hit = cache.get(color)
  if (hit) return hit

  if (cache.size > MAX_ENTRIES) cache.clear()

  const aspect = def.aspect || 1
  const w = aspect >= 1 ? TINT_SIZE : Math.max(1, Math.round(TINT_SIZE * aspect))
  const h = aspect >= 1 ? Math.max(1, Math.round(TINT_SIZE / aspect)) : TINT_SIZE

  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  ctx.clearRect(0, 0, w, h)
  ctx.drawImage(def.image, 0, 0, w, h)
  ctx.globalCompositeOperation = 'source-in'
  ctx.fillStyle = color
  ctx.fillRect(0, 0, w, h)
  ctx.globalCompositeOperation = 'source-over'

  cache.set(color, c)
  return c
}
