import type { AnimationProject, AnimationTrack, Easing, KeyValue, Keyframe } from '../types/anim'
import { animatableFor } from './animatable'
import { keyId } from './animation'

/**
 * One-click timelines.
 *
 * Keys are stored at normalised positions rather than frame numbers, because a
 * preset has to land on whatever length the timeline already is — a 24-frame
 * clip and a 300-frame one both want the same *shape*. Applying a preset never
 * changes fps or duration: the source, or the user, owns those.
 *
 * Only registry paths are allowed here, same as any other track.
 */
export interface PresetKey {
  /** 0..1 across the timeline */
  at: number
  value: KeyValue
  easing?: Easing
}

export interface PresetTrack {
  path: string
  keys: PresetKey[]
}

export interface AnimPreset {
  id: string
  name: string
  note: string
  tracks: PresetTrack[]
}

const ease = (at: number, value: KeyValue, easing: Easing = 'in-out'): PresetKey => ({
  at,
  value,
  easing,
})

/** Every zone preset needs the selection switched on and set to SELECT. */
const ZONE_ON: PresetTrack[] = [
  { path: 'mask.enabled', keys: [{ at: 0, value: 'true', easing: 'hold' }] },
  { path: 'mask.mode', keys: [{ at: 0, value: 'select', easing: 'hold' }] },
  { path: 'zone.enabled', keys: [{ at: 0, value: 'true', easing: 'hold' }] },
]

export const ANIM_PRESETS: AnimPreset[] = [
  {
    id: 'zone-pulse',
    name: 'ZONE PULSE',
    note: 'the picked zone swells and settles, the rest holds still',
    tracks: [
      ...ZONE_ON,
      { path: 'zone.strength', keys: [{ at: 0, value: 1, easing: 'linear' }] },
      { path: 'zone.sizeScale', keys: [ease(0, 1), ease(0.5, 1.9), ease(1, 1)] },
      { path: 'zone.densityScale', keys: [ease(0, 1), ease(0.5, 1.35), ease(1, 1)] },
    ],
  },
  {
    id: 'zone-hue',
    name: 'ZONE HUE',
    note: 'colour runs a full turn inside the zone only',
    tracks: [
      ...ZONE_ON,
      { path: 'zone.strength', keys: [{ at: 0, value: 1, easing: 'linear' }] },
      {
        path: 'zone.hueShift',
        keys: [
          { at: 0, value: 0, easing: 'linear' },
          { at: 1, value: 360, easing: 'linear' },
        ],
      },
    ],
  },
  {
    id: 'zone-ripple',
    name: 'ZONE RIPPLE',
    note: 'the zone comes loose and drifts while everything else stays put',
    tracks: [
      ...ZONE_ON,
      { path: 'zone.strength', keys: [{ at: 0, value: 1, easing: 'linear' }] },
      { path: 'motion.mode', keys: [{ at: 0, value: 'noise', easing: 'hold' }] },
      { path: 'motion.frequency', keys: [{ at: 0, value: 2.4, easing: 'linear' }] },
      { path: 'zone.motionAmount', keys: [ease(0, 0), ease(0.5, 22), ease(1, 0)] },
      {
        path: 'motion.phase',
        keys: [
          { at: 0, value: 0, easing: 'linear' },
          { at: 1, value: 1, easing: 'linear' },
        ],
      },
    ],
  },
  {
    id: 'zone-spot',
    name: 'ZONE SPOT',
    note: 'everything but the zone drains to grey and steps back',
    tracks: [
      ...ZONE_ON,
      { path: 'zone.outside', keys: [{ at: 0, value: 'true', easing: 'hold' }] },
      { path: 'zone.saturation', keys: [{ at: 0, value: -1, easing: 'linear' }] },
      { path: 'zone.opacityScale', keys: [{ at: 0, value: 0.4, easing: 'linear' }] },
      { path: 'zone.sizeScale', keys: [{ at: 0, value: 0.7, easing: 'linear' }] },
      {
        path: 'zone.strength',
        keys: [
          { at: 0, value: 0, easing: 'out' },
          { at: 0.6, value: 1, easing: 'linear' },
          { at: 1, value: 1, easing: 'linear' },
        ],
      },
    ],
  },
  {
    id: 'hue-loop',
    name: 'HUE LOOP',
    note: 'colour cycles once and lands back where it started',
    tracks: [
      {
        path: 'color.hueShift',
        keys: [
          { at: 0, value: 0, easing: 'linear' },
          { at: 1, value: 360, easing: 'linear' },
        ],
      },
    ],
  },
  {
    id: 'breathe',
    name: 'BREATHE',
    note: 'symbols swell and settle — the loop closes on itself',
    tracks: [
      {
        path: 'size.max',
        keys: [ease(0, 1.05), ease(0.5, 1.6), ease(1, 1.05)],
      },
      {
        path: 'opacity.min',
        keys: [ease(0, 0.35), ease(0.5, 0.7), ease(1, 0.35)],
      },
    ],
  },
  {
    id: 'wipe-in',
    name: 'WIPE IN',
    note: 'the picture builds itself left to right, then holds',
    tracks: [
      { path: 'reveal.mode', keys: [{ at: 0, value: 'linear', easing: 'hold' }] },
      { path: 'reveal.softness', keys: [{ at: 0, value: 0.3, easing: 'linear' }] },
      {
        path: 'reveal.amount',
        keys: [
          { at: 0, value: 0, easing: 'out' },
          { at: 0.75, value: 1, easing: 'linear' },
          { at: 1, value: 1, easing: 'linear' },
        ],
      },
    ],
  },
  {
    id: 'dissolve',
    name: 'DISSOLVE',
    note: 'cells fade in one by one instead of appearing at once',
    tracks: [
      { path: 'density.softness', keys: [{ at: 0, value: 0.55, easing: 'linear' }] },
      {
        path: 'density.value',
        keys: [
          { at: 0, value: 0, easing: 'out' },
          { at: 0.85, value: 100, easing: 'linear' },
          { at: 1, value: 100, easing: 'linear' },
        ],
      },
    ],
  },
  {
    id: 'swirl',
    name: 'SWIRL',
    note: 'the field twists around the centre and unwinds',
    tracks: [
      {
        path: 'motion.swirl',
        keys: [ease(0, 0), ease(0.5, 0.55), ease(1, 0)],
      },
      {
        path: 'rotation.base',
        keys: [
          { at: 0, value: 0, easing: 'linear' },
          { at: 1, value: 360, easing: 'linear' },
        ],
      },
    ],
  },
  {
    id: 'drift',
    name: 'DRIFT',
    note: 'a slow wave over the whole frame, seamless at the loop point',
    tracks: [
      { path: 'motion.mode', keys: [{ at: 0, value: 'wave', easing: 'hold' }] },
      { path: 'motion.amplitudeX', keys: [{ at: 0, value: 14, easing: 'linear' }] },
      { path: 'motion.amplitudeY', keys: [{ at: 0, value: 10, easing: 'linear' }] },
      { path: 'motion.frequency', keys: [{ at: 0, value: 1.5, easing: 'linear' }] },
      {
        path: 'motion.phase',
        keys: [
          { at: 0, value: 0, easing: 'linear' },
          { at: 1, value: 1, easing: 'linear' },
        ],
      },
    ],
  },
  {
    id: 'scan',
    name: 'SCAN',
    note: 'a bright band sweeps down the frame',
    tracks: [
      { path: 'reveal.mode', keys: [{ at: 0, value: 'linear', easing: 'hold' }] },
      { path: 'reveal.angle', keys: [{ at: 0, value: 90, easing: 'linear' }] },
      { path: 'reveal.softness', keys: [{ at: 0, value: 0.55, easing: 'linear' }] },
      {
        path: 'reveal.amount',
        keys: [
          { at: 0, value: 0.1, easing: 'linear' },
          { at: 0.5, value: 1, easing: 'linear' },
          { at: 1, value: 0.1, easing: 'linear' },
        ],
      },
      {
        path: 'symbols.strokeWeight',
        keys: [ease(0, 0.1), ease(0.5, 0.22), ease(1, 0.1)],
      },
    ],
  },
]

