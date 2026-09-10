import { create } from 'zustand'

/**
 * Chrome state: language, hover descriptions, and the desktop panel geometry.
 *
 * Deliberately separate from `editorStore`. Nothing here belongs to a preset or
 * to a render — a saved preset must not carry someone's panel widths — and
 * nothing here should re-render the canvas. It persists on its own key.
 */

export type Lang = 'en' | 'ru'

export interface PanelLayout {
  /** folded down to its title bar */
  collapsed: boolean
  /** pixel height for a stacked panel; null = let it take what it needs */
  size: number | null
}

/** Panels that can be folded / resized. `elements` is the flexible one. */
export const PANEL_IDS = ['source', 'elements', 'presets'] as const
export type PanelId = (typeof PANEL_IDS)[number]

export interface LayoutState {
  leftWidth: number
  rightWidth: number
  /** null = the timeline sizes itself to its content, as it always did */
  timelineHeight: number | null
  panels: Record<string, PanelLayout>
}

export const LAYOUT_LIMITS = {
  leftWidth: [200, 620] as const,
  rightWidth: [240, 720] as const,
  timelineHeight: [96, 720] as const,
  panelHeight: [58, 1400] as const,
}

const DEFAULT_LAYOUT: LayoutState = {
  leftWidth: 268,
  rightWidth: 300,
  timelineHeight: null,
  panels: {
    source: { collapsed: false, size: null },
    elements: { collapsed: false, size: null },
    /* Presets are a shelf you visit, not a control you hold. Folded until asked
       for — it is the panel the owner named as the one to start hidden. */
    presets: { collapsed: true, size: null },
  },
}

interface UiStore {
  lang: Lang
  /** hover descriptions on parameter labels */
  tips: boolean
  layout: LayoutState
  /** set while a resize handle is being dragged, so the app can kill selection */
  resizing: boolean

  setLang: (lang: Lang) => void
  toggleLang: () => void
  setTips: (tips: boolean) => void

  setPanel: (id: string, patch: Partial<PanelLayout>) => void
  togglePanel: (id: string) => void
  setLayout: (patch: Partial<Omit<LayoutState, 'panels'>>) => void
  setResizing: (resizing: boolean) => void
  resetLayout: () => void
}

/* ------------------------------------------------------------------ */
/* persistence                                                         */
/* ------------------------------------------------------------------ */

const KEY = 'symbolize.ui.v1'

function clamp(v: number, [lo, hi]: readonly [number, number]): number {
  return Math.max(lo, Math.min(hi, Math.round(v)))
}

interface Saved {
  lang?: Lang
  tips?: boolean
  layout?: Partial<LayoutState>
}

function load(): { lang: Lang; tips: boolean; layout: LayoutState } {
  const fallback = { lang: 'en' as Lang, tips: true, layout: DEFAULT_LAYOUT }
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return fallback
    const saved = JSON.parse(raw) as Saved
    const panels: Record<string, PanelLayout> = { ...DEFAULT_LAYOUT.panels }
    for (const [id, p] of Object.entries(saved.layout?.panels || {})) {
      panels[id] = {
        collapsed: !!p?.collapsed,
        size: typeof p?.size === 'number' ? clamp(p.size, LAYOUT_LIMITS.panelHeight) : null,
      }
    }
    return {
      lang: saved.lang === 'ru' ? 'ru' : 'en',
      tips: saved.tips !== false,
      layout: {
        leftWidth: clamp(saved.layout?.leftWidth ?? DEFAULT_LAYOUT.leftWidth, LAYOUT_LIMITS.leftWidth),
        rightWidth: clamp(
          saved.layout?.rightWidth ?? DEFAULT_LAYOUT.rightWidth,
          LAYOUT_LIMITS.rightWidth,
        ),
        timelineHeight:
          typeof saved.layout?.timelineHeight === 'number'
            ? clamp(saved.layout.timelineHeight, LAYOUT_LIMITS.timelineHeight)
            : null,
        panels,
      },
    }
  } catch {
    return fallback
  }
}

function persist(state: UiStore): void {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ lang: state.lang, tips: state.tips, layout: state.layout }),
    )
  } catch {
    /* a private window with storage blocked is not an error worth showing */
  }
}

/* ------------------------------------------------------------------ */

export const useUi = create<UiStore>((set, get) => {
  const initial = load()

  const after = () => persist(get())

  return {
    lang: initial.lang,
    tips: initial.tips,
    layout: initial.layout,
    resizing: false,

    setLang: (lang) => {
      set({ lang })
      document.documentElement.lang = lang
      after()
    },
    toggleLang: () => get().setLang(get().lang === 'ru' ? 'en' : 'ru'),
    setTips: (tips) => {
      set({ tips })
      after()
    },

    setPanel: (id, patch) => {
      const current = get().layout.panels[id] || { collapsed: false, size: null }
      const next: PanelLayout = {
        collapsed: patch.collapsed ?? current.collapsed,
        size:
          patch.size === undefined
            ? current.size
            : patch.size === null
              ? null
              : clamp(patch.size, LAYOUT_LIMITS.panelHeight),
      }
      set((s) => ({ layout: { ...s.layout, panels: { ...s.layout.panels, [id]: next } } }))
      after()
    },
    togglePanel: (id) => {
      const current = get().layout.panels[id]
      get().setPanel(id, { collapsed: !current?.collapsed })
    },
    setLayout: (patch) => {
      set((s) => ({
        layout: {
          ...s.layout,
          leftWidth:
            patch.leftWidth === undefined
              ? s.layout.leftWidth
              : clamp(patch.leftWidth, LAYOUT_LIMITS.leftWidth),
          rightWidth:
            patch.rightWidth === undefined
              ? s.layout.rightWidth
              : clamp(patch.rightWidth, LAYOUT_LIMITS.rightWidth),
          timelineHeight:
            patch.timelineHeight === undefined
              ? s.layout.timelineHeight
              : patch.timelineHeight === null
                ? null
                : clamp(patch.timelineHeight, LAYOUT_LIMITS.timelineHeight),
        },
      }))
      after()
    },
    setResizing: (resizing) => set({ resizing }),
    resetLayout: () => {
      set({ layout: { ...DEFAULT_LAYOUT, panels: { ...DEFAULT_LAYOUT.panels } } })
      after()
    },
  }
})

document.documentElement.lang = useUi.getState().lang
