/**
 * Per-image position controls.
 *
 * Everything here writes to the *selected* image only. "Apply to all" is an
 * explicit action - transforms are never synchronised automatically.
 */
import {
  ArrowLeftRight,
  ArrowUpDown,
  ClipboardPaste,
  Copy,
  Layers,
  Redo2,
  RotateCcw,
  Undo2,
  ZoomIn,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { FieldRow, SectionTitle } from '@/components/ui/primitives'
import { Slider } from '@/components/ui/slider'
import { useToast } from '@/components/ui/toast'
import { useStudio } from '@/hooks/useStudio'
import { DEFAULT_TRANSFORM } from '@/types/editor'
import { OFFSET_LIMIT, SCALE_MAX, SCALE_MIN, transformsEqual } from '@/utils/transforms'

export function ImageTransformPanel() {
  const { images, editor } = useStudio()
  const { toast } = useToast()
  const selected = images.selected

  if (!selected) {
    return (
      <p className="rounded-lg bg-muted/60 p-3 text-[13px] text-muted-foreground">
        Select an image to adjust its position.
      </p>
    )
  }

  const { transform } = selected
  const isDefault = transformsEqual(transform, DEFAULT_TRANSFORM)

  return (
    <div className="space-y-5">
      <SectionTitle
        icon={Layers}
        action={
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={images.undo}
              disabled={!images.canUndo}
              title="Undo (Ctrl+Z)"
              aria-label="Undo"
            >
              <Undo2 className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={images.redo}
              disabled={!images.canRedo}
              title="Redo (Ctrl+Shift+Z)"
              aria-label="Redo"
            >
              <Redo2 className="size-3.5" />
            </Button>
          </div>
        }
      >
        Image Position
      </SectionTitle>

      <p className="rounded-lg bg-muted/60 px-3 py-2 text-[12px] leading-snug text-muted-foreground">
        These three values belong to <span className="font-medium text-foreground">{selected.name}</span> alone.
        Moving to another image loads its own settings.
      </p>

      <FieldRow
        label="Image scale"
        value={`${Math.round(transform.scale * 100)}%`}
        hint="How large the photo is inside the export frame — this changes the exported pixels."
      >
        <div className="flex items-center gap-2">
          <ZoomIn className="size-3.5 shrink-0 text-muted-foreground" />
          <Slider
            value={[transform.scale]}
            min={SCALE_MIN}
            max={SCALE_MAX}
            step={0.01}
            onValueChange={([value]) =>
              images.updateTransform(selected.id, { scale: value }, false)
            }
            onValueCommit={images.commitHistory}
            aria-label="Image scale"
          />
        </div>
      </FieldRow>

      <FieldRow label="Horizontal position" value={transform.offsetX.toFixed(1)}>
        <div className="flex items-center gap-2">
          <ArrowLeftRight className="size-3.5 shrink-0 text-muted-foreground" />
          <Slider
            value={[transform.offsetX]}
            min={-OFFSET_LIMIT}
            max={OFFSET_LIMIT}
            step={0.5}
            onValueChange={([value]) =>
              images.updateTransform(selected.id, { offsetX: value }, false)
            }
            onValueCommit={images.commitHistory}
            aria-label="Horizontal position"
          />
        </div>
      </FieldRow>

      <FieldRow
        label="Vertical position"
        value={transform.offsetY.toFixed(1)}
        hint="Positions are a percentage of the frame, so they hold at any export size."
      >
        <div className="flex items-center gap-2">
          <ArrowUpDown className="size-3.5 shrink-0 text-muted-foreground" />
          <Slider
            value={[transform.offsetY]}
            min={-OFFSET_LIMIT}
            max={OFFSET_LIMIT}
            step={0.5}
            onValueChange={([value]) =>
              images.updateTransform(selected.id, { offsetY: value }, false)
            }
            onValueCommit={images.commitHistory}
            aria-label="Vertical position"
          />
        </div>
      </FieldRow>

      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => images.resetTransform(selected.id)}
          disabled={isDefault}
        >
          <RotateCcw className="size-3.5" />
          Reset position
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            editor.setClipboard({ ...transform })
            toast('Transform copied', {
              description: 'Paste it onto another image, or apply it to all.',
              variant: 'success',
            })
          }}
        >
          <Copy className="size-3.5" />
          Copy transform
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!editor.clipboard}
          onClick={() => {
            if (editor.clipboard) images.updateTransform(selected.id, editor.clipboard, true)
          }}
        >
          <ClipboardPaste className="size-3.5" />
          Paste
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            images.applyTransformToAll(editor.clipboard ?? transform)
            toast('Applied to every image', {
              description: `${images.images.length} images now share this position.`,
              variant: 'success',
            })
          }}
        >
          <Layers className="size-3.5" />
          Apply to all
        </Button>
      </div>
    </div>
  )
}
