import React, { useMemo, useRef, useState } from 'react'
import { useAnim } from '../store/animStore'
import { useEditor } from '../store/editorStore'
import type { AnimationTrack, Easing, KeyValue, LoopMode } from '../types/anim'
import { MAX_FRAMES, MIN_FRAMES } from '../types/anim'
import {
  EASINGS,
  baseValueFor,
  keyAtFrame,
  parseProject,
  serializeProject,
  trackValueAt,
} from '../engine/animation'
import { downloadBlob } from '../engine/export'
import { ZONE_GROUPS, animatableFor, animatableGroups } from '../engine/animatable'
import { ANIM_PRESETS } from '../engine/animPresets'
import { AsciiBox, NumberField, SelectControl, Toggle, format } from './Primitives'

/**
 * The timeline: transport, playhead and one strip per animated parameter.
 *
 * Strips are a fixed number of characters, like every other meter in the app —
 * measuring them per row was what made the sliders jitter, and the same applies
 * here. The playhead is drawn by slicing the string in three, which is exact in
 * a monospace column. Mobile gets a shorter strip rather than a measured one.
 */
const STRIP_CHARS = 72
const STRIP_CHARS_COMPACT = 34

function charForFrame(frame: number, duration: number, chars: number): number {
  if (duration <= 1) return 0
  const t = frame / (duration - 1)
  return Math.max(0, Math.min(chars - 1, Math.round(t * (chars - 1))))
}

const pad3 = (n: number) => String(n).padStart(3, '0')

function frameForRatio(t: number, duration: number): number {
  return Math.max(0, Math.min(duration - 1, Math.round(t * (duration - 1))))
}

/** The ruler is fixed geometry: eighths of the timeline, whatever its length. */
function rulerCells(chars: number): string {
  const tick = Math.max(2, Math.round(chars / 8))
  return Array.from({ length: chars }, (_, i) =>
    i === 0 || i === chars - 1 || i % tick === 0 ? '┬' : '─',
  ).join('')
}

function trackCells(track: AnimationTrack, duration: number, chars: number): string {
  const cells = new Array(chars).fill('·')
  const first = charForFrame(track.keys[0]?.frame ?? 0, duration, chars)
  const last = charForFrame(track.keys[track.keys.length - 1]?.frame ?? 0, duration, chars)
  for (let i = first; i <= last; i++) cells[i] = '─'
  for (const key of track.keys) {
    cells[charForFrame(key.frame, duration, chars)] = key.easing === 'hold' ? '#' : '*'
  }
  return cells.join('')
}

/* ------------------------------------------------------------------ */

