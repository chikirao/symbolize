import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLang } from '../i18n'
import { TUTORIAL_STEPS, tutorialText } from '../i18n/tutorial'
import { useUi } from '../store/uiStore'

interface Placement { left: number; top: number; width: number; height: number; cardLeft: number; cardTop: number }

/** Spotlight tour for the visible desktop panels or the mobile panel dock. */
export function TutorialOverlay({ mobile }: { mobile: boolean }) {
  const lang = useLang()
  const open = useUi((s) => s.tutorial)
  const close = useUi((s) => s.closeTutorial)
  const [index, setIndex] = useState(0)
  const [placement, setPlacement] = useState<Placement | null>(null)
  const card = useRef<HTMLDivElement>(null)
  const next = useRef<HTMLButtonElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const step = TUTORIAL_STEPS[index]

  useEffect(() => {
    if (!open) return
    previousFocus.current = document.activeElement as HTMLElement | null
    setIndex(0)
    return () => previousFocus.current?.focus({ preventScroll: true })
  }, [open])

  useEffect(() => {
    if (!open) return
    next.current?.focus({ preventScroll: true })
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        close()
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        event.stopImmediatePropagation()
        if (index < TUTORIAL_STEPS.length - 1) setIndex(index + 1)
        else close()
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        event.stopImmediatePropagation()
        setIndex(Math.max(0, index - 1))
      } else if (event.key === 'Tab' && card.current) {
        const buttons = Array.from(card.current.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
        const first = buttons[0]
        const last = buttons[buttons.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last?.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first?.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [open, index, close])

  useLayoutEffect(() => {
    if (!open) return
    const target = document.querySelector<HTMLElement>(mobile ? step.mobile : step.desktop)
    if (!target) { setPlacement(null); return }
    let frame = 0
    const measure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const rect = target.getBoundingClientRect()
        const margin = 8
        const left = Math.max(margin, rect.left - 3)
        const top = Math.max(margin, rect.top - 3)
        const width = Math.max(0, Math.min(window.innerWidth - left - margin, rect.right - rect.left + 6))
        const height = Math.max(0, Math.min(window.innerHeight - top - margin, rect.bottom - rect.top + 6))
        const cardWidth = card.current?.offsetWidth || Math.min(350, window.innerWidth - 24)
        const cardHeight = card.current?.offsetHeight || 190
        const gap = 14
        let cardLeft: number
        let cardTop: number
        if (rect.right + gap + cardWidth + 12 < window.innerWidth) {
          cardLeft = rect.right + gap
          cardTop = rect.top
        } else if (rect.left - gap - cardWidth > 12) {
          cardLeft = rect.left - gap - cardWidth
          cardTop = rect.top
        } else if (rect.bottom + gap + cardHeight + 12 < window.innerHeight) {
          cardLeft = rect.left
          cardTop = rect.bottom + gap
        } else {
          cardLeft = rect.left
          cardTop = rect.top - cardHeight - gap
        }
        cardLeft = Math.max(12, Math.min(window.innerWidth - cardWidth - 12, cardLeft))
        cardTop = Math.max(12, Math.min(window.innerHeight - cardHeight - 12, cardTop))
        setPlacement({ left, top, width, height, cardLeft, cardTop })
      })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(target)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [open, index, mobile, step])

  if (!open) return null
  return (
    <div className="tutorial-overlay" role="dialog" aria-modal="true" aria-label={lang === 'ru' ? 'Обучение редактору' : 'Editor tour'}>
      {placement ? (
        <div className="tutorial-focus" aria-hidden="true" style={{ left: placement.left, top: placement.top, width: placement.width, height: placement.height }} />
      ) : <div className="tutorial-dim" aria-hidden="true" />}
      <div
        ref={card}
        className="tutorial-card"
        style={placement ? { left: placement.cardLeft, top: placement.cardTop } : { left: 12, top: 12 }}
      >
        <div className="tutorial-head">
          <span>{lang === 'ru' ? 'ОБУЧЕНИЕ' : 'TOUR'} :: {String(index + 1).padStart(2, '0')}/{String(TUTORIAL_STEPS.length).padStart(2, '0')}</span>
          <button type="button" className="btn" onClick={close} aria-label={lang === 'ru' ? 'Закрыть обучение' : 'Close tour'}>[X]</button>
        </div>
        <h2 className="tutorial-title">{tutorialText(step.title, lang)}</h2>
        <p className="tutorial-body">{tutorialText(step.body, lang)}</p>
        <div className="tutorial-actions">
          <button type="button" className="btn" onClick={() => setIndex(index - 1)} disabled={index === 0}>
            {lang === 'ru' ? 'НАЗАД' : 'BACK'}
          </button>
          <button ref={next} type="button" className="btn btn-on" onClick={() => index === TUTORIAL_STEPS.length - 1 ? close() : setIndex(index + 1)}>
            {index === TUTORIAL_STEPS.length - 1 ? (lang === 'ru' ? 'ГОТОВО' : 'DONE') : (lang === 'ru' ? 'ДАЛЬШЕ' : 'NEXT')}
          </button>
        </div>
      </div>
    </div>
  )
}
