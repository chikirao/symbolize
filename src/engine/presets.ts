import type { EditorSettings, Preset } from '../types/editor'
import { DEFAULT_STOPS } from './gradients'
import { ALL_SYMBOL_IDS } from './symbols'

export function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

function enabledMap(ids: string[]): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  for (const id of ALL_SYMBOL_IDS) out[id] = false
  for (const id of ids) out[id] = true
  return out
}

function weightMap(overrides: Record<string, number> = {}): Record<string, number> {
  const out: Record<string, number> = {}
  for (const id of ALL_SYMBOL_IDS) out[id] = overrides[id] ?? 1
  return out
}

export const DEFAULT_SETTINGS: EditorSettings = {
  grid: {
    mode: 'square',
    cellSize: 16,
    spacingX: 1,
    spacingY: 1,
    offsetX: 0,
    offsetY: 0,
    rotation: 0,
    jitterX: 0,
    jitterY: 0,
    minCellSize: 5,
    detail: 0.18,
    maxDepth: 4,
  },
  source: {
    mode: 'luminance',
    invert: false,
    brightness: 0,
    contrast: 0,
    gamma: 1,
    blackPoint: 0,
    whitePoint: 1,
  },
  threshold: { min: 0, max: 1, soft: 0.05, invert: false },
  size: { mode: 'dark-large', min: 0.06, max: 1.15, gamma: 1, jitter: 0, clamp: false },
  rotation: {
    mode: 'fixed',
    base: 0,
    jitter: 0,
    min: -180,
    max: 180,
    gradientDir: 'perpendicular',
  },
  symbols: {
    pool: [...ALL_SYMBOL_IDS],
    enabled: enabledMap(['dot']),
    weights: weightMap(),
    selectMode: 'random',
    strokeWeight: 0.14,
    noiseScale: 0.01,
  },
  color: {
    mode: 'luminance-gradient',
    solid: '#FFFFFF',
    stops: clone(DEFAULT_STOPS),
    reverse: true,
    hueShift: 0,
    saturation: 0,
    brightness: 0,
    jitter: 0,
  },
  opacity: { mode: 'constant', min: 0.15, max: 1, gamma: 1, jitter: 0 },
  density: { value: 100, mode: 'constant' },
  mask: {
    enabled: false,
    source: 'alpha',
    threshold: 0.04,
    feather: 0.03,
    invert: false,
    picks: [],
    tolerance: 0.12,
    contiguous: false,
    silhouette: { enabled: false, color: '#101010', opacity: 1 },
  },
  edges: { enabled: false, mode: 'both', threshold: 0.14, thickness: 2, contrast: 0.75, boost: 0.7 },
  random: { seed: 183742 },
  layers: {
    background: { mode: 'black', color: '#0b0b0b' },
    original: { visible: false, opacity: 0.3, blend: 'normal' },
    pattern: { visible: true, opacity: 1, blend: 'normal' },
  },
}

function makePreset(id: string, name: string, patch: (s: EditorSettings) => void): Preset {
  const s = clone(DEFAULT_SETTINGS)
  patch(s)
  return { id, name, builtin: true, settings: s }
}

