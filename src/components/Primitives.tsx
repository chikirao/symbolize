import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { scrambleSubtree, scrambleText } from '../ui/scramble'

/* ------------------------------------------------------------------ */
/* ASCII frame                                                         */
/* ------------------------------------------------------------------ */

export function AsciiBox(props: {
  title?: React.ReactNode
  right?: React.ReactNode
  footerLeft?: React.ReactNode
  footerRight?: React.ReactNode
  className?: string
  bodyClassName?: string
  children?: React.ReactNode
}) {
  return (
    <div className={'ascii-box ' + (props.className || '')}>
      <span className="ascii-corner tl" aria-hidden="true">
        ┌
      </span>
      <span className="ascii-corner tr" aria-hidden="true">
        ┐
      </span>
      <span className="ascii-corner bl" aria-hidden="true">
        └
      </span>
      <span className="ascii-corner br" aria-hidden="true">
        ┘
      </span>
      {(props.title !== undefined || props.right !== undefined) && (
        <div className="flex items-center justify-between px-2 -mt-[9px] pointer-events-none select-none">
          <span className="bg-black px-1 text-fg text-xs2 tracking-widest pointer-events-auto">
            {props.title}
          </span>
          <span className="bg-black px-1 text-fg2 text-xs2 pointer-events-auto">{props.right}</span>
        </div>
      )}
      <div className={props.bodyClassName}>{props.children}</div>
      {(props.footerLeft !== undefined || props.footerRight !== undefined) && (
        <div className="flex items-center justify-between px-2 -mb-[9px] pointer-events-none select-none">
          <span className="bg-black px-1 text-fg2 text-xs2">{props.footerLeft}</span>
          <span className="bg-black px-1 text-fg2 text-xs2">{props.footerRight}</span>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* text scramble                                                       */
/* ------------------------------------------------------------------ */

export function Scramble(props: {
  text: string
  token?: number | string
  duration?: number
  className?: string
  title?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const first = useRef(true)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    if (first.current) {
      first.current = false
      el.textContent = props.text
      return
    }
    return scrambleText(el, props.text, props.duration ?? 240, (props.text.length * 7919) | 0)
  }, [props.text, props.token, props.duration])
  return (
    <span ref={ref} className={props.className} title={props.title}>
      {props.text}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* rows / labels                                                       */
/* ------------------------------------------------------------------ */

export function Hint(props: { text: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  return (
    <span
      className="relative"
      onMouseEnter={() => {
        timer.current = window.setTimeout(() => setOpen(true), 420)
      }}
      onMouseLeave={() => {
        if (timer.current) clearTimeout(timer.current)
        setOpen(false)
      }}
    >
      {props.children}
      {open && (
        <span className="tip ascii-art left-0 top-full mt-1 text-xs2">
          <span className="block text-fg3">┌{'─'.repeat(props.text.length + 2)}┐</span>
          <span className="block">│ {props.text} │</span>
          <span className="block text-fg3">└{'─'.repeat(props.text.length + 2)}┘</span>
        </span>
      )}
    </span>
  )
}

export function Row(props: {
  label: string
  onReset?: () => void
  hint?: string
  children: React.ReactNode
  className?: string
}) {
  const label = (
    <span
      className="row-label text-xs2 uppercase"
      onDoubleClick={props.onReset}
      title={props.onReset ? 'double-click to reset' : undefined}
    >
      {props.label}
    </span>
  )
  return (
    <div className={'row ' + (props.className || '')}>
      {props.hint ? <Hint text={props.hint}>{label}</Hint> : label}
      <div className="flex items-center justify-end gap-1">{props.children}</div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* toggle / radio                                                      */
/* ------------------------------------------------------------------ */

export function Toggle(props: {
  checked: boolean
  onChange: (v: boolean) => void
  label?: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={props.checked}
      aria-label={props.label}
      disabled={props.disabled}
      className={'tog text-xs2 ' + (props.disabled ? 'text-off cursor-not-allowed' : '')}
      onClick={() => !props.disabled && props.onChange(!props.checked)}
    >
      {props.checked ? '[x]' : '[ ]'}
      {props.label ? ' ' + props.label : ''}
    </button>
  )
}

export function RadioRow<T extends string>(props: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  columns?: number
}) {
  return (
    <div
      className="pl-3 grid gap-x-2"
      style={{ gridTemplateColumns: `repeat(${props.columns || 2}, minmax(0,1fr))` }}
      role="radiogroup"
    >
      {props.options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={props.value === o.value}
          className={
            'tog text-left text-xs2 uppercase ' +
            (props.value === o.value ? 'text-fg' : 'text-fg2 hover:text-fg')
          }
          onClick={() => props.onChange(o.value)}
        >
          {props.value === o.value ? '(*) ' : '( ) '}
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* select                                                              */
/* ------------------------------------------------------------------ */

export function SelectControl<T extends string>(props: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  ariaLabel?: string
  width?: number
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const prev = useRef(props.value)
  useEffect(() => {
    if (prev.current === props.value) return
    prev.current = props.value
    const el = ref.current
    if (!el) return
    const label = props.options.find((o) => o.value === props.value)?.label ?? props.value
    return scrambleText(el, label, 200, label.length * 131)
  }, [props.value, props.options])

  const current = props.options.find((o) => o.value === props.value)?.label ?? props.value

  return (
    <span className="sel-wrap text-xs2 relative">
      <span
        ref={ref}
        className="px-1 uppercase inline-block text-right"
        style={{ minWidth: (props.width || 13) + 'ch' }}
      >
        {current}
      </span>
      <select
        className="sel absolute inset-0 opacity-0 w-full h-full cursor-pointer"
        aria-label={props.ariaLabel}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value as T)}
      >
        {props.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* numeric input                                                       */
/* ------------------------------------------------------------------ */

export function NumberField(props: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  decimals?: number
  width?: number
  ariaLabel?: string
}) {
  const [text, setText] = useState(() => format(props.value, props.decimals))
  const focused = useRef(false)

  useEffect(() => {
    if (!focused.current) setText(format(props.value, props.decimals))
  }, [props.value, props.decimals])

  const commit = (raw: string) => {
    const n = parseFloat(raw)
    if (Number.isNaN(n)) {
      setText(format(props.value, props.decimals))
      return
    }
    let v = n
    if (props.min !== undefined) v = Math.max(props.min, v)
    if (props.max !== undefined) v = Math.min(props.max, v)
    props.onChange(v)
    setText(format(v, props.decimals))
  }

  return (
    <input
      className="num text-xs2"
      style={{ width: (props.width || 60) + 'px' }}
      type="number"
      inputMode="decimal"
      aria-label={props.ariaLabel}
      value={text}
      step={props.step}
      min={props.min}
      max={props.max}
      onFocus={() => (focused.current = true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={(e) => {
        focused.current = false
        commit(e.target.value)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
      }}
    />
  )
}

export function format(v: number, decimals?: number): string {
  const d = decimals ?? (Number.isInteger(v) ? 0 : 2)
  return v.toFixed(d)
}

/* ------------------------------------------------------------------ */
/* colour                                                              */
/* ------------------------------------------------------------------ */

export function ColorField(props: {
  value: string
  onChange: (v: string) => void
  ariaLabel?: string
}) {
  return (
    <label className="color-field text-xs2" title={props.value}>
      <span className="color-swatch" style={{ background: props.value }} />
      <span className="text-fg2 uppercase">{props.value}</span>
      <input
        type="color"
        aria-label={props.ariaLabel || 'colour'}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </label>
  )
}

/* ------------------------------------------------------------------ */
/* accordion section                                                   */
/* ------------------------------------------------------------------ */

export function Section(props: {
  id: string
  title: string
  open: boolean
  onToggle: (id: string) => void
  badge?: React.ReactNode
  children: React.ReactNode
}) {
  const titleRef = useRef<HTMLSpanElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const mounted = useRef(false)
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      return
    }
    const el = titleRef.current
    if (!el) return
    return scrambleText(el, props.title, 190, props.title.length * 977)
  }, [props.open, props.title])

  // the whole panel resolves out of noise, not just its heading
  useEffect(() => {
    if (!props.open) return
    const el = bodyRef.current
    if (!el) return
    return scrambleSubtree(el, 320)
  }, [props.open])

  return (
    <div className="border-b border-line">
      <button
        type="button"
        className="w-full flex items-center gap-1 px-2 py-[3px] text-left hover:bg-[#111] group"
        aria-expanded={props.open}
        onClick={() => props.onToggle(props.id)}
      >
        <span className="text-fg2 group-hover:text-fg text-xs2">{props.open ? '[-]' : '[+]'}</span>
        <span ref={titleRef} className="text-fg text-xs2 tracking-widest uppercase">
          {props.title}
        </span>
        <span className="ml-auto text-fg3 text-xxs">{props.badge}</span>
      </button>
      {props.open && (
        <div ref={bodyRef} className="pb-2 px-2 panel-reveal">
          {props.children}
        </div>
      )}
    </div>
  )
}

export function Divider(props: { label?: string }) {
  return (
    <div className="hr text-xxs my-1 select-none">
      {props.label ? `── ${props.label} ` : ''}
      {'─'.repeat(60)}
    </div>
  )
}
