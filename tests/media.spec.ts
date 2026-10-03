import { test, expect } from '@playwright/test'

for (const format of ['gif', 'apng'] as const) {
  test(`${format} round-trips moving pixels and frame timing through the native decoder`, async ({ page }) => {
    await page.goto('./')
    const result = await page.evaluate(async (format) => {
      const base = '/symbolize/src/engine/'
      const width = 16, height = 16, count = 12
      const frames = Array.from({ length: count }, (_, frame) => {
        const rgba = new Uint8ClampedArray(width * height * 4)
        for (let pixel = 0; pixel < width * height; pixel++) {
          rgba[pixel * 4] = pixel % width === frame ? 255 : 0
          rgba[pixel * 4 + 3] = format === 'apng' && pixel % 3 === 0 ? 128 : 255
        }
        return rgba
      })
      const writer = format === 'gif'
        ? new (await import(base + 'encode/gif.ts')).GifWriter({ width, height, dither: false })
        : new (await import(base + 'encode/apng.ts')).ApngWriter({ width, height, frameCount: count })
      for (const frame of frames) await writer.addFrame(frame, 1000 / 12)
      const blob = writer.finish()
      const data = await blob.arrayBuffer()
      const decoder = new (window as any).ImageDecoder({ data, type: blob.type })
      await decoder.tracks.ready
      const canvas = document.createElement('canvas')
      canvas.width = width; canvas.height = height
      const context = canvas.getContext('2d')!
      let maxError = 0, duration = 0
      for (let i = 0; i < count; i++) {
        const { image } = await decoder.decode({ frameIndex: i })
        context.clearRect(0, 0, width, height)
        context.drawImage(image, 0, 0)
        const pixels = context.getImageData(0, 0, width, height).data
        for (let j = 0; j < pixels.length; j++) maxError = Math.max(maxError, Math.abs(pixels[j] - frames[i][j]))
        duration += image.duration
        image.close()
      }
      let ownFrames = count
      let ownError = 0
      if (format === 'gif') {
        const { decodeGifFrames } = await import(base + 'gifDecode.ts')
        const media = await decodeGifFrames(new Uint8Array(data))
        ownFrames = media.frames.length
        for (let i = 0; i < media.frames.length; i++) {
          const frame = media.frames[i]
          context.clearRect(0, 0, width, height)
          context.drawImage(frame.bitmap, 0, 0)
          const pixels = context.getImageData(0, 0, width, height).data
          for (let j = 0; j < pixels.length; j++) ownError = Math.max(ownError, Math.abs(pixels[j] - frames[i][j]))
          frame.bitmap.close()
        }
      }
      const frameCount = decoder.tracks.selectedTrack.frameCount
      decoder.close()
      return { maxError, duration, frameCount, ownFrames, ownError }
    }, format)
    expect(result.maxError).toBe(0)
    expect(result.frameCount).toBe(12)
    expect(result.ownFrames).toBe(12)
    expect(result.ownError).toBe(0)
    expect(Math.abs(result.duration - 1_000_000)).toBeLessThanOrEqual(10_000)
  })
}

test('PNG export has requested dimensions and same-seed pixels are repeatable', async ({ page }) => {
  await page.goto('./')
  await page.waitForFunction(() => (window as any).__editor?.getState().image)
  const result = await page.evaluate(async () => {
    const base = '/symbolize/src/engine/'
    const { renderExport } = await import(base + 'export.ts')
    const editor = (window as any).__editor.getState()
    const request = { settings: editor.settings, maps: editor.maps, original: editor.image.canvas,
      customSymbols: [], textSymbols: [], width: 64, height: 64, format: 'png', quality: 1 }
    const pixels = async () => {
      const result = await renderExport(request)
      const image = await createImageBitmap(result.blob)
      const canvas = document.createElement('canvas')
      canvas.width = image.width; canvas.height = image.height
      const context = canvas.getContext('2d')!
      context.drawImage(image, 0, 0)
      image.close()
      return { width: canvas.width, height: canvas.height, data: Array.from(context.getImageData(0, 0, canvas.width, canvas.height).data) }
    }
    const first = await pixels(), second = await pixels()
    return { width: first.width, height: first.height, equal: first.data.every((value, i) => value === second.data[i]), visible: first.data.some((value, i) => i % 4 === 3 && value > 0) }
  })
  expect(result).toEqual({ width: 64, height: 64, equal: true, visible: true })
})