export function animPresetById(id: string): AnimPreset | undefined {
  return ANIM_PRESETS.find((p) => p.id === id)
}

/**
 * Lays a preset onto an existing project.
 *
 * Tracks the preset defines are replaced outright; anything else the user has
 * built is left alone, so two presets compose instead of one erasing the other.
 */
export function applyAnimPreset(project: AnimationProject, preset: AnimPreset): AnimationProject {
  const last = Math.max(1, project.durationFrames) - 1
  const added: AnimationTrack[] = []

  for (const track of preset.tracks) {
    const meta = animatableFor(track.path)
    if (!meta) continue
    const seen = new Set<number>()
    const keys: Keyframe[] = []
    for (const key of track.keys) {
      const frame = Math.max(0, Math.min(last, Math.round(key.at * last)))
      // a short timeline can collapse two keys onto one frame; the later one wins
      if (seen.has(frame)) {
        const at = keys.findIndex((k) => k.frame === frame)
        if (at >= 0) keys.splice(at, 1)
      }
      seen.add(frame)
      keys.push({
        id: keyId(),
        frame,
        value: key.value,
        easing: meta.kind === 'step' ? 'hold' : (key.easing ?? 'linear'),
      })
    }
    keys.sort((a, b) => a.frame - b.frame)
    if (keys.length === 0) continue
    added.push({ path: track.path, kind: meta.kind, muted: false, keys })
  }

  const replaced = new Set(added.map((t) => t.path))
  return {
    ...project,
    tracks: [...project.tracks.filter((t) => !replaced.has(t.path)), ...added],
  }
}
