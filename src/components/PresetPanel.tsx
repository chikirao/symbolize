import React, { useEffect, useRef, useState } from 'react'
import { useEditor } from '../store/editorStore'
import { AsciiBox } from './Primitives'
import { scrambleText } from '../ui/scramble'
import { useT } from '../i18n'

/** Contents only — the desktop shell supplies a foldable frame. */
export function PresetPanelBody() {
  const t = useT()
  const presets = useEditor((s) => s.presets)
  const activePresetId = useEditor((s) => s.activePresetId)
  const applyPreset = useEditor((s) => s.applyPreset)
  const savePreset = useEditor((s) => s.saveCurrentPreset)
  const deletePreset = useEditor((s) => s.deletePreset)
  const resetAll = useEditor((s) => s.resetAll)

  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const activeRef = useRef<HTMLSpanElement>(null)

  const active = presets.find((p) => p.id === activePresetId)

  useEffect(() => {
    const el = activeRef.current
    if (!el) return
    return scrambleText(el, active ? t(active.name) : t('CUSTOM'), 260, 4242)
  }, [activePresetId, active, t])

  useEffect(() => {
    if (naming) inputRef.current?.focus()
  }, [naming])

  const commit = () => {
    const n = name.trim()
    if (n) savePreset(n)
    setName('')
    setNaming(false)
  }

  return (
    <>
      <div className="text-xxs text-fg3 mb-1">
        {t('CURRENT')}:{' '}
        <span ref={activeRef} className="text-fg">
          {active ? t(active.name) : t('CUSTOM')}
        </span>
      </div>
      <div className="preset-list overflow-y-auto pr-1">
        {presets.map((p) => (
          <div key={p.id} className="flex items-center group">
            <button
              type="button"
              className={
                'preset-item flex-1 text-left text-xs2 truncate px-1 hover:bg-[#111] ' +
                (p.id === activePresetId ? 'text-fg' : 'text-fg2 hover:text-fg')
              }
              onClick={() => applyPreset(p.id)}
            >
              {p.id === activePresetId ? '> ' : '  '}
              {/* built-in names translate; a name someone typed themselves
                  falls through unchanged, which is what we want */}
              {t(p.name)}
              {!p.builtin && <span className="text-fg3 text-xxs"> *</span>}
            </button>
            {!p.builtin && (
              <button
                type="button"
                className="text-fg3 hover:text-fg text-xxs px-1 opacity-0 group-hover:opacity-100"
                aria-label={'delete preset ' + p.name}
                onClick={() => deletePreset(p.id)}
              >
                [x]
              </button>
            )}
          </div>
        ))}
      </div>

      {naming ? (
        <div className="flex items-center gap-1 mt-2 border border-line px-1">
          <span className="text-fg3 text-xxs">{t('NAME:')}</span>
          <input
            ref={inputRef}
            className="flex-1 text-xs2 uppercase min-w-0 outline-none"
            maxLength={28}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') {
                setNaming(false)
                setName('')
              }
            }}
          />
          <button type="button" className="btn text-xxs" onClick={commit}>
            OK
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 mt-2">
          <button type="button" className="btn text-xxs" onClick={() => setNaming(true)}>
            {t('SAVE CURRENT')}
          </button>
          <button type="button" className="btn text-xxs btn-danger" onClick={resetAll}>
            {'! ' + t('RESET')}
          </button>
        </div>
      )}
    </>
  )
}

export function PresetPanel() {
  return (
    <AsciiBox title="PRESETS" bodyClassName="p-2 pt-1">
      <PresetPanelBody />
    </AsciiBox>
  )
}
