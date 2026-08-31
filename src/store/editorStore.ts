import { create } from 'zustand'
import type {
  CustomSymbolDef,
  EditorSettings,
  LoadedImage,
  Preset,
  PreviewQuality,
  RenderStats,
  SourceMaps,
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
import { getPath, setPath } from './path'

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

  applyPreset: (id: string) => void
  saveCurrentPreset: (name: string) => void
  deletePreset: (id: string) => void

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
      settings: clone(DEFAULT_SETTINGS),
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

  applyPreset: (id) => {
    const preset = get().presets.find((p) => p.id === id)
    if (!preset) return
    invalidateSilhouetteCache()
    set((s) => {
      // keep any custom symbols the user loaded in this session available
      const settings = clone(preset.settings)
      for (const c of s.customSymbols) {
        if (!settings.symbols.pool.includes(c.id)) settings.symbols.pool.push(c.id)
        if (settings.symbols.enabled[c.id] === undefined) settings.symbols.enabled[c.id] = false
        if (settings.symbols.weights[c.id] === undefined) settings.symbols.weights[c.id] = 1
      }
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
