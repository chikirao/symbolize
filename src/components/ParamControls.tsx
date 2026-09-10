import React from 'react'
import { useEditor } from '../store/editorStore'
import { useAnim, keyStateFor } from '../store/animStore'
import type { KeyValue } from '../types/anim'
import { getPath } from '../store/path'
import { animatableFor } from '../engine/animatable'
import { findTrack, trackValueAt } from '../engine/animation'
import { SliderControl } from './SliderControl'
import { ColorField, RadioRow, Row, SelectControl, Toggle } from './Primitives'

/* Store-bound controls: each one subscribes to a single settings path so a
   slider drag does not re-render the whole panel.

   Animation rides on the same subscription. A parameter with a track shows the
   value at the playhead and writes keyframes when you drag it — otherwise the
   slider would visibly do nothing, because the track wins at render time. A
   parameter without a track only writes keys when AUTO KEY is armed. */

interface AnimatedParam {
  /** null when the path is not in the animatable registry */
  animatable: boolean
  /** the value to display: the track's value at the playhead, or the base one */
  value: unknown
  keyState: 'none' | 'track' | 'key'
  /** true when edits should become keyframes rather than base-settings changes */
  keying: boolean
}

function useAnimatedParam(path: string): AnimatedParam {
  const meta = animatableFor(path)
  const base = useEditor((s) => getPath<unknown>(s.settings, path))

  // Both selectors return primitives, so a control only re-renders when its own
  // value or marker actually changes — not on every playhead tick.
  const animated = useAnim((s) => {
    if (!meta) return undefined
    const track = findTrack(s.project, path)
    if (!track || track.muted) return undefined
    return trackValueAt(track, s.frame)
  })
  const keyState = useAnim((s) => (meta ? keyStateFor(path, s.frame, s.project) : 'none'))
  // AUTO KEY only lives inside the expanded timeline, so it only bites there
  const recording = useAnim((s) => s.autoKey && s.open)

  return {
    animatable: !!meta,
    value: animated !== undefined ? animated : base,
    keyState,
    keying: !!meta && (keyState !== 'none' || recording),
  }
}

/** Writes an edit to the right place: a keyframe, or the base settings. */
function commitParam(path: string, value: KeyValue, keying: boolean, live: boolean): void {
  if (!keying) {
    const store = useEditor.getState()
    if (live) store.setParamLive(path, value)
    else store.setParam(path, value)
    return
  }
  const anim = useAnim.getState()
  const track = findTrack(anim.project, path)
  // A brand new track started mid-timeline would snap frame 0 to the new value
  // as well. Pin the value you can currently see at 0 first.
  if (!track && anim.frame !== 0) {
    anim.putKeyAt(path, 0, getPath<KeyValue>(useEditor.getState().settings, path))
  }
  anim.putKeyAt(path, anim.frame, value)
}

/* ------------------------------------------------------------------ */

/**
 * `[ ]` no track, `[.]` track but no key here, `[*]` key on this frame.
 *
 * An empty marker on all seventy-odd parameters is a lot of furniture for
 * someone who is only retouching a photo, so the empty state is only drawn
 * while the timeline is open. A parameter that *is* animated always shows its
 * marker, timeline open or not — that one is information, not an affordance.
 */
export function KeyDot(props: { path: string; value: KeyValue }) {
  const meta = animatableFor(props.path)
  const keyState = useAnim((s) => (meta ? keyStateFor(props.path, s.frame, s.project) : 'none'))
  const timelineOpen = useAnim((s) => s.open)
  if (!meta) return null
  if (keyState === 'none' && !timelineOpen) return null

  const glyph = keyState === 'key' ? '[*]' : keyState === 'track' ? '[.]' : '[ ]'
  const title =
    keyState === 'key'
      ? 'remove the keyframe on this frame'
      : keyState === 'track'
        ? 'key this frame'
        : 'animate this parameter'

  return (
    <button
      type="button"
      className={
        'key-dot text-xxs ' +
        (keyState === 'key' ? 'has-key' : keyState === 'track' ? 'has-track' : '')
      }
      aria-label={title}
      title={title}
      onClick={() => {
        const anim = useAnim.getState()
        if (keyState === 'key') anim.removeKeyHere(props.path)
        else {
          if (keyState === 'none' && anim.frame !== 0) anim.putKeyAt(props.path, 0, props.value)
          anim.keyHere(props.path, props.value)
        }
      }}
    >
      {glyph}
    </button>
  )
}

/* ------------------------------------------------------------------ */

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
  advanced?: boolean
}) {
  const param = useAnimatedParam(props.path)
  const reset = useEditor((s) => s.resetParam)
  const value = typeof param.value === 'number' ? param.value : 0

  return (
    <SliderControl
      label={props.label}
      value={value}
      min={props.min}
      max={props.max}
      step={props.step}
      decimals={props.decimals}
      suffix={props.suffix}
      disabled={props.disabled}
      hint={props.hint}
      advanced={props.advanced}
      docPath={props.path}
      marker={param.animatable ? <KeyDot path={props.path} value={value} /> : undefined}
      onChange={(v) => commitParam(props.path, v, param.keying, true)}
      onReset={() => reset(props.path)}
    />
  )
}

export function ParamToggle(props: {
  path: string
  label: string
  disabled?: boolean
  hint?: string
  advanced?: boolean
}) {
  const param = useAnimatedParam(props.path)
  const reset = useEditor((s) => s.resetParam)
  const checked = param.value === true || param.value === 'true'

  return (
    <Row
      label={props.label}
      hint={props.hint}
      advanced={props.advanced}
      docPath={props.path}
      onReset={() => reset(props.path)}
    >
      {param.animatable && <KeyDot path={props.path} value={String(checked)} />}
      <Toggle
        checked={checked}
        disabled={props.disabled}
        label={props.label}
        onChange={(v) => commitParam(props.path, param.keying ? String(v) : v, param.keying, false)}
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
  advanced?: boolean
}) {
  const param = useAnimatedParam(props.path)
  const reset = useEditor((s) => s.resetParam)
  const value = String(param.value ?? '') as T

  return (
    <Row
      label={props.label}
      hint={props.hint}
      advanced={props.advanced}
      docPath={props.path}
      onReset={() => reset(props.path)}
    >
      {param.animatable && <KeyDot path={props.path} value={value} />}
      <SelectControl
        value={value}
        options={props.options}
        ariaLabel={props.label}
        width={props.width}
        onChange={(v) => commitParam(props.path, v, param.keying, false)}
      />
    </Row>
  )
}

export function ParamRadio<T extends string>(props: {
  path: string
  options: { value: T; label: string }[]
  columns?: number
}) {
  const param = useAnimatedParam(props.path)
  const value = String(param.value ?? '') as T
  return (
    <RadioRow
      value={value}
      options={props.options}
      columns={props.columns}
      onChange={(v) => commitParam(props.path, v, param.keying, false)}
    />
  )
}

export function ParamColor(props: { path: string; label: string; advanced?: boolean }) {
  const param = useAnimatedParam(props.path)
  const reset = useEditor((s) => s.resetParam)
  const value = String(param.value ?? '#FFFFFF').toUpperCase()

  return (
    <Row
      label={props.label}
      advanced={props.advanced}
      docPath={props.path}
      onReset={() => reset(props.path)}
    >
      {param.animatable && <KeyDot path={props.path} value={value} />}
      <ColorField
        value={value || '#FFFFFF'}
        ariaLabel={props.label}
        onChange={(v) => commitParam(props.path, v.toUpperCase(), param.keying, false)}
      />
    </Row>
  )
}
