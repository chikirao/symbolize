import { GLYPH_POOL, prefersReducedMotion } from './scramble'

/**
 * The handoff from the boot screen to the interface.
 *
 * A band of ASCII noise sweeps from the top of the window to the bottom; the UI
 * is masked to that front, so every panel materialises exactly as the wave
 * reaches it, and every line of text resolves out of random glyphs just behind
 * it. Nothing here is React state: one mask string and a canvas per frame.
 */

const WAVE_MS = 1500 // time the front takes to cross the window
const BAND = 230 // px of trailing noise behind the front
const AHEAD = 46 // px of scatter running ahead of it
const RESOLVE_PX = 420 // front travel over which one line of text resolves
// The interface trails the wave rather than riding it: the band of noise passes
// first, and panels light up in its wake far enough behind to be watched.
const REVEAL_LAG = 210
const CELL_W = 9
const CELL_H = 16
const MAX_NODES = 900

interface Line {
  node: Text
  original: string
  chars: string[]
  y: number
}

let active: (() => void) | null = null

/** Hides the interface until the intro runs. Safe to call more than once. */
export function armIntro(root: HTMLElement): void {
  if (prefersReducedMotion()) return
  root.classList.add('intro-armed')
}

function setMask(root: HTMLElement, front: number): void {
  // Almost a hard cut. Now that the reveal trails the noise band, a long ramp
  // would read as a grey smear crossing the screen instead of a drawn line.
  const soft = Math.max(0, front - 14)
  const gradient = `linear-gradient(to bottom, #000 0, #000 ${soft}px, transparent ${front}px)`
  root.style.setProperty('-webkit-mask-image', gradient)
  root.style.setProperty('mask-image', gradient)
}

function clearMask(root: HTMLElement): void {
  root.style.removeProperty('-webkit-mask-image')
  root.style.removeProperty('mask-image')
}

/** Text nodes worth animating, paired with the screen row they live on. */
function collectLines(root: HTMLElement): Line[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const text = node.nodeValue
      if (!text || !text.trim()) return NodeFilter.FILTER_REJECT
      const parent = node.parentElement
      if (!parent || parent.closest('input, textarea, select, canvas, option')) {
        return NodeFilter.FILTER_REJECT
      }
      return NodeFilter.FILTER_ACCEPT
    },
  })

  const lines: Line[] = []
  let current = walker.nextNode()
  // every rect is read before a single character is written, so the whole
  // collection pass costs one layout
  while (current && lines.length < MAX_NODES) {
    const node = current as Text
    const parent = node.parentElement as HTMLElement
    const rect = parent.getBoundingClientRect()
    current = walker.nextNode()
    if (rect.width === 0 && rect.height === 0) continue // hidden, leave it alone
    const text = node.nodeValue as string
    lines.push({ node, original: text, chars: Array.from(text), y: rect.top })
  }
  return lines
}

/**
 * Runs the reveal. Resolves once the interface is fully drawn and every text
 * node holds its real value again.
 */
