import React, { useRef } from 'react'
import { AsciiBox } from './Primitives'
import { useT } from '../i18n'
import { useUi } from '../store/uiStore'

/**
 * Desktop panel chrome: fold a panel down to its title, and drag the seam
 * between two of them to change how the space is shared.
 *
 * The timeline already worked this way and it was the one panel nobody
 * complained about, so the same two moves are now on all of them. Everything
 * lives in `uiStore` and persists — a layout you set up once should still be
 * there tomorrow.
 */

/* ------------------------------------------------------------------ */
/* the seam between two panels                                         */
/* ------------------------------------------------------------------ */

/**
 * An invisible strip in the gutter that shows a dotted rule and the right
 * cursor when the pointer is over it. `measure` is read at pointer-down rather
 * than kept in state: a panel with no explicit size yet is whatever height the
 * content made it, and dragging should continue from there instead of jumping
 * to a default.
 */
export function ResizeHandle(props: {
  axis: 'x' | 'y'
  measure: () => number
  /** called with the size the drag has reached, already signed for this seam */
  onSize: (size: number) => void
  /** invert the delta — for a seam that sizes the panel *after* it */
  invert?: boolean
  onReset?: () => void
  label?: string
  /** still occupies the gutter, but does not drag — a folded neighbour */
  disabled?: boolean
  /**
   * Folds a whole column away. A stack of panels has no single title bar to
   * hang this on, so it sits at the top of the seam beside the column it
   * closes — the same place you already go to resize it.
   */
  fold?: { id: string; arrow: '<' | '>' }
}) {
  const setResizing = useUi((s) => s.setResizing)
  const t = useT()
  const live = useRef(props)
  live.current = props

  /* The drag listens on the window rather than capturing the pointer on the
     handle: a seam is a few pixels wide, the pointer leaves it immediately,
     and this way the drag survives that, a panel remounting under it, and a
     pointerup that lands somewhere else entirely. */
  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    const vertical = live.current.axis === 'y'
    const at = vertical ? e.clientY : e.clientX
    const size = live.current.measure()

    const move = (ev: PointerEvent) => {
      const now = vertical ? ev.clientY : ev.clientX
      const delta = (now - at) * (live.current.invert ? -1 : 1)
      live.current.onSize(size + delta)
    }
    const finish = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      document.body.classList.remove('is-resizing')
      setResizing(false)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
    // a drag across a text panel would otherwise select half of it
    document.body.classList.add('is-resizing')
    setResizing(true)
  }

  if (props.disabled) return <div className={'rz rz-' + props.axis + ' is-off'} aria-hidden="true" />

  return (
    <div
      className={'rz rz-' + props.axis}
      role="separator"
      aria-orientation={props.axis === 'x' ? 'vertical' : 'horizontal'}
      aria-label={props.label}
      title={t('drag to resize') + (props.onReset ? ' :: ' + t('double-click to reset the size') : '')}
      onPointerDown={down}
      onDoubleClick={props.onReset}
    >
      {props.fold && <SeamFold id={props.fold.id} arrow={props.fold.arrow} />}
      <span className="rz-grip" aria-hidden="true" />
    </div>
  )
}

function SeamFold(props: { id: string; arrow: '<' | '>' }) {
  const t = useT()
  const togglePanel = useUi((s) => s.togglePanel)
  return (
    <button
      type="button"
      className="rz-fold text-xxs"
      title={t('fold this panel')}
      aria-label={t('fold this panel')}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={() => togglePanel(props.id)}
    >
      {props.arrow}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* a foldable panel                                                    */
/* ------------------------------------------------------------------ */

export function PanelBox(props: {
  id: string
  title: string
  right?: React.ReactNode
  /** grow to fill what the fixed-height panels leave over */
  flex?: boolean
  /** a column rather than a stacked panel: the drag changes its width */
  width?: number
  className?: string
  bodyClassName?: string
  children: React.ReactNode
}) {
  const t = useT()
  const layout = useUi((s) => s.layout.panels[props.id])
  const togglePanel = useUi((s) => s.togglePanel)
  const collapsed = !!layout?.collapsed
  const size = layout?.size ?? null

  const title = (
    <button
      type="button"
      className="panel-fold"
      aria-expanded={!collapsed}
      title={collapsed ? t('unfold this panel') : t('fold this panel')}
      onClick={() => togglePanel(props.id)}
    >
      {collapsed ? '[+]' : '[-]'} {t(props.title)}
    </button>
  )

  return (
    <AsciiBox
      title={title}
      right={collapsed ? undefined : props.right}
      className={
        'panel-slot panel-' +
        props.id +
        ' ' +
        (collapsed ? 'is-folded ' : '') +
        (size !== null && !collapsed && !props.flex ? 'is-sized ' : '') +
        (props.flex && !collapsed ? 'flex-1 min-h-0 ' : 'shrink-0 ') +
        'flex flex-col ' +
        (props.className || '')
      }
      /* A folded panel is a labelled rule, not an empty box: it keeps a few
         pixels of body so the frame still reads as a frame. */
      bodyClassName={collapsed ? 'h-[10px]' : props.bodyClassName}
      style={{
        ...(props.width !== undefined ? { width: props.width } : null),
        ...(!collapsed && !props.flex && size !== null ? { height: size } : null),
      }}
    >
      {collapsed ? null : props.children}
    </AsciiBox>
  )
}

/* ------------------------------------------------------------------ */
/* a folded column                                                     */
/* ------------------------------------------------------------------ */

/**
 * A whole column folded away: one narrow strip with the title set vertically,
 * a letter per line. It is the cheapest way to give the canvas the full width
 * and still leave the way back in plain sight — and stacked capitals are what
 * this interface would do anyway.
 */
export function ColumnStrip(props: { id: string; title: string; side: 'left' | 'right' }) {
  const t = useT()
  const togglePanel = useUi((s) => s.togglePanel)
  const label = t(props.title)

  return (
    <button
      type="button"
      className={'col-strip col-strip-' + props.side}
      aria-expanded={false}
      title={t('unfold this panel')}
      onClick={() => togglePanel(props.id)}
    >
      <span className="col-strip-sign" aria-hidden="true">
        +
      </span>
      <span className="col-strip-title">
        {Array.from(label).map((ch, i) => (
          <span key={i} className="block">
            {ch === ' ' ? '·' : ch}
          </span>
        ))}
      </span>
    </button>
  )
}