export const BUILTIN_PRESETS: Preset[] = [
  makePreset('neon-arrows', 'NEON ARROWS', (s) => {
    s.grid.cellSize = 18
    s.grid.mode = 'staggered'
    s.symbols.enabled = enabledMap(['arrowUpRight', 'circle', 'cross', 'dot'])
    s.symbols.weights = weightMap({ arrowUpRight: 4, circle: 2, cross: 2, dot: 2 })
    s.symbols.selectMode = 'random'
    s.symbols.strokeWeight = 0.16
    s.size.mode = 'dark-large'
    s.size.min = 0.15
    s.size.max = 1.25
    s.size.gamma = 1.1
    s.rotation.mode = 'random'
    s.rotation.min = -25
    s.rotation.max = 25
    s.color.mode = 'luminance-gradient'
    s.color.reverse = true
    s.opacity.mode = 'luminance'
    s.opacity.min = 1
    s.opacity.max = 0.25
    s.layers.background.mode = 'black'
  }),
  makePreset('dot-halftone', 'DOT HALFTONE', (s) => {
    s.grid.cellSize = 12
    s.grid.mode = 'square'
    s.symbols.enabled = enabledMap(['dot'])
    s.size.mode = 'dark-large'
    s.size.min = 0
    s.size.max = 1.35
    s.size.gamma = 0.85
    s.color.mode = 'solid'
    s.color.solid = '#000000'
    s.layers.background.mode = 'white'
    s.opacity.mode = 'constant'
    s.opacity.max = 1
    s.threshold.soft = 0.02
  }),
  makePreset('cyber-mosaic', 'CYBER MOSAIC', (s) => {
    s.grid.cellSize = 20
    s.grid.mode = 'staggered'
    s.symbols.enabled = enabledMap(['arrowRight', 'ring', 'cross', 'checker', 'fourDots'])
    s.symbols.selectMode = 'luminance'
    s.symbols.strokeWeight = 0.18
    s.size.min = 0.3
    s.size.max = 1.1
    s.rotation.mode = 'random'
    s.rotation.min = -90
    s.rotation.max = 90
    s.color.mode = 'luminance-gradient'
    s.color.stops = [
      { id: 'c0', pos: 0, color: '#26C6FF' },
      { id: 'c1', pos: 0.5, color: '#8A3FFC' },
      { id: 'c2', pos: 1, color: '#D500F9' },
    ]
    s.color.reverse = true
    s.edges.enabled = true
    s.edges.mode = 'both'
    s.edges.boost = 0.9
    s.layers.background.mode = 'black'
  }),
  makePreset('minimal-black', 'MINIMAL BLACK', (s) => {
    s.grid.cellSize = 14
    s.symbols.enabled = enabledMap(['plus', 'line'])
    s.symbols.selectMode = 'luminance'
    s.symbols.strokeWeight = 0.11
    s.size.min = 0.05
    s.size.max = 0.95
    s.rotation.mode = 'fixed'
    s.rotation.jitter = 3
    s.color.mode = 'solid'
    s.color.solid = '#111111'
    s.layers.background.mode = 'white'
    s.threshold.soft = 0.03
  }),
  makePreset('arrow-flow', 'ARROW FLOW', (s) => {
    s.grid.cellSize = 17
    s.grid.mode = 'staggered'
    s.symbols.enabled = enabledMap(['arrowRight', 'caret', 'chevron', 'arrowBlock'])
    s.symbols.weights = weightMap({ arrowRight: 4, caret: 2, chevron: 3, arrowBlock: 1 })
    s.symbols.strokeWeight = 0.15
    s.size.min = 0.25
    s.size.max = 1.2
    s.rotation.mode = 'gradient'
    s.rotation.gradientDir = 'perpendicular'
    s.rotation.jitter = 10
    s.color.mode = 'luminance-gradient'
    s.color.reverse = true
    s.opacity.mode = 'luminance'
    s.opacity.min = 1
    s.opacity.max = 0.3
    s.layers.background.mode = 'black'
  }),
  makePreset('tech-grid', 'TECH GRID', (s) => {
    s.grid.cellSize = 22
    s.symbols.enabled = enabledMap([
      'cornerMarks',
      'target',
      'dotGrid',
      'hatch',
      'crosshair',
      'squareDot',
    ])
    s.symbols.selectMode = 'luminance'
    s.symbols.strokeWeight = 0.09
    s.size.min = 0.35
    s.size.max = 1
    s.size.clamp = true
    s.color.mode = 'solid'
    s.color.solid = '#E8FFF6'
    s.opacity.mode = 'luminance'
    s.opacity.min = 1
    s.opacity.max = 0.22
    s.edges.enabled = true
    s.edges.mode = 'both'
    s.edges.boost = 1.1
    s.layers.background.mode = 'black'
  }),
  makePreset('detail-mosaic', 'DETAIL MOSAIC', (s) => {
    s.grid.mode = 'adaptive'
    s.grid.cellSize = 56
    s.grid.minCellSize = 7
    s.grid.detail = 0.16
    s.grid.maxDepth = 4
    s.symbols.enabled = enabledMap([
      'arrowUpRight',
      'ring',
      'cross',
      'checker',
      'dot',
      'squareFilled',
      'chevron',
    ])
    s.symbols.selectMode = 'random'
    s.symbols.strokeWeight = 0.16
    s.size.mode = 'constant'
    s.size.min = 0.86
    s.size.max = 0.86
    s.size.clamp = true
    s.rotation.mode = 'random'
    s.rotation.min = -12
    s.rotation.max = 12
    s.color.mode = 'luminance-gradient'
    s.color.reverse = true
    s.opacity.mode = 'constant'
    s.opacity.max = 1
    s.layers.background.mode = 'black'
  }),
  makePreset('true-color', 'TRUE COLOR', (s) => {
    s.grid.mode = 'adaptive'
    s.grid.cellSize = 40
    s.grid.minCellSize = 6
    s.grid.detail = 0.14
    s.grid.maxDepth = 4
    s.symbols.enabled = enabledMap(['roundedSquare', 'dot', 'hexagon'])
    s.symbols.selectMode = 'random'
    s.size.mode = 'constant'
    s.size.min = 1
    s.size.max = 1
    s.size.clamp = true
    s.rotation.mode = 'fixed'
    s.color.mode = 'source-dominant'
    s.opacity.mode = 'constant'
    s.opacity.max = 1
    s.layers.background.mode = 'black'
  }),
  makePreset('source-colors', 'SOURCE COLORS', (s) => {
    s.grid.cellSize = 13
    s.grid.mode = 'staggered'
    s.symbols.enabled = enabledMap(['roundedSquare'])
    s.size.mode = 'constant'
    s.size.min = 0.9
    s.size.max = 0.9
    s.rotation.mode = 'random'
    s.rotation.min = -8
    s.rotation.max = 8
    s.color.mode = 'source'
    s.color.saturation = 0.15
    s.opacity.mode = 'alpha'
    s.opacity.min = 0
    s.opacity.max = 1
    s.layers.background.mode = 'black'
  }),
]

