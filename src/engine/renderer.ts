import type {
  BlendMode,
  CustomSymbolDef,
  EditorSettings,
  RenderStats,
  SourceMaps,
  TextSymbolDef,
} from '../types/editor'
import { buildGrid, type Cell } from './grid'
import { sampleCell, sampleEdge } from './sampling'
import { buildEdgeMap, gradientAngleAt } from './edges'
import { rngAt, valueNoise } from './random'
import { applyAdjust, buildGradientLUT, hexToRgb, LUT_SIZE } from './gradients'
import { SYMBOL_MAP, type SymbolDef } from './symbols'
import { getTinted } from './tint'
import { drawTextSymbol } from './textSymbols'

/* ------------------------------------------------------------------ */
/* small helpers                                                       */
/* ------------------------------------------------------------------ */

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x >= edge1 ? 1 : 0
  const t = clamp01((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

const BLEND_MAP: Record<BlendMode, GlobalCompositeOperation> = {
  normal: 'source-over',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
  lighten: 'lighten',
  darken: 'darken',
}

/* ------------------------------------------------------------------ */
/* source level pipeline                                               */
/* ------------------------------------------------------------------ */

export function applyLevels(v: number, s: EditorSettings['source']): number {
  const bp = s.blackPoint
  const wp = s.whitePoint
  let x = wp > bp ? (v - bp) / (wp - bp) : v >= wp ? 1 : 0
  x = clamp01(x)
  x += s.brightness
  const c = Math.max(-0.98, Math.min(0.98, s.contrast))
  const f = Math.tan(((c + 1) * Math.PI) / 4)
  x = (x - 0.5) * f + 0.5
  x = clamp01(x)
  const g = Math.max(0.05, s.gamma)
  if (g !== 1) x = Math.pow(x, 1 / g)
  if (s.invert) x = 1 - x
  return clamp01(x)
}

function sourceValue(lum: number, alpha: number, mode: EditorSettings['source']['mode']): number {
  if (mode === 'alpha') return alpha
  if (mode === 'combined') return lum * alpha
  return lum
}

function maskValue(lum: number, alpha: number, source: EditorSettings['mask']['source']): number {
  if (source === 'luminance') return lum
  if (source === 'combined') return lum * alpha
  return alpha
}

/* ------------------------------------------------------------------ */
/* symbol pool                                                         */
/* ------------------------------------------------------------------ */

export interface ResolvedSymbol {
  id: string
  builtin: SymbolDef | null
  custom: CustomSymbolDef | null
  text: TextSymbolDef | null
  weight: number
}

export function resolvePool(
  settings: EditorSettings,
  customSymbols: CustomSymbolDef[],
  textSymbols: TextSymbolDef[] = [],
): ResolvedSymbol[] {
  const customMap = new Map(customSymbols.map((c) => [c.id, c]))
  const textMap = new Map(textSymbols.map((t) => [t.id, t]))
  const pool: ResolvedSymbol[] = []
  for (const id of settings.symbols.pool) {
    if (!settings.symbols.enabled[id]) continue
    const w = settings.symbols.weights[id]
    const weight = w === undefined ? 1 : Math.max(0, w)
    if (weight <= 0) continue
    const builtin = SYMBOL_MAP[id] || null
    const custom = customMap.get(id) || null
    const text = textMap.get(id) || null
    if (!builtin && !custom && !text) continue
    pool.push({ id, builtin, custom, text, weight })
  }
  if (pool.length === 0) {
    const fallback = SYMBOL_MAP['dot']
    pool.push({ id: 'dot', builtin: fallback, custom: null, text: null, weight: 1 })
  }
  return pool
}

function pickWeighted(pool: ResolvedSymbol[], r: number): number {
  let total = 0
  for (let i = 0; i < pool.length; i++) total += pool[i].weight
  if (total <= 0) return 0
  let acc = r * total
  for (let i = 0; i < pool.length; i++) {
    acc -= pool[i].weight
    if (acc <= 0) return i
  }
  return pool.length - 1
}

/* ------------------------------------------------------------------ */
/* element buffer (structure of arrays)                                */
/* ------------------------------------------------------------------ */

export interface ElementBuffer {
  count: number
  x: Float32Array
  y: Float32Array
  size: Float32Array
  rot: Float32Array
  a: Float32Array
  r: Uint8Array
  g: Uint8Array
  b: Uint8Array
  sym: Uint16Array
}

function allocBuffer(n: number): ElementBuffer {
  return {
    count: 0,
    x: new Float32Array(n),
    y: new Float32Array(n),
    size: new Float32Array(n),
    rot: new Float32Array(n),
    a: new Float32Array(n),
    r: new Uint8Array(n),
    g: new Uint8Array(n),
    b: new Uint8Array(n),
    sym: new Uint16Array(n),
  }
}

/* ------------------------------------------------------------------ */
/* per-cell property calculation                                       */
/* ------------------------------------------------------------------ */

export function calculateElements(
  maps: SourceMaps,
  settings: EditorSettings,
  cells: Cell[],
  pool: ResolvedSymbol[],
): ElementBuffer {
  const buf = allocBuffer(cells.length)
  const imgW = maps.imageWidth
  const imgH = maps.imageHeight
  const seed = settings.random.seed

  const adj = {
    hueShift: settings.color.hueShift,
    saturation: settings.color.saturation,
    brightness: settings.color.brightness,
  }
  const lut = buildGradientLUT(settings.color.stops, settings.color.reverse, adj)
  const solid = hexToRgb(settings.color.solid)
  const solidAdj: [number, number, number] = [0, 0, 0]
  applyAdjust(solid[0], solid[1], solid[2], adj, solidAdj)
  const tmpColor: [number, number, number] = [0, 0, 0]

  const edgeMap = settings.edges.enabled ? buildEdgeMap(maps) : null
  const cellSize = Math.max(1, settings.grid.cellSize)

  const cxCentre = imgW / 2
  const cyCentre = imgH / 2
  const maxRadius = Math.sqrt(cxCentre * cxCentre + cyCentre * cyCentre) || 1

  const density = settings.density.value / 100
  const sz = settings.size
  const rt = settings.rotation
  const op = settings.opacity
  const th = settings.threshold
  const mk = settings.mask
  const ed = settings.edges
  const colorJitter = settings.color.jitter
  const poolLen = pool.length
  const noiseScale = Math.max(0.0005, settings.symbols.noiseScale)

  let n = 0

  for (let ci = 0; ci < cells.length; ci++) {
    const cell = cells[ci]

    // fixed random draw order so toggling a feature does not reshuffle the rest
    const rnd = rngAt(seed, cell.col, cell.row)
    const rDensity = rnd()
    const rSymbol = rnd()
    const rSize = rnd()
    const rRot = rnd()
    const rOpacity = rnd()
    const rColR = rnd()
    const rColG = rnd()
    const rColB = rnd()

    const sample = sampleCell(maps, cell.x, cell.y, cell.cw, cell.ch)
    const rawLum = sample.lum
    const rawAlpha = sample.alpha
    const sr = sample.r
    const sg = sample.g
    const sb = sample.b

    // ---- mask -------------------------------------------------------
    let maskF = 1
    if (mk.enabled) {
      const mv = maskValue(rawLum, rawAlpha, mk.source)
      maskF =
        mk.feather <= 0.0005
          ? mv >= mk.threshold
            ? 1
            : 0
          : smoothstep(mk.threshold - mk.feather, mk.threshold + mk.feather, mv)
      if (mk.invert) maskF = 1 - maskF
      if (maskF <= 0.001) continue
    } else if (rawAlpha <= 0.004) {
      // fully transparent source pixels never produce symbols
      continue
    }

    // ---- levels -----------------------------------------------------
    const v = applyLevels(sourceValue(rawLum, rawAlpha, settings.source.mode), settings.source)

    // ---- threshold --------------------------------------------------
    let thF: number
    if (th.soft <= 0.0005) {
      thF = v >= th.min && v <= th.max ? 1 : 0
    } else {
      const lo = smoothstep(th.min - th.soft, th.min + th.soft, v)
      const hi = 1 - smoothstep(th.max - th.soft, th.max + th.soft, v)
      thF = Math.min(lo, hi)
    }
    if (th.invert) thF = 1 - thF
    if (thF <= 0.002) continue

    // ---- edges ------------------------------------------------------
    let edgeF = 0
    if (edgeMap) {
      let e = sampleEdge(maps, edgeMap, cell.x, cell.y, ed.thickness)
      e = clamp01(Math.pow(e, Math.max(0.1, ed.contrast)))
      if (ed.mode === 'edges' && e < ed.threshold) continue
      if (ed.mode === 'inside' && e >= ed.threshold) continue
      edgeF = clamp01((e - ed.threshold) / Math.max(0.001, 1 - ed.threshold))
    }

    // ---- density ----------------------------------------------------
    let p = density
    if (settings.density.mode === 'dark') p *= 1 - v
    else if (settings.density.mode === 'light') p *= v
    if (edgeMap && ed.mode !== 'inside') p *= 1 + edgeF * ed.boost
    if (p < 1 && rDensity > p) continue

    // ---- symbol -----------------------------------------------------
    let symIndex = 0
    if (poolLen > 1) {
      switch (settings.symbols.selectMode) {
        case 'luminance': {
          symIndex = Math.min(poolLen - 1, Math.floor(v * poolLen))
          break
        }
        case 'sequential': {
          symIndex = ((cell.col + cell.row) % poolLen + poolLen) % poolLen
          break
        }
        case 'noise': {
          const nz = valueNoise(seed ^ 0x2f1b, cell.x * noiseScale, cell.y * noiseScale)
          symIndex = pickWeighted(pool, clamp01(nz))
          break
        }
        default:
          symIndex = pickWeighted(pool, rSymbol)
      }
    }

    // ---- size -------------------------------------------------------
    let sf: number
    if (sz.mode === 'constant') sf = 1
    else if (sz.mode === 'dark-large') sf = Math.pow(1 - v, Math.max(0.05, sz.gamma))
    else sf = Math.pow(v, Math.max(0.05, sz.gamma))
    let size = lerp(sz.min, sz.max, sf) * cell.unit
    if (sz.jitter > 0) size *= 1 + (rSize - 0.5) * 2 * sz.jitter
    if (th.soft > 0.0005) size *= lerp(0.45, 1, thF)
    if (mk.enabled && mk.feather > 0.0005) size *= lerp(0.45, 1, maskF)
    if (edgeMap && ed.mode !== 'inside') size *= 1 + edgeF * ed.boost * 0.5
    if (sz.clamp) size = Math.min(size, Math.min(cell.cw, cell.ch) * 1.25)
    if (size <= 0.05) continue

    // ---- rotation ---------------------------------------------------
    let rot: number
    switch (rt.mode) {
      case 'random':
        rot = rt.base + lerp(rt.min, rt.max, rRot)
        break
      case 'luminance':
        rot = rt.base + lerp(rt.min, rt.max, v)
        break
      case 'gradient': {
        const gradStep = Math.max(1, cell.unit * maps.scale * 0.6)
        const ang =
          (gradientAngleAt(maps, cell.x * maps.scale, cell.y * maps.scale, gradStep) * 180) /
          Math.PI
        rot = rt.base + ang + (rt.gradientDir === 'perpendicular' ? 90 : 0)
        break
      }
      default:
        rot = rt.base
    }
    if (rt.jitter > 0) rot += (rRot - 0.5) * 2 * rt.jitter

    // ---- opacity ----------------------------------------------------
    let alpha: number
    if (op.mode === 'constant') {
      alpha = op.max
    } else {
      const t = op.mode === 'alpha' ? rawAlpha : v
      alpha = lerp(op.min, op.max, Math.pow(clamp01(t), Math.max(0.05, op.gamma)))
    }
    if (op.jitter > 0) alpha *= 1 + (rOpacity - 0.5) * 2 * op.jitter
    alpha *= thF
    if (mk.enabled) alpha *= maskF
    alpha = clamp01(alpha)
    if (alpha <= 0.004) continue

    // ---- colour -----------------------------------------------------
    let cr: number
    let cg: number
    let cb: number
    switch (settings.color.mode) {
      case 'solid':
        cr = solidAdj[0]
        cg = solidAdj[1]
        cb = solidAdj[2]
        break
      case 'source-image':
        cr = 255
        cg = 255
        cb = 255
        break
      case 'source': {
        applyAdjust(sr, sg, sb, adj, tmpColor)
        cr = tmpColor[0]
        cg = tmpColor[1]
        cb = tmpColor[2]
        break
      }
      default: {
        let t: number
        if (settings.color.mode === 'x-gradient') t = imgW > 0 ? cell.x / imgW : 0
        else if (settings.color.mode === 'y-gradient') t = imgH > 0 ? cell.y / imgH : 0
        else if (settings.color.mode === 'radial') {
          const dx = cell.x - cxCentre
          const dy = cell.y - cyCentre
          t = Math.sqrt(dx * dx + dy * dy) / maxRadius
        } else t = v
        const li = Math.max(0, Math.min(LUT_SIZE - 1, Math.round(clamp01(t) * (LUT_SIZE - 1)))) * 3
        cr = lut[li]
        cg = lut[li + 1]
        cb = lut[li + 2]
      }
    }
    if (colorJitter > 0) {
      const j = colorJitter * 255
      cr += (rColR - 0.5) * 2 * j
      cg += (rColG - 0.5) * 2 * j
      cb += (rColB - 0.5) * 2 * j
    }

    buf.x[n] = cell.x
    buf.y[n] = cell.y
    buf.size[n] = size
    buf.rot[n] = (rot * Math.PI) / 180
    buf.a[n] = alpha
    buf.r[n] = cr < 0 ? 0 : cr > 255 ? 255 : cr
    buf.g[n] = cg < 0 ? 0 : cg > 255 ? 255 : cg
    buf.b[n] = cb < 0 ? 0 : cb > 255 ? 255 : cb
    buf.sym[n] = symIndex
    n++
  }

  buf.count = n
  return buf
}

/* ------------------------------------------------------------------ */
/* drawing                                                             */
/* ------------------------------------------------------------------ */

const colorCache = new Map<number, string>()

function colorString(r: number, g: number, b: number): string {
  const key = (r << 16) | (g << 8) | b
  let s = colorCache.get(key)
  if (s === undefined) {
    s = 'rgb(' + r + ',' + g + ',' + b + ')'
    if (colorCache.size > 4096) colorCache.clear()
    colorCache.set(key, s)
  }
  return s
}

export function drawElements(
  ctx: CanvasRenderingContext2D,
  buf: ElementBuffer,
  pool: ResolvedSymbol[],
  strokeWeight: number,
  scale: number,
  from: number,
  to: number,
): void {
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  let lastFillKey = -1
  let lastStrokeKey = -1
  let lastAlpha = -1
  const end = Math.min(to, buf.count)

  for (let i = from; i < end; i++) {
    const size = buf.size[i]
    // sub-pixel symbols cost as much as visible ones and contribute nothing
    if (size * scale < 0.3) continue

    const rot = buf.rot[i]
    const cos = Math.cos(rot)
    const sin = Math.sin(rot)
    ctx.setTransform(scale * cos, scale * sin, -scale * sin, scale * cos, scale * buf.x[i], scale * buf.y[i])
    const alpha = buf.a[i]
    if (alpha !== lastAlpha) {
      ctx.globalAlpha = alpha
      lastAlpha = alpha
    }

    const r = buf.r[i]
    const g = buf.g[i]
    const b = buf.b[i]
    const key = (r << 16) | (g << 8) | b
    const entry = pool[buf.sym[i]] || pool[0]

    if (entry.custom) {
      const img = entry.custom.recolor
        ? getTinted(entry.custom, colorString(r, g, b))
        : entry.custom.image
      const aspect = entry.custom.aspect || 1
      let w = size
      let h = size
      if (aspect >= 1) h = size / aspect
      else w = size * aspect
      if (img) {
        try {
          ctx.drawImage(img, -w / 2, -h / 2, w, h)
        } catch {
          /* image not decoded yet */
        }
      }
    } else if (entry.text) {
      if (key !== lastFillKey) {
        ctx.fillStyle = colorString(r, g, b)
        lastFillKey = key
      }
      drawTextSymbol(ctx, entry.text, size)
    } else if (entry.builtin) {
      // set only the style the routine actually consumes
      if (entry.builtin.paint === 'fill') {
        if (key !== lastFillKey) {
          ctx.fillStyle = colorString(r, g, b)
          lastFillKey = key
        }
      } else if (key !== lastStrokeKey) {
        ctx.strokeStyle = colorString(r, g, b)
        lastStrokeKey = key
      }
      entry.builtin.draw(ctx, size, Math.max(size * strokeWeight, 0.15))
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha = 1
}

/* ------------------------------------------------------------------ */
/* layers                                                              */
/* ------------------------------------------------------------------ */

function paintBackground(
  ctx: CanvasRenderingContext2D,
  settings: EditorSettings,
  w: number,
  h: number,
): void {
  const bg = settings.layers.background
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, w, h)
  if (bg.mode === 'transparent') return
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = bg.mode === 'white' ? '#ffffff' : bg.mode === 'black' ? '#000000' : bg.color
  ctx.fillRect(0, 0, w, h)
}

let silCache: { key: string; canvas: HTMLCanvasElement } | null = null

function silhouetteCanvas(maps: SourceMaps, settings: EditorSettings): HTMLCanvasElement {
  const mk = settings.mask
  const key = [
    maps.width,
    maps.height,
    maps.imageWidth,
    mk.source,
    mk.threshold,
    mk.feather,
    mk.invert,
    mk.enabled,
    mk.silhouette.color,
  ].join('|')
  if (silCache && silCache.key === key) return silCache.canvas

  const c = document.createElement('canvas')
  c.width = maps.width
  c.height = maps.height
  const cx = c.getContext('2d')!
  const img = cx.createImageData(maps.width, maps.height)
  const d = img.data
  const [fr, fg, fb] = hexToRgb(mk.silhouette.color)
  const n = maps.width * maps.height
  for (let i = 0; i < n; i++) {
    const mv = mk.enabled
      ? maskValue(maps.lum[i], maps.alpha[i], mk.source)
      : maps.alpha[i]
    let f =
      mk.feather <= 0.0005
        ? mv >= mk.threshold
          ? 1
          : 0
        : smoothstep(mk.threshold - mk.feather, mk.threshold + mk.feather, mv)
    if (mk.invert && mk.enabled) f = 1 - f
    const p = i * 4
    d[p] = fr
    d[p + 1] = fg
    d[p + 2] = fb
    d[p + 3] = f * 255
  }
  cx.putImageData(img, 0, 0)
  silCache = { key, canvas: c }
  return c
}

export function invalidateSilhouetteCache(): void {
  silCache = null
}

/* ------------------------------------------------------------------ */
/* composite                                                           */
/* ------------------------------------------------------------------ */

export interface RenderRequest {
  ctx: CanvasRenderingContext2D
  outputWidth: number
  outputHeight: number
  scale: number // output px per image px
  maps: SourceMaps
  settings: EditorSettings
  original: CanvasImageSource | null
  customSymbols: CustomSymbolDef[]
  textSymbols?: TextSymbolDef[]
}

interface Prepared {
  cells: Cell[]
  buf: ElementBuffer
  pool: ResolvedSymbol[]
}

function prepare(req: RenderRequest): Prepared {
  const cells = buildGrid(req.settings, req.maps)
  const pool = resolvePool(req.settings, req.customSymbols, req.textSymbols)
  const buf = calculateElements(req.maps, req.settings, cells, pool)
  return { cells, buf, pool }
}

function paintUnderlays(req: RenderRequest): void {
  const { ctx, settings, outputWidth: w, outputHeight: h } = req
  paintBackground(ctx, settings, w, h)

  if (settings.mask.silhouette.enabled) {
    const sil = silhouetteCanvas(req.maps, settings)
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = settings.mask.silhouette.opacity
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(sil, 0, 0, w, h)
    ctx.globalAlpha = 1
  }

  if (settings.layers.original.visible && req.original) {
    ctx.globalCompositeOperation = BLEND_MAP[settings.layers.original.blend]
    ctx.globalAlpha = settings.layers.original.opacity
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(req.original, 0, 0, w, h)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }
}

function patternTarget(req: RenderRequest): {
  ctx: CanvasRenderingContext2D
  offscreen: HTMLCanvasElement | null
} {
  const layer = req.settings.layers.pattern
  const needsOffscreen =
    layer.blend !== 'normal' ||
    layer.opacity < 0.999 ||
    req.settings.color.mode === 'source-image'
  if (!needsOffscreen) return { ctx: req.ctx, offscreen: null }
  const c = document.createElement('canvas')
  c.width = req.outputWidth
  c.height = req.outputHeight
  return { ctx: c.getContext('2d')!, offscreen: c }
}

function compositePattern(req: RenderRequest, offscreen: HTMLCanvasElement | null): void {
  if (!offscreen) return

  // ORIGINAL PIXELS: the symbols so far are an alpha stencil — punch the source
  // image through them so every symbol shows the real colours underneath it.
  if (req.settings.color.mode === 'source-image' && req.original) {
    const octx = offscreen.getContext('2d')
    if (octx) {
      octx.setTransform(1, 0, 0, 1, 0, 0)
      octx.globalAlpha = 1
      octx.globalCompositeOperation = 'source-in'
      octx.imageSmoothingEnabled = true
      octx.imageSmoothingQuality = 'high'
      octx.drawImage(req.original, 0, 0, offscreen.width, offscreen.height)
      octx.globalCompositeOperation = 'source-over'
    }
  }

  const layer = req.settings.layers.pattern
  req.ctx.setTransform(1, 0, 0, 1, 0, 0)
  req.ctx.globalCompositeOperation = BLEND_MAP[layer.blend]
  req.ctx.globalAlpha = layer.opacity
  req.ctx.drawImage(offscreen, 0, 0)
  req.ctx.globalAlpha = 1
  req.ctx.globalCompositeOperation = 'source-over'
}

/** Synchronous render — used for the live preview. */
export function renderComposite(req: RenderRequest): RenderStats {
  const t0 = performance.now()
  const { cells, buf, pool } = prepare(req)
  paintUnderlays(req)

  if (req.settings.layers.pattern.visible && buf.count > 0) {
    const target = patternTarget(req)
    drawElements(
      target.ctx,
      buf,
      pool,
      req.settings.symbols.strokeWeight,
      req.scale,
      0,
      buf.count,
    )
    compositePattern(req, target.offscreen)
  }

  req.ctx.setTransform(1, 0, 0, 1, 0, 0)
  return {
    elements: buf.count,
    cells: cells.length,
    ms: performance.now() - t0,
    outputWidth: req.outputWidth,
    outputHeight: req.outputHeight,
  }
}

/**
 * Yields to the browser between chunks. rAF keeps the UI smooth while the tab
 * is visible; the timeout makes sure a background tab still finishes its export
 * instead of stalling on a paused animation frame.
 */
const nextFrame = () =>
  new Promise<void>((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      resolve()
    }
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(finish)
    setTimeout(finish, 24)
  })

/** Chunked render — used for large exports so the UI keeps responding. */
export async function renderCompositeAsync(
  req: RenderRequest,
  onProgress?: (p: number) => void,
): Promise<RenderStats> {
  const t0 = performance.now()
  onProgress?.(0.02)
  await nextFrame()
  const { cells, buf, pool } = prepare(req)
  onProgress?.(0.2)
  await nextFrame()
  paintUnderlays(req)

  if (req.settings.layers.pattern.visible && buf.count > 0) {
    const target = patternTarget(req)
    const CHUNK = 4000
    for (let i = 0; i < buf.count; i += CHUNK) {
      drawElements(
        target.ctx,
        buf,
        pool,
        req.settings.symbols.strokeWeight,
        req.scale,
        i,
        i + CHUNK,
      )
      onProgress?.(0.2 + 0.75 * ((i + CHUNK) / buf.count))
      await nextFrame()
    }
    compositePattern(req, target.offscreen)
  }

  req.ctx.setTransform(1, 0, 0, 1, 0, 0)
  onProgress?.(1)
  return {
    elements: buf.count,
    cells: cells.length,
    ms: performance.now() - t0,
    outputWidth: req.outputWidth,
    outputHeight: req.outputHeight,
  }
}
