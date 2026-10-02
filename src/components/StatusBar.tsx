import React, { useEffect, useRef } from 'react'
import { useEditor } from '../store/editorStore'
import { AsciiMeter } from './SliderControl'
import { scrambleText } from '../ui/scramble'
import { useMessageT, useT } from '../i18n'
import { useHistory } from '../store/historyStore'

export function StatusBar(props: { compact?: boolean; className?: string } = {}) {
  const t = useT()
  const tm = useMessageT()
  const status = useEditor((s) => s.status)
  const stats = useEditor((s) => s.stats)
  const image = useEditor((s) => s.image)
  const view = useEditor((s) => s.view)
  const interacting = useEditor((s) => s.interacting)
  const canUndo = useHistory((s) => s.canUndo)
  const canRedo = useHistory((s) => s.canRedo)
  const undo = useHistory((s) => s.undo)
  const redo = useHistory((s) => s.redo)

  const message = tm(status.message)
  const msgRef = useRef<HTMLSpanElement>(null)
  const lastMsg = useRef(message)

  useEffect(() => {
    if (lastMsg.current === message) return
    lastMsg.current = message
    const el = msgRef.current
    if (!el) return
    return scrambleText(el, message, 220, message.length * 31)
  }, [message])

  const busy = status.kind === 'busy'

  if (props.compact) {
    return (
      <div className={'mobile-status-bar ' + (props.className || '')}>
        <span data-tour="history" className="mobile-history">
          <button type="button" disabled={!canUndo} onClick={undo} aria-label={t('UNDO')} title={t('UNDO')}>↶</button>
          <button type="button" disabled={!canRedo} onClick={redo} aria-label={t('REDO')} title={t('REDO')}>↷</button>
        </span>
        <span className="mobile-status-message">
          {status.kind === 'error' ? t('ERROR') + ' :: ' : ''}
          <span ref={msgRef}>{message}</span>
        </span>
        {busy && status.progress >= 0 ? (
          <span className="text-fg">{Math.round(status.progress * 100)}%</span>
        ) : (
          <span className="mobile-status-stats">
            {(stats ? stats.elements : 0) + ' ' + t('SYM')} :: {Math.round(view.zoom * 100)}%
          </span>
        )}
      </div>
    )
  }

  return (
    <div className={'h-[22px] shrink-0 border-t border-line px-3 flex items-center gap-2 text-xs2 select-none ' + (props.className || '')}>
      <span
        className={
          status.kind === 'error' ? 'text-fg' : status.kind === 'busy' ? 'text-fg' : 'text-fg2'
        }
      >
        {status.kind === 'error' ? '[ ' + t('ERROR') + ' ] ' : ''}
        <span ref={msgRef}>{message}</span>
      </span>

      {busy && status.progress >= 0 && (
        <>
          <AsciiMeter value={status.progress} chars={18} />
          <span className="text-fg2">{Math.round(status.progress * 100)}%</span>
        </>
      )}

      <span className="ml-auto flex items-center gap-2 text-fg2">
        <span className="text-fg3">::</span>
        <span>{image ? `${image.width}x${image.height}` : t('NO SOURCE')}</span>
        <span className="text-fg3">::</span>
        {/* the short unit in both languages: "5041 СИМВОЛЫ" is the wrong case
            in Russian, and a status bar abbreviates anyway */}
        <span>{(stats ? stats.elements : 0) + ' ' + t('SYM')}</span>
        <span className="text-fg3">::</span>
        <span>{stats ? `${stats.ms.toFixed(1)}ms` : '—'}</span>
        <span className="text-fg3">::</span>
        <span>
          {t('ZOOM')} {Math.round(view.zoom * 100)}%
        </span>
        <span className="text-fg3">::</span>
        <span className={interacting ? 'text-fg' : 'text-fg3'}>
          {interacting ? t('DRAFT') : t(view.quality.toUpperCase())}
        </span>
      </span>
    </div>
  )
}
