import type {
  AnimationProject,
  AnimationTrack,
  Easing,
  FrameContext,
  KeyValue,
  Keyframe,
  LoopMode,
  TrackKind,
} from '../types/anim'
import { MAX_FPS, MAX_FRAMES, MIN_FPS, MIN_FRAMES } from '../types/anim'
import type { EditorSettings } from '../types/editor'
import { getPath, setPath } from '../store/path'
import { hexToRgb, rgbToHex } from './gradients'
import { animatableFor } from './animatable'

/* ------------------------------------------------------------------ */
/* easing                                                              */
/* ------------------------------------------------------------------ */

export function ease(t: number, kind: Easing): number {
  if (t <= 0) return 0
  if (t >= 1) return 1
  switch (kind) {
    case 'hold':
      return 0
    case 'in':
      return t * t
    case 'out':
      return t * (2 - t)
    case 'in-out':
      return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
    default:
      return t
  }
}

export const EASINGS: { value: Easing; label: string }[] = [
  { value: 'linear', label: 'LINEAR' },
  { value: 'in', label: 'EASE IN' },
  { value: 'out', label: 'EASE OUT' },
  { value: 'in-out', label: 'EASE IN-OUT' },
  { value: 'hold', label: 'HOLD' },
]

/* ------------------------------------------------------------------ */
/* time                                                                */
/* ------------------------------------------------------------------ */

export const clampFps = (v: number) => Math.max(MIN_FPS, Math.min(MAX_FPS, Math.round(v)))
export const clampFrames = (v: number) =>
  Math.max(MIN_FRAMES, Math.min(MAX_FRAMES, Math.round(v)))

/**
 * Maps a monotonically increasing tick to a frame inside the timeline.
 * `once` stops on the last frame; `pingpong` walks back without repeating the
 * end frames, so a 4-frame loop plays 0 1 2 3 2 1 0 1 ...
 */
export function wrapFrame(tick: number, duration: number, loop: LoopMode): number {
  const d = Math.max(1, Math.round(duration))
  if (d === 1) return 0
  const t = Math.floor(tick)
  if (loop === 'once') return Math.max(0, Math.min(d - 1, t))
  if (loop === 'pingpong') {
    const span = (d - 1) * 2
    const m = ((t % span) + span) % span
    return m < d ? m : span - m
  }
  return ((t % d) + d) % d
}

/** True once a non-looping timeline has reached its final frame. */
export function isFinished(tick: number, duration: number, loop: LoopMode): boolean {
  return loop === 'once' && Math.floor(tick) >= Math.max(1, Math.round(duration)) - 1
}

export function frameContext(project: AnimationProject, frame: number): FrameContext {
  const duration = Math.max(1, project.durationFrames)
  const f = Math.max(0, Math.min(duration - 1, Math.round(frame)))
  return {
    frame: f,
    time: f / project.fps,
    progress: f / duration,
    fps: project.fps,
    durationFrames: duration,
  }
}

/* ------------------------------------------------------------------ */
/* keyframe lookup                                                     */
/* ------------------------------------------------------------------ */

function lerpNumber(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function lerpColor(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a)
  const [br, bg, bb] = hexToRgb(b)
  return rgbToHex(lerpNumber(ar, br, t), lerpNumber(ag, bg, t), lerpNumber(ab, bb, t)).toUpperCase()
}

function mix(kind: TrackKind, a: KeyValue, b: KeyValue, t: number): KeyValue {
  if (kind === 'step') return t >= 1 ? b : a
  if (kind === 'color') return lerpColor(String(a), String(b), t)
  // angles interpolate linearly on purpose: 0 -> 720 has to spin twice, not
  // take the "short way round" and stand still.
  return lerpNumber(Number(a), Number(b), t)
}

