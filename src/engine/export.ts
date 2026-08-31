import type { CustomSymbolDef, EditorSettings, RenderStats, SourceMaps } from '../types/editor'
import { renderCompositeAsync } from './renderer'

export type ExportFormat = 'png' | 'jpeg' | 'webp'

export const MAX_EXPORT_SIDE = 8192
export const MAX_EXPORT_PIXELS = 48_000_000

export interface ExportRequest {
  settings: EditorSettings
  maps: SourceMaps
  original: HTMLCanvasElement | null
  customSymbols: CustomSymbolDef[]
  width: number
  height: number
  format: ExportFormat
  quality: number // 0..1 for jpeg/webp
}

export interface ExportResult {
  blob: Blob
  stats: RenderStats
  width: number
  height: number
}

export function clampExportSize(w: number, h: number): [number, number] {
  let ow = Math.max(1, Math.round(w))
  let oh = Math.max(1, Math.round(h))
  const sideScale = Math.min(1, MAX_EXPORT_SIDE / Math.max(ow, oh))
  ow = Math.max(1, Math.round(ow * sideScale))
  oh = Math.max(1, Math.round(oh * sideScale))
  const px = ow * oh
  if (px > MAX_EXPORT_PIXELS) {
    const s = Math.sqrt(MAX_EXPORT_PIXELS / px)
    ow = Math.max(1, Math.round(ow * s))
    oh = Math.max(1, Math.round(oh * s))
  }
  return [ow, oh]
}

/**
 * Renders at full export resolution — never a scaled-up preview canvas.
 * All spatial parameters live in image space, so scaling the output scales the
 * whole composition uniformly and the layout matches the preview exactly.
 */
export async function renderExport(
  req: ExportRequest,
  onProgress?: (p: number) => void,
): Promise<ExportResult> {
  const [w, h] = clampExportSize(req.width, req.height)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('CANVAS CONTEXT UNAVAILABLE')

  const scale = w / req.maps.imageWidth

  const stats = await renderCompositeAsync(
    {
      ctx,
      outputWidth: w,
      outputHeight: h,
      scale,
      maps: req.maps,
      settings: req.settings,
      original: req.original,
      customSymbols: req.customSymbols,
    },
    onProgress,
  )

  const mime = req.format === 'png' ? 'image/png' : req.format === 'jpeg' ? 'image/jpeg' : 'image/webp'
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, mime, req.format === 'png' ? undefined : req.quality)
  })
  if (!blob) throw new Error('ENCODE FAILED: ' + mime)

  // free the backing store early on large exports
  canvas.width = 1
  canvas.height = 1

  return { blob, stats, width: w, height: h }
}

function pad(n: number): string {
  return n < 10 ? '0' + n : String(n)
}

export function buildFilename(format: ExportFormat): string {
  const d = new Date()
  const stamp =
    d.getFullYear() +
    '-' +
    pad(d.getMonth() + 1) +
    '-' +
    pad(d.getDate()) +
    '-' +
    pad(d.getHours()) +
    pad(d.getMinutes())
  const ext = format === 'jpeg' ? 'jpg' : format
  return `symbol-halftone-${stamp}.${ext}`
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export function canCopyToClipboard(): boolean {
  return typeof ClipboardItem !== 'undefined' && !!navigator.clipboard?.write
}

export async function copyBlobToClipboard(blob: Blob): Promise<void> {
  if (!canCopyToClipboard()) throw new Error('CLIPBOARD IMAGE API UNAVAILABLE')
  if (blob.type !== 'image/png') throw new Error('CLIPBOARD SUPPORTS PNG ONLY')
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
}