export function runIntro(root: HTMLElement, waveMs = WAVE_MS): Promise<void> {
  active?.()

  if (prefersReducedMotion()) {
    root.classList.remove('intro-armed')
    clearMask(root)
    return Promise.resolve()
  }

  // paint the closed mask before unhiding, or the first frame flashes the
  // finished interface
  setMask(root, 0)
  root.classList.remove('intro-armed')
  root.style.pointerEvents = 'none'

  const lines = collectLines(root)
  const resolved = new Uint8Array(lines.length)

  const canvas = document.createElement('canvas')
  canvas.className = 'intro-wave'
  canvas.setAttribute('aria-hidden', 'true')
  document.body.appendChild(canvas)
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const vw = window.innerWidth
  const vh = window.innerHeight
  canvas.width = Math.round(vw * dpr)
  canvas.height = Math.round(vh * dpr)
  const ctx = canvas.getContext('2d')

  const cols = Math.ceil(vw / CELL_W) + 1
  const total = vh + BAND
  const speed = total / waveMs // px per ms, kept for the tail
  // Time is accumulated per frame with a clamp instead of read off the wall
  // clock: a background tab pauses rAF, and without this the sweep would jump
  // straight to the end the moment the tab came back.
  let elapsed = 0
  let last = performance.now()
  let raf = 0
  let done = false

  return new Promise<void>((resolve) => {
    const finish = () => {
      if (done) return
      done = true
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', skip, true)
      window.removeEventListener('pointerdown', skip, true)
      for (let i = 0; i < lines.length; i++) lines[i].node.nodeValue = lines[i].original
      clearMask(root)
      root.style.removeProperty('pointer-events')
      canvas.remove()
      active = null
      resolve()
    }

    function skip() {
      finish()
    }

    const step = () => {
      if (done) return
      const now = performance.now()
      elapsed += Math.min(48, now - last)
      last = now
      const t = Math.min(1, elapsed / waveMs)
      // ease in and out so the wave leans into the middle of the screen
      const eased = 0.5 - 0.5 * Math.cos(Math.PI * t)
      // past the bottom the front keeps travelling so the last rows resolve
      const front = t < 1 ? eased * total : total + (elapsed - waveMs) * speed
      const reveal = front - REVEAL_LAG

      if (reveal < vh) setMask(root, Math.max(0, reveal))
      else clearMask(root)

      /* ---- text resolves just behind the front ---- */
      let pending = false
      for (let i = 0; i < lines.length; i++) {
        if (resolved[i]) continue
        const line = lines[i]
        const local = (reveal - line.y) / RESOLVE_PX
        if (local <= 0) {
          pending = true
          continue
        }
        if (local >= 1) {
          line.node.nodeValue = line.original
          resolved[i] = 1
          continue
        }
        pending = true
        const src = line.chars
        let out = ''
        for (let c = 0; c < src.length; c++) {
          const ch = src[c]
          if (ch === ' ' || ch === '\n') out += ch
          else if (Math.random() < local) out += ch
          else out += GLYPH_POOL[(Math.random() * GLYPH_POOL.length) | 0]
        }
        line.node.nodeValue = out
      }

      /* ---- the wave itself ---- */
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.clearRect(0, 0, vw, vh)
        ctx.font = `${CELL_H - 3}px "Ubuntu Mono", "JetBrains Mono", monospace`
        ctx.textBaseline = 'top'
        ctx.fillStyle = '#ffffff'
        // the band fades out once there is nothing left to cover
        const tail = t < 1 ? 1 : Math.max(0, 1 - (elapsed - waveMs) / 320)
        if (tail > 0) {
          const top = Math.max(-CELL_H, Math.floor((front - BAND) / CELL_H) * CELL_H)
          for (let y = top; y < Math.min(vh, front + AHEAD); y += CELL_H) {
            const d = (front - y) / BAND
            let density: number
            if (d < 0) density = 0.16 * (1 + d * (BAND / AHEAD)) // scatter ahead
            else density = (1 - d) ** 1.6 * 0.78
            if (density <= 0.002) continue
            const edge = d >= 0 && d < 0.05
            for (let c = 0; c < cols; c++) {
              if (Math.random() > density) continue
              ctx.globalAlpha = (edge ? 0.75 + Math.random() * 0.25 : 0.25 + Math.random() * 0.5) * tail
              const glyph = edge
                ? '█▓▒'[(Math.random() * 3) | 0]
                : GLYPH_POOL[(Math.random() * GLYPH_POOL.length) | 0]
              ctx.fillText(glyph, c * CELL_W, y)
            }
          }
        }
        ctx.globalAlpha = 1
      }

      if (t >= 1 && !pending && elapsed - waveMs > 320) {
        finish()
        return
      }
      raf = requestAnimationFrame(step)
    }

    active = finish
    raf = requestAnimationFrame(step)
    // a click or a key mid-sweep means "just show me the app"
    window.setTimeout(() => {
      if (done) return
      window.addEventListener('keydown', skip, true)
      window.addEventListener('pointerdown', skip, true)
    }, 260)
  })
}

/** VIEW > REPLAY INTRO. */
export function replayIntro(waveMs?: number): Promise<void> {
  const root = document.getElementById('root')
  if (!root) return Promise.resolve()
  return runIntro(root, waveMs)
}