/* --------------------------------------------------------------- */
/* deep merge so saved presets survive schema additions             */
/* --------------------------------------------------------------- */

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function mergeSettings(base: EditorSettings, patch: unknown): EditorSettings {
  const out = clone(base) as unknown as Record<string, unknown>
  const walk = (dst: Record<string, unknown>, src: Record<string, unknown>) => {
    for (const key of Object.keys(src)) {
      const sv = src[key]
      const dv = dst[key]
      if (isPlainObject(sv) && isPlainObject(dv)) walk(dv, sv)
      else if (sv !== undefined) dst[key] = sv
    }
  }
  if (isPlainObject(patch)) walk(out, patch)
  return out as unknown as EditorSettings
}

const LS_KEY = 'symbol-halftone.presets.v1'

export function loadUserPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((p) => p && typeof p.id === 'string' && typeof p.name === 'string')
      .map((p) => ({
        id: p.id,
        name: p.name,
        builtin: false,
        settings: mergeSettings(DEFAULT_SETTINGS, p.settings),
      }))
  } catch {
    return []
  }
}

export function saveUserPresets(presets: Preset[]): void {
  try {
    localStorage.setItem(
      LS_KEY,
      JSON.stringify(presets.map((p) => ({ id: p.id, name: p.name, settings: p.settings }))),
    )
  } catch {
    /* quota or private mode — presets simply do not persist */
  }
}
