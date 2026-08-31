import React, { useEffect, useRef } from 'react'
import { BUILTIN_SYMBOLS, SYMBOL_MAP } from '../engine/symbols'
import type { CustomSymbolDef, EditorSettings } from '../types/editor'
import { useEditor } from '../store/editorStore'
import { loadCustomSymbol } from '../engine/imageLoad'

function SymbolPreview(props: { id: string; custom?: CustomSymbolDef; on: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const size = 18
    c.width = size * dpr
    c.height = size * dpr
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size, size)
    ctx.translate(size / 2, size / 2)
    const color = props.on ? '#ffffff' : '#5a5a5a'
    ctx.fillStyle = color
    ctx.strokeStyle = color
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    if (props.custom) {
      const img = props.custom.image
      if (img.complete && img.naturalWidth) {
        const a = props.custom.aspect || 1
        const w = a >= 1 ? 14 : 14 * a
        const h = a >= 1 ? 14 / a : 14
        ctx.globalAlpha = props.on ? 1 : 0.45
        ctx.drawImage(img, -w / 2, -h / 2, w, h)
      }
    } else {
      const def = SYMBOL_MAP[props.id]
      if (def) def.draw(ctx, 13, 13 * 0.15)
    }
  }, [props.id, props.on, props.custom])
  return <canvas ref={ref} style={{ width: 18, height: 18 }} className="shrink-0" />
}

function SymbolRow(props: {
  id: string
  label: string
  enabled: boolean
  weight: number
  custom?: CustomSymbolDef
  onToggle: () => void
  onWeight: (v: number) => void
  onRemove?: () => void
  onRecolor?: (v: boolean) => void
}) {
  return (
    <div className="flex items-center gap-1 group hover:bg-[#101010] pr-1">
      <button
        type="button"
        role="checkbox"
        aria-checked={props.enabled}
        className="tog text-xs2 shrink-0"
        onClick={props.onToggle}
      >
        {props.enabled ? '[x]' : '[ ]'}
      </button>
      <SymbolPreview id={props.id} custom={props.custom} on={props.enabled} />
      <span
        className={
          'text-xs2 uppercase truncate flex-1 ' + (props.enabled ? 'text-fg' : 'text-fg3')
        }
      >
        {props.label}
      </span>
      {props.onRecolor && (
        <button
          type="button"
          className="text-xxs text-fg3 hover:text-fg shrink-0"
          title="recolor with the colour settings"
          onClick={() => props.onRecolor?.(!props.custom?.recolor)}
        >
          {props.custom?.recolor ? '[x]TINT' : '[ ]TINT'}
        </button>
      )}
      <input
        type="number"
        className="num text-xxs shrink-0"
        style={{ width: 34 }}
        min={0}
        max={99}
        step={1}
        value={props.weight}
        aria-label={props.label + ' weight'}
        onChange={(e) => props.onWeight(Math.max(0, parseFloat(e.target.value) || 0))}
      />
      {props.onRemove && (
        <button
          type="button"
          className="text-fg3 hover:text-fg text-xxs shrink-0"
          aria-label={'remove ' + props.label}
          onClick={props.onRemove}
        >
          [x]
        </button>
      )}
    </div>
  )
}

export function SymbolLibrary(props: { settings: EditorSettings }) {
  const setParam = useEditor((s) => s.setParam)
  const customSymbols = useEditor((s) => s.customSymbols)
  const addCustomSymbol = useEditor((s) => s.addCustomSymbol)
  const removeCustomSymbol = useEditor((s) => s.removeCustomSymbol)
  const setCustomRecolor = useEditor((s) => s.setCustomRecolor)
  const setStatus = useEditor((s) => s.setStatus)
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = React.useState(false)

  const sym = props.settings.symbols

  const toggle = (id: string) => {
    setParam('symbols.enabled', { ...sym.enabled, [id]: !sym.enabled[id] })
  }
  const setWeight = (id: string, v: number) => {
    setParam('symbols.weights', { ...sym.weights, [id]: v })
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

  const enabledCount = Object.values(sym.enabled).filter(Boolean).length

  return (
    <div className="pl-1">
      <div className="flex gap-2 pl-2 py-1">
        <button
          type="button"
          className="btn text-xxs"
          onClick={() => {
            const next: Record<string, boolean> = { ...sym.enabled }
            for (const id of sym.pool) next[id] = true
            setParam('symbols.enabled', next)
          }}
        >
          ALL
        </button>
        <button
          type="button"
          className="btn text-xxs"
          onClick={() => {
            const next: Record<string, boolean> = { ...sym.enabled }
            for (const id of sym.pool) next[id] = false
            next['dot'] = true
            setParam('symbols.enabled', next)
          }}
        >
          NONE
        </button>
        <span className="ml-auto text-fg3 text-xxs self-center">{enabledCount} ON</span>
      </div>

      {groups.map((g) => (
        <div key={g.name} className="mt-1">
          <div className="hr text-xxs px-1 select-none">── {g.name} {'─'.repeat(40)}</div>
          {g.ids.map((id) => (
            <SymbolRow
              key={id}
              id={id}
              label={SYMBOL_MAP[id].label}
              enabled={!!sym.enabled[id]}
              weight={sym.weights[id] ?? 1}
              onToggle={() => toggle(id)}
              onWeight={(v) => setWeight(id, v)}
            />
          ))}
        </div>
      ))}

      <div className="mt-2">
        <div className="hr text-xxs px-1 select-none">── CUSTOM {'─'.repeat(40)}</div>
        {customSymbols.map((c) => (
          <SymbolRow
            key={c.id}
            id={c.id}
            label={c.label}
            custom={c}
            enabled={!!sym.enabled[c.id]}
            weight={sym.weights[c.id] ?? 1}
            onToggle={() => toggle(c.id)}
            onWeight={(v) => setWeight(c.id, v)}
            onRecolor={(v) => setCustomRecolor(c.id, v)}
            onRemove={() => removeCustomSymbol(c.id)}
          />
        ))}
        <div
          className={
            'mt-1 mx-1 border border-dashed p-2 text-center text-xxs cursor-pointer ' +
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
          DROP SVG / PNG SYMBOL &nbsp;[+]
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
    </div>
  )
}
