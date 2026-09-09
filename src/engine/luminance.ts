import type { SourceMaps } from '../types/editor'

/**
 * Longest side of the analysis buffers. Sampling reads from these typed arrays
 * instead of calling getImageData per element.
 */
export const ANALYSIS_MAX = 1800

export function analysisSizeFor(w: number, h: number): [number, number] {
  const long = Math.max(w, h)
  if (long <= ANALYSIS_MAX) return [Math.max(1, w), Math.max(1, h)]
  const s = ANALYSIS_MAX / long
  return [Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s))]
}

/**
 * One-time pass over the pixels: luminance, alpha and average RGB maps.
 * L = 0.2126 R + 0.7152 G + 0.0722 B
 *
 * `width`/`height` are only needed for sources that do not carry usable
 * intrinsic dimensions; a canvas or an `ImageBitmap` reports its own.
 */
export function buildSourceMaps(
  source: CanvasImageSource,
  width?: number,
  height?: number,
): SourceMaps {
  const intrinsic = source as { width?: number; height?: number }
  const imageWidth = width ?? intrinsic.width ?? 1
  const imageHeight = height ?? intrinsic.height ?? 1
  const [aw, ah] = analysisSizeFor(imageWidth, imageHeight)

  const scratch = document.createElement('canvas')
  scratch.width = aw
  scratch.height = ah
  const ctx = scratch.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.clearRect(0, 0, aw, ah)
  ctx.drawImage(source, 0, 0, aw, ah)

  const data = ctx.getImageData(0, 0, aw, ah).data
  const n = aw * ah
  const lum = new Float32Array(n)
  const alpha = new Float32Array(n)
  const rgb = new Uint8ClampedArray(n * 3)

  for (let i = 0; i < n; i++) {
    const p = i * 4
    const a = data[p + 3] / 255
    // Canvas gives premultiplied-looking values already un-premultiplied by the
    // 2D spec, so raw channels are the straight colours.
    const r = data[p]
    const g = data[p + 1]
    const b = data[p + 2]
    lum[i] = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
    alpha[i] = a
    rgb[i * 3] = r
    rgb[i * 3 + 1] = g
    rgb[i * 3 + 2] = b
  }

  return {
    width: aw,
    height: ah,
    imageWidth,
    imageHeight,
    scale: aw / imageWidth,
    lum,
    alpha,
    rgb,
    edge: null,
  }
}
