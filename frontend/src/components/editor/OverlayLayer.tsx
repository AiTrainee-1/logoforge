/**
 * The interactive layer of free-position elements.
 *
 * Shared by the batch editor ("extra letters" on a photo) and the composer.
 * Elements can be dragged, resized from any corner and rotated; every gesture
 * writes back through `onChange` and ends with a single `onCommit` so undo
 * treats the whole drag as one step.
 *
 * The layer itself never swallows pointer events — only the elements do — so
 * dragging the photo underneath still works in the batch editor.
 */
import { RotateCw } from 'lucide-react'
import { useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

import { cn } from '@/lib/utils'
import type { CanvasAsset, OverlayElement } from '@/types/editor'
import {
  BOX_WIDTH_MAX,
  BOX_WIDTH_MIN,
  ELEMENT_WIDTH_MAX,
  ELEMENT_WIDTH_MIN,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  elementStyle,
} from '@/utils/overlays'
import { clamp, type Size } from '@/utils/transforms'

export interface OverlayLayerProps {
  frame: Size
  elements: OverlayElement[]
  assets?: Record<string, CanvasAsset>
  selectedId?: string | null
  interactive?: boolean
  onSelect?: (id: string | null) => void
  onChange?: (id: string, patch: Partial<OverlayElement>, commit?: boolean) => void
  onCommit?: () => void
}

type Corner = 'nw' | 'ne' | 'sw' | 'se'

const CORNERS: Record<Corner, string> = {
  nw: '-top-1.5 -left-1.5 cursor-nwse-resize',
  ne: '-top-1.5 -right-1.5 cursor-nesw-resize',
  sw: '-bottom-1.5 -left-1.5 cursor-nesw-resize',
  se: '-bottom-1.5 -right-1.5 cursor-nwse-resize',
}

export function OverlayLayer({
  frame,
  elements,
  assets = {},
  selectedId = null,
  interactive = false,
  onSelect,
  onChange,
  onCommit,
}: OverlayLayerProps) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {elements.map((element) => (
        <ElementView
          key={element.id}
          frame={frame}
          element={element}
          asset={assets[element.assetId]}
          selected={interactive && element.id === selectedId}
          interactive={interactive}
          onSelect={onSelect}
          onChange={onChange}
          onCommit={onCommit}
        />
      ))}
    </div>
  )
}

