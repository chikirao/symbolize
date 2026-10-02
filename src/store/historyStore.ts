import { create } from 'zustand'
import { useEditor } from './editorStore'
import { useAnim } from './animStore'
import { invalidateSilhouetteCache } from '../engine/renderer'
import { invalidateSelectionCache } from '../engine/selection'
import { clearTintCache } from '../engine/tint'
import type { EditorSettings, CustomSymbolDef, TextSymbolDef, Preset } from '../types/editor'
import type { AnimationProject } from '../types/anim'
import { saveUserPresets } from '../engine/presets'

/** In-memory history for edits to the current source. Media/transport are not copied. */
interface Snapshot {
  settings: EditorSettings
  customSymbols: CustomSymbolDef[]
  textSymbols: TextSymbolDef[]
  activePresetId: string | null
  presets: Preset[]
  project: AnimationProject
}

interface HistoryState {
  canUndo: boolean
  canRedo: boolean
  undo: () => void
  redo: () => void
  reset: () => void
}

const LIMIT = 60
const take = (): Snapshot => {
  const editor = useEditor.getState()
  return {
    settings: editor.settings,
    customSymbols: editor.customSymbols,
    textSymbols: editor.textSymbols,
    activePresetId: editor.activePresetId,
    presets: editor.presets,
    project: useAnim.getState().project,
  }
}

const differs = (a: Snapshot, b: Snapshot) =>
  a.settings !== b.settings ||
  a.customSymbols !== b.customSymbols ||
  a.textSymbols !== b.textSymbols ||
  a.activePresetId !== b.activePresetId ||
  a.presets !== b.presets ||
  a.project !== b.project

let present = take()
let past: Snapshot[] = []
let future: Snapshot[] = []
let restoring = false
let pointerGroup = false
let liveGroup = false
let sameTick = false
let grouped = false

const publish = () => useHistory.setState({ canUndo: past.length > 0, canRedo: future.length > 0 })

function record() {
  if (restoring) return
  const next = take()
  if (!differs(present, next)) {
    if (!useEditor.getState().interacting) liveGroup = false
    return
  }
  const editingLive = useEditor.getState().interacting
  const group = pointerGroup || editingLive || liveGroup || sameTick
  if (!group || !grouped) {
    past.push(present)
    if (past.length > LIMIT) past.shift()
  }
  present = next
  future = []
  grouped = group
  liveGroup = editingLive
  sameTick = true
  queueMicrotask(() => {
    sameTick = false
    if (!pointerGroup && !liveGroup) grouped = false
  })
  publish()
}

function restore(snapshot: Snapshot) {
  restoring = true
  invalidateSilhouetteCache()
  invalidateSelectionCache()
  clearTintCache()
  useAnim.getState().pause()
  useEditor.setState((s) => ({
    settings: snapshot.settings,
    customSymbols: snapshot.customSymbols,
    textSymbols: snapshot.textSymbols,
    activePresetId: snapshot.activePresetId,
    presets: snapshot.presets,
    interacting: false,
    glitchToken: s.glitchToken + 1,
  }))
  useAnim.setState((s) => ({
    project: snapshot.project,
    frame: Math.min(s.frame, snapshot.project.durationFrames - 1),
    clockToken: s.clockToken + 1,
  }))
  saveUserPresets(snapshot.presets.filter((preset) => !preset.builtin))
  present = snapshot
  grouped = false
  liveGroup = false
  restoring = false
  publish()
}

export const useHistory = create<HistoryState>(() => ({
  canUndo: false,
  canRedo: false,
  undo: () => {
    const previous = past.pop()
    if (!previous) return
    future.push(present)
    restore(previous)
  },
  redo: () => {
    const next = future.pop()
    if (!next) return
    past.push(present)
    restore(next)
  },
  reset: () => {
    past = []
    future = []
    present = take()
    grouped = false
    liveGroup = false
    publish()
  },
}))

useEditor.subscribe(record)
useAnim.subscribe(record)

/** Group a pointer drag into one undo step, including animated sliders. */
export function installHistoryPointerGrouping(): () => void {
  const down = (event: PointerEvent) => {
    const target = event.target as Element | null
    if (target?.closest('input[type="range"], [role="slider"]')) {
      pointerGroup = true
      grouped = false
    }
  }
  const up = () => {
    pointerGroup = false
    if (useEditor.getState().interacting) useEditor.getState().endInteract()
    if (!liveGroup) grouped = false
  }
  document.addEventListener('pointerdown', down, true)
  window.addEventListener('pointerup', up, true)
  window.addEventListener('pointercancel', up, true)
  return () => {
    document.removeEventListener('pointerdown', down, true)
    window.removeEventListener('pointerup', up, true)
    window.removeEventListener('pointercancel', up, true)
  }
}
