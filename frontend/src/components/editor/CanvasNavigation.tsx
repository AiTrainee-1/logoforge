/** Previous / next navigation plus the *view* zoom (never the image scale). */
import { ChevronLeft, ChevronRight, Eye, Maximize2, Minus, Plus, RotateCcw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/primitives'
import { useStudio } from '@/hooks/useStudio'
import { cn } from '@/lib/utils'
import { alphabeticLabel } from '@/utils/labels'

export function CanvasNavigation({
  onFullscreen,
  className,
}: {
  onFullscreen?: () => void
  className?: string
}) {
  const { images, editor } = useStudio()
  const count = images.images.length
  const position = count === 0 ? 0 : images.selectedIndex + 1

  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3', className)}>
      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          onClick={images.previous}
          disabled={count < 2}
          aria-label="Previous image"
        >
          <ChevronLeft className="size-4" />
          <span className="hidden sm:inline">Previous</span>
        </Button>
        <div className="flex min-w-24 items-center justify-center gap-2 px-2 text-sm">
          <Badge>{count ? alphabeticLabel(images.selectedIndex) : '—'}</Badge>
          <span className="font-mono tabular-nums text-muted-foreground">
            {position} / {count}
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={images.next}
          disabled={count < 2}
          aria-label="Next image"
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <div className="flex items-center gap-1.5">
        <Button
          variant={editor.showBefore ? 'default' : 'ghost'}
          size="sm"
          onClick={() => editor.setShowBefore(!editor.showBefore)}
          disabled={count === 0}
          title="Toggle before / after (B)"
        >
          <Eye className="size-4" />
          <span className="hidden sm:inline">{editor.showBefore ? 'Before' : 'After'}</span>
        </Button>

        <div className="flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={editor.zoomOut}
            aria-label="Zoom out the canvas view"
          >
            <Minus className="size-3.5" />
          </Button>
          <button
            type="button"
            onClick={editor.resetView}
            className="w-14 font-mono text-[12px] tabular-nums text-muted-foreground transition-colors hover:text-foreground"
            title="Reset the view zoom (this never changes the export)"
          >
            {Math.round(editor.view.zoom * 100)}%
          </button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={editor.zoomIn}
            aria-label="Zoom in the canvas view"
          >
            <Plus className="size-3.5" />
          </Button>
        </div>

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={editor.resetView}
          title="Fit the canvas to the screen"
          aria-label="Fit canvas"
        >
          <RotateCcw className="size-3.5" />
        </Button>

        {onFullscreen ? (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onFullscreen}
            disabled={count === 0}
            title="Fullscreen preview (F)"
            aria-label="Fullscreen preview"
          >
            <Maximize2 className="size-3.5" />
          </Button>
        ) : null}
      </div>
    </div>
  )
}
