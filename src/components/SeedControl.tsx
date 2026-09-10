import React, { useEffect, useRef } from 'react'
import { useEditor } from '../store/editorStore'
import { scrambleNumber } from '../ui/scramble'
import { NumberField } from './Primitives'
import { useT } from '../i18n'
import { HoverDoc } from './HoverDoc'

export function SeedControl() {
  const t = useT()
  const seed = useEditor((s) => s.settings.random.seed)
  const setParam = useEditor((s) => s.setParam)
  const randomize = useEditor((s) => s.randomizeSeed)
  const ref = useRef<HTMLSpanElement>(null)
  const prev = useRef(seed)

  useEffect(() => {
    if (prev.current === seed) return
    prev.current = seed
    const el = ref.current
    if (!el) return
    return scrambleNumber(el, String(seed), 340)
  }, [seed])

  return (
    <div className="pl-3 py-[1px]">
      <div className="flex items-baseline justify-between gap-2">
        <HoverDoc path="random.seed" title={t('SEED')}>
          <span className="text-xs2 uppercase text-fg2">{t('SEED')}</span>
        </HoverDoc>
        <span className="flex items-baseline gap-2">
          <span ref={ref} className="text-fg text-xs2 tabular-nums caret">
            {seed}
          </span>
          <NumberField
            value={seed}
            min={0}
            max={4294967295}
            step={1}
            decimals={0}
            width={92}
            ariaLabel="seed"
            onChange={(v) => setParam('random.seed', Math.round(v))}
          />
        </span>
      </div>
      <div className="flex gap-2 mt-1">
        <button type="button" className="btn text-xs2" onClick={randomize}>
          {t('RANDOMIZE')}
        </button>
        <button
          type="button"
          className="btn text-xs2"
          onClick={() => setParam('random.seed', 183742)}
        >
          {t('DEFAULT')}
        </button>
      </div>
    </div>
  )
}
