/* Data model for animated output: keyframe tracks, transport and frame context.
   Deliberately separate from EditorSettings — tracks are evaluated *on top of*
   the base settings for a frame and never written back into them. */

export type LoopMode = 'loop' | 'pingpong' | 'once'

/** `hold` is the only legal easing for step tracks (enums, booleans). */
export type Easing = 'linear' | 'in' | 'out' | 'in-out' | 'hold'

export type TrackKind = 'number' | 'angle' | 'color' | 'step'

/** How expensive a change to this parameter is per frame. */
export type TrackCost = 'cheap' | 'elements' | 'topology'

export type KeyValue = number | string | boolean

export interface Keyframe {
  id: string
  /** integer frame index, 0-based */
  frame: number
  value: KeyValue
  /** how the value travels *from this key to the next one* */
  easing: Easing
}

export interface AnimationTrack {
  /** dotted path into EditorSettings — must exist in the animatable registry */
  path: string
  kind: TrackKind
  /** muted tracks keep their keys but do not affect the evaluated frame */
  muted: boolean
  /** always sorted by frame, at most one key per frame */
  keys: Keyframe[]
}

export interface AnimationProject {
  version: 1
  fps: number
  durationFrames: number
  loop: LoopMode
  tracks: AnimationTrack[]
}

/** Everything a renderer needs to know about *when* it is. */
export interface FrameContext {
  frame: number
  /** seconds from the start of the timeline */
  time: number
  /** 0..1 across the whole timeline, 1 exclusive so a loop does not repeat a frame */
  progress: number
  fps: number
  durationFrames: number
}

export const MIN_FPS = 1
export const MAX_FPS = 60
export const MIN_FRAMES = 2
export const MAX_FRAMES = 1800

export const DEFAULT_ANIMATION: AnimationProject = {
  version: 1,
  fps: 12,
  durationFrames: 48,
  loop: 'loop',
  tracks: [],
}
