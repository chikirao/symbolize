import { create } from 'zustand'
import type {
  CustomSymbolDef,
  EditorSettings,
  LoadedImage,
  Preset,
  PreviewQuality,
  RenderStats,
  SourceMaps,
  TextSymbolDef,
} from '../types/editor'
import { buildSourceMaps } from '../engine/luminance'
import { invalidateSilhouetteCache } from '../engine/renderer'
import {
  BUILTIN_PRESETS,
  DEFAULT_SETTINGS,
  clone,
  loadUserPresets,
  saveUserPresets,
} from '../engine/presets'
import { randomSeed } from '../engine/random'
import { clearTintCache } from '../engine/tint'
import { invalidateSelectionCache, sampleColourAt } from '../engine/selection'
import { ALL_SYMBOL_IDS } from '../engine/symbols'
import { splitGlyphs } from '../engine/textSymbols'
import { getPath, setPath } from './path'

/**
 * Keeps the symbol pool in sync with the library: presets saved before a symbol
 * existed must not hide it, and session-loaded custom / glyph symbols have to
 * survive a preset switch.
 */
function normalisePool(
  settings: EditorSettings,
  extras: { id: string }[],
  enableExtras = false,
): EditorSettings {
  for (const id of ALL_SYMBOL_IDS) {
    if (!settings.symbols.pool.includes(id)) settings.symbols.pool.push(id)
    if (settings.symbols.enabled[id] === undefined) settings.symbols.enabled[id] = false
    if (settings.symbols.weights[id] === undefined) settings.symbols.weights[id] = 1
  }
  for (const e of extras) {
    if (!settings.symbols.pool.includes(e.id)) settings.symbols.pool.push(e.id)
    if (settings.symbols.enabled[e.id] === undefined) settings.symbols.enabled[e.id] = enableExtras
    if (settings.symbols.weights[e.id] === undefined) settings.symbols.weights[e.id] = 1
  }
  return settings
}

export type StatusKind = 'ready' | 'busy' | 'error'

export interface ViewState {
  zoom: number
  panX: number
  panY: number
  showOriginal: boolean
  beforeAfter: boolean
  split: number // 0..1
  quality: PreviewQuality
  fitToken: number // bump to request a fit-to-screen
  /** pan drags the canvas; pick samples a colour for the selection mask */
  tool: 'pan' | 'pick'
}

export interface StatusState {
  kind: StatusKind
  message: string
  progress: number // 0..1, -1 = indeterminate / not running
}

interface EditorStore {
  settings: EditorSettings
  image: LoadedImage | null
  maps: SourceMaps | null
  customSymbols: CustomSymbolDef[]
  textSymbols: TextSymbolDef[]
  presets: Preset[]
  activePresetId: string | null
  view: ViewState
  status: StatusState
  stats: RenderStats | null
  interacting: boolean
  glitchToken: number
  bootToken: number

  setParam: (path: string, value: unknown) => void
  setParamLive: (path: string, value: unknown) => void
  resetParam: (path: string) => void
  resetAll: () => void
  replaceSettings: (s: EditorSettings, presetId?: string | null) => void

  loadImageSource: (canvas: HTMLCanvasElement, name: string) => void
  clearImage: () => void

  addCustomSymbol: (def: CustomSymbolDef) => void
  removeCustomSymbol: (id: string) => void
  setCustomRecolor: (id: string, recolor: boolean) => void

  addTextSymbols: (input: string, font: string, bold: boolean) => number
  removeTextSymbol: (id: string) => void
  clearTextSymbols: () => void

  applyPreset: (id: string) => void
  saveCurrentPreset: (name: string) => void
  deletePreset: (id: string) => void

  addMaskPick: (nx: number, ny: number) => void
  removeMaskPick: (index: number) => void
  clearMaskPicks: () => void

  randomizeSeed: () => void
  setView: (patch: Partial<ViewState>) => void
  requestFit: () => void
  setStatus: (s: Partial<StatusState>) => void
  setStats: (s: RenderStats | null) => void
  triggerGlitch: () => void
  endInteract: () => void
}

let interactTimer: number | undefined

