/**
 * The composer canvas.
 *
 * In `image` mode the frame is the uploaded photo at its own pixel size, so
 * what you place here lands on the full-resolution original untouched. In
 * `card` mode the frame is a page and the photo is one of the elements.
 */
import { ImagePlus } from 'lucide-react'
import { useLayoutEffect, useState } from 'react'

import { CatalogSetup } from '@/components/compose/CatalogSetup'
import { OverlayLayer } from '@/components/editor/OverlayLayer'
import type { UseCompose } from '@/hooks/useCompose'
import { cn } from '@/lib/utils'

const PADDING = 48

export function ComposerCanvas({
  compose,
  className,
}: {
  compose: UseCompose
  className?: string
}) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const [box, setBox] = useState({ width: 0, height: 0 })

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

  const { canvas, frame, baseImage, elements, assetMap } = compose
  const empty = canvas.mode === 'image' && !baseImage
  const catalogSetup = canvas.mode === 'card' && canvas.preset === 'catalog' && elements.length === 0

  const available = {
    width: Math.max(80, box.width - PADDING),
    height: Math.max(80, box.height - PADDING),
  }
  const fit = Math.min(available.width / frame.width, available.height / frame.height)
  const previewWidth = Math.max(1, frame.width * fit * compose.viewZoom)
  const previewHeight = Math.max(1, frame.height * fit * compose.viewZoom)
  const previewFrame = { width: previewWidth, height: previewHeight }

  return (
    <div
      ref={setContainer}
      className={cn(
        'relative flex flex-1 items-center justify-center overflow-auto rounded-xl bg-canvas p-6',
        className,
      )}
    >
      {catalogSetup ? (
        <CatalogSetup compose={compose} />
      ) : empty ? (
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <ImagePlus className="size-8 opacity-60" />
          <p className="text-sm">Upload an image to start</p>
        </div>
      ) : (
        <div
          role="application"
          aria-label="Composition canvas"
          className={cn(
            'relative shrink-0 overflow-hidden shadow-[0_8px_40px_-12px_rgba(0,0,0,0.45)] ring-1 ring-black/10',
            canvas.mode === 'card' && canvas.transparent ? 'bg-checkerboard' : '',
          )}
          style={{
            width: previewWidth,
            height: previewHeight,
            backgroundColor:
              canvas.mode === 'card' && !canvas.transparent ? canvas.background : undefined,
          }}
          onPointerDown={(event) => {
            // A press on the bare canvas clears the selection.
            if (event.target === event.currentTarget) compose.select(null)
          }}
        >
          {canvas.mode === 'image' && baseImage ? (
            <img
              src={baseImage.previewUrl}
              alt={baseImage.name}
              draggable={false}
              className="pointer-events-none absolute inset-0 size-full select-none"
            />
          ) : null}

          <OverlayLayer
            frame={previewFrame}
            elements={elements}
            assets={assetMap}
            selectedId={compose.selectedId}
            interactive
            onSelect={compose.select}
            onChange={compose.update}
            onCommit={compose.commit}
          />
        </div>
      )}

      {!empty ? (
        <span className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-black/45 px-2 py-1 font-mono text-[11px] text-white/90">
          {frame.width} × {frame.height}
        </span>
      ) : null}
    </div>
  )
}