function ElementView({
  frame,
  element,
  asset,
  selected,
  interactive,
  onSelect,
  onChange,
  onCommit,
}: {
  frame: Size
  element: OverlayElement
  asset?: CanvasAsset
  selected: boolean
  interactive: boolean
  onSelect?: (id: string | null) => void
  onChange?: (id: string, patch: Partial<OverlayElement>, commit?: boolean) => void
  onCommit?: () => void
}) {
  const gesture = useRef<{ pointerId: number; kind: 'move' | Corner | 'rotate' } | null>(null)
  const start = useRef({
    x: 0,
    y: 0,
    elementX: 0,
    elementY: 0,
    distance: 1,
    fontSize: 1,
    widthPercent: 1,
    angle: 0,
    rotation: 0,
  })

  /** The element's centre in the parent's pixel space. */
  const centre = () => ({
    x: (element.x / 100) * frame.width,
    y: (element.y / 100) * frame.height,
  })

  const localPoint = (event: ReactPointerEvent, node: HTMLElement) => {
    const parent = node.offsetParent as HTMLElement | null
    const rect = (parent ?? node).getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  const begin = (event: ReactPointerEvent<HTMLElement>, kind: 'move' | Corner | 'rotate') => {
    if (!interactive) return
    event.stopPropagation()
    event.preventDefault()
    onSelect?.(element.id)

    const node = event.currentTarget as HTMLElement
    const box = (kind === 'move' ? node : node.parentElement) as HTMLElement
    const point = localPoint(event, box)
    const origin = centre()

    start.current = {
      x: point.x,
      y: point.y,
      elementX: element.x,
      elementY: element.y,
      distance: Math.max(1, Math.hypot(point.x - origin.x, point.y - origin.y)),
      fontSize: element.fontSize,
      widthPercent: element.widthPercent,
      angle: Math.atan2(point.y - origin.y, point.x - origin.x),
      rotation: element.rotation,
    }
    gesture.current = { pointerId: event.pointerId, kind }
    node.setPointerCapture(event.pointerId)
  }

  const move = (event: ReactPointerEvent<HTMLElement>) => {
    const active = gesture.current
    if (!active || active.pointerId !== event.pointerId) return
    event.stopPropagation()

    const node = event.currentTarget as HTMLElement
    const box = (active.kind === 'move' ? node : node.parentElement) as HTMLElement
    const point = localPoint(event, box)

    if (active.kind === 'move') {
      const deltaX = ((point.x - start.current.x) / frame.width) * 100
      const deltaY = ((point.y - start.current.y) / frame.height) * 100
      onChange?.(
        element.id,
        {
          x: clamp(start.current.elementX + deltaX, -50, 150),
          y: clamp(start.current.elementY + deltaY, -50, 150),
        },
        false,
      )
      return
    }

    const origin = centre()
    if (active.kind === 'rotate') {
      const angle = Math.atan2(point.y - origin.y, point.x - origin.x)
      let rotation =
        start.current.rotation + ((angle - start.current.angle) * 180) / Math.PI
      if (event.shiftKey) rotation = Math.round(rotation / 15) * 15
      while (rotation > 180) rotation -= 360
      while (rotation < -180) rotation += 360
      onChange?.(element.id, { rotation: Math.round(rotation) }, false)
      return
    }

    if (element.type === 'text' && element.boxWidth > 0) {
      // A text box resizes like a rectangle, not a uniform scale: dragging a
      // corner sets the box's half-width to the pointer's distance from the
      // (fixed) centre. Height is never dragged here - it always follows
      // from how the wider/narrower box rewraps the text.
      const widthPx = Math.abs(point.x - origin.x) * 2
      onChange?.(
        element.id,
        { boxWidth: clamp((widthPx / frame.width) * 100, BOX_WIDTH_MIN, BOX_WIDTH_MAX) },
        false,
      )
      return
    }

    // Any other corner scales the element about its centre, which keeps
    // working however far it has been rotated.
    const distance = Math.hypot(point.x - origin.x, point.y - origin.y)
    const ratio = distance / start.current.distance
    if (element.type === 'image') {
      onChange?.(
        element.id,
        {
          widthPercent: clamp(
            start.current.widthPercent * ratio,
            ELEMENT_WIDTH_MIN,
            ELEMENT_WIDTH_MAX,
          ),
        },
        false,
      )
    } else {
      onChange?.(
        element.id,
        {
          fontSize: Math.round(
            clamp(start.current.fontSize * ratio, FONT_SIZE_MIN, FONT_SIZE_MAX),
          ),
        },
        false,
      )
    }
  }

  const end = (event: ReactPointerEvent<HTMLElement>) => {
    if (!gesture.current || gesture.current.pointerId !== event.pointerId) return
    gesture.current = null
    onCommit?.()
  }

  const style = elementStyle(frame, element, asset)
  const alpha = clamp(element.opacity, 0, 100) / 100

  return (
    <div
      role={interactive ? 'button' : undefined}
      tabIndex={-1}
      style={style}
      onPointerDown={(event) => begin(event, 'move')}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      className={cn(
        'select-none',
        interactive && 'pointer-events-auto cursor-move touch-none',
        selected && 'outline-2 outline-offset-2 outline-sky-400',
        interactive && !selected && 'hover:outline-1 hover:outline-offset-2 hover:outline-sky-300/70',
      )}
    >
      {element.type === 'image' ? (
        asset ? (
          <img
            src={asset.previewUrl}
            alt={asset.name}
            draggable={false}
            style={{ opacity: alpha }}
            className="pointer-events-none size-full object-fill select-none"
          />
        ) : (
          <span className="pointer-events-none block size-full bg-muted/60" />
        )
      ) : (
        element.text
      )}

      {selected ? (
        <>
          {(Object.keys(CORNERS) as Corner[]).map((corner) => (
            <span
              key={corner}
              onPointerDown={(event) => begin(event, corner)}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={end}
              className={cn(
                'pointer-events-auto absolute size-3 rounded-[3px] border border-white bg-sky-500 shadow touch-none',
                CORNERS[corner],
              )}
            />
          ))}
          <span
            onPointerDown={(event) => begin(event, 'rotate')}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            className="pointer-events-auto absolute -top-8 left-1/2 grid size-5 -translate-x-1/2 cursor-grab place-items-center rounded-full border border-white bg-sky-500 text-white shadow touch-none"
          >
            <RotateCw className="size-3" />
          </span>
        </>
      ) : null}
    </div>
  )
}
