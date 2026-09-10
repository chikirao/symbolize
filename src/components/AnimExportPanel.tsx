import React, { useEffect, useRef, useState } from 'react'
import { useEditor } from '../store/editorStore'
import { join, tr, useMessageT, useT } from '../i18n'
import { useAnim } from '../store/animStore'
import { clampExportSize, downloadBlob } from '../engine/export'
import {
  MAX_ANIM_FRAMES,
  animFrameCount,
  estimateAnimCost,
  renderAnimation,
  type AnimFormat,
} from '../engine/animExport'
import { hasWebCodecs } from '../engine/encode/webm'
import { canWriteApng } from '../engine/encode/apng'
import { AsciiMeter } from './SliderControl'
import { NumberField, Row, Scramble, SelectControl, Toggle } from './Primitives'

type ScaleMode = '1' | '2' | '4' | 'custom'

const FORMAT_NOTE: Record<AnimFormat, string> = {
  gif: 'EVERYWHERE :: 256 COLOURS :: 1-BIT ALPHA',
  webm: 'SMALL AND SHARP :: NO ALPHA :: NEEDS WEBCODECS',
  apng: 'TRUE COLOUR + FULL ALPHA :: LARGER FILES',
  zip: 'ONE PNG PER FRAME :: FOR AFTER EFFECTS / FFMPEG',
}

