/* Deterministic, seeded randomness. Same seed + same settings => same image. */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 32-bit integer hash of three values. Order independent of call count. */
export function hash3(seed: number, x: number, y: number): number {
  let h = seed >>> 0
  h = Math.imul(h ^ (x >>> 0), 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h ^ (y >>> 0), 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}

/** Per-cell generator: independent of how many random values other cells consumed. */
export function rngAt(seed: number, col: number, row: number): () => number {
  return mulberry32(hash3(seed, col + 0x9e37, row + 0x7f4a))
}

function hashFloat(seed: number, x: number, y: number): number {
  return hash3(seed, x | 0, y | 0) / 4294967296
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t)
}

/** Smooth 2D value noise in 0..1. */
export function valueNoise(seed: number, x: number, y: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const a = hashFloat(seed, xi, yi)
  const b = hashFloat(seed, xi + 1, yi)
  const c = hashFloat(seed, xi, yi + 1)
  const d = hashFloat(seed, xi + 1, yi + 1)
  const u = smooth(xf)
  const v = smooth(yf)
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v
}

export function randomSeed(): number {
  return (Math.random() * 0xffffff) >>> 0
}
