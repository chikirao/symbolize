import React, { useEffect, useMemo, useRef, useState } from 'react'
import { BUILTIN_SYMBOLS, SYMBOL_MAP } from '../engine/symbols'
import type { CustomSymbolDef, EditorSettings, TextSymbolDef } from '../types/editor'
import { useEditor } from '../store/editorStore'
import { loadCustomSymbol } from '../engine/imageLoad'
import { FONT_PRESETS, drawTextSymbol, splitGlyphs } from '../engine/textSymbols'

/* ------------------------------------------------------------------ */
/* preview                                                             */
/* ------------------------------------------------------------------ */

function SymbolPreview(props: {
  id: string
  custom?: CustomSymbolDef
  text?: TextSymbolDef
  on: boolean
  size?: number
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const size = props.size ?? 24
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    c.width = size * dpr
    c.height = size * dpr
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size, size)
    ctx.translate(size / 2, size / 2)
    const color = props.on ? '#ffffff' : '#5f5f5f'
    ctx.fillStyle = color
    ctx.strokeStyle = color
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    const inner = size - 6

    if (props.text) {
      drawTextSymbol(ctx, props.text, inner)
    } else if (props.custom) {
      const img = props.custom.image
      if (img.complete && img.naturalWidth) {
        const a = props.custom.aspect || 1
        const w = a >= 1 ? inner : inner * a
        const h = a >= 1 ? inner / a : inner
        ctx.globalAlpha = props.on ? 1 : 0.45
        ctx.drawImage(img, -w / 2, -h / 2, w, h)
      }
    } else {
      const def = SYMBOL_MAP[props.id]
      if (def) def.draw(ctx, inner, inner * 0.14)
    }
  }, [props.id, props.on, props.custom, props.text, size])
  return <canvas ref={ref} style={{ width: size, height: size }} className="shrink-0" />
}

/* ------------------------------------------------------------------ */
/* palette tile                                                        */
/* ------------------------------------------------------------------ */

function Tile(props: {
  id: string
  label: string
  enabled: boolean
  weight: number
  custom?: CustomSymbolDef
  text?: TextSymbolDef
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={props.enabled}
      aria-label={props.label}
      title={props.label + (props.enabled ? '  [ON]' : '  [OFF]')}
      onClick={props.onToggle}
      className={
        'relative flex items-center justify-center h-[32px] border transition-colors ' +
        (props.enabled
          ? 'border-fg bg-[#151515]'
          : 'border-line hover:border-line2 hover:bg-[#0d0d0d]')
      }
    >
      <SymbolPreview id={props.id} custom={props.custom} text={props.text} on={props.enabled} />
      {props.enabled && props.weight !== 1 && (
        <span className="absolute bottom-0 right-[1px] text-xxs leading-none text-fg2">
          {props.weight}
        </span>
      )}
    </button>
  )
}

function TileGrid(props: { children: React.ReactNode }) {
  return (
    <div
      className="grid gap-[3px] px-1 pb-1"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(32px, 1fr))' }}
    >
      {props.children}
    </div>
  )
}