export const useEditor = create<EditorStore>((set, get) => ({
  settings: clone(DEFAULT_SETTINGS),
  image: null,
  maps: null,
  customSymbols: [],
  textSymbols: [],
  presets: [...BUILTIN_PRESETS, ...loadUserPresets()],
  activePresetId: null,
  view: {
    zoom: 1,
    panX: 0,
    panY: 0,
    showOriginal: false,
    beforeAfter: false,
    split: 0.5,
    quality: 'high',
    fitToken: 0,
    tool: 'pan',
  },
  status: { kind: 'ready', message: 'READY', progress: -1 },
  stats: null,
  interacting: false,
  glitchToken: 0,
  bootToken: 0,

  setParam: (path, value) => {
    set((s) => ({ settings: setPath(s.settings, path, value), activePresetId: null }))
  },

  setParamLive: (path, value) => {
    if (interactTimer !== undefined) clearTimeout(interactTimer)
    interactTimer = window.setTimeout(() => get().endInteract(), 240)
    set((s) => ({
      settings: setPath(s.settings, path, value),
      activePresetId: null,
      interacting: true,
    }))
  },

  endInteract: () => {
    interactTimer = undefined
    if (get().interacting) set({ interacting: false })
  },

  resetParam: (path) => {
    const def = getPath(DEFAULT_SETTINGS, path)
    if (def === undefined) return
    set((s) => ({
      settings: setPath(s.settings, path, typeof def === 'object' && def !== null ? clone(def) : def),
      activePresetId: null,
    }))
  },

  resetAll: () => {
    invalidateSilhouetteCache()
    set((s) => ({
      settings: normalisePool(clone(DEFAULT_SETTINGS), [...s.customSymbols, ...s.textSymbols]),
      activePresetId: null,
      glitchToken: s.glitchToken + 1,
      status: { kind: 'ready', message: 'SETTINGS RESET', progress: -1 },
    }))
  },

  replaceSettings: (settings, presetId = null) => {
    invalidateSilhouetteCache()
    set((s) => ({ settings, activePresetId: presetId, glitchToken: s.glitchToken + 1 }))
  },

  loadImageSource: (canvas, name) => {
    invalidateSilhouetteCache()
    invalidateSelectionCache()
    const maps = buildSourceMaps(canvas)
    set((s) => ({
      image: { name, width: canvas.width, height: canvas.height, canvas },
      maps,
      glitchToken: s.glitchToken + 1,
      view: { ...s.view, fitToken: s.view.fitToken + 1, panX: 0, panY: 0 },
      status: { kind: 'ready', message: 'READY', progress: -1 },
    }))
  },

  clearImage: () => {
    invalidateSilhouetteCache()
    invalidateSelectionCache()
    set({ image: null, maps: null, stats: null })
  },

  addCustomSymbol: (def) => {
    set((s) => {
      const customSymbols = [...s.customSymbols.filter((c) => c.id !== def.id), def]
      const settings = clone(s.settings)
      if (!settings.symbols.pool.includes(def.id)) settings.symbols.pool.push(def.id)
      settings.symbols.enabled[def.id] = true
      if (settings.symbols.weights[def.id] === undefined) settings.symbols.weights[def.id] = 1
      return { customSymbols, settings, activePresetId: null }
    })
  },

  removeCustomSymbol: (id) => {
    clearTintCache(id)
    set((s) => {
      const settings = clone(s.settings)
      settings.symbols.pool = settings.symbols.pool.filter((p) => p !== id)
      delete settings.symbols.enabled[id]
      delete settings.symbols.weights[id]
      return { customSymbols: s.customSymbols.filter((c) => c.id !== id), settings }
    })
  },

  setCustomRecolor: (id, recolor) => {
    clearTintCache(id)
    set((s) => ({
      customSymbols: s.customSymbols.map((c) => (c.id === id ? { ...c, recolor } : c)),
    }))
  },

  addTextSymbols: (input, font, bold) => {
    const chars = splitGlyphs(input)
    if (chars.length === 0) return 0
    const stamp = Date.now().toString(36)
    const defs: TextSymbolDef[] = chars.map((char, i) => ({
      id: 'glyph-' + stamp + '-' + i.toString(36),
      label: char,
      char,
      font,
      bold,
    }))
    set((s) => {
      const settings = clone(s.settings)
      for (const d of defs) {
        settings.symbols.pool.push(d.id)
        settings.symbols.enabled[d.id] = true
        settings.symbols.weights[d.id] = 1
      }
      return {
        textSymbols: [...s.textSymbols, ...defs],
        settings,
        activePresetId: null,
        glitchToken: s.glitchToken + 1,
      }
    })
    return defs.length
  },

  removeTextSymbol: (id) => {
    set((s) => {
      const settings = clone(s.settings)
      settings.symbols.pool = settings.symbols.pool.filter((p) => p !== id)
      delete settings.symbols.enabled[id]
      delete settings.symbols.weights[id]
      return { textSymbols: s.textSymbols.filter((t) => t.id !== id), settings }
    })
  },

  clearTextSymbols: () => {
    set((s) => {
      const ids = new Set(s.textSymbols.map((t) => t.id))
      const settings = clone(s.settings)
      settings.symbols.pool = settings.symbols.pool.filter((p) => !ids.has(p))
      for (const id of ids) {
        delete settings.symbols.enabled[id]
        delete settings.symbols.weights[id]
      }
      return { textSymbols: [], settings }
    })
  },

  applyPreset: (id) => {
    const preset = get().presets.find((p) => p.id === id)
    if (!preset) return
    invalidateSilhouetteCache()
    set((s) => {
      // keep symbols the user loaded in this session available after a switch
      const settings = normalisePool(clone(preset.settings), [
        ...s.customSymbols,
        ...s.textSymbols,
      ])
      return {
        settings,
        activePresetId: id,
        glitchToken: s.glitchToken + 1,
        status: { kind: 'ready', message: 'PRESET :: ' + preset.name, progress: -1 },
      }
    })
  },

  saveCurrentPreset: (name) => {
    const id = 'user-' + Date.now().toString(36)
    const preset: Preset = { id, name: name.toUpperCase().slice(0, 28), settings: clone(get().settings) }
    const presets = [...get().presets, preset]
    set({ presets, activePresetId: id })
    saveUserPresets(presets.filter((p) => !p.builtin))
  },

  deletePreset: (id) => {
    const presets = get().presets.filter((p) => p.id !== id || p.builtin)
    set((s) => ({ presets, activePresetId: s.activePresetId === id ? null : s.activePresetId }))
    saveUserPresets(presets.filter((p) => !p.builtin))
  },

  addMaskPick: (nx, ny) => {
    const maps = get().maps
    if (!maps) return
    const color = sampleColourAt(maps, nx, ny)
    set((s) => {
      const settings = clone(s.settings)
      settings.mask.picks = [...settings.mask.picks, { color, x: nx, y: ny }]
      // picking a colour is a clear intent: turn the mask on and point it here
      settings.mask.enabled = true
      settings.mask.source = 'color'
      return {
        settings,
        activePresetId: null,
        status: { kind: 'ready' as const, message: 'PICKED ' + color, progress: -1 },
      }
    })
  },

  removeMaskPick: (index) => {
    set((s) => {
      const settings = clone(s.settings)
      settings.mask.picks = settings.mask.picks.filter((_, i) => i !== index)
      return { settings, activePresetId: null }
    })
  },

  clearMaskPicks: () => {
    set((s) => {
      const settings = clone(s.settings)
      settings.mask.picks = []
      return { settings, activePresetId: null }
    })
  },

  randomizeSeed: () => {
    set((s) => ({
      settings: setPath(s.settings, 'random.seed', randomSeed()),
      activePresetId: null,
      glitchToken: s.glitchToken + 1,
    }))
  },

  setView: (patch) => set((s) => ({ view: { ...s.view, ...patch } })),
  requestFit: () => set((s) => ({ view: { ...s.view, fitToken: s.view.fitToken + 1 } })),
  setStatus: (p) => set((s) => ({ status: { ...s.status, ...p } })),
  setStats: (stats) => set({ stats }),
  triggerGlitch: () => set((s) => ({ glitchToken: s.glitchToken + 1 })),
}))
