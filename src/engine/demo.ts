/**
 * Procedural bust silhouette used on first run so the app never opens on an
 * empty grey canvas. Transparent background + soft internal shading, which
 * exercises luminance, alpha and edge paths straight away.
 */
export function buildDemoImage(w = 900, h = 1120): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  ctx.clearRect(0, 0, w, h)

  const cx = w / 2
  const headR = w * 0.205
  const headY = h * 0.315

  // --- silhouette path ------------------------------------------------
  ctx.save()
  ctx.beginPath()
  // shoulders / torso
  ctx.moveTo(w * 0.06, h)
  ctx.bezierCurveTo(w * 0.08, h * 0.78, w * 0.26, h * 0.65, w * 0.385, h * 0.585)
  ctx.lineTo(w * 0.615, h * 0.585)
  ctx.bezierCurveTo(w * 0.74, h * 0.65, w * 0.92, h * 0.78, w * 0.94, h)
  ctx.closePath()
  ctx.fillStyle = '#ffffff'
  ctx.fill()

  // neck
  ctx.beginPath()
  ctx.moveTo(cx - w * 0.085, h * 0.44)
  ctx.lineTo(cx + w * 0.085, h * 0.44)
  ctx.lineTo(cx + w * 0.105, h * 0.6)
  ctx.lineTo(cx - w * 0.105, h * 0.6)
  ctx.closePath()
  ctx.fill()

  // head
  ctx.beginPath()
  ctx.ellipse(cx, headY, headR * 0.86, headR * 1.13, 0, 0, Math.PI * 2)
  ctx.fill()

  // hair mass
  ctx.beginPath()
  ctx.ellipse(cx, headY - headR * 0.34, headR * 1.0, headR * 0.94, 0, Math.PI, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  // --- shading: only inside the silhouette ----------------------------
  ctx.globalCompositeOperation = 'source-in'

  const g = ctx.createLinearGradient(w * 0.18, 0, w * 0.92, h)
  g.addColorStop(0, '#ffffff')
  g.addColorStop(0.45, '#b9b9b9')
  g.addColorStop(1, '#1c1c1c')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)

  const rg = ctx.createRadialGradient(cx - headR * 0.5, headY - headR * 0.55, headR * 0.08, cx, headY, headR * 2.4)
  rg.addColorStop(0, 'rgba(255,255,255,0.95)')
  rg.addColorStop(0.5, 'rgba(255,255,255,0.12)')
  rg.addColorStop(1, 'rgba(0,0,0,0.55)')
  ctx.globalCompositeOperation = 'source-atop'
  ctx.fillStyle = rg
  ctx.fillRect(0, 0, w, h)

  // subtle horizontal banding gives the halftone something to bite on
  ctx.globalAlpha = 0.09
  for (let y = 0; y < h; y += 14) {
    ctx.fillStyle = y % 28 === 0 ? '#000000' : '#ffffff'
    ctx.fillRect(0, y, w, 7)
  }
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'

  return c
}
