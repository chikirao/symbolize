import type { EditorSettings } from '../types/editor'
import { rngAt } from './random'

export interface Cell {
  x: number // image-space centre
  y: number
  cw: number // sampling footprint
  ch: number
  col: number
  row: number
  index: number
}

/**
 * Builds sampling points across the whole image. Coordinates are in *image
 * space*, so the same settings produce the same composition at any output
 * resolution (preview or export).
 */
export function buildGrid(settings: EditorSettings, imageW: number, imageH: number): Cell[] {
  const g = settings.grid
  const cell = Math.max(1, g.cellSize)
  let stepX = Math.max(0.5, cell * Math.max(0.05, g.spacingX))
  let stepY = Math.max(0.5, cell * Math.max(0.05, g.spacingY))
  if (g.mode === 'hex') stepY *= 0.8660254

  const theta = (g.rotation * Math.PI) / 180
  const cos = Math.cos(theta)
  const sin = Math.sin(theta)
  const cx = imageW / 2
  const cy = imageH / 2

  // Cover the image even when the lattice is rotated.
  const radius = Math.sqrt(imageW * imageW + imageH * imageH) / 2
  const cols = Math.ceil((radius * 2) / stepX) + 2
  const rows = Math.ceil((radius * 2) / stepY) + 2
  const startCol = -Math.floor(cols / 2)
  const startRow = -Math.floor(rows / 2)

  const offX = g.offsetX * stepX
  const offY = g.offsetY * stepY
  const seed = settings.random.seed
  const jx = g.jitterX
  const jy = g.jitterY
  const margin = Math.max(stepX, stepY)

  const out: Cell[] = []
  let index = 0
  // Hard ceiling keeps a pathological cellSize from locking the tab up.
  const MAX_CELLS = 400000

  for (let r = 0; r < rows; r++) {
    const row = startRow + r
    for (let c = 0; c < cols; c++) {
      const col = startCol + c
      let lx = col * stepX + offX
      let ly = row * stepY + offY

      if (g.mode === 'staggered' || g.mode === 'hex') {
        if (((row % 2) + 2) % 2 === 1) lx += stepX * 0.5
      }

      if (jx > 0 || jy > 0 || g.mode === 'random') {
        const rnd = rngAt(seed ^ 0x51ed, col, row)
        const a = rnd()
        const b = rnd()
        if (g.mode === 'random') {
          lx += (a - 0.5) * stepX
          ly += (b - 0.5) * stepY
        } else {
          lx += (a - 0.5) * stepX * jx * 2
          ly += (b - 0.5) * stepY * jy * 2
        }
      }

      // rotate the lattice around the image centre
      const x = cx + lx * cos - ly * sin
      const y = cy + lx * sin + ly * cos

      if (x < -margin || y < -margin || x > imageW + margin || y > imageH + margin) continue

      out.push({ x, y, cw: stepX, ch: stepY, col, row, index: index++ })
      if (out.length >= MAX_CELLS) return out
    }
  }
  return out
}

export function estimateCellCount(settings: EditorSettings, w: number, h: number): number {
  const cell = Math.max(1, settings.grid.cellSize)
  const stepX = Math.max(0.5, cell * Math.max(0.05, settings.grid.spacingX))
  let stepY = Math.max(0.5, cell * Math.max(0.05, settings.grid.spacingY))
  if (settings.grid.mode === 'hex') stepY *= 0.8660254
  return Math.ceil(w / stepX) * Math.ceil(h / stepY)
}
