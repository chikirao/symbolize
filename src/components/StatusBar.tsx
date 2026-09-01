import React, { useEffect, useRef } from 'react'
import { useEditor } from '../store/editorStore'
import { AsciiMeter } from './SliderControl'
import { scrambleText } from '../ui/scramble'

export function StatusBar(props: { compact?: boolean; className?: string } = {}) {
  const status = useEditor((s) => s.status)
  const stats = useEditor((s) => s.stats)
  const image = useEditor((s) => s.image)
  const view = useEditor((s) => s.view)
  const interacting = useEditor((s) => s.interacting)

  const msgRef = useRef<HTMLSpanElement>(null)
  const lastMsg = useRef(status.message)

  useEffect(() => {
    if (lastMsg.current === status.message) return
    lastMsg.current = status.message
    const el = msgRef.current
    if (!el) return
    return scrambleText(el, status.message, 220, status.message.length * 31)
  }, [status.message])

  const busy = status.kind === 'busy'

  if (props.compact) {
    return (
      <div className={'mobile-status-bar ' + (props.className || '')}>
        <span className="mobile-status-message">
          {status.kind === 'error' ? 'ERROR :: ' : ''}
          <span ref={msgRef}>{status.message}</span>
        </span>
        {busy && status.progress >= 0 ? (
          <span className="text-fg">{Math.round(status.progress * 100)}%</span>
        ) : (
          <span className="mobile-status-stats">
            {stats ? `${stats.elements} SYM` : '0 SYM'} :: {Math.round(view.zoom * 100)}%
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
        {status.kind === 'error' ? '[ ERROR ] ' : ''}
        <span ref={msgRef}>{status.message}</span>
      </span>

      {busy && status.progress >= 0 && (
        <>
          <AsciiMeter value={status.progress} chars={18} />
          <span className="text-fg2">{Math.round(status.progress * 100)}%</span>
        </>
      )}

      <span className="ml-auto flex items-center gap-2 text-fg2">
        <span className="text-fg3">::</span>
        <span>{image ? `${image.width}x${image.height}` : 'NO SOURCE'}</span>
        <span className="text-fg3">::</span>
        <span>{stats ? `${stats.elements} SYMBOLS` : '0 SYMBOLS'}</span>
        <span className="text-fg3">::</span>
        <span>{stats ? `${stats.ms.toFixed(1)}ms` : '—'}</span>
        <span className="text-fg3">::</span>
        <span>ZOOM {Math.round(view.zoom * 100)}%</span>
        <span className="text-fg3">::</span>
        <span className={interacting ? 'text-fg' : 'text-fg3'}>
          {interacting ? 'DRAFT' : view.quality.toUpperCase()}
        </span>
      </span>
    </div>
  )
}
