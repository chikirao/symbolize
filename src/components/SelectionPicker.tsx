import React from 'react'
import { useEditor } from '../store/editorStore'
import { getPath } from '../store/path'
import type { ColorPick } from '../types/editor'
import { ColorField } from './Primitives'

/** stable empty array so the selector does not hand back a new one each call */
const EMPTY: ColorPick[] = []

/**
 * Colour-selection controls: the eyedropper toggle, the list of picked colours
 * and the contiguous switch.
 *
 * The mask and each zone all own a selection of the same shape, so this is
 * pointed at one of them by path prefix rather than hard-wired to the mask.
 * The eyedropper writes to whichever picker armed it, which is what
 * `view.pickTarget` records.
 */
export function SelectionPicker(props: { prefix?: string }) {
  const prefix = props.prefix ?? 'mask'
  const picks = useEditor((s) => getPath<ColorPick[]>(s.settings, prefix + '.picks') ?? EMPTY)
  const contiguous = useEditor((s) => !!getPath<boolean>(s.settings, prefix + '.contiguous'))
  const tool = useEditor((s) => s.view.tool)
  const pickTarget = useEditor((s) => s.view.pickTarget)
  const image = useEditor((s) => s.image)
  const setParam = useEditor((s) => s.setParam)
  const setView = useEditor((s) => s.setView)
  const removePick = useEditor((s) => s.removePick)
  const clearPicks = useEditor((s) => s.clearPicks)

  const picking = tool === 'pick' && pickTarget === prefix

  return (
    <div className="pl-3 mt-1">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={'btn text-xxs ' + (picking ? 'btn-on' : '')}
          aria-pressed={picking}
          disabled={!image}
          title="click the canvas to sample a colour"
          onClick={() =>
            setView(picking ? { tool: 'pan' } : { tool: 'pick', pickTarget: prefix })
          }
        >
          {picking ? 'PICKING' : 'PICK COLOR'}
        </button>
        <button
          type="button"
          className="btn text-xxs"
          disabled={picks.length === 0}
          onClick={() => clearPicks(prefix)}
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
          <div key={i} className="flex items-center gap-1 group">
            <span className="text-fg3 text-xxs w-[13px] shrink-0">{String(i).padStart(2, '0')}</span>
            <ColorField
              value={p.color}
              ariaLabel={`selected colour ${i}`}
              onChange={(v) => {
                const next = picks.map((q, j) => (j === i ? { ...q, color: v.toUpperCase() } : q))
                setParam(prefix + '.picks', next)
              }}
            />
            <span className="text-fg3 text-xxs ml-auto shrink-0 tabular-nums">
              {(p.x * 100).toFixed(0)},{(p.y * 100).toFixed(0)}
            </span>
            <button
              type="button"
              className="text-fg3 hover:text-fg text-xxs shrink-0 pl-1"
              aria-label={`remove pick ${i}`}
              onClick={() => removePick(prefix, i)}
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
        onClick={() => setParam(prefix + '.contiguous', !contiguous)}
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
