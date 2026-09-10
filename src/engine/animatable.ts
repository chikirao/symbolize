import type { TrackCost, TrackKind } from '../types/anim'

/**
 * The allowlist of animatable parameters.
 *
 * Interpolating an arbitrary dotted path would be a trap: the evaluator has no
 * way of knowing whether a value is an angle, a colour or an enum, what its
 * legal range is, or how much work changing it costs per frame. This registry
 * answers all four questions, and the timeline only ever offers what is in it.
 *
 * `cost` is advisory, shown in the UI:
 *   cheap     — composite-level, no per-cell work (layer opacity, background)
 *   elements  — re-runs calculateElements (most parameters)
 *   topology  — rebuilds the grid or the colour selection; cells appear and
 *               disappear, so tween these knowingly
 */
export interface AnimatableParam {
  path: string
  label: string
  group: string
  kind: TrackKind
  cost: TrackCost
  min?: number
  max?: number
  step?: number
  decimals?: number
  suffix?: string
  /** step tracks: the values the parameter may hold */
  options?: { value: string; label: string }[]
}

const n = (
  path: string,
  label: string,
  group: string,
  min: number,
  max: number,
  step: number,
  decimals: number,
  cost: TrackCost = 'elements',
  suffix?: string,
): AnimatableParam => ({ path, label, group, kind: 'number', cost, min, max, step, decimals, suffix })

const a = (
  path: string,
  label: string,
  group: string,
  min: number,
  max: number,
  cost: TrackCost = 'elements',
): AnimatableParam => ({
  path,
  label,
  group,
  kind: 'angle',
  cost,
  min,
  max,
  step: 1,
  decimals: 0,
  suffix: 'd',
})

const c = (path: string, label: string, group: string, cost: TrackCost = 'elements'): AnimatableParam => ({
  path,
  label,
  group,
  kind: 'color',
  cost,
})

const s = (
  path: string,
  label: string,
  group: string,
  options: { value: string; label: string }[],
  cost: TrackCost = 'elements',
): AnimatableParam => ({ path, label, group, kind: 'step', cost, options })

const BOOL = [
  { value: 'true', label: 'ON' },
  { value: 'false', label: 'OFF' },
]

const b = (path: string, label: string, group: string, cost: TrackCost = 'elements'): AnimatableParam =>
  s(path, label, group, BOOL, cost)

/* ------------------------------------------------------------------ */