function Strip(props: {
  cells: string
  head: number
  headChar?: string
  onScrub: (ratio: number) => void
  onGrab?: (ratio: number) => boolean
  onDrag?: (ratio: number) => void
  onRelease?: () => void
  ariaLabel: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const mode = useRef<'none' | 'scrub' | 'drag'>('none')

  const ratioAt = (clientX: number): number => {
    const el = ref.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    return Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)))
  }

  const head = Math.max(0, Math.min(props.cells.length - 1, props.head))
  const under = props.cells[head] ?? '·'

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label={props.ariaLabel}
      aria-valuenow={head}
      aria-valuemin={0}
      aria-valuemax={props.cells.length - 1}
      className="tl-strip ascii-art text-xs2"
      onPointerDown={(e) => {
        e.preventDefault()
        const ratio = ratioAt(e.clientX)
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        mode.current = props.onGrab?.(ratio) ? 'drag' : 'scrub'
        if (mode.current === 'scrub') props.onScrub(ratio)
      }}
      onPointerMove={(e) => {
        if (mode.current === 'none') return
        const ratio = ratioAt(e.clientX)
        if (mode.current === 'drag') props.onDrag?.(ratio)
        else props.onScrub(ratio)
      }}
      onPointerUp={(e) => {
        if (mode.current === 'drag') props.onRelease?.()
        mode.current = 'none'
        try {
          ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
        } catch {
          /* already released */
        }
      }}
      onPointerCancel={() => {
        mode.current = 'none'
      }}
    >
      <span className="text-fg3">{props.cells.slice(0, head)}</span>
      <span className="tl-head text-fg">
        {under === '*' || under === '#' ? under : props.headChar || '│'}
      </span>
      <span className="text-fg3">{props.cells.slice(head + 1)}</span>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function TrackRow(props: { track: AnimationTrack; chars: number }) {
  const { track, chars } = props
  const project = useAnim((s) => s.project)
  const frame = useAnim((s) => s.frame)
  const selected = useAnim((s) => s.selected)
  const setFrame = useAnim((s) => s.setFrame)
  const setSelected = useAnim((s) => s.setSelected)
  const putKeyAt = useAnim((s) => s.putKeyAt)
  const removeKeyAt = useAnim((s) => s.removeKeyAt)
  const dragKey = useAnim((s) => s.dragKey)
  const dropTrack = useAnim((s) => s.dropTrack)
  const muteTrack = useAnim((s) => s.muteTrack)
  const gotoKey = useAnim((s) => s.gotoKey)
  const setEasingAt = useAnim((s) => s.setEasingAt)

  const meta = animatableFor(track.path)
  const duration = project.durationFrames
  const cells = useMemo(() => trackCells(track, duration, chars), [track, duration, chars])
  const here = keyAtFrame(track, frame)
  const value = trackValueAt(track, frame)

  /** the key a pointer press grabbed, so a drag moves it instead of scrubbing */
  const grabbed = useRef<number | null>(null)
  const grabTolerance = Math.max(1, Math.round(duration / chars))

  const label = meta?.label ?? track.path
  const readout =
    value === undefined
      ? ''
      : meta?.kind === 'number' || meta?.kind === 'angle'
        ? format(Number(value), meta.decimals ?? 2)
        : String(value)

  const toggleKey = () => {
    if (here) removeKeyAt(track.path, frame)
    else if (value !== undefined) putKeyAt(track.path, frame, value)
  }

  return (
    <div className={'tl-track' + (selected === track.path ? ' is-selected' : '')}>
      <button
        type="button"
        className="tl-track-name text-xs2 uppercase"
        title={track.path + (meta ? ' :: ' + meta.cost.toUpperCase() : '')}
        onClick={() => setSelected(selected === track.path ? null : track.path)}
      >
        {label}
      </button>
      <Toggle
        checked={!track.muted}
        label={'ENABLE ' + label}
        hideLabel
        onChange={() => muteTrack(track.path)}
      />
      <Strip
        ariaLabel={label + ' keyframes'}
        cells={cells}
        head={charForFrame(frame, duration, chars)}
        onScrub={(r) => setFrame(frameForRatio(r, duration))}
        onGrab={(r) => {
          const at = frameForRatio(r, duration)
          const near = track.keys.find((k) => Math.abs(k.frame - at) <= grabTolerance)
          grabbed.current = near ? near.frame : null
          return near !== undefined
        }}
        onDrag={(r) => {
          if (grabbed.current === null) return
          const to = frameForRatio(r, duration)
          if (to === grabbed.current) return
          dragKey(track.path, grabbed.current, to)
          grabbed.current = to
        }}
        onRelease={() => {
          grabbed.current = null
        }}
      />
      <span className="tl-value text-xxs text-fg2">{readout}</span>
      <span className="tl-track-actions">
        <button type="button" className="btn text-xxs" title="previous key" onClick={() => gotoKey(track.path, -1)}>
          {'<'}
        </button>
        <button
          type="button"
          className={'btn text-xxs ' + (here ? 'is-on' : '')}
          title={here ? 'remove key at this frame' : 'key this frame'}
          onClick={toggleKey}
        >
          {here ? '[*]' : '[.]'}
        </button>
        <button type="button" className="btn text-xxs" title="next key" onClick={() => gotoKey(track.path, 1)}>
          {'>'}
        </button>
        <button
          type="button"
          className="btn text-xxs btn-danger"
          title="delete track"
          onClick={() => dropTrack(track.path)}
        >
          X
        </button>
      </span>

      {/* Rendered for the whole time a track is selected, not only on frames
          that happen to hold a key: tying it to `here` made the row grow and
          shrink under the playhead, so the entire panel jumped on every key
          during playback. Selecting a track is a click; the layout may move
          then. Playback must never move it. */}
      {selected === track.path && (
        <div className="tl-track-detail text-xxs text-fg2">
          {here && meta?.kind !== 'step' ? (
            <>
              KEY {pad3(here.frame)} :: EASING
              <SelectControl
                value={here.easing}
                width={11}
                ariaLabel="key easing"
                options={EASINGS}
                onChange={(v) => setEasingAt(track.path, here.frame, v as Easing)}
              />
            </>
          ) : (
            <span className="text-fg3">
              {here ? 'STEP KEY :: HOLDS UNTIL THE NEXT ONE' : 'NO KEY ON THIS FRAME'}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */

function AddTrack() {
  const settings = useEditor((s) => s.settings)
  const zones = useEditor((s) => s.settings.zone.list)
  const project = useAnim((s) => s.project)
  const frame = useAnim((s) => s.frame)
  const putKeyAt = useAnim((s) => s.putKeyAt)
  const setSelected = useAnim((s) => s.setSelected)
  const [open, setOpen] = useState(false)
  const [openGroup, setOpenGroup] = useState<string | null>(null)

  // A zone nobody has picked a colour for cannot do anything, so its eighteen
  // parameters stay out of the menu rather than tripling its length.
  const groups = useMemo(() => {
    const hidden = new Set<string>()
    zones.forEach((z, i) => {
      if (!z.enabled || z.picks.length === 0) hidden.add(ZONE_GROUPS[i])
    })
    return animatableGroups(hidden)
  }, [zones])
  const existing = useMemo(() => new Set(project.tracks.map((t) => t.path)), [project.tracks])

  const add = (path: string) => {
    const value: KeyValue = baseValueFor(settings, path)
    // A track that starts at the playhead would jump on frame 0; seed the base
    // value there too so the first key is a change *from* what you can see.
    if (frame !== 0) putKeyAt(path, 0, value)
    putKeyAt(path, frame, value)
    setSelected(path)
    setOpen(false)
  }

  return (
    <div className="tl-add">
      <button type="button" className="btn text-xxs" onClick={() => setOpen((v) => !v)}>
        {open ? '- ADD TRACK' : '+ ADD TRACK'}
      </button>
      {open && (
        <div className="tl-add-menu">
          {/* Group headers only until you open one. Ninety-odd parameters in a
              single wall is not a menu, it is a haystack. */}
          {groups.map((group) => {
            const isOpen = openGroup === group.group
            const used = group.params.filter((param) => existing.has(param.path)).length
            return (
              <div key={group.group} className="tl-add-group">
                <button
                  type="button"
                  className="tl-add-group-head text-xxs tracking-widest"
                  aria-expanded={isOpen}
                  onClick={() => setOpenGroup(isOpen ? null : group.group)}
                >
                  <span className="text-fg2">{isOpen ? '[-]' : '[+]'}</span>{' '}
                  <span className={isOpen ? 'text-fg' : 'text-fg2'}>{group.group}</span>
                  <span className="text-fg3">
                    {' '}
                    {used > 0 ? used + '/' + group.params.length : group.params.length}
                  </span>
                </button>
                {isOpen && (
                  <div className="tl-add-items">
                    {group.params.map((param) => (
                      <button
                        key={param.path}
                        type="button"
                        className="tl-add-item text-xxs uppercase"
                        disabled={existing.has(param.path)}
                        title={param.path + ' :: ' + param.cost.toUpperCase()}
                        onClick={() => add(param.path)}
                      >
                        {existing.has(param.path) ? '[x] ' : '[ ] '}
                        {param.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** One-click timelines, laid onto whatever length the timeline already is. */
function PresetMenu() {
  const applyPreset = useAnim((s) => s.applyPreset)
  const [open, setOpen] = useState(false)

  return (
    <div className="tl-add">
      <button type="button" className="btn text-xxs" onClick={() => setOpen((v) => !v)}>
        {open ? '- PRESET' : '+ PRESET'}
      </button>
      {open && (
        <div className="tl-add-menu tl-preset-menu">
          {ANIM_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="tl-preset-item text-xxs"
              title={preset.note}
              onClick={() => {
                applyPreset(preset.id)
                setOpen(false)
              }}
            >
              <span className="text-fg">{preset.name}</span>
              <span className="text-fg3"> :: {preset.note.toUpperCase()}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */

export function Timeline(props: { className?: string; compact?: boolean }) {
  const project = useAnim((s) => s.project)
  const frame = useAnim((s) => s.frame)
  const playing = useAnim((s) => s.playing)
  const open = useAnim((s) => s.open)
  const autoKey = useAnim((s) => s.autoKey)
  const toggleOpen = useAnim((s) => s.toggleOpen)
  const togglePlay = useAnim((s) => s.togglePlay)
  const setFrame = useAnim((s) => s.setFrame)
  const stepFrame = useAnim((s) => s.stepFrame)
  const toFirst = useAnim((s) => s.toFirst)
  const toLast = useAnim((s) => s.toLast)
  const setFps = useAnim((s) => s.setFps)
  const setDuration = useAnim((s) => s.setDuration)
  const setLoop = useAnim((s) => s.setLoop)
  const setAutoKey = useAnim((s) => s.setAutoKey)
  const clearTracks = useAnim((s) => s.clearTracks)
  const sequence = useEditor((s) => s.sequence)

  const setProject = useAnim((s) => s.setProject)
  const loadRef = useRef<HTMLInputElement>(null)

  const duration = project.durationFrames
  const seconds = (duration / project.fps).toFixed(1)
  const chars = props.compact ? STRIP_CHARS_COMPACT : STRIP_CHARS
  const ruler = useMemo(() => rulerCells(chars), [chars])

  // On mobile the ANIM sheet is itself the disclosure, so the body is always
  // open there and the [+]/[-] title toggle would be a second, confusing one.
  const expanded = props.compact || open

  const saveProject = () => {
    const blob = new Blob([serializeProject(project)], { type: 'application/json' })
    downloadBlob(blob, 'symbolize-animation.json')
  }

  const loadProject = async (file: File | undefined | null) => {
    if (!file) return
    try {
      setProject(parseProject(await file.text()))
      useEditor.getState().setStatus({
        kind: 'ready',
        message: 'ANIMATION LOADED :: ' + file.name.toUpperCase(),
        progress: -1,
      })
    } catch (err) {
      useEditor.getState().setStatus({
        kind: 'error',
        message: 'ANIMATION LOAD FAILED :: ' + String((err as Error).message || err),
        progress: -1,
      })
    }
  }

  return (
    <AsciiBox
      className={'timeline ' + (props.className || '')}
      title={
        // the mobile sheet already has a TIMELINE header; a second one is noise
        props.compact ? undefined : (
          <button type="button" className="tl-title" onClick={toggleOpen} aria-expanded={open}>
            {open ? '[-]' : '[+]'} TIMELINE
          </button>
        )
      }
      right={
        <span>
          {sequence ? `SRC ${sequence.frames.length}F` : 'KEYFRAMES'} :: {project.tracks.length}{' '}
          TRACKS :: {seconds}s
        </span>
      }
      bodyClassName="px-2 py-1"
    >
      <div className="tl-transport">
        <button type="button" className="btn text-xs2" title="first frame" onClick={toFirst}>
          |&lt;
        </button>
        <button type="button" className="btn text-xs2" title="previous frame" onClick={() => stepFrame(-1)}>
          &lt;
        </button>
        <button
          type="button"
          className={'btn text-xs2 ' + (playing ? 'is-on' : '')}
          title="play / pause (space)"
          onClick={togglePlay}
        >
          {playing ? 'PAUSE' : 'PLAY'}
        </button>
        <button type="button" className="btn text-xs2" title="next frame" onClick={() => stepFrame(1)}>
          &gt;
        </button>
        <button type="button" className="btn text-xs2" title="last frame" onClick={toLast}>
          &gt;|
        </button>

        <span className="text-fg text-xs2 ml-2">
          FRAME {pad3(frame)}/{pad3(duration - 1)}
        </span>
      </div>

      {expanded && (
        <>
          {/* Rate, length, loop and auto-key are set once and then left alone.
              Keeping them out of the collapsed bar means someone editing a
              still photo sees a transport, not a control desk. */}
          <div className="tl-settings">
            <span className="tl-field text-xxs text-fg2">
              FPS
              <NumberField
                value={project.fps}
                min={1}
                max={60}
                step={1}
                decimals={0}
                width={44}
                ariaLabel="frames per second"
                onChange={(v) => setFps(v)}
              />
            </span>
            <span className="tl-field text-xxs text-fg2">
              LEN
              <NumberField
                value={duration}
                min={MIN_FRAMES}
                max={MAX_FRAMES}
                step={1}
                decimals={0}
                width={52}
                ariaLabel="timeline length in frames"
                onChange={(v) => setDuration(v)}
              />
            </span>
            <span className="tl-field text-xxs text-fg2">
              LOOP
              <SelectControl
                value={project.loop}
                width={9}
                ariaLabel="loop mode"
                options={[
                  { value: 'loop', label: 'LOOP' },
                  { value: 'pingpong', label: 'PINGPONG' },
                  { value: 'once', label: 'ONCE' },
                ]}
                onChange={(v) => setLoop(v as LoopMode)}
              />
            </span>
            <span className="tl-field text-xxs text-fg2">
              <Toggle checked={autoKey} label="AUTO KEY" onChange={setAutoKey} />
            </span>
          </div>

          <div className="tl-ruler">
            <span className="tl-track-name text-xxs text-fg3">FRAME</span>
            <Strip
              ariaLabel="playhead"
              cells={ruler}
              head={charForFrame(frame, duration, chars)}
              headChar="█"
              onScrub={(r) => setFrame(frameForRatio(r, duration))}
            />
            <span className="tl-value text-xxs text-fg3">{pad3(frame)}</span>
          </div>

          <div className="tl-tracks">
            {project.tracks.length === 0 && (
              <div className="text-fg3 text-xxs py-1">
                NO TRACKS :: START FROM A PRESET BELOW, ADD ONE BY HAND, OR TURN ON AUTO KEY AND
                MOVE A SLIDER
              </div>
            )}
            {project.tracks.map((track) => (
              <TrackRow key={track.path} track={track} chars={chars} />
            ))}
          </div>

          <div className="tl-footer">
            <AddTrack />
            <PresetMenu />
            <button
              type="button"
              className="btn text-xxs"
              disabled={project.tracks.length === 0}
              title="save the timeline as JSON"
              onClick={saveProject}
            >
              SAVE ANIM
            </button>
            <button
              type="button"
              className="btn text-xxs"
              title="load a timeline JSON"
              onClick={() => loadRef.current?.click()}
            >
              LOAD ANIM
            </button>
            <button
              type="button"
              className="btn text-xxs btn-danger"
              disabled={project.tracks.length === 0}
              onClick={clearTracks}
            >
              ! CLEAR TRACKS
            </button>
            <input
              ref={loadRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                void loadProject(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </div>
        </>
      )}
    </AsciiBox>
  )
}
