import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useEditor } from './store/editorStore'
import { useAnim } from './store/animStore'
import { Toolbar } from './components/Toolbar'
import { TransportClock } from './components/TransportClock'
import { Timeline } from './components/Timeline'
import { CanvasViewport } from './components/CanvasViewport'
import { ControlPanel } from './components/ControlPanel'
import { SourcePanelBadge, SourcePanelBody } from './components/SourcePanel'
import { PresetPanelBody } from './components/PresetPanel'
import { SymbolLibrary } from './components/SymbolLibrary'
import { StatusBar } from './components/StatusBar'
import { MobileWorkspace } from './components/MobileWorkspace'
import { ColumnStrip, PanelBox, ResizeHandle } from './components/Panel'
import { GuideOverlay } from './components/GuideOverlay'
import { TutorialOverlay } from './components/TutorialOverlay'
import { installHistoryPointerGrouping, useHistory } from './store/historyStore'
import { useUi } from './store/uiStore'
import { armIntro, runIntro, replayIntro } from './ui/intro'
import { join, tr, useT } from './i18n'
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
  const t = useT()
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
  const layout = useUi((s) => s.layout)
  const setLayout = useUi((s) => s.setLayout)
  const setPanel = useUi((s) => s.setPanel)

  useEffect(() => installHistoryPointerGrouping(), [])
  useEffect(() => {
    const replay = () => { void replayIntro() }
    window.addEventListener('symbolize:replay-intro', replay)
    return () => window.removeEventListener('symbolize:replay-intro', replay)
  }, [])

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
    void loadDemoImage().then((canvas) => {
      loadImageSource(canvas, 'DEMO_BUNNY.JPG')
      useHistory.getState().reset()
    })

    const root = document.getElementById('root')
    const w = window as unknown as {
      __bootFinish?: () => void
      __introRun?: () => void
      __bootAlive?: boolean
      __skipIntro?: boolean
    }
    if (!root) return
    if (w.__skipIntro) {
      useUi.getState().offerTutorial()
      return
    }

    // The interface is laid out immediately but stays dark: the boot screen
    // hands over on a keypress and the wave lights it up top to bottom.
    armIntro(root)
    let started = false
    const start = () => {
      if (started) return
      started = true
      void runIntro(root).then(() => {
        useUi.getState().offerTutorial()
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
    const hard = window.setTimeout(() => { if (!w.__bootAlive) start() }, 12_000)

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
        useHistory.getState().reset()
        setStatus({ kind: 'ready', message: 'READY', progress: -1 })
      } catch (err) {
        setStatus({
          kind: 'error',
          message: String((err as Error).message || tr('IMAGE LOAD FAILED')),
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
      setStatus({
        kind: 'busy',
        message: tr('DECODING ' + kind + '...'),
        progress: 0,
      })
      try {
        const media = await decodeMediaFile(file, {
          maxSide: anim.importSide,
          maxFrames: anim.importMaxFrames,
          fps: anim.importFps,
          trimStart: anim.importTrimStart,
          trimEnd: anim.importTrimEnd,
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
        useHistory.getState().reset()
        /* The first decoded clip is the moment this stops being a still-image
           editor, and nothing on screen says so. Once, then never again. */
        useUi.getState().offerGuide()
        setStatus({
          kind: 'ready',
          message: join(
            tr('SEQUENCE'),
            sequence.frames.length + ' ' + tr('FRAMES') + ' @ ' + sequence.fps + ' FPS',
            media.truncated && tr('TRUNCATED'),
          ),
          progress: -1,
        })
      } catch (err) {
        if (job.signal.aborted) return
        setStatus({
          kind: 'error',
          message: String((err as Error).message || tr('MEDIA DECODE FAILED')),
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

  /* ---------------- panel geometry ---------------- */
  const foldedPanel = (id: string) => !!layout.panels[id]?.collapsed
  const leftFolded = foldedPanel('left')
  const paramsFolded = foldedPanel('params')
  const timelineOpen = useAnim((s) => s.open)

  /* A panel with no stored size is whatever height its content made it, so a
     drag has to start from what is on screen rather than from a default. */
  const measurePanel = (id: string, fallback: number) =>
    document.querySelector('.panel-' + id)?.getBoundingClientRect().height ?? fallback
  const measureTracks = () =>
    document.querySelector('.tl-tracks')?.getBoundingClientRect().height ?? 168

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
        message: join(String((err as Error).message || tr('CLIPBOARD BLOCKED')), 'CTRL+V'),
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
      if ((window as unknown as { __bootAlive?: boolean }).__bootAlive) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (useUi.getState().tutorial || useUi.getState().guide) return
      if ((e.metaKey || e.ctrlKey) && !e.altKey) {
        const history = useHistory.getState()
        if (e.key.toLowerCase() === 'z' && (e.shiftKey ? history.canRedo : history.canUndo)) {
          e.preventDefault()
          if (e.shiftKey) history.redo()
          else history.undo()
        } else if (e.key.toLowerCase() === 'y' && history.canRedo) {
          e.preventDefault()
          history.redo()
        }
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'f' || e.key === 'F') requestFit()
      else if (e.key === '0') setView({ zoom: 1, panX: 0, panY: 0 })
      else if (e.key === 'r' || e.key === 'R') randomizeSeed()
      else if (e.key === 'o' || e.key === 'O')
        setView({ showOriginal: !useEditor.getState().view.showOriginal })
      // transport
      else if (e.key === ' ') {
        e.preventDefault()
        useAnim.getState().togglePlay()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        useAnim.getState().stepFrame(e.shiftKey ? -10 : -1)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        useAnim.getState().stepFrame(e.shiftKey ? 10 : 1)
      } else if (e.key === 'Home') useAnim.getState().toFirst()
      else if (e.key === 'End') useAnim.getState().toLast()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [requestFit, setView, randomizeSeed])

  return (
    <div className="app-shell h-full w-full flex flex-col bg-black text-fg min-w-[900px]">
      <TransportClock />
      <GuideOverlay />
      <TutorialOverlay mobile={mobileLayout} />
      <Toolbar onPickFile={pickFile} onPaste={pasteFromClipboard} />

      {mobileLayout ? (
        <MobileWorkspace onPickFile={pickFile} onPaste={pasteFromClipboard} />
      ) : (
        <>
          {/* Every seam here is draggable and every panel folds. The gutters
              that used to be a `gap-4` are the handles themselves, so the
              spacing is unchanged and there is nothing dead between panels. */}
          <div className="desktop-workspace flex-1 min-h-0 flex p-4 pt-3">
            {leftFolded ? (
              <ColumnStrip id="left" title="PANELS" side="left" />
            ) : (
              <div
                className="desktop-left flex flex-col min-h-0 shrink-0"
                style={{ width: layout.leftWidth }}
              >
                <PanelBox
                  id="source"
                  title="SOURCE"
                  right={<SourcePanelBadge />}
                  bodyClassName="p-2 pt-1 min-h-0 overflow-y-auto"
                >
                  <SourcePanelBody onPickFile={pickFile} onPaste={pasteFromClipboard} />
                </PanelBox>

                <ResizeHandle
                  axis="y"
                  label="source panel height"
                  disabled={foldedPanel('source') || foldedPanel('elements')}
                  measure={() => measurePanel('source', 210)}
                  onSize={(h) => setPanel('source', { size: h })}
                  onReset={() => setPanel('source', { size: null })}
                />

                <PanelBox
                  id="elements"
                  title="ELEMENTS"
                  flex
                  bodyClassName="flex-1 min-h-0 overflow-y-auto pt-1 pb-2"
                >
                  <SymbolLibrary settings={settings} />
                </PanelBox>

                <ResizeHandle
                  axis="y"
                  invert
                  label="presets panel height"
                  disabled={foldedPanel('presets') || foldedPanel('elements')}
                  measure={() => measurePanel('presets', 190)}
                  onSize={(h) => setPanel('presets', { size: h })}
                  onReset={() => setPanel('presets', { size: null })}
                />

                <PanelBox id="presets" title="PRESETS" bodyClassName="p-2 pt-1 min-h-0 flex flex-col">
                  <PresetPanelBody />
                </PanelBox>
              </div>
            )}

            <ResizeHandle
              axis="x"
              label="left column width"
              fold={{ id: 'left', arrow: '<' }}
              disabled={leftFolded}
              measure={() => useUi.getState().layout.leftWidth}
              onSize={(w) => setLayout({ leftWidth: w })}
              onReset={() => setLayout({ leftWidth: 268 })}
            />

            <CanvasViewport onPickFile={pickFile} />

            <ResizeHandle
              axis="x"
              invert
              label="parameter column width"
              fold={{ id: 'params', arrow: '>' }}
              disabled={paramsFolded}
              measure={() => useUi.getState().layout.rightWidth}
              onSize={(w) => setLayout({ rightWidth: w })}
              onReset={() => setLayout({ rightWidth: 300 })}
            />

            {paramsFolded ? (
              <ColumnStrip id="params" title="PARAMETERS" side="right" />
            ) : (
              <PanelBox
                id="params"
                title="PARAMETERS"
                width={layout.rightWidth}
                className="min-h-0"
                bodyClassName="flex-1 min-h-0 pt-1"
              >
                <ControlPanel />
              </PanelBox>
            )}
          </div>

          <div className="desktop-timeline-wrap mx-4 mb-2">
            <ResizeHandle
              axis="y"
              invert
              label="timeline height"
              disabled={!timelineOpen}
              measure={() => measureTracks()}
              onSize={(h) => setLayout({ timelineHeight: h })}
              onReset={() => setLayout({ timelineHeight: null })}
            />
            <Timeline className="desktop-timeline" />
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
            <div className="text-fg3">{'┌' + '─'.repeat(38) + '┐'}</div>
            <div className="py-2 tracking-widest">{t('DROP IMAGE OR VIDEO IN')}</div>
            <div className="text-fg2 text-xs2">JPG PNG WEBP / GIF MP4 WEBM</div>
            <div className="text-fg3 pt-2">{'└' + '─'.repeat(38) + '┘'}</div>
          </div>
        </div>
      )}
    </div>
  )
}
