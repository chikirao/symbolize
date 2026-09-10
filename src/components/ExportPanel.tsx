import React, { useEffect, useRef, useState } from 'react'
import { useEditor } from '../store/editorStore'
import { join, tr, useT } from '../i18n'
import { AnimExportPanel } from './AnimExportPanel'
import {
  buildFilename,
  canCopyToClipboard,
  clampExportSize,
  copyBlobToClipboard,
  downloadBlob,
  renderExport,
  type ExportFormat,
} from '../engine/export'
import { AsciiMeter } from './SliderControl'
import { NumberField, Row, Scramble, SelectControl, Toggle } from './Primitives'

type ScaleMode = '1' | '2' | '4' | 'custom'
type OutputMode = 'still' | 'anim'

export function ExportPanel() {
  const t = useT()
  const image = useEditor((s) => s.image)
  const sequence = useEditor((s) => s.sequence)
  const maps = useEditor((s) => s.maps)
  const settings = useEditor((s) => s.settings)
  const customSymbols = useEditor((s) => s.customSymbols)
  const textSymbols = useEditor((s) => s.textSymbols)
  const setStatus = useEditor((s) => s.setStatus)

  const [format, setFormat] = useState<ExportFormat>('png')
  const [scaleMode, setScaleMode] = useState<ScaleMode>('1')
  const [customW, setCustomW] = useState(2048)
  const [customH, setCustomH] = useState(2048)
  const [lockAspect, setLockAspect] = useState(true)
  const [quality, setQuality] = useState(0.92)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [done, setDone] = useState<string | null>(null)
  const [doneToken, setDoneToken] = useState(0)
  const [mode, setMode] = useState<OutputMode>('still')

  // dropping a video in is a clear statement of intent about the output
  const lastSequence = useRef(sequence?.id ?? 0)
  useEffect(() => {
    const id = sequence?.id ?? 0
    if (id !== lastSequence.current) {
      lastSequence.current = id
      if (id !== 0) setMode('anim')
    }
  }, [sequence])

  const baseW = image?.width ?? 0
  const baseH = image?.height ?? 0
  const aspect = baseH > 0 ? baseW / baseH : 1

  let targetW = baseW
  let targetH = baseH
  if (scaleMode === '2') {
    targetW = baseW * 2
    targetH = baseH * 2
  } else if (scaleMode === '4') {
    targetW = baseW * 4
    targetH = baseH * 4
  } else if (scaleMode === 'custom') {
    targetW = customW
    targetH = lockAspect ? Math.round(customW / (aspect || 1)) : customH
  }
  const [clampedW, clampedH] = clampExportSize(targetW || 1, targetH || 1)
  const clamped = clampedW !== Math.round(targetW) || clampedH !== Math.round(targetH)

  const run = async (target: 'download' | 'clipboard') => {
    if (!maps || !image || busy) return
    setBusy(true)
    setDone(null)
    setProgress(0)
    setStatus({ kind: 'busy', message: 'EXPORTING...', progress: 0 })
    try {
      const res = await renderExport(
        {
          settings,
          maps,
          original: image.canvas,
          customSymbols,
          textSymbols,
          width: targetW,
          height: targetH,
          format,
          quality,
        },
        (p) => {
          setProgress(p)
          setStatus({
            kind: 'busy',
            message:
              p < 0.95 ? 'RENDERING EXPORT...' : 'ENCODING ' + format.toUpperCase() + '...',
            progress: p,
          })
        },
      )
      if (target === 'clipboard') {
        await copyBlobToClipboard(res.blob)
        setDone(tr('COPIED TO CLIPBOARD'))
      } else {
        downloadBlob(res.blob, buildFilename(format))
        setDone(tr('EXPORT COMPLETE'))
      }
      setDoneToken((t) => t + 1)
      setStatus({
        kind: 'ready',
        message: join(
          tr('EXPORT OK'),
          res.width + 'x' + res.height,
          res.stats.elements + ' ' + tr('SYM'),
          Math.round(res.stats.ms) + 'ms',
        ),
        progress: -1,
      })
    } catch (err) {
      setDone(null)
      setStatus({
        kind: 'error',
        message: join(tr('ERROR'), String((err as Error).message || err)),
        progress: -1,
      })
    } finally {
      setBusy(false)
      setProgress(0)
    }
  }

  const modeRow = (
    <Row label="OUTPUT">
      <SelectControl
        value={mode}
        width={11}
        ariaLabel="export output"
        options={[
          { value: 'still', label: 'STILL IMAGE' },
          { value: 'anim', label: 'ANIMATION' },
        ]}
        onChange={(v) => setMode(v as OutputMode)}
      />
    </Row>
  )

  if (mode === 'anim') {
    return (
      <div className="pl-1">
        {modeRow}
        <AnimExportPanel />
      </div>
    )
  }

  return (
    <div className="pl-1">
      {modeRow}
      <Row label="FORMAT">
        <SelectControl
          value={format}
          width={6}
          ariaLabel="export format"
          options={[
            { value: 'png', label: 'PNG' },
            { value: 'jpeg', label: 'JPEG' },
            { value: 'webp', label: 'WEBP' },
          ]}
          onChange={(v) => setFormat(v)}
        />
      </Row>
      <Row label="RESOLUTION">
        <SelectControl
          value={scaleMode}
          width={8}
          ariaLabel="export resolution"
          options={[
            { value: '1', label: 'ORIGINAL' },
            { value: '2', label: '2X' },
            { value: '4', label: '4X' },
            { value: 'custom', label: 'CUSTOM' },
          ]}
          onChange={(v) => setScaleMode(v)}
        />
      </Row>
      {scaleMode === 'custom' && (
        <>
          <Row label="WIDTH">
            <NumberField
              value={customW}
              min={16}
              max={8192}
              step={1}
              decimals={0}
              ariaLabel="custom width"
              onChange={(v) => setCustomW(Math.round(v))}
            />
          </Row>
          <Row label="HEIGHT">
            <NumberField
              value={lockAspect ? Math.round(customW / (aspect || 1)) : customH}
              min={16}
              max={8192}
              step={1}
              decimals={0}
              ariaLabel="custom height"
              onChange={(v) => setCustomH(Math.round(v))}
            />
          </Row>
          <Row label="LOCK ASPECT">
            <Toggle checked={lockAspect} label="lock aspect" onChange={setLockAspect} />
          </Row>
        </>
      )}
      {format !== 'png' && (
        <Row label="QUALITY">
          <NumberField
            value={quality}
            min={0.1}
            max={1}
            step={0.01}
            decimals={2}
            ariaLabel="encoder quality"
            onChange={setQuality}
          />
        </Row>
      )}

      <div className="pl-3 text-xxs text-fg3 mt-1 leading-snug">
        {t('OUTPUT')}: {clampedW}x{clampedH}
        {clamped && <span className="text-fg2"> ({t('CLAMPED')})</span>}
        <br />
        {format === 'png' ? t('ALPHA PRESERVED') : t('NO ALPHA CHANNEL')} ::{' '}
        {t('RENDERED AT FULL SIZE')}
      </div>

      <div className="flex flex-wrap gap-2 pl-3 mt-2">
        <button
          type="button"
          className="btn text-xs2"
          disabled={busy || !image}
          onClick={() => void run('download')}
        >
          {busy ? t('WORKING') : t('DOWNLOAD')}
        </button>
        <button
          type="button"
          className="btn text-xs2"
          disabled={busy || !image || !canCopyToClipboard() || format !== 'png'}
          title={
            canCopyToClipboard()
              ? t('copy PNG to clipboard')
              : t('clipboard image API unavailable in this browser')
          }
          onClick={() => void run('clipboard')}
        >
          {t('COPY PNG')}
        </button>
      </div>

      {busy && (
        <div className="pl-3 mt-1 text-xs2 text-fg2">
          <AsciiMeter value={progress} chars={18} /> {Math.round(progress * 100)}%
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