/** Index of the last key at or before `frame`, or -1 when there is none. */
function keyIndexAt(keys: Keyframe[], frame: number): number {
  let lo = 0
  let hi = keys.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (keys[mid].frame <= frame) {
      found = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return found
}

/** The track's value at a frame. Holds flat before the first and after the last key. */
export function trackValueAt(track: AnimationTrack, frame: number): KeyValue | undefined {
  const keys = track.keys
  if (keys.length === 0) return undefined
  const i = keyIndexAt(keys, frame)
  if (i < 0) return keys[0].value
  if (i >= keys.length - 1) return keys[keys.length - 1].value
  const a = keys[i]
  const b = keys[i + 1]
  const span = b.frame - a.frame
  if (span <= 0) return b.value
  const t = ease((frame - a.frame) / span, a.easing)
  return mix(track.kind, a.value, b.value, t)
}

/** Step tracks store their value as a string; booleans need converting back. */
function coerce(path: string, value: KeyValue): unknown {
  const meta = animatableFor(path)
  if (!meta) return value
  if (meta.kind === 'step') {
    if (value === 'true') return true
    if (value === 'false') return false
    return value
  }
  if (meta.kind === 'color') return String(value).toUpperCase()
  let v = Number(value)
  if (!Number.isFinite(v)) return value
  if (meta.min !== undefined) v = Math.max(meta.min, v)
  if (meta.max !== undefined) v = Math.min(meta.max, v)
  return v
}

/* ------------------------------------------------------------------ */
/* evaluation                                                          */
/* ------------------------------------------------------------------ */

export function activeTracks(project: AnimationProject): AnimationTrack[] {
  return project.tracks.filter((t) => !t.muted && t.keys.length > 0)
}

/**
 * Base settings with every live track applied for one frame.
 *
 * `setPath` shares untouched branches, so the returned object is cheap even
 * though it is produced 24 times a second — only the branches an animated path
 * walks through are cloned.
 */
export function evaluateFrame(
  base: EditorSettings,
  project: AnimationProject | null,
  frame: number,
): EditorSettings {
  if (!project) return base
  const tracks = activeTracks(project)
  if (tracks.length === 0) return base
  let out = base
  for (const track of tracks) {
    const value = trackValueAt(track, frame)
    if (value === undefined) continue
    out = setPath(out, track.path, coerce(track.path, value))
  }
  return out
}

/** True when the frame carries no interpolation the still renderer cannot do. */
export function projectIsAnimated(project: AnimationProject | null): boolean {
  return !!project && activeTracks(project).some((t) => t.keys.length > 1)
}

/* ------------------------------------------------------------------ */
/* editing (pure — the store wraps these)                               */
/* ------------------------------------------------------------------ */

let keySeq = 0
export function keyId(): string {
  keySeq += 1
  return 'k' + Date.now().toString(36) + keySeq.toString(36)
}

export function findTrack(project: AnimationProject, path: string): AnimationTrack | undefined {
  return project.tracks.find((t) => t.path === path)
}

/**
 * The nearest frames either side of `frame` that any live track has a key on.
 * What onion skinning wants to draw: where this pose came from and where it is
 * going, rather than the arbitrary frame before and after.
 */
export function neighbourKeyFrames(
  project: AnimationProject | null,
  frame: number,
): { prev: number | null; next: number | null } {
  let prev: number | null = null
  let next: number | null = null
  if (!project) return { prev, next }
  for (const track of activeTracks(project)) {
    for (const key of track.keys) {
      if (key.frame < frame && (prev === null || key.frame > prev)) prev = key.frame
      if (key.frame > frame && (next === null || key.frame < next)) next = key.frame
    }
  }
  return { prev, next }
}

export function keyAtFrame(track: AnimationTrack | undefined, frame: number): Keyframe | undefined {
  if (!track) return undefined
  return track.keys.find((k) => k.frame === frame)
}

function sortKeys(keys: Keyframe[]): Keyframe[] {
  return [...keys].sort((a, b) => a.frame - b.frame)
}

/** Value a new track should hold — what the settings currently say. */
export function baseValueFor(settings: EditorSettings, path: string): KeyValue {
  const meta = animatableFor(path)
  const raw = getPath<unknown>(settings, path)
  if (meta?.kind === 'step') return typeof raw === 'boolean' ? String(raw) : String(raw ?? '')
  if (meta?.kind === 'color') return String(raw ?? '#FFFFFF').toUpperCase()
  return typeof raw === 'number' ? raw : 0
}

/** Adds or replaces the key at `frame`. Returns a new project. */
export function putKey(
  project: AnimationProject,
  path: string,
  frame: number,
  value: KeyValue,
  easing: Easing = 'linear',
): AnimationProject {
  const meta = animatableFor(path)
  if (!meta) return project
  const f = Math.max(0, Math.round(frame))
  const existing = findTrack(project, path)
  const key: Keyframe = {
    id: keyId(),
    frame: f,
    value,
    easing: meta.kind === 'step' ? 'hold' : easing,
  }

  if (!existing) {
    const track: AnimationTrack = { path, kind: meta.kind, muted: false, keys: [key] }
    return { ...project, tracks: [...project.tracks, track] }
  }
  const keys = sortKeys([...existing.keys.filter((k) => k.frame !== f), key])
  return {
    ...project,
    tracks: project.tracks.map((t) => (t.path === path ? { ...t, keys } : t)),
  }
}

/** Removes the key at `frame`; drops the track when it was the last one. */
export function removeKey(
  project: AnimationProject,
  path: string,
  frame: number,
): AnimationProject {
  const track = findTrack(project, path)
  if (!track) return project
  const keys = track.keys.filter((k) => k.frame !== frame)
  if (keys.length === 0) return { ...project, tracks: project.tracks.filter((t) => t.path !== path) }
  return { ...project, tracks: project.tracks.map((t) => (t.path === path ? { ...t, keys } : t)) }
}

export function moveKey(
  project: AnimationProject,
  path: string,
  fromFrame: number,
  toFrame: number,
): AnimationProject {
  const track = findTrack(project, path)
  if (!track) return project
  const key = track.keys.find((k) => k.frame === fromFrame)
  if (!key) return project
  const to = Math.max(0, Math.min(project.durationFrames - 1, Math.round(toFrame)))
  if (to === fromFrame) return project
  const keys = sortKeys([
    ...track.keys.filter((k) => k.frame !== fromFrame && k.frame !== to),
    { ...key, frame: to },
  ])
  return { ...project, tracks: project.tracks.map((t) => (t.path === path ? { ...t, keys } : t)) }
}

export function setKeyEasing(
  project: AnimationProject,
  path: string,
  frame: number,
  easing: Easing,
): AnimationProject {
  const track = findTrack(project, path)
  if (!track) return project
  return {
    ...project,
    tracks: project.tracks.map((t) =>
      t.path === path
        ? { ...t, keys: t.keys.map((k) => (k.frame === frame ? { ...k, easing } : k)) }
        : t,
    ),
  }
}

export function removeTrack(project: AnimationProject, path: string): AnimationProject {
  return { ...project, tracks: project.tracks.filter((t) => t.path !== path) }
}

export function toggleTrackMute(project: AnimationProject, path: string): AnimationProject {
  return {
    ...project,
    tracks: project.tracks.map((t) => (t.path === path ? { ...t, muted: !t.muted } : t)),
  }
}

/** Keeps every key inside the timeline after the duration shrinks. */
export function clampProject(project: AnimationProject): AnimationProject {
  const durationFrames = clampFrames(project.durationFrames)
  const fps = clampFps(project.fps)
  const last = durationFrames - 1
  const tracks = project.tracks
    .map((t) => {
      const seen = new Set<number>()
      const keys: Keyframe[] = []
      for (const k of sortKeys(t.keys)) {
        const frame = Math.max(0, Math.min(last, k.frame))
        if (seen.has(frame)) continue
        seen.add(frame)
        keys.push(k.frame === frame ? k : { ...k, frame })
      }
      return { ...t, keys }
    })
    .filter((t) => t.keys.length > 0)
  return { ...project, fps, durationFrames, tracks }
}

/* ------------------------------------------------------------------ */
/* serialisation                                                       */
/* ------------------------------------------------------------------ */

export function serializeProject(project: AnimationProject): string {
  return JSON.stringify(project, null, 2)
}

/** Tolerant parse — an unknown path or a malformed key is dropped, not fatal. */
export function parseProject(text: string): AnimationProject {
  const raw = JSON.parse(text) as Partial<AnimationProject>
  const tracks: AnimationTrack[] = []
  for (const t of Array.isArray(raw.tracks) ? raw.tracks : []) {
    const meta = animatableFor(String(t?.path ?? ''))
    if (!meta) continue
    const keys: Keyframe[] = []
    for (const k of Array.isArray(t.keys) ? t.keys : []) {
      if (typeof k?.frame !== 'number' || k.value === undefined) continue
      keys.push({
        id: keyId(),
        frame: Math.max(0, Math.round(k.frame)),
        value: k.value as KeyValue,
        easing: (EASINGS.some((e) => e.value === k.easing) ? k.easing : 'linear') as Easing,
      })
    }
    if (keys.length === 0) continue
    tracks.push({ path: meta.path, kind: meta.kind, muted: !!t.muted, keys: sortKeys(keys) })
  }
  return clampProject({
    version: 1,
    fps: clampFps(Number(raw.fps) || 12),
    durationFrames: clampFrames(Number(raw.durationFrames) || 48),
    loop: raw.loop === 'once' || raw.loop === 'pingpong' ? raw.loop : 'loop',
    tracks,
  })
}
