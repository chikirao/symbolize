import React, { useEffect, useRef } from 'react'
import { useT, useLang } from '../i18n'
import { GUIDE_LEAD, GUIDE_STEPS, GUIDE_TITLE, guideText } from '../i18n/guide'
import { useUi } from '../store/uiStore'

/**
 * The animation walkthrough.
 *
 * It opens by itself the first time a clip is decoded — that is the moment the
 * mode stops being a still-image editor and the moment nothing on screen says
 * so. After that it is in HELP and in the timeline footer, and it never opens
 * on its own again.
 */
export function GuideOverlay() {
  const t = useT()
  const lang = useLang()
  const open = useUi((s) => s.guide)
  const closeGuide = useUi((s) => s.closeGuide)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeGuide()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [open, closeGuide])

  if (!open) return null

  return (
    <div
      className="guide-scrim"
      role="dialog"
      aria-modal="true"
      aria-label={guideText(GUIDE_TITLE, lang)}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) closeGuide()
      }}
    >
      <div className="guide-box panel-reveal">
        <div className="guide-head">
          <span className="text-fg tracking-widest">{guideText(GUIDE_TITLE, lang)}</span>
          <button ref={closeRef} type="button" className="btn text-xs2" onClick={closeGuide}>
            [X] {t('CLOSE')}
          </button>
        </div>

        <div className="guide-body">
          <p className="text-fg2 text-xs2 leading-snug mb-3">{guideText(GUIDE_LEAD, lang)}</p>

          {GUIDE_STEPS.map((step, i) => (
            <section key={i} className="guide-step">
              <h3 className="guide-step-head text-xs2">
                <span className="text-fg3">{String(i + 1).padStart(2, '0')}</span>{' '}
                <span className="text-fg tracking-widest">{guideText(step.title, lang)}</span>
              </h3>
              {step.lines.map((line, j) => (
                <p key={j} className="guide-line text-xs2 text-fg2 leading-snug">
                  <span className="text-fg3 select-none">— </span>
                  {guideText(line, lang)}
                </p>
              ))}
            </section>
          ))}

          <p className="text-fg3 text-xxs leading-snug mt-3">{t('REOPEN THIS FROM THE HELP MENU')}</p>
        </div>
      </div>
    </div>
  )
}
