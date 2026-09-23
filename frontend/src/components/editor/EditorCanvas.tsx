/**
 * The interactive editing canvas.
 *
 * What you see here is what the server renders: the frame, placement, logo and
 * label all come from `utils/transforms.ts`, the port of the backend's model.
 * Dragging, wheel zoom and pinch all write to the selected image's transform -
 * never to the view zoom, and never to another image.
 */
import { Hand, ImageOff } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react'

import { LabelOverlay, LogoOverlay } from '@/components/editor/CanvasOverlays'
import { OverlayLayer } from '@/components/editor/OverlayLayer'
import { useStudio } from '@/hooks/useStudio'
import { cn } from '@/lib/utils'
import { alphabeticLabel } from '@/utils/labels'
import { computeFrame, computePlacement, SCALE_MAX, SCALE_MIN, clamp } from '@/utils/transforms'

const CANVAS_PADDING = 32

interface Pointer {
  x: number
  y: number
}

export function EditorCanvas({ className }: { className?: string }) {
  const { images, editor } = useStudio()
  const { selected, selectedIndex, updateTransform, commitHistory, resetTransform } = images
  const { exportSettings, logoSettings, labelSettings, view, showBefore } = editor

  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ width: 0, height: 0 })
  const [isDragging, setDragging] = useState(false)

  const pointers = useRef<Map<number, Pointer>>(new Map())
  const pinchDistance = useRef<number | null>(null)
  const wheelCommit = useRef<number | null>(null)

  // A callback ref keeps the observer attached even though the placeholder and
  // the editor are different elements.
  useLayoutEffect(() => {
    if (!container) return undefined
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (rect) setBox({ width: rect.width, height: rect.height })
    })
    observer.observe(container)
    setBox({ width: container.clientWidth, height: container.clientHeight })
    return () => observer.disconnect()
  }, [container])

  useEffect(
    () => () => {
      if (wheelCommit.current) window.clearTimeout(wheelCommit.current)
    },
    [],
  )

  // React registers onWheel passively, so the page would scroll while the user
  // zooms. A non-passive listener alongside it cancels that.
  useEffect(() => {
    const node = frameRef.current
    if (!node) return undefined
    const stopScroll = (event: WheelEvent) => event.preventDefault()
    node.addEventListener('wheel', stopScroll, { passive: false })
    return () => node.removeEventListener('wheel', stopScroll)
  }, [selected?.id])

  const scheduleCommit = useCallback(() => {
    if (wheelCommit.current) window.clearTimeout(wheelCommit.current)
    wheelCommit.current = window.setTimeout(() => {
      commitHistory()
      wheelCommit.current = null
    }, 350)
  }, [commitHistory])

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!selected || showBefore) return
      // A press on empty canvas drops the element selection; presses that
      // started on an element never reach here.
      if (event.target === event.currentTarget) images.selectOverlay(null)
      event.currentTarget.setPointerCapture(event.pointerId)
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (pointers.current.size === 1) setDragging(true)
    },
    [images, selected, showBefore],
  )

  const endGesture = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      pointers.current.delete(event.pointerId)
      if (pointers.current.size < 2) pinchDistance.current = null
      if (pointers.current.size === 0 && isDragging) {
        setDragging(false)
        commitHistory()
      }
    },
    [commitHistory, isDragging],
  )

  // The container is always mounted (even with no image) so the ResizeObserver
  // has something to measure from the very first paint.
  if (!selected) {
    return (
      <div
        ref={setContainer}
        className={cn(
          'flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-canvas/60 text-muted-foreground',
          className,
        )}
      >
        <ImageOff className="size-8 opacity-60" />
        <p className="text-sm">Upload images to start editing</p>
      </div>
    )
  }

  const source = { width: selected.width, height: selected.height }
  const frame = computeFrame(source, exportSettings)
  const available = {
    width: Math.max(80, box.width - CANVAS_PADDING),
    height: Math.max(80, box.height - CANVAS_PADDING),
  }
  const fit = Math.min(available.width / frame.width, available.height / frame.height)
  const previewWidth = Math.max(1, frame.width * fit * view.zoom)
  const previewHeight = Math.max(1, frame.height * fit * view.zoom)
  const previewFrame = { width: previewWidth, height: previewHeight }
  const placement = computePlacement(source, previewFrame, selected.transform, exportSettings.fit)
  const label = alphabeticLabel(selectedIndex)

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return
    const previous = pointers.current.get(event.pointerId)!
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })

    if (pointers.current.size >= 2) {
      const [first, second] = [...pointers.current.values()]
      const distance = Math.hypot(first.x - second.x, first.y - second.y)
      if (pinchDistance.current !== null && distance > 0) {
        const ratio = distance / pinchDistance.current
        updateTransform(
          selected.id,
          { scale: clamp(selected.transform.scale * ratio, SCALE_MIN, SCALE_MAX) },
          false,
        )
      }
      pinchDistance.current = distance
      return
    }

    if (!isDragging) return
    const deltaX = event.clientX - previous.x
    const deltaY = event.clientY - previous.y
    updateTransform(
      selected.id,
      {
        offsetX: selected.transform.offsetX + (deltaX / previewWidth) * 100,
        offsetY: selected.transform.offsetY + (deltaY / previewHeight) * 100,
      },
      false,
    )
  }

  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (showBefore) return
    // Wheel changes the IMAGE transform, never the editor's view zoom.
    const factor = Math.exp(-event.deltaY * 0.0012)
    updateTransform(
      selected.id,
      { scale: clamp(selected.transform.scale * factor, SCALE_MIN, SCALE_MAX) },
      false,
    )
    scheduleCommit()
  }

  const showCheckerboard = selected.hasAlpha && exportSettings.keepTransparency

  return (
    <div
      ref={setContainer}
      className={cn(
        'relative flex flex-1 items-center justify-center overflow-hidden rounded-xl bg-canvas',
        className,
      )}
    >
      <div
        ref={frameRef}
        role="application"
        aria-label="Image position editor"
        className={cn(
          'relative overflow-hidden rounded-md shadow-[0_8px_40px_-12px_rgba(0,0,0,0.45)] ring-1 ring-black/10',
          showCheckerboard ? 'bg-checkerboard' : '',
          showBefore ? 'cursor-default' : isDragging ? 'cursor-grabbing' : 'cursor-grab',
        )}
        style={{
          width: previewWidth,
          height: previewHeight,
          touchAction: 'none',
          backgroundColor: showCheckerboard ? undefined : exportSettings.background,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        onPointerLeave={endGesture}
        onWheel={onWheel}
        onDoubleClick={() => !showBefore && resetTransform(selected.id)}
      >
        {showBefore ? (
          <img
            src={selected.previewUrl}
            alt={selected.name}
            draggable={false}
            className="absolute inset-0 size-full object-contain select-none"
          />
        ) : (
          <>
            <img
              src={selected.previewUrl}
              alt={selected.name}
              draggable={false}
              className="absolute max-w-none select-none"
              style={{
                left: placement.x,
                top: placement.y,
                width: placement.width,
                height: placement.height,
              }}
            />
            {images.logo ? (
              <LogoOverlay frame={previewFrame} logo={images.logo} settings={logoSettings} />
            ) : null}
            <LabelOverlay frame={previewFrame} text={label} settings={labelSettings} />
            <OverlayLayer
              frame={previewFrame}
              elements={selected.overlays}
              selectedId={images.selectedOverlayId}
              interactive
              onSelect={images.selectOverlay}
              onChange={(elementId, patch, commit) =>
                images.updateOverlay(selected.id, elementId, patch, commit)
              }
              onCommit={images.commitHistory}
            />
          </>
        )}
      </div>

      {showBefore ? (
        <span className="pointer-events-none absolute top-3 left-3 rounded-md bg-black/70 px-2 py-1 text-[11px] font-medium text-white">
          Before — original upload
        </span>
      ) : (
        <span className="pointer-events-none absolute bottom-3 left-3 hidden items-center gap-1.5 rounded-md bg-black/45 px-2 py-1 text-[11px] font-medium text-white/90 md:flex">
          <Hand className="size-3" />
          Drag to reposition · scroll to zoom · double-click to reset
        </span>
      )}
    </div>
  )
}
