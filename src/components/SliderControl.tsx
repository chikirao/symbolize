import React from 'react'
import { NumberField, format } from './Primitives'

/**
 * Every ASCII meter is the same length. It used to be measured per slider,
 * which meant controls that mounted before the panel scrollbar appeared ended
 * up a few characters wider than their neighbours — and the mismatch only
 * became obvious once a focus outline was drawn around one of them.
 *
 * The parameter column is a fixed width, so a constant is both correct and
 * stable. `.slider-bar` also clips, so a bar can never spill out of its row.
 */
export const BAR_CHARS = 32

/* ------------------------------------------------------------------ */

export interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  decimals?: number
  disabled?: boolean
  hint?: string
  onChange: (v: number) => void
  onReset?: () => void
  suffix?: string
  /** keyframe marker, rendered next to the value (see ParamControls) */
  marker?: React.ReactNode
  /** hidden while the panel is in its plain state */
  advanced?: boolean
}

export function SliderControl(props: SliderProps) {
  const { value, min, max } = props
  const step = props.step ?? 1
  const chars = BAR_CHARS

  const t = max > min ? (value - min) / (max - min) : 0
  const filled = Math.max(0, Math.min(chars, Math.round(t * chars)))

  return (
    <div
      className={
        'slider-control group relative pl-3 py-[1px] ' +
        (props.advanced ? 'is-advanced ' : '') +
        (props.disabled ? 'opacity-40 pointer-events-none' : '')
      }
    >
      <span
        aria-hidden="true"
        className="absolute left-0 top-[1px] text-fg opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 text-xs2 select-none"
      >
        &gt;
      </span>
      <div className="flex items-baseline justify-between gap-2">
        <span
          className="text-xs2 uppercase text-fg2 group-hover:text-fg truncate select-none"
          onDoubleClick={props.onReset}
          title={props.hint || (props.onReset ? 'double-click label to reset' : undefined)}
        >
          {props.label}
        </span>
        <span className="flex items-baseline">
          {props.marker}
          <NumberField
            value={value}
            min={min}
            max={max}
            step={step}
            decimals={props.decimals}
            ariaLabel={props.label}
            onChange={props.onChange}
          />
          {props.suffix && <span className="text-fg3 text-xxs ml-[2px]">{props.suffix}</span>}
        </span>
      </div>
      <div className="slider-wrap">
        <div className="slider-bar text-xs2" aria-hidden="true">
          [<b>{'█'.repeat(filled)}</b>
          {'░'.repeat(Math.max(0, chars - filled))}]
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={props.label}
          aria-valuetext={format(value, props.decimals) + (props.suffix || '')}
          onChange={(e) => props.onChange(parseFloat(e.target.value))}
          onDoubleClick={props.onReset}
        />
      </div>
    </div>
  )
}

/** Read-only ASCII meter, used by the status bar and export progress. */
export function AsciiMeter(props: { value: number; chars?: number; className?: string }) {
  const chars = props.chars ?? 16
  const filled = Math.max(0, Math.min(chars, Math.round(props.value * chars)))
  return (
    <span className={'slider-bar ' + (props.className || '')}>
      [<b>{'█'.repeat(filled)}</b>
      {'░'.repeat(chars - filled)}]
    </span>
  )
}