export function AnimExportPanel() {
  const t = useT()
  const tm = useMessageT()
  const image = useEditor((s) => s.image)
  const maps = useEditor((s) => s.maps)
  const sequence = useEditor((s) => s.sequence)
  const settings = useEditor((s) => s.settings)
  const customSymbols = useEditor((s) => s.customSymbols)
  const textSymbols = useEditor((s) => s.textSymbols)
  const setStatus = useEditor((s) => s.setStatus)
  const project = useAnim((s) => s.project)
  const pause = useAnim((s) => s.pause)

  const [format, setFormat] = useState<AnimFormat>('gif')
  const [scaleMode, setScaleMode] = useState<ScaleMode>('1')
  const [customW, setCustomW] = useState(1080)
  const [fps, setFps] = useState(project.fps)
  const [from, setFrom] = useState(0)
  const [to, setTo] = useState(project.durationFrames - 1)
  const [colors, setColors] = useState(256)
  const [dither, setDither] = useState(true)
  const [globalPalette, setGlobalPalette] = useState(false)
  const [transparent, setTransparent] = useState(false)
  const [bitrate, setBitrate] = useState(6)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [label, setLabel] = useState('')
  const [done, setDone] = useState<string | null>(null)
  const [doneToken, setDoneToken] = useState(0)
  const job = useRef<AbortController | null>(null)

  // the timeline is the source of truth for range and rate until touched
  const lastProject = useRef(project)
  useEffect(() => {
    if (lastProject.current === project) return
    const grew = project.durationFrames !== lastProject.current.durationFrames
    if (grew) {
      setFrom(0)
      setTo(project.durationFrames - 1)
    }
    if (project.fps !== lastProject.current.fps) setFps(project.fps)
    lastProject.current = project
  }, [project])

  const baseW = image?.width ?? 0
  const baseH = image?.height ?? 0
  const aspect = baseH > 0 ? baseW / baseH : 1
  const targetW =
    scaleMode === 'custom' ? customW : baseW * (scaleMode === '2' ? 2 : scaleMode === '4' ? 4 : 1)
  const targetH =
    scaleMode === 'custom'
      ? Math.round(customW / (aspect || 1))
      : baseH * (scaleMode === '2' ? 2 : scaleMode === '4' ? 4 : 1)
  const [outW, outH] = clampExportSize(targetW || 1, targetH || 1)

  const lastFrame = project.durationFrames - 1
  const safeFrom = Math.max(0, Math.min(lastFrame, Math.round(from)))
  const safeTo = Math.max(safeFrom, Math.min(lastFrame, Math.round(to)))
  const frames = animFrameCount(safeFrom, safeTo)
  const cost = estimateAnimCost(targetW || 1, targetH || 1, frames)
  const clipped = safeTo - safeFrom + 1 > MAX_ANIM_FRAMES
  const seconds = (frames / Math.max(1, fps)).toFixed(1)

  const unsupported =
    (format === 'webm' && !hasWebCodecs()) || (format === 'apng' && !canWriteApng())

  const run = async () => {
    if (!maps || !image || busy) return
    pause()
    const controller = new AbortController()
    job.current = controller
    setBusy(true)
    setDone(null)
    setProgress(0)
    setStatus({ kind: 'busy', message: 'EXPORTING ANIMATION...', progress: 0 })
    try {
      const result = await renderAnimation({
        settings,
        project,
        sequence,
        maps,
        original: image.canvas,
        customSymbols,
        textSymbols,
        width: targetW,
        height: targetH,
        format,
        fps,
        from: safeFrom,
        to: safeTo,
        dither,
        transparent,
        maxColors: colors,
        globalPalette,
        bitrate: Math.round(bitrate * 1_000_000),
        signal: controller.signal,
        onProgress: (p, message) => {
          setProgress(p)
          setLabel(message)
          setStatus({ kind: 'busy', message: 'EXPORT :: ' + message, progress: p })
        },
      })
      downloadBlob(result.blob, result.filename)
      const kb = Math.round(result.blob.size / 1024)
      setDone(join(tr('EXPORT COMPLETE'), kb + ' KB'))
      setDoneToken((t) => t + 1)
      setStatus({
        kind: 'ready',
        message: join(
          tr('ANIMATION OK'),
          result.frames + ' ' + tr('FRAMES'),
          result.width + 'x' + result.height,
          kb + ' KB',
          Math.round(result.ms) + 'ms',
        ),
        progress: -1,
      })
    } catch (err) {
      const message = String((err as Error).message || err)
      setDone(null)
      setStatus({
        kind: controller.signal.aborted ? 'ready' : 'error',
        message: controller.signal.aborted
          ? tr('EXPORT CANCELLED')
          : join(tr('ERROR'), message),
        progress: -1,
      })
    } finally {
      job.current = null
      setBusy(false)
      setProgress(0)
      setLabel('')
    }
  }

  return (
    <div className="pl-1">
      <Row label="FORMAT">
        <SelectControl
          value={format}
          width={10}
          ariaLabel="animation format"
          options={[
            { value: 'gif', label: 'GIF' },
            { value: 'webm', label: 'WEBM' },
            { value: 'apng', label: 'APNG' },
            { value: 'zip', label: 'PNG SEQ' },
          ]}
          onChange={(v) => setFormat(v as AnimFormat)}
        />
      </Row>
      <Row label="RESOLUTION">
        <SelectControl
          value={scaleMode}
          width={8}
          ariaLabel="animation resolution"
          options={[
            { value: '1', label: 'ORIGINAL' },
            { value: '2', label: '2X' },
            { value: '4', label: '4X' },
            { value: 'custom', label: 'CUSTOM' },
          ]}
          onChange={(v) => setScaleMode(v as ScaleMode)}
        />
      </Row>
      {scaleMode === 'custom' && (
        <Row label="WIDTH">
          <NumberField
            value={customW}
            min={16}
            max={4096}
            step={1}
            decimals={0}
            ariaLabel="animation width"
            onChange={(v) => setCustomW(Math.round(v))}
          />
        </Row>
      )}
      <Row label="FPS">
        <NumberField
          value={fps}
          min={1}
          max={60}
          step={1}
          decimals={0}
          ariaLabel="export frames per second"
          onChange={(v) => setFps(Math.round(v))}
        />
      </Row>
      <Row label="RANGE FROM">
        <NumberField
          value={safeFrom}
          min={0}
          max={lastFrame}
          step={1}
          decimals={0}
          ariaLabel="first frame"
          onChange={(v) => setFrom(Math.round(v))}
        />
      </Row>
      <Row label="RANGE TO">
        <NumberField
          value={safeTo}
          min={0}
          max={lastFrame}
          step={1}
          decimals={0}
          ariaLabel="last frame"
          onChange={(v) => setTo(Math.round(v))}
        />
      </Row>

      {format === 'gif' && (
        <>
          <Row label="COLORS">
            <NumberField
              value={colors}
              min={2}
              max={256}
              step={1}
              decimals={0}
              ariaLabel="palette size"
              onChange={(v) => setColors(Math.max(2, Math.min(256, Math.round(v))))}
            />
          </Row>
          <Row label="DITHER" hint="spreads quantisation error so gradients do not band">
            <Toggle checked={dither} label="DITHER" onChange={setDither} />
          </Row>
          <Row
            label="ALPHA"
            hint="1-bit transparency; turns off frame differencing so files get bigger"
          >
            <Toggle checked={transparent} label="ALPHA" onChange={setTransparent} />
          </Row>
          <Row
            label="ONE PALETTE"
            hint="one colour table for the whole clip: no shimmer on gradients, slightly slower"
          >
            <Toggle checked={globalPalette} label="ONE PALETTE" onChange={setGlobalPalette} />
          </Row>
        </>
      )}

      {format === 'webm' && (
        <Row label="BITRATE">
          <NumberField
            value={bitrate}
            min={0.5}
            max={40}
            step={0.5}
            decimals={1}
            ariaLabel="bitrate in megabits per second"
            onChange={setBitrate}
          />
        </Row>
      )}

      <div className="pl-3 text-xxs text-fg3 mt-1 leading-snug">
        {t('OUTPUT')}: {outW}x{outH} :: {frames} {t('FRAMES')} :: {seconds}s
        <br />
        {t(FORMAT_NOTE[format])}
        {sequence && (
          <>
            <br />
            {t('SOURCE')} :: {sequence.frames.length}{' '}
            {t('DECODED FRAMES, LOOPED TO FIT THE RANGE')}
          </>
        )}
        {clipped && (
          <>
            <br />
            <span className="text-fg2">
              {t('RANGE CLIPPED TO')} {MAX_ANIM_FRAMES} {t('FRAMES')}
            </span>
          </>
        )}
        {cost.overBudget && (
          <>
            <br />
            <span className="text-fg">
              {t('HEAVY')} :: {Math.round(cost.pixels / 1_000_000)}{' '}
              {t('MPX TOTAL — THIS WILL TAKE A WHILE')}
            </span>
          </>
        )}
        {unsupported && (
          <>
            <br />
            <span className="text-fg">
              {t('THIS BROWSER CANNOT WRITE')} {format.toUpperCase()}
            </span>
          </>
        )}
      </div>

      <div className="flex flex-wrap gap-2 pl-3 mt-2">
        <button
          type="button"
          className="btn text-xs2"
          disabled={busy || !image || unsupported}
          onClick={() => void run()}
        >
          {busy
            ? t('WORKING')
            : t('EXPORT') + ' ' + (format === 'zip' ? t('PNG SEQ') : format.toUpperCase())}
        </button>
        <button
          type="button"
          className="btn text-xs2 btn-danger"
          disabled={!busy}
          onClick={() => job.current?.abort()}
        >
          {'! ' + t('CANCEL')}
        </button>
      </div>

      {busy && (
        <div className="pl-3 mt-1 text-xs2 text-fg2">
          <AsciiMeter value={progress} chars={18} /> {Math.round(progress * 100)}% {tm(label)}
        </div>
      )}
      {!busy && done && (
        <div className="pl-3 mt-1 text-xs2 text-fg">
          <Scramble text={done} token={doneToken} duration={280} />
        </div>
      )}
    </div>
  )
}
