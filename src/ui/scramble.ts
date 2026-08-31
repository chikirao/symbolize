import { mulberry32 } from '../engine/random'

export const GLYPH_POOL =
  '!<>-_\\/[]{}=+*^?#________0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ.:;|░▒▓█'

let reducedQuery: MediaQueryList | null = null

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  if (!reducedQuery) reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  return reducedQuery.matches
}

/**
 * Replaces an element's text with random glyphs and resolves it left-to-right.
 * Runs entirely on the DOM node — no React state per frame.
 * Returns a cancel function.
 */
export function scrambleText(
  el: HTMLElement,
  finalText: string,
  duration = 260,
  seed = 1,
): () => void {
  if (prefersReducedMotion() || duration <= 0) {
    el.textContent = finalText
    return () => {}
  }

  const chars = Array.from(finalText)
  const rnd = mulberry32(seed >>> 0)
  const starts = chars.map(() => rnd() * 0.55)
  const spans = chars.map(() => 0.2 + rnd() * 0.35)
  const t0 = performance.now()
  let raf = 0
  let cancelled = false

  const step = () => {
    if (cancelled) return
    const t = (performance.now() - t0) / duration
    if (t >= 1) {
      el.textContent = finalText
      return
    }
    let out = ''
    for (let i = 0; i < chars.length; i++) {
      const c = chars[i]
      if (c === ' ' || c === '\n') {
        out += c
        continue
      }
      const local = (t - starts[i]) / spans[i]
      if (local >= 1) out += c
      else if (local <= 0) out += GLYPH_POOL[(rnd() * GLYPH_POOL.length) | 0]
      else out += rnd() < local * 0.6 ? c : GLYPH_POOL[(rnd() * GLYPH_POOL.length) | 0]
    }
    el.textContent = out
    raf = requestAnimationFrame(step)
  }

  raf = requestAnimationFrame(step)
  return () => {
    cancelled = true
    cancelAnimationFrame(raf)
    el.textContent = finalText
  }
}

/**
 * Numeric roll used by RANDOMIZE SEED: the value flickers through random
 * digits for a moment and lands on the real one.
 */
export function scrambleNumber(
  el: HTMLElement,
  finalValue: string,
  duration = 320,
): () => void {
  if (prefersReducedMotion()) {
    el.textContent = finalValue
    return () => {}
  }
  const t0 = performance.now()
  const len = finalValue.length
  let raf = 0
  let cancelled = false
  const step = () => {
    if (cancelled) return
    const t = (performance.now() - t0) / duration
    if (t >= 1) {
      el.textContent = finalValue
      return
    }
    const resolved = Math.floor(t * t * len)
    let out = finalValue.slice(0, resolved)
    for (let i = resolved; i < len; i++) out += ((Math.random() * 10) | 0).toString()
    el.textContent = out
    raf = requestAnimationFrame(step)
  }
  raf = requestAnimationFrame(step)
  return () => {
    cancelled = true
    cancelAnimationFrame(raf)
    el.textContent = finalValue
  }
}
