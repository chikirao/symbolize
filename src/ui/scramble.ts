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
 * Scrambles every piece of text inside a container at once, resolving roughly
 * top-to-bottom. Used when a panel opens so the whole block materialises out of
 * noise instead of only its title.
 *
 * Text nodes are written directly; React is never asked to re-render per frame.
 */
export function scrambleSubtree(root: HTMLElement, duration = 260, maxNodes = 220): () => void {
  if (prefersReducedMotion() || duration <= 0) return () => {}

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const text = node.nodeValue
      if (!text || !text.trim()) return NodeFilter.FILTER_REJECT
      const parent = node.parentElement
      // never touch form controls or the tag name of replaced elements
      if (!parent || parent.closest('input, textarea, select, canvas, option')) {
        return NodeFilter.FILTER_REJECT
      }
      return NodeFilter.FILTER_ACCEPT
    },
  })

  const nodes: Text[] = []
  const originals: string[] = []
  const chars: string[][] = []
  let current = walker.nextNode()
  while (current && nodes.length < maxNodes) {
    const text = current.nodeValue as string
    nodes.push(current as Text)
    originals.push(text)
    chars.push(Array.from(text))
    current = walker.nextNode()
  }
  if (nodes.length === 0) return () => {}

  const rnd = mulberry32(nodes.length * 2654435761)
  // later nodes start later, so the block resolves downwards
  const delays = nodes.map((_, i) => (i / nodes.length) * 0.45)
  const t0 = performance.now()
  let raf = 0
  let cancelled = false

  const restore = () => {
    for (let i = 0; i < nodes.length; i++) nodes[i].nodeValue = originals[i]
  }

  const step = () => {
    if (cancelled) return
    const t = (performance.now() - t0) / duration
    if (t >= 1) {
      restore()
      root.removeEventListener('pointerdown', cancel)
      return
    }
    for (let i = 0; i < nodes.length; i++) {
      const local = (t - delays[i]) / 0.55
      if (local >= 1) {
        if (nodes[i].nodeValue !== originals[i]) nodes[i].nodeValue = originals[i]
        continue
      }
      const src = chars[i]
      let out = ''
      for (let c = 0; c < src.length; c++) {
        const ch = src[c]
        if (ch === ' ' || ch === '\n') out += ch
        else if (local > 0 && rnd() < local) out += ch
        else out += GLYPH_POOL[(rnd() * GLYPH_POOL.length) | 0]
      }
      nodes[i].nodeValue = out
    }
    raf = requestAnimationFrame(step)
  }

  function cancel() {
    if (cancelled) return
    cancelled = true
    cancelAnimationFrame(raf)
    restore()
    root.removeEventListener('pointerdown', cancel)
  }

  // touching a control mid-animation stops it rather than fighting React
  root.addEventListener('pointerdown', cancel)
  raf = requestAnimationFrame(step)
  return cancel
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
