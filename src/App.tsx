import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useEditor } from './store/editorStore'
import { useAnim } from './store/animStore'
import { Toolbar } from './components/Toolbar'
import { TransportClock } from './components/TransportClock'
import { CanvasViewport } from './components/CanvasViewport'
import { ControlPanel } from './components/ControlPanel'
import { SourcePanel } from './components/SourcePanel'
import { PresetPanel } from './components/PresetPanel'
import { SymbolLibrary } from './components/SymbolLibrary'
import { StatusBar } from './components/StatusBar'
import { MobileWorkspace } from './components/MobileWorkspace'
import { AsciiBox } from './components/Primitives'
import { armIntro, runIntro } from './ui/intro'
import { loadDemoImage } from './engine/demo'
import { decodeMediaFile, isVideoFile, looksAnimated, releaseFrames } from './engine/media'
import { createSequence } from './engine/sequence'
import {
  imageFileFromTransfer,
  loadImageFile,
  readClipboardImage,
  transferHasText,
} from './engine/imageLoad'

export default function App() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [dropping, setDropping] = useState(false)
  const [mobileLayout, setMobileLayout] = useState(() =>
    window.matchMedia('(max-width: 899px), (pointer: coarse) and (max-width: 1199px)').matches,
  )
  const settings = useEditor((s) => s.settings)
  const loadImageSource = useEditor((s) => s.loadImageSource)
  const loadSequence = useEditor((s) => s.loadSequence)
  const setStatus = useEditor((s) => s.setStatus)
  const requestFit = useEditor((s) => s.requestFit)
  const randomizeSeed = useEditor((s) => s.randomizeSeed)
  const setView = useEditor((s) => s.setView)

  useEffect(() => {
    const query = window.matchMedia(
      '(max-width: 899px), (pointer: coarse) and (max-width: 1199px)',
    )
    const update = () => setMobileLayout(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  /* ---------------- first run ---------------- */
  useEffect(() => {
    void loadDemoImage().then((canvas) => loadImageSource(canvas, 'DEMO_BUNNY.JPG'))

    const root = document.getElementById('root')
    const w = window as unknown as {
      __bootFinish?: () => void
      __introRun?: () => void
      __bootAlive?: boolean
    }
    if (!root) return

    // The interface is laid out immediately but stays dark: the boot screen
    // hands over on a keypress and the wave lights it up top to bottom.
    armIntro(root)
    let started = false
    const start = () => {
      if (started) return
      started = true
      void runIntro(root).then(() => {
        setStatus({
          kind: 'ready',
          message: 'SYSTEM ONLINE :: DROP AN IMAGE, PRESS CTRL+V OR PICK A PRESET',
          progress: -1,
        })
        window.setTimeout(() => {
          if (useEditor.getState().status.kind === 'ready') {
            setStatus({ kind: 'ready', message: 'READY', progress: -1 })
          }
        }, 4200)
      })
    }
    w.__introRun = start
    w.__bootFinish?.()

    // Failsafe: if the boot screen is gone and nothing kicked the intro off
    // (an older cached index.html, a script error), light the app up anyway.
    const poll = window.setInterval(() => {
      if (!w.__bootAlive) {
        start()
        clearInterval(poll)
      }
    }, 400)
    const hard = window.setTimeout(start, 12_000)

    return () => {
      clearInterval(poll)
      clearTimeout(hard)
      if (w.__introRun === start) w.__introRun = undefined
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ---------------- image loading ---------------- */
  const handleStill = useCallback(
    async (file: File, label?: string) => {
      setStatus({ kind: 'busy', message: 'READING IMAGE...', progress: -1 })
      try {
        await new Promise((r) => setTimeout(r, 16))
        setStatus({ kind: 'busy', message: 'DECODING...', progress: -1 })
        const canvas = await loadImageFile(file)
        setStatus({ kind: 'busy', message: 'BUILDING SOURCE MAP...', progress: -1 })
        await new Promise((r) => setTimeout(r, 16))
        loadImageSource(canvas, (label || file.name || 'UNTITLED').toUpperCase())
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

  /**
   * Videos and animated images decode into a frame sequence the timeline
   * drives. A file that turns out to hold a single frame — a static GIF, a
   * one-frame WebP — falls back to the still path rather than becoming a
   * one-frame animation.
   */
  const decodeJob = useRef<AbortController | null>(null)
  const handleMedia = useCallback(
    async (file: File, label?: string) => {
      decodeJob.current?.abort()
      const job = new AbortController()
      decodeJob.current = job
      const anim = useAnim.getState()
      const kind = isVideoFile(file) ? 'VIDEO' : 'ANIMATION'
      setStatus({ kind: 'busy', message: 'DECODING ' + kind + '...', progress: 0 })
      try {
        const media = await decodeMediaFile(file, {
          maxSide: anim.importSide,
          maxFrames: anim.importMaxFrames,
          fps: anim.importFps,
          signal: job.signal,
          onProgress: (progress, message) =>
            setStatus({ kind: 'busy', message, progress }),
        })
        if (media.frames.length < 2) {
          releaseFrames(media.frames)
          await handleStill(file, label)
          return
        }
        const sequence = createSequence(media)
        sequence.name = (label || file.name || sequence.name).toUpperCase()
        loadSequence(sequence)
        useAnim.getState().syncToSequence(sequence.frames.length, sequence.fps)
        setStatus({
          kind: 'ready',
          message:
            'SEQUENCE :: ' +
            sequence.frames.length +
            ' FRAMES @ ' +
            sequence.fps +
            ' FPS' +
            (media.truncated ? ' :: TRUNCATED' : ''),
          progress: -1,
        })
      } catch (err) {
        if (job.signal.aborted) return
        setStatus({
          kind: 'error',
          message: String((err as Error).message || 'MEDIA DECODE FAILED'),
          progress: -1,
        })
      } finally {
        if (decodeJob.current === job) decodeJob.current = null
      }
    },
    [handleStill, loadSequence, setStatus],
  )

  const handleFile = useCallback(
    async (file: File | undefined | null, label?: string) => {
      if (!file) return
      if (looksAnimated(file)) return handleMedia(file, label)
      return handleStill(file, label)
    },
    [handleMedia, handleStill],
  )

  const pickFile = useCallback(() => fileRef.current?.click(), [])

  /* ---------------- clipboard ---------------- */

  /** Ctrl+V anywhere on the page drops a clipboard image straight in. */
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const data = e.clipboardData
      const file = imageFileFromTransfer(data)
      if (!file) return
      const target = e.target as HTMLElement | null
      const inField =
        !!target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      // a text field pasting text keeps its normal behaviour
      if (inField && transferHasText(data)) return
      e.preventDefault()
      void handleFile(file, 'CLIPBOARD.' + (file.type.split('/')[1] || 'PNG'))
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [handleFile])

  /** Explicit button: asks the browser for the clipboard, which may be blocked. */
  const pasteFromClipboard = useCallback(async () => {
    setStatus({ kind: 'busy', message: 'READING CLIPBOARD...', progress: -1 })
    try {
      const file = await readClipboardImage()
      await handleFile(file, 'CLIPBOARD.' + (file.type.split('/')[1] || 'PNG'))
    } catch (err) {
      setStatus({
        kind: 'error',
        message: String((err as Error).message || 'CLIPBOARD BLOCKED') + ' :: TRY CTRL+V',
        progress: -1,
      })
    }
  }, [handleFile, setStatus])

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
    <div className="app-shell h-full w-full flex flex-col bg-black text-fg min-w-[900px]">
      <TransportClock />
      <Toolbar onPickFile={pickFile} onPaste={pasteFromClipboard} />

      {mobileLayout ? (
        <MobileWorkspace onPickFile={pickFile} onPaste={pasteFromClipboard} />
      ) : (
        <>
          <div className="desktop-workspace flex-1 min-h-0 flex gap-4 p-4 pt-3">
            {/* left column */}
            <div className="hidden lg:flex w-[268px] shrink-0 flex-col gap-4 min-h-0">
              <SourcePanel onPickFile={pickFile} onPaste={pasteFromClipboard} />
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

          <StatusBar className="desktop-status" />
        </>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif,video/*,.png,.jpg,.jpeg,.webp,.gif,.avif,.mp4,.m4v,.webm,.mov"
        className="hidden"
        onChange={(e) => {
          void handleFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />

      {dropping && (
        <div className="fixed inset-0 z-[200] bg-black/85 flex items-center justify-center pointer-events-none">
          <div className="ascii-art text-fg text-center">
            {`┌──────────────────────────────────┐
│                                  │
│      DROP IMAGE OR VIDEO IN      │
│                                  │
│   JPG PNG WEBP / GIF MP4 WEBM    │
│                                  │
└──────────────────────────────────┘`}
          </div>
        </div>
      )}
    </div>
  )
}
