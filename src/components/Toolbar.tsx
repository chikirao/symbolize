import React, { useEffect, useRef, useState } from 'react'
import { useEditor } from '../store/editorStore'
import { scrambleSubtree } from '../ui/scramble'
import { replayIntro } from '../ui/intro'
import { loadDemoImage } from '../engine/demo'
import { buildFilename, downloadBlob, renderExport } from '../engine/export'
import type { PreviewQuality } from '../types/editor'
import { useUi } from '../store/uiStore'
import { useHistory } from '../store/historyStore'
import { join, tr, useT } from '../i18n'

interface Item {
  label: string
  onClick?: () => void
  checked?: boolean
  divider?: boolean
  disabled?: boolean
}

function Menu(props: { label: string; items: Item[] }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const el = listRef.current
    if (!el) return
    return scrambleSubtree(el, 220)
  }, [open])

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

  const items = props.items.map((i) => ({ ...i, label: t(i.label) }))
  const width = Math.max(...items.map((i) => i.label.length), 10) + 4

  return (
    <div ref={ref} className="relative" data-tour={'menu-' + props.label.toLowerCase()}>
      <button
        type="button"
        className="menu-btn text-xs2"
        data-open={open ? '1' : '0'}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {t(props.label)}
      </button>
      {open && (
        <div
          ref={listRef}
          role="menu"
          className="absolute left-0 top-full mt-[2px] z-50 bg-black border border-line2 py-1 panel-reveal"
          style={{ minWidth: width + 'ch' }}
        >
          {items.map((it, i) =>
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

/**
 * Language, first thing on the bar and left of every menu.
 *
 * Two words rather than a checkbox: which one is live is legible at a glance,
 * and the one you want is always a single click away — a toggle you have to
 * read the state of first is one step slower every time.
 */
function LangSwitch() {
  const lang = useUi((s) => s.lang)
  const setLang = useUi((s) => s.setLang)
  return (
    <div className="lang-switch text-xs2" role="radiogroup" aria-label="interface language">
      {(['en', 'ru'] as const).map((code) => (
        <button
          key={code}
          type="button"
          role="radio"
          aria-checked={lang === code}
          className={'lang-opt' + (lang === code ? ' is-on' : '')}
          onClick={() => setLang(code)}
        >
          {code.toUpperCase()}
        </button>
      ))}
    </div>
  )
}

export function Toolbar(props: { onPickFile: () => void; onPaste: () => void }) {
  const t = useT()
  const tips = useUi((s) => s.tips)
  const setTips = useUi((s) => s.setTips)
  const resetLayout = useUi((s) => s.resetLayout)
  const openGuide = useUi((s) => s.openGuide)
  const openTutorial = useUi((s) => s.openTutorial)
  const canUndo = useHistory((s) => s.canUndo)
  const canRedo = useHistory((s) => s.canRedo)
  const undo = useHistory((s) => s.undo)
  const redo = useHistory((s) => s.redo)
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
        message: join(
          tr('EXPORT OK'),
          `${res.width}x${res.height}`,
          `${res.stats.elements} ${tr('SYMBOLS')}`,
        ),
        progress: -1,
      })
    } catch (err) {
      setStatus({
        kind: 'error',
        message: join(tr('ERROR'), String((err as Error).message)),
        progress: -1,
      })
    }
  }

  return (
    <div className="app-toolbar flex items-center gap-4 px-3 h-[26px] border-b border-line shrink-0">
      <span className="app-brand text-fg text-xs2 tracking-[0.25em] select-none">symbolize</span>

      <LangSwitch />

      <div className="desktop-toolbar-nav flex items-center gap-1">
        <Menu
          label="FILE"
          items={[
            { label: 'LOAD IMAGE...', onClick: props.onPickFile },
            { label: 'PASTE IMAGE  CTRL+V', onClick: props.onPaste },
            {
              label: 'LOAD DEMO',
              onClick: () => void loadDemoImage().then((c) => {
                loadImageSource(c, 'DEMO_BUNNY.JPG')
                useHistory.getState().reset()
              }),
            },
            { label: 'CLEAR IMAGE', onClick: () => { clearImage(); useHistory.getState().reset() }, disabled: !image },
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
              // pre-translated: the menu would otherwise look up the whole
              // "QUALITY MEDIUM" phrase, which is two words in one entry
              label: t('QUALITY') + ' ' + t(q.toUpperCase()),
              checked: view.quality === q,
              onClick: () => setView({ quality: q }),
            })),
            { label: '', divider: true },
            {
              label: 'ADVANCED CONTROLS',
              checked: view.showAdvanced,
              onClick: () => setView({ showAdvanced: !view.showAdvanced }),
            },
            {
              label: 'HOVER DESCRIPTIONS',
              checked: tips,
              onClick: () => setTips(!tips),
            },
            { label: 'RESET PANEL LAYOUT', onClick: resetLayout },
            { label: '', divider: true },
            { label: 'REPLAY INTRO', onClick: () => void replayIntro() },
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
        <Menu label="HELP" items={[
          { label: 'EDITOR TOUR', onClick: openTutorial },
          { label: 'HOW THE ANIMATION MODE WORKS', onClick: openGuide },
        ]} />
      </div>

      <div className="mobile-toolbar-actions ml-auto">
        <button type="button" className="btn" onClick={props.onPickFile}>
          {t('LOAD')}
        </button>
        <button type="button" className="btn" onClick={randomizeSeed}>
          {t('RND')}
        </button>
        <button type="button" className="btn" onClick={requestFit}>
          {t('FIT')}
        </button>
        <button
          type="button"
          className={'btn ' + (view.showOriginal ? 'btn-on' : '')}
          aria-pressed={view.showOriginal}
          onClick={() => setView({ showOriginal: !view.showOriginal, beforeAfter: false })}
        >
          {t('ORIG')}
        </button>
      </div>

      <div className="desktop-toolbar-actions ml-auto flex items-center gap-3">
        <span data-tour="history" className="flex items-center gap-1">
          <button type="button" className="btn text-xxs" disabled={!canUndo} onClick={undo} title={t('UNDO') + ' (Ctrl+Z)'} aria-label={t('UNDO')}>{t('UNDO')}</button>
          <button type="button" className="btn text-xxs" disabled={!canRedo} onClick={redo} title={t('REDO') + ' (Ctrl+Shift+Z)'} aria-label={t('REDO')}>{t('REDO')}</button>
        </span>
        <button type="button" className="btn text-xxs" onClick={randomizeSeed}>
          {t('RANDOMIZE')}
        </button>
        <button type="button" className="btn text-xxs" onClick={requestFit}>
          {t('FIT')}
        </button>
        <button
          type="button"
          className="btn text-xxs"
          onClick={() => setView({ zoom: 1, panX: 0, panY: 0 })}
        >
          100%
        </button>
        <span className="text-fg3 text-xxs select-none">{t('LOCAL // NO UPLOAD')}</span>
      </div>
    </div>
  )
}
