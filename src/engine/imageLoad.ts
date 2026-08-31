import type { CustomSymbolDef } from '../types/editor'

export const MAX_SOURCE_SIDE = 6000

export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('IMAGE DECODE FAILED'))
    img.src = src
  })
}

function readAsDataURL(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result))
    fr.onerror = () => reject(new Error('FILE READ FAILED'))
    fr.readAsDataURL(file)
  })
}

function readAsText(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result))
    fr.onerror = () => reject(new Error('FILE READ FAILED'))
    fr.readAsText(file)
  })
}

/**
 * Decodes a user image into a same-origin canvas. Nothing leaves the browser:
 * the file is read with FileReader and drawn locally.
 */
export async function loadImageFile(file: File): Promise<HTMLCanvasElement> {
  const type = file.type || ''
  if (!ACCEPTED_IMAGE_TYPES.includes(type) && !/\.(png|jpe?g|webp)$/i.test(file.name)) {
    throw new Error('UNSUPPORTED FORMAT: ' + (type || file.name))
  }
  const url = await readAsDataURL(file)
  const img = await loadImageElement(url)

  let w = img.naturalWidth || img.width
  let h = img.naturalHeight || img.height
  if (!w || !h) throw new Error('INVALID IMAGE DIMENSIONS')

  const s = Math.min(1, MAX_SOURCE_SIDE / Math.max(w, h))
  w = Math.max(1, Math.round(w * s))
  h = Math.max(1, Math.round(h * s))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('CANVAS CONTEXT UNAVAILABLE')
  ctx.clearRect(0, 0, w, h)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, w, h)
  return canvas
}

/** Makes sure an SVG has intrinsic dimensions so <img> can rasterise it. */
function normaliseSvg(text: string): { src: string; width: number; height: number } {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml')
  const svg = doc.documentElement
  if (!svg || svg.nodeName.toLowerCase() !== 'svg') throw new Error('INVALID SVG')

  let w = parseFloat(svg.getAttribute('width') || '')
  let h = parseFloat(svg.getAttribute('height') || '')
  const vb = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(parseFloat)
  if ((!w || !h) && vb.length === 4 && vb.every((n) => !Number.isNaN(n))) {
    w = vb[2]
    h = vb[3]
  }
  if (!w || !h) {
    w = 128
    h = 128
  }
  if (!svg.getAttribute('viewBox')) svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
  // rasterise at a workable size regardless of the authored units
  const scale = 256 / Math.max(w, h)
  svg.setAttribute('width', String(Math.round(w * scale)))
  svg.setAttribute('height', String(Math.round(h * scale)))

  const out = new XMLSerializer().serializeToString(svg)
  return {
    src: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(out),
    width: w,
    height: h,
  }
}

export async function loadCustomSymbol(file: File): Promise<CustomSymbolDef> {
  const isSvg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)
  const isPng = file.type === 'image/png' || /\.png$/i.test(file.name)
  if (!isSvg && !isPng) throw new Error('SYMBOL MUST BE SVG OR PNG')

  let src: string
  let aspect = 1
  if (isSvg) {
    const text = await readAsText(file)
    const norm = normaliseSvg(text)
    src = norm.src
    aspect = norm.width / norm.height
  } else {
    src = await readAsDataURL(file)
  }

  const img = await loadImageElement(src)
  if (!isSvg) aspect = (img.naturalWidth || 1) / (img.naturalHeight || 1)

  const base = file.name.replace(/\.[^.]+$/, '').toUpperCase().slice(0, 16) || 'CUSTOM'
  return {
    id: 'custom-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e4).toString(36),
    label: base,
    kind: isSvg ? 'svg' : 'png',
    src,
    image: img,
    recolor: isSvg,
    aspect: aspect || 1,
  }
}
