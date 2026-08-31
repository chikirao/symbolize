import { prefersReducedMotion } from './scramble'

const POOL = '#%+/X><:.▓▒░=*-|\\'

/**
 * Short ASCII wipe drawn on a transparent overlay canvas above the preview.
 * Purely a UI transition: it never touches the rendered artwork.
 */
export function runGlitchOverlay(
  canvas: HTMLCanvasElement,
  duration = 220,
  cell = 26,
): () => void {
  if (prefersReducedMotion()) return () => {}
  const ctx = canvas.getContext('2d')
  if (!ctx) return () => {}

  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  if (w < 4 || h < 4) return () => {}
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)

  const cols = Math.ceil(w / cell)
  const rows = Math.ceil(h / cell)
  const t0 = performance.now()
  let raf = 0
  let cancelled = false

  const step = () => {
    if (cancelled) return
    const t = (performance.now() - t0) / duration
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    if (t >= 1) {
      canvas.width = 1
      canvas.height = 1
      return
    }
    // 0 -> peak around 0.45 -> 0
    const density = Math.sin(Math.PI * Math.min(1, t)) ** 1.15 * 0.9
    ctx.font = `${Math.round(cell * 0.8)}px "Ubuntu Mono", monospace`
    ctx.textBaseline = 'top'
    ctx.fillStyle = '#ffffff'
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (Math.random() > density) continue
        ctx.globalAlpha = 0.35 + Math.random() * 0.55
        ctx.fillText(POOL[(Math.random() * POOL.length) | 0], c * cell, r * cell)
      }
    }
    ctx.globalAlpha = 1
    raf = requestAnimationFrame(step)
  }
  raf = requestAnimationFrame(step)

  return () => {
    cancelled = true
    cancelAnimationFrame(raf)
    canvas.width = 1
    canvas.height = 1
  }
}
