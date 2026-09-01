import demoBunnyUrl from '../assets/demo-bunny.jpg'

/**
 * The real demo image: a toy on a flat dark background. Bundled as a local
 * asset (never fetched over the network) and decoded on demand. Falls back to
 * the procedural bust below if decoding ever fails, so first run never opens
 * on an empty canvas.
 */
export async function loadDemoImage(): Promise<HTMLCanvasElement> {
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('DEMO IMAGE DECODE FAILED'))
      el.src = demoBunnyUrl
    })
    const w = img.naturalWidth || img.width
    const h = img.naturalHeight || img.height
    if (!w || !h) throw new Error('INVALID DEMO IMAGE')
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const ctx = c.getContext('2d')
    if (!ctx) throw new Error('CANVAS CONTEXT UNAVAILABLE')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, w, h)
    return c
  } catch {
    return buildProceduralDemoImage()
  }
}

/**
 * Procedural bust silhouette — the original built-in demo, kept as a fallback.
 * Transparent background + soft internal shading, which exercises luminance,
 * alpha and edge paths straight away.
 */
export function buildProceduralDemoImage(w = 900, h = 1120): HTMLCanvasElement {
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
  g.addColorStop(0, '#e2e2e2')
  g.addColorStop(0.45, '#8f8f8f')
  g.addColorStop(1, '#101010')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)

  const rg = ctx.createRadialGradient(cx - headR * 0.5, headY - headR * 0.55, headR * 0.08, cx, headY, headR * 2.4)
  rg.addColorStop(0, 'rgba(255,255,255,0.6)')
  rg.addColorStop(0.42, 'rgba(255,255,255,0.05)')
  rg.addColorStop(1, 'rgba(0,0,0,0.5)')
  ctx.globalCompositeOperation = 'source-atop'
  ctx.fillStyle = rg
  ctx.fillRect(0, 0, w, h)

  // dark hair mass + cheek shadow: gives the default view real tonal structure
  ctx.globalCompositeOperation = 'source-atop'
  ctx.fillStyle = 'rgba(6,6,6,0.82)'
  ctx.beginPath()
  ctx.ellipse(cx, headY - headR * 0.44, headR * 0.99, headR * 0.82, 0, Math.PI, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(0,0,0,0.34)'
  ctx.beginPath()
  ctx.ellipse(cx + headR * 0.48, headY + headR * 0.18, headR * 0.42, headR * 0.66, -0.2, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.3)'
  ctx.beginPath()
  ctx.ellipse(cx - headR * 0.3, headY + headR * 0.22, headR * 0.34, headR * 0.5, 0.15, 0, Math.PI * 2)
  ctx.fill()

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
