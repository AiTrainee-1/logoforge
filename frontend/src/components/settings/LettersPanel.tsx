/**
 * "Extra letters" for the batch editor.
 *
 * The automatic A/B/C label stays where it is; this panel adds any number of
 * extra letters or lines of text, placed anywhere on the photo. Every element
 * belongs to the selected image alone - switching images loads that image's
 * own set.
 */
import { Copy, Layers, Plus, Trash2, Type } from 'lucide-react'

import { ElementInspector } from '@/components/settings/ElementInspector'
import { Button } from '@/components/ui/button'
import { Badge, SectionTitle } from '@/components/ui/primitives'
import { useToast } from '@/components/ui/toast'
import { useStudio } from '@/hooks/useStudio'
import { cn } from '@/lib/utils'
import { ELEMENT_LIMIT, elementLabel, nextLetter } from '@/utils/overlays'

export function LettersPanel() {
  const { images } = useStudio()
  const { toast } = useToast()
  const selected = images.selected

  if (!selected) {
    return (
      <p className="rounded-lg bg-muted/60 p-3 text-[13px] text-muted-foreground">
        Select an image to add letters to it.
      </p>
    )
  }

  const elements = selected.overlays
  const active = elements.find((element) => element.id === images.selectedOverlayId) ?? null
  const full = elements.length >= ELEMENT_LIMIT

  return (
    <div className="space-y-5">
      <SectionTitle
        icon={Type}
        action={
          elements.length > 0 ? (
            <Badge variant="muted">{elements.length}</Badge>
          ) : null
        }
      >
        Extra Letters
      </SectionTitle>

      <p className="rounded-lg bg-muted/60 px-3 py-2 text-[12px] leading-snug text-muted-foreground">
        These belong to <span className="font-medium text-foreground">{selected.name}</span> only.
        Drag them on the canvas, or resize and rotate with the handles.
      </p>

      <div className="grid grid-cols-2 gap-2">
        <Button
          size="sm"
          disabled={full}
          onClick={() =>
            images.addOverlay(selected.id, {
              text: nextLetter(elements),
              fontSize: 56,
              x: 30 + elements.length * 8,
              y: 80,
            })
          }
        >
          <Plus className="size-3.5" />
          Add letter
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={full}
          onClick={() =>
            images.addOverlay(selected.id, {
              text: 'Your text',
              fontSize: 40,
              x: 50,
              y: 50,
            })
          }
        >
          <Type className="size-3.5" />
          Add text
        </Button>
      </div>

      {full ? (
        <p className="text-[11px] text-muted-foreground">
          That is the maximum of {ELEMENT_LIMIT} elements for one image.
        </p>
      ) : null}

      {elements.length > 0 ? (
        <ul className="space-y-1.5">
          {elements.map((element) => (
            <li key={element.id}>
              <div
                className={cn(
                  'flex items-center gap-2 rounded-lg border p-1.5 pl-2.5 transition-colors',
                  element.id === images.selectedOverlayId
                    ? 'border-primary/60 bg-primary/5'
                    : 'border-border bg-card hover:bg-accent/40',
                )}
              >
                <button
                  type="button"
                  onClick={() => images.selectOverlay(element.id)}
                  className="min-w-0 flex-1 truncate text-left text-[13px] font-medium"
                >
                  {elementLabel(element)}
                </button>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {Math.round(element.x)},{Math.round(element.y)}
                </span>
                <button
                  type="button"
                  aria-label="Duplicate"
                  className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => images.duplicateOverlay(selected.id, element.id)}
                >
                  <Copy className="size-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Remove"
                  className="rounded p-1 text-muted-foreground transition-colors hover:text-destructive"
                  onClick={() => images.removeOverlay(selected.id, element.id)}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed border-border p-3 text-center text-[12px] text-muted-foreground">
          No extra letters on this image yet.
        </p>
      )}

      {active ? (
        <div className="space-y-4 rounded-xl border border-border bg-card p-3">
          <p className="text-[13px] font-semibold">Selected element</p>
          <ElementInspector
            element={active}
            onChange={(patch, commit) =>
              images.updateOverlay(selected.id, active.id, patch, commit)
            }
            onCommit={images.commitHistory}
          />
        </div>
      ) : null}

      {elements.length > 0 ? (
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => images.clearOverlays(selected.id)}
          >
            <Trash2 className="size-3.5" />
            Clear
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={images.images.length < 2}
            onClick={() => {
              images.copyOverlaysToAll(selected.id)
              toast('Copied to every image', {
                description: `${elements.length} element${elements.length === 1 ? '' : 's'} placed on ${images.images.length - 1} other image${images.images.length === 2 ? '' : 's'}.`,
                variant: 'success',
              })
            }}
          >
            <Layers className="size-3.5" />
            Copy to all
          </Button>
        </div>
      ) : null}
    </div>
  )
}
