import React, { useEffect, useRef, useState } from 'react'
import { useEditor } from '../store/editorStore'
import { useT } from '../i18n'
import { AsciiBox } from './Primitives'
import { CanvasViewport } from './CanvasViewport'
import { ControlPanel } from './ControlPanel'
import { ExportPanel } from './ExportPanel'
import { PresetPanel } from './PresetPanel'
import { SourcePanel } from './SourcePanel'
import { StatusBar } from './StatusBar'
import { SymbolLibrary } from './SymbolLibrary'
import { Timeline } from './Timeline'
import { useUi } from '../store/uiStore'

type MobilePanelId = 'image' | 'symbols' | 'presets' | 'params' | 'anim' | 'export'

const PANELS: { id: MobilePanelId; label: string; title: string }[] = [
  { id: 'image', label: 'IMAGE', title: 'IMAGE / SOURCE' },
  { id: 'symbols', label: 'SYMBOLS', title: 'SYMBOLS' },
  { id: 'presets', label: 'PRESETS', title: 'PRESETS' },
  { id: 'params', label: 'PARAMS', title: 'PARAMETERS' },
  { id: 'anim', label: 'ANIM', title: 'TIMELINE' },
  { id: 'export', label: 'EXPORT', title: 'EXPORT' },
]

export function MobileWorkspace(props: { onPickFile: () => void; onPaste: () => void }) {
  const t = useT()
  const settings = useEditor((s) => s.settings)
  const openTutorial = useUi((s) => s.openTutorial)
  const [active, setActive] = useState<MobilePanelId | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!active) return
    if (contentRef.current) contentRef.current.scrollTop = 0
    closeRef.current?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActive(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active])

  const meta = PANELS.find((panel) => panel.id === active)

  return (
    <div className="mobile-workspace flex-1 min-h-0">
      <main className="mobile-stage" aria-label={t('symbolize canvas workspace')}>
        <CanvasViewport onPickFile={props.onPickFile} />

        {active && meta && (
          <section
            id="mobile-editor-panel"
            className="mobile-sheet panel-reveal"
            aria-label={t(meta.title)}
          >
            <header className="mobile-sheet-header">
              <span className="text-fg tracking-widest">{t(meta.title)}</span>
              <button
                ref={closeRef}
                type="button"
                className="btn mobile-close"
                aria-label={t('CLOSE') + ' ' + t(meta.title).toLowerCase()}
                onClick={() => setActive(null)}
              >
                {t('CLOSE')}
              </button>
            </header>

            <div ref={contentRef} className="mobile-sheet-content">
              {active === 'image' && (
                <SourcePanel onPickFile={props.onPickFile} onPaste={props.onPaste} />
              )}
              {active === 'symbols' && (
                <AsciiBox
                  title="ELEMENTS"
                  className="mobile-panel-box"
                  bodyClassName="mobile-panel-scroll pt-1 pb-2"
                >
                  <SymbolLibrary settings={settings} />
                </AsciiBox>
              )}
              {active === 'presets' && <PresetPanel />}
              {active === 'params' && (
                <AsciiBox
                  title="PARAMETERS"
                  className="mobile-panel-box"
                  bodyClassName="flex-1 min-h-0 pt-1"
                >
                  <ControlPanel includeExport={false} singleOpen />
                </AsciiBox>
              )}
              {active === 'anim' && <Timeline compact className="mobile-panel-box" />}
              {active === 'export' && (
                <AsciiBox title="EXPORT" className="mobile-panel-box" bodyClassName="p-2 pt-1">
                  <ExportPanel />
                </AsciiBox>
              )}
            </div>
          </section>
        )}
      </main>

      <StatusBar compact />

      <nav className="mobile-dock" aria-label={t('mobile editor panels')}>
        {PANELS.map((panel) => {
          const selected = active === panel.id
          return (
            <button
              key={panel.id}
              type="button"
              className="mobile-dock-button"
              data-tour={'dock-' + panel.id}
              aria-pressed={selected}
              aria-controls={selected ? 'mobile-editor-panel' : undefined}
              onClick={() => setActive(selected ? null : panel.id)}
            >
              <span aria-hidden="true">{selected ? '[x]' : '[ ]'}</span>
              <span>{t(panel.label)}</span>
            </button>
          )
        })}
        <button type="button" className="mobile-dock-button" data-tour="dock-help" onClick={openTutorial} aria-label={t('EDITOR TOUR')}>
          <span aria-hidden="true">[?]</span><span>{t('HELP')}</span>
        </button>
      </nav>
    </div>
  )
}
