import type {
  BlendMode,
  CustomSymbolDef,
  EditorSettings,
  RenderStats,
  SourceMaps,
  TextSymbolDef,
  ZoneDef,
} from '../types/editor'
import { buildGrid, type Cell } from './grid'
import { sampleCell, sampleEdge } from './sampling'
import { buildEdgeMap, gradientAngleAt } from './edges'
import { rngAt, valueNoise } from './random'
import { applyAdjust, buildGradientLUT, hexToRgb, LUT_SIZE } from './gradients'
import { SYMBOL_MAP, type SymbolDef } from './symbols'
import { getTinted } from './tint'
import { drawTextSymbol } from './textSymbols'
import { buildSelection, getSelectionEdge, getSelectionMask, sampleSelection } from './selection'

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

function maskValue(
  lum: number,
  alpha: number,
  selection: number,
  source: EditorSettings['mask']['source'],
): number {
  if (source === 'luminance') return lum
  if (source === 'combined') return lum * alpha
  if (source === 'color') return selection
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
    // an id from an older preset whose symbol no longer exists must not take a slot
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
  const selection = getSelectionMask(maps, settings.mask)
  const cellSize = Math.max(1, settings.grid.cellSize)

  const cxCentre = imgW / 2
  const cyCentre = imgH / 2
  const maxRadius = Math.sqrt(cxCentre * cxCentre + cyCentre * cyCentre) || 1

  const density = settings.density.value / 100
  const sz = settings.size
  const rt = settings.rotation
  const op = settings.opacity
  const th = settings.threshold
  const ed = settings.edges
  const colorJitter = settings.color.jitter
  const wantDominant = settings.color.mode === 'source-dominant'
  const poolLen = pool.length
  const noiseScale = Math.max(0.0005, settings.symbols.noiseScale)
  const mk = settings.mask
  const rv = settings.reveal
  const mo = settings.motion
  const zn = settings.zone
  const densitySoft = settings.density.softness

  // The zone rides on the mask's field, so it needs a selection to exist at all.
  const zoneAdj = { hueShift: 0, saturation: 0, brightness: 0 }

  /**
   * Zones are resolved once per render, not once per cell. A zone with no
   * picks, no strength or switched off simply is not here, so the per-cell
   * loop below costs nothing when nobody is using them. The outline field is
   * a second Sobel pass and is only built when a zone actually asks for one.
   */
  interface LiveZone {
    def: ZoneDef
    field: Uint8Array
    edge: Float32Array | null
    tints: boolean
  }
  const liveZones: LiveZone[] = []
  for (const def of zn.list) {
    if (!def.enabled || def.strength <= 0.001 || def.picks.length === 0) continue
    const field = buildSelection(maps, def)
    if (!field) continue
    const wantsEdge =
      def.edgeOnly || def.edgeSize !== 1 || def.edgeOpacity !== 1 || def.edgeHue !== 0
    liveZones.push({
      def,
      field,
      edge: wantsEdge ? getSelectionEdge(maps, def) : null,
      tints: def.hueShift !== 0 || def.saturation !== 0,
    })
  }
  const zonesLive = liveZones.length > 0
  const edgeOnlyZones = liveZones.filter((z) => z.def.edgeOnly).length

  // A reveal at full amount is the resting state, and skipping it there keeps
  // every still image on exactly the path it was on before reveal existed.
  const revealOn = rv.amount < 0.999 || rv.invert
  const revealSoft = Math.max(0.004, rv.softness * 0.5)
  const revealEdge = lerp(-revealSoft, 1 + revealSoft, clamp01(rv.amount))
  const revealAngle = (rv.angle * Math.PI) / 180
  const revealCos = Math.cos(revealAngle)
  const revealSin = Math.sin(revealAngle)

  const motionOn =
    mo.amplitudeX !== 0 ||
    mo.amplitudeY !== 0 ||
    mo.swirl !== 0 ||
    zn.list.some((z) => z.enabled && z.motionAmount !== 0 && z.picks.length > 0)
  const motionPhase = mo.phase * Math.PI * 2
  const motionFreq = Math.max(0.01, mo.frequency)

  // Temporal noise walks a circle in the noise field instead of a line, so
  // phase 0 and phase 1 read the same values and a loop does not jump.
  const noiseAngle = settings.symbols.noisePhase * Math.PI * 2
  const noisePhaseX = Math.cos(noiseAngle) * 6
  const noisePhaseY = Math.sin(noiseAngle) * 6
  const sequenceOffset = Math.round(settings.symbols.sequenceOffset)
  const gradientOffset = settings.color.gradientOffset

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

    const sample = sampleCell(maps, cell.x, cell.y, cell.cw, cell.ch, wantDominant)
    const rawLum = sample.lum
    const rawAlpha = sample.alpha
    const sr = wantDominant ? sample.dr : sample.r
    const sg = wantDominant ? sample.dg : sample.g
    const sb = wantDominant ? sample.db : sample.b

    // ---- mask -------------------------------------------------------
    // The mask gates: GATE deletes what falls outside it, SELECT keeps every
    // cell and only shapes the silhouette and clip layers. Zones no longer
    // ride on it — they carry their own selections.
    let maskF = 1
    const gating = mk.enabled && mk.mode === 'gate'
    if (mk.enabled) {
      const sel = selection ? sampleSelection(maps, selection, cell.x, cell.y, cell.cw, cell.ch) : 0
      const mv = maskValue(rawLum, rawAlpha, sel, mk.source)
      let f =
        mk.feather <= 0.0005
          ? mv >= mk.threshold
            ? 1
            : 0
          : smoothstep(mk.threshold - mk.feather, mk.threshold + mk.feather, mv)
      if (mk.invert) f = 1 - f
      if (gating) {
        maskF = f
        if (maskF <= 0.001) continue
      }
    }
    // fully transparent source pixels never produce symbols
    if (!gating && rawAlpha <= 0.004) continue

    // ---- zones ------------------------------------------------------
    // Every live zone contributes to the same set of accumulators, so two
    // zones overlapping compose instead of one winning.
    let zDensity = 1
    let zSize = 1
    let zOpacity = 1
    let zRotate = 0
    let zMotion = 0
    let zGradient = 0
    let zHue = 0
    let zSat = 0
    let onSomeEdge = false

    if (zonesLive) {
      for (let li = 0; li < liveZones.length; li++) {
        const lz = liveZones[li]
        const d = lz.def
        const raw = sampleSelection(maps, lz.field, cell.x, cell.y, cell.cw, cell.ch)
        const f =
          d.feather <= 0.0005
            ? raw >= 0.5
              ? 1
              : 0
            : smoothstep(0.5 - d.feather, 0.5 + d.feather, raw)
        const w = (d.outside ? 1 - f : f) * d.strength

        // The outline ignores OUTSIDE on purpose: an edge is an edge from
        // either side of it.
        let ew = 0
        if (lz.edge) {
          ew = clamp01(sampleEdge(maps, lz.edge, cell.x, cell.y, d.edgeThickness)) * d.strength
          if (d.edgeOnly && ew > 0.02) onSomeEdge = true
        }

        if (w > 0.002) {
          if (d.densityScale !== 1) zDensity *= 1 + (d.densityScale - 1) * w
          if (d.sizeScale !== 1) zSize *= 1 + (d.sizeScale - 1) * w
          if (d.opacityScale !== 1) zOpacity *= 1 + (d.opacityScale - 1) * w
          if (d.rotate !== 0) zRotate += d.rotate * w
          if (d.motionAmount !== 0) zMotion += d.motionAmount * w
          if (d.gradientOffset !== 0) zGradient += d.gradientOffset * w
          if (lz.tints) {
            zHue += d.hueShift * w
            zSat += d.saturation * w
          }
        }
        if (ew > 0.002) {
          if (d.edgeSize !== 1) zSize *= 1 + (d.edgeSize - 1) * ew
          if (d.edgeOpacity !== 1) zOpacity *= 1 + (d.edgeOpacity - 1) * ew
          if (d.edgeHue !== 0) zHue += d.edgeHue * ew
        }
      }
      // With OUTLINE ONLY armed anywhere, a cell has to be on at least one of
      // those outlines to survive — the union, so several outlines compose.
      if (edgeOnlyZones > 0 && !onSomeEdge) continue
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

    // ---- reveal -----------------------------------------------------
    // An independent wipe, after the mask and before density: it decides how
    // much of the frame exists at all, which is what an intro or an outro
    // actually is.
    let revealF = 1
    if (revealOn) {
      let t: number
      switch (rv.mode) {
        case 'radial': {
          const dx = cell.x - cxCentre
          const dy = cell.y - cyCentre
          t = Math.sqrt(dx * dx + dy * dy) / maxRadius
          break
        }
        case 'luminance':
          t = v
          break
        case 'noise':
          t = valueNoise(seed ^ 0x51ed, cell.x * 0.012, cell.y * 0.012)
          break
        default: {
          const nx = imgW > 0 ? cell.x / imgW - 0.5 : 0
          const ny = imgH > 0 ? cell.y / imgH - 0.5 : 0
          t = clamp01(0.5 + nx * revealCos + ny * revealSin)
        }
      }
      revealF = 1 - smoothstep(revealEdge - revealSoft, revealEdge + revealSoft, clamp01(t))
      if (rv.invert) revealF = 1 - revealF
      if (revealF <= 0.002) continue
    }

    // ---- density ----------------------------------------------------
    let p = density
    if (settings.density.mode === 'dark') p *= 1 - v
    else if (settings.density.mode === 'light') p *= v
    if (edgeMap && ed.mode !== 'inside') p *= 1 + edgeF * ed.boost
    if (zDensity !== 1) p *= zDensity
    let densityF = 1
    if (p < 1) {
      if (densitySoft <= 0.001) {
        if (rDensity > p) continue
      } else {
        // the same stable per-cell number, read as a distance from the cutoff
        // instead of a yes/no, so cells fade in rather than pop
        const half = densitySoft * 0.5
        densityF = 1 - smoothstep(p - half, p + half, rDensity)
        if (densityF <= 0.004) continue
      }
    }

    // ---- symbol -----------------------------------------------------
    let symIndex = 0
    if (poolLen > 1) {
      switch (settings.symbols.selectMode) {
        case 'luminance': {
          symIndex = Math.min(poolLen - 1, Math.floor(v * poolLen))
          break
        }
        case 'sequential': {
          const step = cell.col + cell.row + sequenceOffset
          symIndex = ((step % poolLen) + poolLen) % poolLen
          break
        }
        case 'noise': {
          const nz = valueNoise(
            seed ^ 0x2f1b,
            cell.x * noiseScale + noisePhaseX,
            cell.y * noiseScale + noisePhaseY,
          )
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
    if (revealF < 0.999) size *= lerp(0.35, 1, revealF)
    if (densityF < 0.999) size *= lerp(0.25, 1, densityF)
    if (zSize !== 1) size *= zSize
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
    if (zRotate !== 0) rot += zRotate

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
    alpha *= revealF * densityF
    if (zOpacity !== 1) alpha *= zOpacity
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
      case 'source':
      case 'source-dominant': {
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
        // gradientOffset rolls the LUT round, which is what turns a static
        // ramp into a travelling one; a non-cyclic gradient shows a seam.
        const rollOffset = gradientOffset + zGradient
        let slot = Math.round(clamp01(t) * (LUT_SIZE - 1) + rollOffset * LUT_SIZE)
        slot = ((slot % LUT_SIZE) + LUT_SIZE) % LUT_SIZE
        const li = slot * 3
        cr = lut[li]
        cg = lut[li + 1]
        cb = lut[li + 2]
      }
    }
    // The zone recolours whatever the colour mode produced, so it works the
    // same on a solid fill, a gradient and colours sampled from the photo.
    if (zHue !== 0 || zSat !== 0) {
      zoneAdj.hueShift = zHue
      zoneAdj.saturation = zSat < -1 ? -1 : zSat > 1 ? 1 : zSat
      applyAdjust(cr, cg, cb, zoneAdj, tmpColor)
      cr = tmpColor[0]
      cg = tmpColor[1]
      cb = tmpColor[2]
    }

    if (colorJitter > 0) {
      const j = colorJitter * 255
      cr += (rColR - 0.5) * 2 * j
      cg += (rColG - 0.5) * 2 * j
      cb += (rColB - 0.5) * 2 * j
    }

    // ---- motion -----------------------------------------------------
    // Applied to the output position only: the cell keeps sampling the source
    // where it sits, so the picture stays put while the symbols travel.
    let px = cell.x
    let py = cell.y
    if (motionOn) {
      // Zone motion is added, not scaled: making just the jacket ripple must
      // not require turning on a whole-frame wave first.
      const ampX = mo.amplitudeX + zMotion
      const ampY = mo.amplitudeY + zMotion
      if (mo.swirl !== 0) {
        const dx = px - cxCentre
        const dy = py - cyCentre
        const radius = Math.sqrt(dx * dx + dy * dy)
        const theta = mo.swirl * (1 - Math.min(1, radius / maxRadius)) * Math.PI
        const ca = Math.cos(theta)
        const sa = Math.sin(theta)
        px = cxCentre + dx * ca - dy * sa
        py = cyCentre + dx * sa + dy * ca
      }
      switch (mo.mode) {
        case 'radial': {
          const dx = px - cxCentre
          const dy = py - cyCentre
          const radius = Math.sqrt(dx * dx + dy * dy) || 1
          const wave = Math.sin((radius / maxRadius) * motionFreq * Math.PI * 2 - motionPhase)
          px += (dx / radius) * ampX * wave
          py += (dy / radius) * ampY * wave
          break
        }
        case 'noise': {
          const tx = Math.cos(motionPhase) * 5
          const ty = Math.sin(motionPhase) * 5
          const sx = cell.x * 0.004 * motionFreq
          const sy = cell.y * 0.004 * motionFreq
          px += (valueNoise(seed ^ 0x6b17, sx + tx, sy + ty) - 0.5) * 2 * ampX
          py += (valueNoise(seed ^ 0x1d4c, sx + tx + 37, sy + ty + 11) - 0.5) * 2 * ampY
          break
        }
        default: {
          const nx = imgW > 0 ? cell.x / imgW : 0
          const ny = imgH > 0 ? cell.y / imgH : 0
          px += ampX * Math.sin(ny * motionFreq * Math.PI * 2 + motionPhase)
          py += ampY * Math.cos(nx * motionFreq * Math.PI * 2 + motionPhase)
        }
      }
    }

    buf.x[n] = px
    buf.y[n] = py
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

/* --- mask field shared by the silhouette and the original-layer clip --- */

/**
 * All three are per-`SourceMaps`, which for an animated source means per frame.
 *
 * The silhouette and the mask stencil used to be keyed on the mask signature
 * alone, and that signature only carries the map *dimensions* — identical for
 * every frame of a video. So frame 0's silhouette was handed back for the whole
 * clip: not just slow, wrong. Keying on the maps object fixes both at once.
 */
let fieldCache = new WeakMap<SourceMaps, { key: string; data: Uint8Array }>()
let silCache = new WeakMap<SourceMaps, { key: string; canvas: HTMLCanvasElement }>()
let alphaCache = new WeakMap<SourceMaps, { key: string; canvas: HTMLCanvasElement }>()

function maskKey(maps: SourceMaps, mk: EditorSettings['mask']): string {
  return [
    maps.width,
    maps.height,
    maps.imageWidth,
    mk.source,
    mk.threshold,
    mk.feather,
    mk.invert,
    mk.enabled,
    mk.tolerance,
    mk.contiguous,
    mk.picks.map((p) => p.color + '@' + p.x.toFixed(3) + ',' + p.y.toFixed(3)).join(';'),
  ].join('|')
}

/** The mask after threshold, feather and invert, as 0..255 at analysis size. */
function maskField(maps: SourceMaps, mk: EditorSettings['mask']): Uint8Array {
  const key = maskKey(maps, mk)
  const hit = fieldCache.get(maps)
  if (hit && hit.key === key) return hit.data

  const n = maps.width * maps.height
  const data = new Uint8Array(n)
  const selection = getSelectionMask(maps, mk)
  for (let i = 0; i < n; i++) {
    const mv = mk.enabled
      ? maskValue(maps.lum[i], maps.alpha[i], selection ? selection[i] / 255 : 0, mk.source)
      : maps.alpha[i]
    let f =
      mk.feather <= 0.0005
        ? mv >= mk.threshold
          ? 1
          : 0
        : smoothstep(mk.threshold - mk.feather, mk.threshold + mk.feather, mv)
    if (mk.invert && mk.enabled) f = 1 - f
    data[i] = f * 255
  }
  fieldCache.set(maps, { key, data })
  return data
}

function fieldToCanvas(
  maps: SourceMaps,
  field: Uint8Array,
  r: number,
  g: number,
  b: number,
): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = maps.width
  c.height = maps.height
  const cx = c.getContext('2d')!
  const img = cx.createImageData(maps.width, maps.height)
  const d = img.data
  for (let i = 0; i < field.length; i++) {
    const p = i * 4
    d[p] = r
    d[p + 1] = g
    d[p + 2] = b
    d[p + 3] = field[i]
  }
  cx.putImageData(img, 0, 0)
  return c
}

function silhouetteCanvas(maps: SourceMaps, settings: EditorSettings): HTMLCanvasElement {
  const mk = settings.mask
  const key = maskKey(maps, mk) + '|' + mk.silhouette.color
  const hit = silCache.get(maps)
  if (hit && hit.key === key) return hit.canvas
  const [r, g, b] = hexToRgb(mk.silhouette.color)
  const canvas = fieldToCanvas(maps, maskField(maps, mk), r, g, b)
  silCache.set(maps, { key, canvas })
  return canvas
}

/** White stencil of the mask, used to knock the original layer in or out. */
function maskAlphaCanvas(maps: SourceMaps, mk: EditorSettings['mask']): HTMLCanvasElement {
  const key = maskKey(maps, mk)
  const hit = alphaCache.get(maps)
  if (hit && hit.key === key) return hit.canvas
  const canvas = fieldToCanvas(maps, maskField(maps, mk), 255, 255, 255)
  alphaCache.set(maps, { key, canvas })
  return canvas
}

export function invalidateSilhouetteCache(): void {
  silCache = new WeakMap()
  alphaCache = new WeakMap()
  fieldCache = new WeakMap()
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
    const clip = settings.layers.original.clip
    let source: CanvasImageSource = req.original

    if (clip !== 'none') {
      // Cut the mask out of the photo (or keep only it) so whatever the
      // background layer painted shows through the hole.
      const tmp = document.createElement('canvas')
      tmp.width = w
      tmp.height = h
      const tctx = tmp.getContext('2d')
      if (tctx) {
        tctx.imageSmoothingEnabled = true
        tctx.imageSmoothingQuality = 'high'
        tctx.drawImage(req.original, 0, 0, w, h)
        tctx.globalCompositeOperation =
          clip === 'outside-mask' ? 'destination-out' : 'destination-in'
        tctx.drawImage(maskAlphaCanvas(req.maps, settings.mask), 0, 0, w, h)
        tctx.globalCompositeOperation = 'source-over'
        source = tmp
      }
    }

    ctx.globalCompositeOperation = BLEND_MAP[settings.layers.original.blend]
    ctx.globalAlpha = settings.layers.original.opacity
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(source, 0, 0, w, h)
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
 * Yields to the browser between chunks.
 *
 * While the tab is visible, rAF is the right beat — it lines the chunks up with
 * the compositor and keeps the UI smooth. Once the tab is hidden rAF stops and
 * `setTimeout` is clamped to about a second, which would turn a long export
 * into a multi-minute wait for nothing; a MessageChannel task is neither
 * paused nor clamped, so a backgrounded export runs at full speed.
 */
const nextFrame = () =>
  new Promise<void>((resolve) => {
    const visible = typeof document !== 'undefined' && !document.hidden
    if (visible && typeof requestAnimationFrame === 'function') {
      let done = false
      const finish = () => {
        if (done) return
        done = true
        resolve()
      }
      requestAnimationFrame(finish)
      setTimeout(finish, 24)
      return
    }
    const channel = new MessageChannel()
    channel.port1.onmessage = () => {
      channel.port1.close()
      resolve()
    }
    channel.port2.postMessage(0)
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
