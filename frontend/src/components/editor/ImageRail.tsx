/**
 * The image list: thumbnails, labels, dimensions, reordering and removal.
 *
 * Labels are derived from the current order, so moving an image renumbers the
 * whole list immediately (A, B, C ... Z, AA, AB).
 */
import { ChevronDown, ChevronUp, GripVertical, ImagePlus, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { UploadDropzone } from '@/components/upload/UploadDropzone'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/primitives'
import { useStudio } from '@/hooks/useStudio'
import { cn } from '@/lib/utils'
import { formatBytes, formatDimensions, shortName } from '@/utils/format'
import { alphabeticLabel } from '@/utils/labels'

export function ImageRail({ className }: { className?: string }) {
  const { images } = useStudio()
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

  const count = images.images.length

  return (
    <div className={cn('flex min-h-0 flex-col gap-3', className)}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold tracking-wide uppercase">
          Images
          <Badge variant="muted">{count}</Badge>
        </h2>
        {count > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => void images.removeAll()}
          >
            <Trash2 className="size-3.5" />
            Clear
          </Button>
        ) : null}
      </div>

      <UploadDropzone compact={count > 0} />

      {count > 0 ? (
        <ul className="scrollbar-thin -mr-1 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
          {images.images.map((image, index) => {
            const isSelected = index === images.selectedIndex
            return (
              <li
                key={image.id}
                draggable
                onDragStart={() => setDragIndex(index)}
                onDragEnter={() => setOverIndex(index)}
                onDragOver={(event) => event.preventDefault()}
                onDragEnd={() => {
                  setDragIndex(null)
                  setOverIndex(null)
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  if (dragIndex !== null && dragIndex !== index) images.reorder(dragIndex, index)
                  setDragIndex(null)
                  setOverIndex(null)
                }}
                className={cn(
                  'group relative flex cursor-pointer items-center gap-3 rounded-xl border p-2 transition-colors',
                  isSelected
                    ? 'border-primary/60 bg-primary/5'
                    : 'border-border bg-card hover:bg-accent/40',
                  overIndex === index && dragIndex !== null && dragIndex !== index
                    ? 'border-primary border-dashed'
                    : '',
                  dragIndex === index ? 'opacity-50' : '',
                )}
                onClick={() => images.select(index)}
              >
                <GripVertical className="size-4 shrink-0 text-muted-foreground/50" />

                <div className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                  {image.thumbUrl ? (
                    <img
                      src={image.thumbUrl}
                      alt=""
                      className="size-full object-cover"
                      draggable={false}
                    />
                  ) : null}
                  <span className="absolute inset-x-0 bottom-0 bg-black/60 py-0.5 text-center text-[10px] font-bold text-white">
                    {alphabeticLabel(index)}
                  </span>
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium" title={image.name}>
                    {shortName(image.name, 26)}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                    {formatDimensions(image.width, image.height)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {image.format} · {formatBytes(image.size)}
                  </p>
                </div>

                <div className="flex shrink-0 flex-col gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <button
                    type="button"
                    aria-label="Move up"
                    disabled={index === 0}
                    className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                    onClick={(event) => {
                      event.stopPropagation()
                      images.reorder(index, index - 1)
                    }}
                  >
                    <ChevronUp className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Move down"
                    disabled={index === count - 1}
                    className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                    onClick={(event) => {
                      event.stopPropagation()
                      images.reorder(index, index + 1)
                    }}
                  >
                    <ChevronDown className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${image.name}`}
                    className="rounded p-0.5 text-muted-foreground transition-colors hover:text-destructive"
                    onClick={(event) => {
                      event.stopPropagation()
                      void images.removeImage(image.id)
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="flex items-center gap-2 rounded-lg bg-muted/60 p-3 text-[13px] text-muted-foreground">
          <ImagePlus className="size-4 shrink-0" />
          Your uploaded images will appear here, each with its own label.
        </p>
      )}
    </div>
  )
}
