import React from 'react'
import type { GradientStop } from '../types/editor'
import { cssGradient } from '../engine/gradients'
import { ColorField } from './Primitives'
import { useT } from '../i18n'

export function GradientEditor(props: {
  stops: GradientStop[]
  reverse: boolean
  onChange: (stops: GradientStop[]) => void
  onReverse: (v: boolean) => void
}) {
  const t = useT()
  const sorted = [...props.stops].sort((a, b) => a.pos - b.pos)

  const update = (id: string, patch: Partial<GradientStop>) => {
    props.onChange(props.stops.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }
  const remove = (id: string) => {
    if (props.stops.length <= 2) return
    props.onChange(props.stops.filter((s) => s.id !== id))
  }
  const add = () => {
    const id = 'g' + Date.now().toString(36)
    // insert into the biggest gap
    let bestPos = 0.5
    let bestGap = -1
    for (let i = 0; i < sorted.length - 1; i++) {
      const gap = sorted[i + 1].pos - sorted[i].pos
      if (gap > bestGap) {
        bestGap = gap
        bestPos = sorted[i].pos + gap / 2
      }
    }
    props.onChange([...props.stops, { id, pos: bestPos, color: '#FFFFFF' }])
  }

  return (
    <div className="pl-3 mt-1">
      <div
        className="h-4 border border-line2"
        style={{ backgroundImage: cssGradient(props.stops, props.reverse) }}
        aria-label={t('gradient preview')}
      />
      <div className="mt-1 space-y-[1px]">
        {sorted.map((s, i) => (
          <div key={s.id} className="flex items-center gap-1 group">
            <span className="text-fg3 text-xxs w-[13px] shrink-0 select-none">
              {i.toString().padStart(2, '0')}
            </span>
            <ColorField
              compact
              value={s.color}
              ariaLabel={`stop ${i} colour`}
              onChange={(v) => update(s.id, { color: v.toUpperCase() })}
            />
            <input
              type="range"
              className="ascii-range flex-1 min-w-0"
              min={0}
              max={1}
              step={0.01}
              value={s.pos}
              aria-label={`stop ${i} position`}
              onChange={(e) => update(s.id, { pos: parseFloat(e.target.value) })}
            />
            <span className="text-fg2 text-xxs w-[28px] shrink-0 text-right tabular-nums">
              {s.pos.toFixed(2)}
            </span>
            <button
              type="button"
              className="text-fg3 hover:text-fg text-xxs shrink-0 pl-1 disabled:opacity-30"
              disabled={props.stops.length <= 2}
              aria-label={`remove stop ${i}`}
              onClick={() => remove(s.id)}
            >
              [x]
            </button>
          </div>
        ))}
      </div>
      <div className="flex gap-3 mt-1">
        <button type="button" className="btn text-xxs" onClick={add}>
          {t('ADD STOP')}
        </button>
        <button
          type="button"
          className={'btn text-xxs ' + (props.reverse ? 'btn-on' : '')}
          onClick={() => props.onReverse(!props.reverse)}
        >
          {t('REVERSE')}
        </button>
      </div>
    </div>
  )
}
