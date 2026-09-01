import React, { useEffect, useRef, useState } from 'react'
import { useEditor } from '../store/editorStore'
import { buildDemoImage } from '../engine/demo'
import { buildFilename, downloadBlob, renderExport } from '../engine/export'
import type { PreviewQuality } from '../types/editor'

interface Item {
  label: string
  onClick?: () => void
  checked?: boolean
  divider?: boolean
  disabled?: boolean
}

function Menu(props: { label: string; items: Item[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const width = Math.max(...props.items.map((i) => i.label.length), 10) + 4

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className="menu-btn text-xs2"
        data-open={open ? '1' : '0'}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {props.label}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full mt-[2px] z-50 bg-black border border-line2 py-1 panel-reveal"
          style={{ minWidth: width + 'ch' }}
        >
          {props.items.map((it, i) =>
            it.divider ? (
              <div key={i} className="hr text-xxs px-2 select-none">
                {'─'.repeat(width)}
              </div>
            ) : (
              <button
                key={i}
                type="button"
                role="menuitem"
                disabled={it.disabled}
                className={
                  'block w-full text-left px-2 text-xs2 whitespace-nowrap ' +
                  (it.disabled
                    ? 'text-off cursor-not-allowed'
                    : 'text-fg2 hover:text-fg hover:bg-[#141414]')
                }
                onClick={() => {
                  if (it.disabled) return
                  setOpen(false)
                  it.onClick?.()
                }}
              >
                {it.checked === undefined ? '  ' : it.checked ? '[x] ' : '[ ] '}
                {it.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  )
}

export function Toolbar(props: { onPickFile: () => void }) {
  const store = useEditor
  const image = useEditor((s) => s.image)
  const view = useEditor((s) => s.view)
  const presets = useEditor((s) => s.presets)
  const setView = useEditor((s) => s.setView)
  const requestFit = useEditor((s) => s.requestFit)
  const resetAll = useEditor((s) => s.resetAll)
  const clearImage = useEditor((s) => s.clearImage)
  const loadImageSource = useEditor((s) => s.loadImageSource)
  const applyPreset = useEditor((s) => s.applyPreset)
  const setStatus = useEditor((s) => s.setStatus)
  const randomizeSeed = useEditor((s) => s.randomizeSeed)

  const quickExport = async (mult: number) => {
    const st = store.getState()
    if (!st.maps || !st.image) return
    setStatus({ kind: 'busy', message: 'EXPORTING...', progress: 0 })
    try {
      const res = await renderExport(
        {
          settings: st.settings,
          maps: st.maps,
          original: st.image.canvas,
          customSymbols: st.customSymbols,
          textSymbols: st.textSymbols,
          width: st.image.width * mult,
          height: st.image.height * mult,
          format: 'png',
          quality: 1,
        },
        (p) => setStatus({ kind: 'busy', message: 'RENDERING EXPORT...', progress: p }),
      )
      downloadBlob(res.blob, buildFilename('png'))
      setStatus({
        kind: 'ready',
        message: `EXPORT OK :: ${res.width}x${res.height} :: ${res.stats.elements} SYMBOLS`,
        progress: -1,
      })
    } catch (err) {
      setStatus({ kind: 'error', message: 'ERROR :: ' + String((err as Error).message), progress: -1 })
    }
  }

  return (
    <div className="flex items-center gap-4 px-3 h-[26px] border-b border-line shrink-0">
      <span className="text-fg text-xs2 tracking-[0.25em] select-none">SYMBOL_HALFTONE.exe</span>

      <div className="flex items-center gap-1">
        <Menu
          label="FILE"
          items={[
            { label: 'LOAD IMAGE...', onClick: props.onPickFile },
            {
              label: 'LOAD DEMO',
              onClick: () => loadImageSource(buildDemoImage(), 'DEMO_BUST.PROC'),
            },
            { label: 'CLEAR IMAGE', onClick: clearImage, disabled: !image },
            { label: '', divider: true },
            { label: 'RESET SETTINGS', onClick: resetAll },
          ]}
        />
        <Menu
          label="PRESETS"
          items={presets.map((p) => ({ label: p.name, onClick: () => applyPreset(p.id) }))}
        />
        <Menu
          label="VIEW"
          items={[
            { label: 'FIT TO SCREEN', onClick: requestFit },
            { label: 'ZOOM 100%', onClick: () => setView({ zoom: 1, panX: 0, panY: 0 }) },
            { label: '', divider: true },
            {
              label: 'SHOW ORIGINAL',
              checked: view.showOriginal,
              onClick: () => setView({ showOriginal: !view.showOriginal }),
            },
            {
              label: 'BEFORE / AFTER',
              checked: view.beforeAfter,
              onClick: () => setView({ beforeAfter: !view.beforeAfter, showOriginal: false }),
            },
            { label: '', divider: true },
            ...(['low', 'medium', 'high'] as PreviewQuality[]).map((q) => ({
              label: 'QUALITY ' + q.toUpperCase(),
              checked: view.quality === q,
              onClick: () => setView({ quality: q }),
            })),
          ]}
        />
        <Menu
          label="EXPORT"
          items={[
            { label: 'PNG 1X', onClick: () => void quickExport(1), disabled: !image },
            { label: 'PNG 2X', onClick: () => void quickExport(2), disabled: !image },
            { label: 'PNG 4X', onClick: () => void quickExport(4), disabled: !image },
          ]}
        />
      </div>

      <div className="ml-auto flex items-center gap-3">
        <button type="button" className="btn text-xxs" onClick={randomizeSeed}>
          RANDOMIZE
        </button>
        <button type="button" className="btn text-xxs" onClick={requestFit}>
          FIT
        </button>
        <button
          type="button"
          className="btn text-xxs"
          onClick={() => setView({ zoom: 1, panX: 0, panY: 0 })}
        >
          100%
        </button>
        <span className="text-fg3 text-xxs select-none">LOCAL // NO UPLOAD</span>
      </div>
    </div>
  )
}