function GroupLabel(props: { text: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-1 px-1 pt-1 select-none">
      <span className="text-fg3 text-xxs">──</span>
      <span className="text-fg2 text-xxs tracking-widest">{props.text}</span>
      <span className="hr text-xxs flex-1 overflow-hidden">{'─'.repeat(60)}</span>
      {props.right}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* library                                                             */
/* ------------------------------------------------------------------ */

export function SymbolLibrary(props: { settings: EditorSettings }) {
  const setParam = useEditor((s) => s.setParam)
  const customSymbols = useEditor((s) => s.customSymbols)
  const textSymbols = useEditor((s) => s.textSymbols)
  const addCustomSymbol = useEditor((s) => s.addCustomSymbol)
  const removeCustomSymbol = useEditor((s) => s.removeCustomSymbol)
  const setCustomRecolor = useEditor((s) => s.setCustomRecolor)
  const addTextSymbols = useEditor((s) => s.addTextSymbols)
  const removeTextSymbol = useEditor((s) => s.removeTextSymbol)
  const setStatus = useEditor((s) => s.setStatus)

  const fileRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [glyphInput, setGlyphInput] = useState('')
  const [glyphFontFamily, setGlyphFontFamily] = useState(FONT_PRESETS[0].value)
  const [glyphBold, setGlyphBold] = useState(false)

  const sym = props.settings.symbols
  const parsedGlyphs = useMemo(() => splitGlyphs(glyphInput), [glyphInput])

  const setEnabled = (next: Record<string, boolean>) => setParam('symbols.enabled', next)
  const toggle = (id: string) => setEnabled({ ...sym.enabled, [id]: !sym.enabled[id] })
  const setWeight = (id: string, v: number) =>
    setParam('symbols.weights', { ...sym.weights, [id]: v })

  const allIds = sym.pool
  const enabledIds = allIds.filter((id) => sym.enabled[id])

  const bulk = (fn: (id: string) => boolean) => {
    const next: Record<string, boolean> = { ...sym.enabled }
    for (const id of allIds) next[id] = fn(id)
    if (!allIds.some((id) => next[id])) next['dot'] = true
    setEnabled(next)
  }

  const randomSet = () => {
    const pickable = [...allIds]
    const count = 3 + Math.floor(Math.random() * 3)
    const next: Record<string, boolean> = {}
    for (const id of allIds) next[id] = false
    for (let i = 0; i < count && pickable.length; i++) {
      const k = Math.floor(Math.random() * pickable.length)
      next[pickable.splice(k, 1)[0]] = true
    }
    setEnabled(next)
  }

  const handleFiles = async (files: FileList | null) => {
    if (!files) return
    for (const f of Array.from(files)) {
      try {
        const def = await loadCustomSymbol(f)
        addCustomSymbol(def)
        setStatus({ kind: 'ready', message: 'SYMBOL LOADED :: ' + def.label, progress: -1 })
      } catch (err) {
        setStatus({ kind: 'error', message: String((err as Error).message || err), progress: -1 })
      }
    }
  }

  const addGlyphs = () => {
    const n = addTextSymbols(glyphInput, glyphFontFamily, glyphBold)
    if (n > 0) {
      setGlyphInput('')
      setStatus({ kind: 'ready', message: `ADDED ${n} GLYPH${n > 1 ? 'S' : ''}`, progress: -1 })
    } else {
      setStatus({ kind: 'error', message: 'NO GLYPHS IN INPUT', progress: -1 })
    }
  }

  const groups: { name: string; ids: string[] }[] = [
    { name: 'BASIC', ids: BUILTIN_SYMBOLS.filter((s) => s.category === 'basic').map((s) => s.id) },
    {
      name: 'DIRECTIONAL',
      ids: BUILTIN_SYMBOLS.filter((s) => s.category === 'directional').map((s) => s.id),
    },
    {
      name: 'GRAPHIC',
      ids: BUILTIN_SYMBOLS.filter((s) => s.category === 'graphic').map((s) => s.id),
    },
  ]

  const customById = new Map(customSymbols.map((c) => [c.id, c]))
  const textById = new Map(textSymbols.map((t) => [t.id, t]))

  return (
    <div>
      <div className="flex items-center gap-2 px-1 py-1">
        <button type="button" className="btn text-xxs" onClick={() => bulk(() => true)}>
          ALL
        </button>
        <button type="button" className="btn text-xxs" onClick={() => bulk((id) => id === 'dot')}>
          NONE
        </button>
        <button type="button" className="btn text-xxs" onClick={randomSet} title="pick a random mix">
          MIX
        </button>
        <span className="ml-auto text-fg3 text-xxs">{enabledIds.length} ON</span>
      </div>

      {groups.map((g) => (
        <div key={g.name}>
          <GroupLabel text={g.name} />
          <TileGrid>
            {g.ids.map((id) => (
              <Tile
                key={id}
                id={id}
                label={SYMBOL_MAP[id].label}
                enabled={!!sym.enabled[id]}
                weight={sym.weights[id] ?? 1}
                onToggle={() => toggle(id)}
              />
            ))}
          </TileGrid>
        </div>
      ))}

      {textSymbols.length > 0 && (
        <div>
          <GroupLabel text="GLYPHS" />
          <TileGrid>
            {textSymbols.map((t) => (
              <Tile
                key={t.id}
                id={t.id}
                label={t.char}
                text={t}
                enabled={!!sym.enabled[t.id]}
                weight={sym.weights[t.id] ?? 1}
                onToggle={() => toggle(t.id)}
              />
            ))}
          </TileGrid>
        </div>
      )}

      {customSymbols.length > 0 && (
        <div>
          <GroupLabel text="IMAGES" />
          <TileGrid>
            {customSymbols.map((c) => (
              <Tile
                key={c.id}
                id={c.id}
                label={c.label}
                custom={c}
                enabled={!!sym.enabled[c.id]}
                weight={sym.weights[c.id] ?? 1}
                onToggle={() => toggle(c.id)}
              />
            ))}
          </TileGrid>
        </div>
      )}

      {/* ---------------- unicode input ---------------- */}
      <GroupLabel text="ADD UNICODE" />
      <div className="px-1 pb-1 space-y-1">
        <div className="flex items-center gap-1 border border-line focus-within:border-fg px-1">
          <span className="text-fg3 text-xxs shrink-0">&gt;</span>
          <input
            className="flex-1 min-w-0 text-sm2 outline-none py-[1px]"
            style={{ fontFamily: glyphFontFamily, fontWeight: glyphBold ? 700 : 400 }}
            placeholder="★ ✦ → ▲ 亜 ⌘ ..."
            aria-label="unicode characters to add"
            value={glyphInput}
            onChange={(e) => setGlyphInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addGlyphs()
            }}
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            className="sel text-xxs border border-line px-1 flex-1 min-w-0"
            aria-label="glyph font"
            value={glyphFontFamily}
            onChange={(e) => setGlyphFontFamily(e.target.value)}
          >
            {FONT_PRESETS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            role="checkbox"
            aria-checked={glyphBold}
            className="tog text-xxs shrink-0"
            onClick={() => setGlyphBold((b) => !b)}
          >
            {glyphBold ? '[x]' : '[ ]'} BOLD
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn text-xxs"
            disabled={parsedGlyphs.length === 0}
            onClick={addGlyphs}
          >
            ADD {parsedGlyphs.length || ''}
          </button>
          <span className="text-fg3 text-xxs truncate">
            {parsedGlyphs.length
              ? `${parsedGlyphs.length} GLYPH${parsedGlyphs.length > 1 ? 'S' : ''}`
              : 'EACH CHARACTER = ONE SYMBOL'}
          </span>
        </div>
        <div className="text-fg3 text-xxs leading-snug">
          DEPENDS ON INSTALLED FONTS. COLOUR EMOJI KEEP THEIR OWN COLOURS.
        </div>
      </div>

      {/* ---------------- custom image ---------------- */}
      <GroupLabel text="ADD SVG / PNG" />
      <div className="px-1 pb-1">
        <div
          className={
            'border border-dashed p-2 text-center text-xxs cursor-pointer ' +
            (dragOver ? 'border-fg text-fg' : 'border-line text-fg3 hover:text-fg2')
          }
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setDragOver(false)
            void handleFiles(e.dataTransfer.files)
          }}
        >
          DROP SVG / PNG &nbsp;[+]
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".svg,.png,image/svg+xml,image/png"
          multiple
          className="hidden"
          onChange={(e) => {
            void handleFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {/* ---------------- active list ---------------- */}
      <GroupLabel text={`ACTIVE ${enabledIds.length}`} />
      <div className="px-1 pb-2">
        {enabledIds.length === 0 && <div className="text-fg3 text-xxs">NOTHING SELECTED</div>}
        {enabledIds.map((id) => {
          const custom = customById.get(id)
          const text = textById.get(id)
          const label = text ? text.char : custom ? custom.label : SYMBOL_MAP[id]?.label || id
          return (
            <div key={id} className="flex items-center gap-1 group hover:bg-[#101010]">
              <SymbolPreview id={id} custom={custom} text={text} on size={16} />
              <span className="text-xs2 text-fg truncate flex-1 min-w-0">{label}</span>
              {custom && (
                <button
                  type="button"
                  className="text-xxs text-fg3 hover:text-fg shrink-0"
                  title="recolour with the colour settings"
                  onClick={() => setCustomRecolor(custom.id, !custom.recolor)}
                >
                  {custom.recolor ? '[x]TINT' : '[ ]TINT'}
                </button>
              )}
              <span className="text-fg3 text-xxs shrink-0">W</span>
              <input
                type="number"
                className="num text-xxs shrink-0"
                style={{ width: 34 }}
                min={0}
                max={99}
                step={1}
                value={sym.weights[id] ?? 1}
                aria-label={label + ' weight'}
                onChange={(e) => setWeight(id, Math.max(0, parseFloat(e.target.value) || 0))}
              />
              <button
                type="button"
                className="text-fg3 hover:text-fg text-xxs shrink-0"
                aria-label={'disable ' + label}
                title={text || custom ? 'remove' : 'disable'}
                onClick={() => {
                  if (text) removeTextSymbol(text.id)
                  else if (custom) removeCustomSymbol(custom.id)
                  else toggle(id)
                }}
              >
                [x]
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
