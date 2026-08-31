import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useEditor } from './store/editorStore'
import { Toolbar } from './components/Toolbar'
import { CanvasViewport } from './components/CanvasViewport'
import { ControlPanel } from './components/ControlPanel'
import { SourcePanel } from './components/SourcePanel'
import { PresetPanel } from './components/PresetPanel'
import { SymbolLibrary } from './components/SymbolLibrary'
import { StatusBar } from './components/StatusBar'
import { AsciiBox } from './components/Primitives'
import { buildDemoImage } from './engine/demo'
import { loadImageFile } from './engine/imageLoad'

export default function App() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [dropping, setDropping] = useState(false)
  const settings = useEditor((s) => s.settings)
  const loadImageSource = useEditor((s) => s.loadImageSource)
  const setStatus = useEditor((s) => s.setStatus)
  const requestFit = useEditor((s) => s.requestFit)
  const randomizeSeed = useEditor((s) => s.randomizeSeed)
  const setView = useEditor((s) => s.setView)

  /* ---------------- first run ---------------- */
  useEffect(() => {
    loadImageSource(buildDemoImage(), 'DEMO_BUST.PROC')
    const w = window as unknown as { __bootFinish?: () => void }
    w.__bootFinish?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ---------------- image loading ---------------- */
  const handleFile = useCallback(
    async (file: File | undefined | null) => {
      if (!file) return
      setStatus({ kind: 'busy', message: 'READING IMAGE...', progress: -1 })
      try {
        await new Promise((r) => setTimeout(r, 16))
        setStatus({ kind: 'busy', message: 'DECODING...', progress: -1 })
        const canvas = await loadImageFile(file)
        setStatus({ kind: 'busy', message: 'BUILDING SOURCE MAP...', progress: -1 })
        await new Promise((r) => setTimeout(r, 16))
        loadImageSource(canvas, file.name.toUpperCase())
        setStatus({ kind: 'ready', message: 'READY', progress: -1 })
      } catch (err) {
        setStatus({
          kind: 'error',
          message: String((err as Error).message || 'IMAGE LOAD FAILED'),
          progress: -1,
        })
      }
    },
    [loadImageSource, setStatus],
  )

  const pickFile = useCallback(() => fileRef.current?.click(), [])

  /* ---------------- window drag & drop ---------------- */
  useEffect(() => {
    let depth = 0
    const onOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types?.includes('Files')) return
      e.preventDefault()
    }
    const onEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types?.includes('Files')) return
      depth++
      setDropping(true)
    }
    const onLeave = () => {
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDropping(false)
    }
    const onDrop = (e: DragEvent) => {
      depth = 0
      setDropping(false)
      const files = e.dataTransfer?.files
      if (!files || files.length === 0) return
      const f = files[0]
      if (/\.svg$/i.test(f.name)) return // handled by the symbol drop zone
      e.preventDefault()
      void handleFile(f)
    }
    window.addEventListener('dragover', onOver)
    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [handleFile])

  /* ---------------- shortcuts ---------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'f' || e.key === 'F') requestFit()
      else if (e.key === '0') setView({ zoom: 1, panX: 0, panY: 0 })
      else if (e.key === 'r' || e.key === 'R') randomizeSeed()
      else if (e.key === 'o' || e.key === 'O')
        setView({ showOriginal: !useEditor.getState().view.showOriginal })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [requestFit, setView, randomizeSeed])

  return (
    <div className="h-full w-full flex flex-col bg-black text-fg min-w-[900px]">
      <Toolbar onPickFile={pickFile} />

      <div className="flex-1 min-h-0 flex gap-4 p-4 pt-3">
        {/* left column */}
        <div className="hidden lg:flex w-[268px] shrink-0 flex-col gap-4 min-h-0">
          <SourcePanel onPickFile={pickFile} />
          <AsciiBox
            title="ELEMENTS"
            className="flex-1 min-h-0 flex flex-col"
            bodyClassName="flex-1 min-h-0 overflow-y-auto pt-1 pb-2"
          >
            <SymbolLibrary settings={settings} />
          </AsciiBox>
          <PresetPanel />
        </div>

        {/* canvas */}
        <CanvasViewport onPickFile={pickFile} />

        {/* right column */}
        <AsciiBox
          title="PARAMETERS"
          className="w-[300px] shrink-0 flex flex-col min-h-0"
          bodyClassName="flex-1 min-h-0 pt-1"
        >
          <ControlPanel />
        </AsciiBox>
      </div>

      <StatusBar />

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
        className="hidden"
        onChange={(e) => {
          void handleFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />

      {dropping && (
        <div className="fixed inset-0 z-[200] bg-black/85 flex items-center justify-center pointer-events-none">
          <div className="text-fg text-center whitespace-pre leading-tight">
            {`┌──────────────────────────────────┐
│                                  │
│        DROP IMAGE TO BEGIN       │
│                                  │
│        JPG / PNG / WEBP          │
│                                  │
└──────────────────────────────────┘`}
          </div>
        </div>
      )}
    </div>
  )
}
