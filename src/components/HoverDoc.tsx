import React, { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLang } from '../i18n'
import { paramDoc } from '../i18n/paramDocs'
import { useUi } from '../store/uiStore'

/**
 * Hold the pointer over a parameter label and its description appears.
 *
 * The box is portalled to `document.body` on purpose: the parameter panel
 * scrolls and clips, and a description that gets cut off at the panel edge is
 * worse than none. It is placed against the trigger and flipped when there is
 * no room, so a label at the bottom of the list still shows its whole box.
 */

const OPEN_DELAY = 380
const WIDTH = 280
const GAP = 8

export function HoverDoc(props: {
  /** settings path — the description is looked up from it */
  path?: string
  /** heading, normally the control's own label */
  title?: string
  /** shown when the path has no description of its own */
  fallback?: string
  children: React.ReactNode
}) {
  const lang = useLang()
  const enabled = useUi((s) => s.tips)
  const text = paramDoc(props.path, lang) ?? props.fallback ?? null

  const [at, setAt] = useState<{ left: number; top: number } | null>(null)
  const holdRef = useRef<HTMLSpanElement>(null)
  const boxRef = useRef<HTMLSpanElement>(null)
  const timer = useRef<number | undefined>(undefined)

  const close = () => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = undefined
    setAt(null)
  }

  const openNow = () => {
    const box = holdRef.current?.getBoundingClientRect()
    if (!box) return
    // first guess: under the label, left-aligned with it
    setAt({ left: box.left, top: box.bottom + GAP })
  }

  const open = () => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(openNow, OPEN_DELAY)
  }

  /* Measured once it is on screen: only then is the height known, and only
     then can it be flipped above the label or pulled back from the edge. */
  useLayoutEffect(() => {
    if (!at) return
    const el = boxRef.current
    const anchor = holdRef.current?.getBoundingClientRect()
    if (!el || !anchor) return
    const box = el.getBoundingClientRect()
    let left = at.left
    let top = at.top
    if (left + box.width > window.innerWidth - 6) left = window.innerWidth - box.width - 6
    if (left < 6) left = 6
    if (top + box.height > window.innerHeight - 6) top = anchor.top - box.height - GAP
    if (top < 6) top = 6
    if (Math.abs(left - at.left) > 0.5 || Math.abs(top - at.top) > 0.5) setAt({ left, top })
  }, [at])

  React.useEffect(() => () => window.clearTimeout(timer.current), [])

  /* A phone has no hover, so the label opens its description on tap. Anything
     else that gets clicked, and Escape, puts it away again. */
  React.useEffect(() => {
    if (!at) return
    const away = (e: Event) => {
      if (!holdRef.current?.contains(e.target as Node)) close()
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', esc)
      window.removeEventListener('scroll', close, true)
    }
  }, [at])

  if (!enabled || !text) return <>{props.children}</>

  return (
    <span
      ref={holdRef}
      className="doc-hold"
      onPointerEnter={open}
      onPointerLeave={close}
      onFocus={open}
      onBlur={close}
      onClick={() => (at ? close() : openNow())}
    >
      {props.children}
      {at &&
        createPortal(
          <span
            ref={boxRef}
            className="doc-tip"
            role="tooltip"
            style={{ left: at.left, top: at.top, width: WIDTH }}
          >
            {props.title && <span className="doc-tip-title">{props.title}</span>}
            {text}
          </span>,
          document.body,
        )}
    </span>
  )
}
