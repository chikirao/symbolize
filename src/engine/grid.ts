import type { EditorSettings, SourceMaps } from '../types/editor'
import { rngAt } from './random'

export interface Cell {
  x: number // image-space centre
  y: number
  cw: number // sampling footprint
  ch: number
  /** size basis for the symbol drawn here — the cell's own edge in adaptive mode */
  unit: number
  col: number
  row: number
  index: number
}

/** Hard ceiling so a pathological cell size cannot lock the tab up. */
const MAX_CELLS = 400000

/**
 * The lattice depends on the grid settings, the seed and the image size — not
 * on the pixels. Playing a 200-frame video would otherwise rebuild an identical
 * lattice 200 times, which is the single most wasteful thing an animated source
 * can do. Adaptive grids *do* read the pixels, so those are additionally keyed
 * on the exact `SourceMaps` object.
 *
 * Callers treat the result as read-only; nothing in the pipeline mutates cells.
 */
let gridCache: { key: string; maps: SourceMaps | null; cells: Cell[] } | null = null

function gridKey(settings: EditorSettings, maps: SourceMaps): string {
  const g = settings.grid
  return [
    g.mode,
    g.cellSize,
    g.spacingX,
    g.spacingY,
    g.offsetX,
    g.offsetY,
    g.rotation,
    g.jitterX,
    g.jitterY,
    g.minCellSize,
    g.detail,
    g.maxDepth,
    settings.random.seed,
    maps.imageWidth,
    maps.imageHeight,
  ].join('|')
}

export function invalidateGridCache(): void {
  gridCache = null
}

/**
 * Builds sampling points across the whole image. Coordinates are in *image
 * space*, so the same settings produce the same composition at any output
 * resolution (preview or export).
 */
export function buildGrid(settings: EditorSettings, maps: SourceMaps): Cell[] {
  const adaptive = settings.grid.mode === 'adaptive'
  const key = gridKey(settings, maps)
  if (gridCache && gridCache.key === key && (!adaptive || gridCache.maps === maps)) {
    return gridCache.cells
  }
  const cells = adaptive
    ? buildAdaptiveGrid(settings, maps)
    : buildLatticeGrid(settings, maps.imageWidth, maps.imageHeight)
  gridCache = { key, maps: adaptive ? maps : null, cells }
  return cells
}

function buildLatticeGrid(settings: EditorSettings, imageW: number, imageH: number): Cell[] {
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

      out.push({ x, y, cw: stepX, ch: stepY, unit: cell, col, row, index: index++ })
      if (out.length >= MAX_CELLS) return out
    }
  }
  return out
}

/* ------------------------------------------------------------------ */
/* adaptive quadtree                                                   */
/* ------------------------------------------------------------------ */

/**
 * Local contrast inside a square, from a stratified set of taps: the widest
 * spread of luminance, alpha or any colour channel. Flat areas score near 0,
 * areas holding an edge or a colour change score high.
 */
function measureDetail(maps: SourceMaps, cx: number, cy: number, size: number): number {
  const s = maps.scale
  const w = maps.width
  const h = maps.height
  const f = size * s
  const k = Math.max(2, Math.min(4, Math.round(f / 2)))

  let lumMin = 1
  let lumMax = 0
  let alphaMin = 1
  let alphaMax = 0
  let rMin = 255
  let rMax = 0
  let gMin = 255
  let gMax = 0
  let bMin = 255
  let bMax = 0

  const ax = cx * s
  const ay = cy * s

  for (let j = 0; j < k; j++) {
    const py = Math.min(h - 1, Math.max(0, Math.round(ay + ((j + 0.5) / k - 0.5) * f)))
    for (let i = 0; i < k; i++) {
      const px = Math.min(w - 1, Math.max(0, Math.round(ax + ((i + 0.5) / k - 0.5) * f)))
      const idx = py * w + px
      const l = maps.lum[idx]
      const a = maps.alpha[idx]
      if (l < lumMin) lumMin = l
      if (l > lumMax) lumMax = l
      if (a < alphaMin) alphaMin = a
      if (a > alphaMax) alphaMax = a
      const p = idx * 3
      const r = maps.rgb[p]
      const g = maps.rgb[p + 1]
      const b = maps.rgb[p + 2]
      if (r < rMin) rMin = r
      if (r > rMax) rMax = r
      if (g < gMin) gMin = g
      if (g > gMax) gMax = g
      if (b < bMin) bMin = b
      if (b > bMax) bMax = b
    }
  }

  // fully transparent squares hold nothing worth subdividing
  if (alphaMax <= 0.004) return -1

  const colour = Math.max(rMax - rMin, gMax - gMin, bMax - bMin) / 255
  return Math.max(lumMax - lumMin, alphaMax - alphaMin, colour)
}

