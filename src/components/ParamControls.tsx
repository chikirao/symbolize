import React from 'react'
import { useEditor } from '../store/editorStore'
import { getPath } from '../store/path'
import { SliderControl } from './SliderControl'
import { ColorField, RadioRow, Row, SelectControl, Toggle } from './Primitives'

/* Store-bound controls: each one subscribes to a single settings path so a
   slider drag does not re-render the whole panel. */

export function ParamSlider(props: {
  path: string
  label: string
  min: number
  max: number
  step?: number
  decimals?: number
  suffix?: string
  disabled?: boolean
  hint?: string
}) {
  const value = useEditor((s) => getPath<number>(s.settings, props.path))
  const setLive = useEditor((s) => s.setParamLive)
  const reset = useEditor((s) => s.resetParam)
  return (
    <SliderControl
      label={props.label}
      value={typeof value === 'number' ? value : 0}
      min={props.min}
      max={props.max}
      step={props.step}
      decimals={props.decimals}
      suffix={props.suffix}
      disabled={props.disabled}
      hint={props.hint}
      onChange={(v) => setLive(props.path, v)}
      onReset={() => reset(props.path)}
    />
  )
}

export function ParamToggle(props: {
  path: string
  label: string
  disabled?: boolean
  hint?: string
}) {
  const value = useEditor((s) => getPath<boolean>(s.settings, props.path))
  const set = useEditor((s) => s.setParam)
  const reset = useEditor((s) => s.resetParam)
  return (
    <Row label={props.label} hint={props.hint} onReset={() => reset(props.path)}>
      <Toggle
        checked={!!value}
        disabled={props.disabled}
        label={props.label}
        onChange={(v) => set(props.path, v)}
      />
    </Row>
  )
}

export function ParamSelect<T extends string>(props: {
  path: string
  label: string
  options: { value: T; label: string }[]
  hint?: string
  width?: number
}) {
  const value = useEditor((s) => getPath<T>(s.settings, props.path))
  const set = useEditor((s) => s.setParam)
  const reset = useEditor((s) => s.resetParam)
  return (
    <Row label={props.label} hint={props.hint} onReset={() => reset(props.path)}>
      <SelectControl
        value={value}
        options={props.options}
        ariaLabel={props.label}
        width={props.width}
        onChange={(v) => set(props.path, v)}
      />
    </Row>
  )
}

export function ParamRadio<T extends string>(props: {
  path: string
  options: { value: T; label: string }[]
  columns?: number
}) {
  const value = useEditor((s) => getPath<T>(s.settings, props.path))
  const set = useEditor((s) => s.setParam)
  return (
    <RadioRow
      value={value}
      options={props.options}
      columns={props.columns}
      onChange={(v) => set(props.path, v)}
    />
  )
}

export function ParamColor(props: { path: string; label: string }) {
  const value = useEditor((s) => getPath<string>(s.settings, props.path))
  const set = useEditor((s) => s.setParam)
  const reset = useEditor((s) => s.resetParam)
  return (
    <Row label={props.label} onReset={() => reset(props.path)}>
      <ColorField
        value={value || '#ffffff'}
        ariaLabel={props.label}
        onChange={(v) => set(props.path, v.toUpperCase())}
      />
    </Row>
  )
}
