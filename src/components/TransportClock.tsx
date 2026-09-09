import { useEffect } from 'react'
import { useAnim } from '../store/animStore'
import { wrapFrame } from '../engine/animation'

/**
 * The playback clock. Renders nothing — it only advances the playhead.
 *
 * Time is real time, not "one frame per animation frame": the target frame is
 * `floor(elapsed * fps)`, so when a heavy render takes 200ms the preview skips
 * the frames it missed instead of playing back in slow motion. Export never
 * uses this path and never drops anything.
 *
 * The loop writes the playhead with `setState` rather than the `setFrame`
 * action on purpose: the action bumps `clockToken`, which is what re-bases this
 * effect when the user scrubs. Going through it here would restart the clock
 * sixty times a second.
 */
export function TransportClock() {
  const playing = useAnim((s) => s.playing)
  const clockToken = useAnim((s) => s.clockToken)

  useEffect(() => {
    if (!playing) return
    const startFrame = useAnim.getState().frame
    const startTime = performance.now()
    let raf = 0

    const tick = (now: number) => {
      const state = useAnim.getState()
      if (!state.playing) return
      const { fps, durationFrames, loop } = state.project
      const advance = Math.floor(((now - startTime) / 1000) * fps)
      const target = startFrame + advance

      if (loop === 'once' && target >= durationFrames - 1) {
        useAnim.setState({ frame: durationFrames - 1, playing: false })
        return
      }
      const next = wrapFrame(target, durationFrames, loop)
      if (next !== state.frame) useAnim.setState({ frame: next })
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, clockToken])

  /* A hidden tab throttles rAF to about once a second; letting that run would
     make the playhead lurch forward on return. Pause instead. */
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && useAnim.getState().playing) useAnim.getState().pause()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  return null
}