export const ANIMATABLE_PARAMS: AnimatableParam[] = [
  /* --- source levels --- */
  n('source.brightness', 'BRIGHTNESS', 'SOURCE', -1, 1, 0.01, 2),
  n('source.contrast', 'CONTRAST', 'SOURCE', -1, 1, 0.01, 2),
  n('source.gamma', 'GAMMA', 'SOURCE', 0.1, 4, 0.01, 2),
  n('source.blackPoint', 'BLACK POINT', 'SOURCE', 0, 1, 0.01, 2),
  n('source.whitePoint', 'WHITE POINT', 'SOURCE', 0, 1, 0.01, 2),
  b('source.invert', 'INVERT', 'SOURCE'),

  /* --- threshold --- */
  n('threshold.min', 'MIN THRESHOLD', 'THRESHOLD', 0, 1, 0.01, 2),
  n('threshold.max', 'MAX THRESHOLD', 'THRESHOLD', 0, 1, 0.01, 2),
  n('threshold.soft', 'SOFTNESS', 'THRESHOLD', 0, 0.5, 0.005, 3),
  b('threshold.invert', 'INVERT RULE', 'THRESHOLD'),

  /* --- grid --- */
  n('grid.cellSize', 'CELL SIZE', 'GRID', 2, 160, 1, 0, 'topology', 'px'),
  n('grid.spacingX', 'SPACING X', 'GRID', 0.1, 4, 0.01, 2, 'topology'),
  n('grid.spacingY', 'SPACING Y', 'GRID', 0.1, 4, 0.01, 2, 'topology'),
  n('grid.offsetX', 'OFFSET X', 'GRID', -1, 1, 0.01, 2, 'topology'),
  n('grid.offsetY', 'OFFSET Y', 'GRID', -1, 1, 0.01, 2, 'topology'),
  a('grid.rotation', 'GRID ROTATION', 'GRID', -180, 180, 'topology'),
  n('grid.jitterX', 'JITTER X', 'GRID', 0, 1, 0.01, 2, 'topology'),
  n('grid.jitterY', 'JITTER Y', 'GRID', 0, 1, 0.01, 2, 'topology'),
  n('grid.detail', 'DETAIL', 'GRID', 0.01, 1, 0.01, 2, 'topology'),

  /* --- symbols --- */
  n('symbols.strokeWeight', 'STROKE WEIGHT', 'SYMBOLS', 0.02, 0.5, 0.005, 3),
  n('symbols.noiseScale', 'NOISE SCALE', 'SYMBOLS', 0.001, 0.2, 0.001, 3),
  n('symbols.noisePhase', 'NOISE PHASE', 'SYMBOLS', 0, 1, 0.001, 3),
  n('symbols.sequenceOffset', 'SEQ OFFSET', 'SYMBOLS', 0, 64, 1, 0),
  s('symbols.selectMode', 'SELECT MODE', 'SYMBOLS', [
    { value: 'random', label: 'RANDOM' },
    { value: 'luminance', label: 'LUMINANCE' },
    { value: 'sequential', label: 'SEQUENTIAL' },
    { value: 'noise', label: 'NOISE' },
  ]),

  /* --- size --- */
  n('size.min', 'MIN SIZE', 'SIZE', 0, 2, 0.01, 2, 'elements', 'x'),
  n('size.max', 'MAX SIZE', 'SIZE', 0, 3, 0.01, 2, 'elements', 'x'),
  n('size.gamma', 'SIZE CURVE', 'SIZE', 0.1, 4, 0.01, 2),
  n('size.jitter', 'SIZE JITTER', 'SIZE', 0, 1, 0.01, 2),

  /* --- rotation --- */
  a('rotation.base', 'BASE ROTATION', 'ROTATION', -1080, 1080),
  a('rotation.min', 'ROT MIN', 'ROTATION', -360, 360),
  a('rotation.max', 'ROT MAX', 'ROTATION', -360, 360),
  a('rotation.jitter', 'ROTATION JITTER', 'ROTATION', 0, 180),

  /* --- colour --- */
  c('color.solid', 'COLOR', 'COLOR'),
  a('color.hueShift', 'HUE SHIFT', 'COLOR', -720, 720),
  n('color.saturation', 'SATURATION', 'COLOR', -1, 1, 0.01, 2),
  n('color.brightness', 'COLOR BRIGHTNESS', 'COLOR', -1, 1, 0.01, 2),
  n('color.jitter', 'COLOR JITTER', 'COLOR', 0, 1, 0.01, 2),
  n('color.gradientOffset', 'GRADIENT OFFSET', 'COLOR', -1, 1, 0.001, 3),
  b('color.reverse', 'REVERSE GRADIENT', 'COLOR'),

  /* --- opacity --- */
  n('opacity.min', 'MIN OPACITY', 'OPACITY', 0, 1, 0.01, 2),
  n('opacity.max', 'MAX OPACITY', 'OPACITY', 0, 1, 0.01, 2),
  n('opacity.gamma', 'OPACITY CURVE', 'OPACITY', 0.1, 4, 0.01, 2),
  n('opacity.jitter', 'OPACITY JITTER', 'OPACITY', 0, 1, 0.01, 2),

  /* --- density --- */
  n('density.value', 'DENSITY', 'DENSITY', 0, 100, 1, 0, 'elements', '%'),
  n('density.softness', 'DENSITY SOFTNESS', 'DENSITY', 0, 1, 0.01, 2),

  /* --- reveal --- */
  n('reveal.amount', 'REVEAL', 'REVEAL', 0, 1, 0.01, 2),
  n('reveal.softness', 'REVEAL SOFTNESS', 'REVEAL', 0, 1, 0.01, 2),
  a('reveal.angle', 'REVEAL ANGLE', 'REVEAL', -180, 180),
  b('reveal.invert', 'REVEAL INVERT', 'REVEAL'),
  s('reveal.mode', 'REVEAL MODE', 'REVEAL', [
    { value: 'linear', label: 'LINEAR' },
    { value: 'radial', label: 'RADIAL' },
    { value: 'luminance', label: 'LUMINANCE' },
    { value: 'noise', label: 'NOISE' },
  ]),

  /* --- motion --- */
  n('motion.amplitudeX', 'WAVE X', 'MOTION', 0, 200, 0.5, 1, 'elements', 'px'),
  n('motion.amplitudeY', 'WAVE Y', 'MOTION', 0, 200, 0.5, 1, 'elements', 'px'),
  n('motion.frequency', 'WAVE FREQ', 'MOTION', 0.05, 8, 0.05, 2),
  n('motion.phase', 'WAVE PHASE', 'MOTION', 0, 1, 0.001, 3),
  n('motion.swirl', 'SWIRL', 'MOTION', -2, 2, 0.01, 2),
  s('motion.mode', 'WAVE MODE', 'MOTION', [
    { value: 'wave', label: 'WAVE' },
    { value: 'radial', label: 'RADIAL' },
    { value: 'noise', label: 'NOISE' },
  ]),

  /* --- edges --- */
  n('edges.threshold', 'EDGE THRESHOLD', 'EDGES', 0, 1, 0.01, 2),
  n('edges.thickness', 'EDGE THICKNESS', 'EDGES', 0, 24, 0.5, 1, 'elements', 'px'),
  n('edges.contrast', 'EDGE CONTRAST', 'EDGES', 0.1, 4, 0.01, 2),
  n('edges.boost', 'EDGE BOOST', 'EDGES', 0, 2, 0.01, 2),
  b('edges.enabled', 'EDGE MODE', 'EDGES'),

  /* --- zone: the selection driving parameters instead of hiding things --- */
  n('zone.strength', 'ZONE STRENGTH', 'ZONE', 0, 1, 0.01, 2),
  n('zone.sizeScale', 'ZONE SIZE', 'ZONE', 0, 3, 0.01, 2, 'elements', 'x'),
  n('zone.opacityScale', 'ZONE OPACITY', 'ZONE', 0, 3, 0.01, 2, 'elements', 'x'),
  n('zone.densityScale', 'ZONE DENSITY', 'ZONE', 0, 3, 0.01, 2, 'elements', 'x'),
  a('zone.rotate', 'ZONE ROTATE', 'ZONE', -1080, 1080),
  a('zone.hueShift', 'ZONE HUE', 'ZONE', -720, 720),
  n('zone.saturation', 'ZONE SATURATION', 'ZONE', -1, 1, 0.01, 2),
  n('zone.gradientOffset', 'ZONE GRADIENT', 'ZONE', -1, 1, 0.001, 3),
  n('zone.motionAmount', 'ZONE MOTION', 'ZONE', 0, 200, 0.5, 1, 'elements', 'px'),
  n('zone.edgeThickness', 'EDGE THICKNESS', 'ZONE', 0, 24, 0.5, 1, 'elements', 'px'),
  n('zone.edgeSize', 'EDGE SIZE', 'ZONE', 0, 3, 0.01, 2, 'elements', 'x'),
  n('zone.edgeOpacity', 'EDGE OPACITY', 'ZONE', 0, 3, 0.01, 2, 'elements', 'x'),
  a('zone.edgeHue', 'EDGE HUE', 'ZONE', -720, 720),
  b('zone.edgeOnly', 'EDGE ONLY', 'ZONE'),
  b('zone.enabled', 'ZONE ON', 'ZONE'),
  b('zone.outside', 'ZONE OUTSIDE', 'ZONE'),

  /* --- mask --- */
  n('mask.threshold', 'MASK THRESHOLD', 'MASK', 0, 1, 0.01, 2, 'topology'),
  n('mask.feather', 'MASK FEATHER', 'MASK', 0, 0.5, 0.005, 3, 'topology'),
  n('mask.tolerance', 'MASK TOLERANCE', 'MASK', 0.01, 1, 0.005, 3, 'topology'),
  b('mask.enabled', 'MASK ENABLED', 'MASK', 'topology'),
  s('mask.mode', 'MASK MODE', 'MASK', [
    { value: 'gate', label: 'GATE' },
    { value: 'select', label: 'SELECT' },
  ], 'topology'),
  b('mask.invert', 'MASK INVERT', 'MASK', 'topology'),
  c('mask.silhouette.color', 'FILL COLOR', 'MASK', 'cheap'),
  n('mask.silhouette.opacity', 'FILL OPACITY', 'MASK', 0, 1, 0.01, 2, 'cheap'),
  b('mask.silhouette.enabled', 'SHOW FILL', 'MASK', 'cheap'),

  /* --- layers --- */
  c('layers.background.color', 'BG COLOR', 'LAYERS', 'cheap'),
  n('layers.original.opacity', 'PHOTO OPACITY', 'LAYERS', 0, 1, 0.01, 2, 'cheap'),
  b('layers.original.visible', 'SHOW PHOTO', 'LAYERS', 'cheap'),
  n('layers.pattern.opacity', 'PATTERN OPACITY', 'LAYERS', 0, 1, 0.01, 2, 'cheap'),
  b('layers.pattern.visible', 'SHOW PATTERN', 'LAYERS', 'cheap'),
]

const BY_PATH = new Map(ANIMATABLE_PARAMS.map((p) => [p.path, p]))

export function animatableFor(path: string): AnimatableParam | null {
  return BY_PATH.get(path) ?? null
}

export function isAnimatable(path: string): boolean {
  return BY_PATH.has(path)
}

/** Groups in registry order, for the ADD TRACK picker. */
export function animatableGroups(): { group: string; params: AnimatableParam[] }[] {
  const out: { group: string; params: AnimatableParam[] }[] = []
  for (const p of ANIMATABLE_PARAMS) {
    let bucket = out.find((g) => g.group === p.group)
    if (!bucket) {
      bucket = { group: p.group, params: [] }
      out.push(bucket)
    }
    bucket.params.push(p)
  }
  return out
}