/**
 * Splits the image into a quadtree: flat regions stay one large cell and get
 * one large symbol, busy regions keep subdividing down to minCellSize and fill
 * with many small ones. This is what makes detail read at small scales while
 * open areas stay graphic.
 */
function buildAdaptiveGrid(settings: EditorSettings, maps: SourceMaps): Cell[] {
  const g = settings.grid
  const imageW = maps.imageWidth
  const imageH = maps.imageHeight
  const root = Math.max(2, g.cellSize)
  const minCell = Math.max(1, Math.min(root, g.minCellSize))
  const maxDepth = Math.max(0, Math.min(7, Math.round(g.maxDepth)))
  const threshold = Math.max(0.001, g.detail)

  const theta = (g.rotation * Math.PI) / 180
  const cos = Math.cos(theta)
  const sin = Math.sin(theta)
  const centreX = imageW / 2
  const centreY = imageH / 2
  const rotate = g.rotation !== 0

  const offX = g.offsetX * root
  const offY = g.offsetY * root
  const seed = settings.random.seed
  const jx = g.jitterX
  const jy = g.jitterY
  const quant = Math.max(0.5, minCell / 2)

  const out: Cell[] = []
  let index = 0

  const emit = (lx: number, ly: number, size: number) => {
    let px = lx
    let py = ly
    if (jx > 0 || jy > 0) {
      const rnd = rngAt(seed ^ 0x51ed, Math.round(lx / quant), Math.round(ly / quant))
      px += (rnd() - 0.5) * size * jx
      py += (rnd() - 0.5) * size * jy
    }
    let x = px
    let y = py
    if (rotate) {
      const dx = px - centreX
      const dy = py - centreY
      x = centreX + dx * cos - dy * sin
      y = centreY + dx * sin + dy * cos
    }
    out.push({
      x,
      y,
      cw: size,
      ch: size,
      unit: size,
      col: Math.round(lx / quant),
      row: Math.round(ly / quant),
      index: index++,
    })
  }

  const visit = (lx: number, ly: number, size: number, depth: number) => {
    if (out.length >= MAX_CELLS) return
    const canSplit = depth < maxDepth && size / 2 >= minCell
    if (canSplit) {
      const d = measureDetail(maps, lx, ly, size)
      if (d > threshold) {
        const q = size / 4
        const half = size / 2
        visit(lx - q, ly - q, half, depth + 1)
        visit(lx + q, ly - q, half, depth + 1)
        visit(lx - q, ly + q, half, depth + 1)
        visit(lx + q, ly + q, half, depth + 1)
        return
      }
    }
    emit(lx, ly, size)
  }

  const radius = rotate ? Math.sqrt(imageW * imageW + imageH * imageH) / 2 : 0
  const startX = rotate ? centreX - radius : 0
  const endX = rotate ? centreX + radius : imageW
  const startY = rotate ? centreY - radius : 0
  const endY = rotate ? centreY + radius : imageH

  for (let y = startY + offY; y < endY + root; y += root) {
    for (let x = startX + offX; x < endX + root; x += root) {
      visit(x + root / 2, y + root / 2, root, 0)
      if (out.length >= MAX_CELLS) return out
    }
  }
  return out
}

export function estimateCellCount(settings: EditorSettings, w: number, h: number): number {
  const g = settings.grid
  const cell = Math.max(1, g.cellSize)
  if (g.mode === 'adaptive') {
    // somewhere between the coarse and the finest grid; geometric mean is a
    // good enough guess for choosing the sync vs chunked renderer
    const avg = Math.max(1, Math.sqrt(cell * Math.max(1, Math.min(cell, g.minCellSize))))
    return Math.ceil(w / avg) * Math.ceil(h / avg)
  }
  const stepX = Math.max(0.5, cell * Math.max(0.05, g.spacingX))
  let stepY = Math.max(0.5, cell * Math.max(0.05, g.spacingY))
  if (g.mode === 'hex') stepY *= 0.8660254
  return Math.ceil(w / stepX) * Math.ceil(h / stepY)
}
