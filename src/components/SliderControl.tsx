import React, { useLayoutEffect, useRef, useState } from 'react'
import { NumberField, format } from './Primitives'

/* --- character metrics so the ASCII bar fills its container --------- */

let metricCtx: CanvasRenderingContext2D | null = null
const widthCache = new Map<string, number>()

function measureCharWidth(font: string): number {
  const hit = widthCache.get(font)
  if (hit) return hit
  if (!metricCtx) metricCtx = document.createElement('canvas').getContext('2d')
  if (!metricCtx) return 7
  metricCtx.font = font
  const w = metricCtx.measureText('█████████').width / 9
  if (w > 0) widthCache.set(font, w)
  return w || 7
}

if (typeof document !== 'undefined' && (document as any).fonts?.ready) {
  ;(document as any).fonts.ready.then(() => widthCache.clear())
}

export function useFitChars(fontPx = 12, min = 8, max = 96) {
  const ref = useRef<HTMLDivElement>(null)
  const [n, setN] = useState(22)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      const cw = measureCharWidth(`${fontPx}px "Ubuntu Mono", "Courier New", monospace`)
      const count = Math.max(min, Math.min(max, Math.floor(el.clientWidth / cw) - 2))
      setN((prev) => (prev === count ? prev : count))
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    const t = window.setTimeout(update, 400)
    return () => {
      ro.disconnect()
      clearTimeout(t)
    }
  }, [fontPx, min, max])
  return [ref, n] as const
}

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
}

export function SliderControl(props: SliderProps) {
  const { value, min, max } = props
  const step = props.step ?? 1
  const [barRef, chars] = useFitChars(12, 10, 90)

  const t = max > min ? (value - min) / (max - min) : 0
  const filled = Math.max(0, Math.min(chars, Math.round(t * chars)))

  return (
    <div
      className={
        'group relative pl-3 py-[1px] ' + (props.disabled ? 'opacity-40 pointer-events-none' : '')
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
      <div ref={barRef} className="slider-wrap w-full">
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
