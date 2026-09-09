import { create } from 'zustand'
import type { AnimationProject, Easing, KeyValue, LoopMode } from '../types/anim'
import { DEFAULT_ANIMATION } from '../types/anim'
import {
  clampFps,
  clampFrames,
  clampProject,
  findTrack,
  keyAtFrame,
  moveKey,
  putKey,
  removeKey,
  removeTrack,
  setKeyEasing,
  toggleTrackMute,
  trackValueAt,
  wrapFrame,
} from '../engine/animation'

/**
 * The timeline lives in its own store on purpose.
 *
 * Playback moves the playhead up to 60 times a second. If that ran through the
 * settings store every panel subscribed to `settings` would re-render on every
 * frame; here only the components that actually read the playhead do.
 * Evaluated settings are derived at render time and never written back.
 */
interface AnimStore {
  project: AnimationProject
  /** current playhead, always inside 0..durationFrames-1 */
  frame: number
  playing: boolean
  /** timeline panel expanded */
  open: boolean
  /** editing a parameter writes a keyframe instead of the base value */
  autoKey: boolean
  /** path whose track row is expanded in the timeline */
  selected: string | null
  /** bumped whenever playback should restart its clock from the playhead */
  clockToken: number

  /** decode settings for the next video / gif import */
  importSide: number
  importFps: number
  importMaxFrames: number

  setProject: (p: AnimationProject) => void
  setFrame: (f: number) => void
  stepFrame: (delta: number) => void
  toFirst: () => void
  toLast: () => void
  play: () => void
  pause: () => void
  togglePlay: () => void

  setFps: (fps: number) => void
  setDuration: (frames: number) => void
  setLoop: (loop: LoopMode) => void
  /** matches the timeline to a freshly loaded video / gif */
  syncToSequence: (frames: number, fps: number) => void

  setImport: (patch: Partial<{ importSide: number; importFps: number; importMaxFrames: number }>) => void
  setOpen: (open: boolean) => void
  toggleOpen: () => void
  setAutoKey: (on: boolean) => void
  setSelected: (path: string | null) => void

  putKeyAt: (path: string, frame: number, value: KeyValue, easing?: Easing) => void
  keyHere: (path: string, value: KeyValue) => void
  removeKeyHere: (path: string) => void
  removeKeyAt: (path: string, frame: number) => void
  dragKey: (path: string, from: number, to: number) => void
  setEasingAt: (path: string, frame: number, easing: Easing) => void
  dropTrack: (path: string) => void
  muteTrack: (path: string) => void
  clearTracks: () => void
  /** jump to the previous / next key of a track; returns the frame it landed on */
  gotoKey: (path: string, dir: -1 | 1) => void
}

export const useAnim = create<AnimStore>((set, get) => ({
  project: DEFAULT_ANIMATION,
  frame: 0,
  playing: false,
  open: false,
  autoKey: true,
  selected: null,
  clockToken: 0,
  importSide: 800,
  importFps: 12,
  importMaxFrames: 240,

  setProject: (project) =>
    set((s) => {
      const next = clampProject(project)
      return { project: next, frame: Math.min(s.frame, next.durationFrames - 1) }
    }),

  setFrame: (f) =>
    set((s) => ({
      frame: Math.max(0, Math.min(s.project.durationFrames - 1, Math.round(f))),
      clockToken: s.clockToken + 1,
    })),

  stepFrame: (delta) =>
    set((s) => ({
      frame: wrapFrame(s.frame + delta, s.project.durationFrames, s.project.loop),
      clockToken: s.clockToken + 1,
    })),

  toFirst: () => set((s) => ({ frame: 0, clockToken: s.clockToken + 1 })),
  toLast: () =>
    set((s) => ({ frame: s.project.durationFrames - 1, clockToken: s.clockToken + 1 })),

  play: () => set((s) => ({ playing: true, open: true, clockToken: s.clockToken + 1 })),
  pause: () => set({ playing: false }),
  togglePlay: () =>
    set((s) => ({ playing: !s.playing, open: true, clockToken: s.clockToken + 1 })),

  setFps: (fps) => set((s) => ({ project: { ...s.project, fps: clampFps(fps) } })),

  setDuration: (frames) =>
    set((s) => {
      const project = clampProject({ ...s.project, durationFrames: clampFrames(frames) })
      return { project, frame: Math.min(s.frame, project.durationFrames - 1) }
    }),

  setLoop: (loop) => set((s) => ({ project: { ...s.project, loop } })),

  syncToSequence: (frames, fps) =>
    set((s) => {
      const project = clampProject({
        ...s.project,
        durationFrames: clampFrames(frames),
        fps: clampFps(fps),
      })
      return { project, frame: 0, open: true, clockToken: s.clockToken + 1 }
    }),

  setImport: (patch) => set(patch),
  setOpen: (open) => set({ open }),
  toggleOpen: () => set((s) => ({ open: !s.open })),
  setAutoKey: (autoKey) => set({ autoKey }),
  setSelected: (selected) => set({ selected }),

  putKeyAt: (path, frame, value, easing) =>
    set((s) => ({ project: putKey(s.project, path, frame, value, easing) })),

  keyHere: (path, value) =>
    set((s) => ({ project: putKey(s.project, path, s.frame, value), open: true })),

  removeKeyHere: (path) => set((s) => ({ project: removeKey(s.project, path, s.frame) })),
  removeKeyAt: (path, frame) => set((s) => ({ project: removeKey(s.project, path, frame) })),

  dragKey: (path, from, to) => set((s) => ({ project: moveKey(s.project, path, from, to) })),

  setEasingAt: (path, frame, easing) =>
    set((s) => ({ project: setKeyEasing(s.project, path, frame, easing) })),

  dropTrack: (path) =>
    set((s) => ({
      project: removeTrack(s.project, path),
      selected: s.selected === path ? null : s.selected,
    })),

  muteTrack: (path) => set((s) => ({ project: toggleTrackMute(s.project, path) })),

  clearTracks: () => set((s) => ({ project: { ...s.project, tracks: [] }, selected: null })),

  gotoKey: (path, dir) => {
    const { project, frame } = get()
    const track = findTrack(project, path)
    if (!track) return
    const target =
      dir < 0
        ? [...track.keys].reverse().find((k) => k.frame < frame)
        : track.keys.find((k) => k.frame > frame)
    if (!target) return
    set((s) => ({ frame: target.frame, clockToken: s.clockToken + 1 }))
  },
}))

/* ------------------------------------------------------------------ */
/* helpers used by the parameter controls                              */
/* ------------------------------------------------------------------ */

/** Is this path animated (has a track with at least one key)? */
export function trackFor(path: string) {
  return findTrack(useAnim.getState().project, path)
}

/** `[ ]` no track, `[.]` track but no key here, `[*]` key on this frame. */
export type KeyState = 'none' | 'track' | 'key'

export function keyStateFor(path: string, frame: number, project: AnimationProject): KeyState {
  const track = findTrack(project, path)
  if (!track) return 'none'
  return keyAtFrame(track, frame) ? 'key' : 'track'
}

/** The value a path shows in the UI at the current frame, or undefined if unanimated. */
export function animatedValue(
  project: AnimationProject,
  path: string,
  frame: number,
): KeyValue | undefined {
  const track = findTrack(project, path)
  if (!track || track.muted) return undefined
  return trackValueAt(track, frame)
}
