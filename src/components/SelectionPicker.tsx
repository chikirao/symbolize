import React from 'react'
import { useEditor } from '../store/editorStore'
import { ColorField } from './Primitives'

/**
 * Colour-selection controls: the eyedropper toggle, the list of picked colours
 * and the contiguous switch. Lives inside the MASK section.
 */
export function SelectionPicker() {
  const picks = useEditor((s) => s.settings.mask.picks)
  const contiguous = useEditor((s) => s.settings.mask.contiguous)
  const tool = useEditor((s) => s.view.tool)
  const image = useEditor((s) => s.image)
  const setParam = useEditor((s) => s.setParam)
  const setView = useEditor((s) => s.setView)
  const removeMaskPick = useEditor((s) => s.removeMaskPick)
  const clearMaskPicks = useEditor((s) => s.clearMaskPicks)

  const picking = tool === 'pick'

  return (
    <div className="pl-3 mt-1">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={'btn text-xxs ' + (picking ? 'btn-on' : '')}
          aria-pressed={picking}
          disabled={!image}
          title="click the canvas to sample a colour"
          onClick={() => setView({ tool: picking ? 'pan' : 'pick' })}
        >
          {picking ? 'PICKING' : 'PICK COLOR'}
        </button>
        <button
          type="button"
          className="btn text-xxs"
          disabled={picks.length === 0}
          onClick={clearMaskPicks}
        >
          CLEAR
        </button>
        <span className="text-fg3 text-xxs">{picks.length} PICKED</span>
      </div>

      {picking && (
        <div className="text-fg text-xxs mt-1 caret">CLICK THE CANVAS TO SAMPLE</div>
      )}

      <div className="mt-1 space-y-[1px]">
        {picks.map((p, i) => (
          <div key={i} className="flex items-center gap-2 group">
            <span className="text-fg3 text-xxs w-[14px]">{String(i).padStart(2, '0')}</span>
            <ColorField
              value={p.color}
              ariaLabel={`selected colour ${i}`}
              onChange={(v) => {
                const next = picks.map((q, j) => (j === i ? { ...q, color: v.toUpperCase() } : q))
                setParam('mask.picks', next)
              }}
            />
            <span className="text-fg3 text-xxs ml-auto tabular-nums">
              {(p.x * 100).toFixed(0)},{(p.y * 100).toFixed(0)}
            </span>
            <button
              type="button"
              className="text-fg3 hover:text-fg text-xxs px-1"
              aria-label={`remove pick ${i}`}
              onClick={() => removeMaskPick(i)}
            >
              [x]
            </button>
          </div>
        ))}
        {picks.length === 0 && (
          <div className="text-fg3 text-xxs leading-snug">
            PICK ONE OR MORE COLORS OFF THE IMAGE.
            <br />
            TOLERANCE WIDENS THE RANGE AROUND THEM.
          </div>
        )}
      </div>

      <button
        type="button"
        role="checkbox"
        aria-checked={contiguous}
        className="tog text-xxs mt-1 block"
        title="magic wand: keep only the area connected to the click"
        onClick={() => setParam('mask.contiguous', !contiguous)}
      >
        {contiguous ? '[x]' : '[ ]'} CONTIGUOUS (WAND)
      </button>
      <div className="text-fg3 text-xxs leading-snug">
        {contiguous
          ? 'ONLY THE REGION TOUCHING EACH PICK.'
          : 'EVERY MATCHING PIXEL IN THE IMAGE.'}
      </div>
    </div>
  )
}
