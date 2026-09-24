/**
 * Upload an image, drop text and logos onto it, export at full resolution.
 *
 * The same page covers both jobs: the canvas can be the photo itself, or a
 * page/card the photo sits on.
 */
import { Minus, Plus, Redo2, Trash2, Undo2, UploadCloud } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { ComposerCanvas } from '@/components/compose/ComposerCanvas'
import { ComposerSidebar } from '@/components/compose/ComposerSidebar'
import { Header, type Page } from '@/components/layout/Header'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import type { UseCompose } from '@/hooks/useCompose'

const IMAGE_ACCEPT =
  'image/*,.jpg,.jpeg,.png,.webp,.gif,.bmp,.tif,.tiff,.heic,.heif,.avif'

export function ComposerPage({
  compose,
  onNavigate,
}: {
  compose: UseCompose
  onNavigate: (page: Page) => void
}) {
  const baseInput = useRef<HTMLInputElement>(null)
  const { toast } = useToast()
  // While the guided catalog panel is up, the top toolbar's own "Upload
  // image" button must not be usable - it calls uploadBase(), which (in card
  // mode) auto-places a generically-positioned image element and would
  // silently bypass the catalog auto-layout the guided panel is about to run.
  const catalogSetup =
    compose.canvas.mode === 'card' &&
    compose.canvas.preset === 'catalog' &&
    compose.elements.length === 0

  // Element shortcuts. They stay quiet while a field has focus.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      if (target instanceof HTMLElement) {
        const tag = target.tagName.toLowerCase()
        if (
          tag === 'input' ||
          tag === 'textarea' ||
          tag === 'select' ||
          target.isContentEditable ||
          target.getAttribute('role') === 'slider'
        ) {
          return
        }
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) compose.redo()
        else compose.undo()
        return
      }
      if (event.metaKey || event.ctrlKey) return

      const selected = compose.selectedId
      if (!selected) return

      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        compose.remove(selected)
        return
      }

      const step = event.shiftKey ? 5 : 1
      const element = compose.selected
      if (!element) return
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        compose.update(selected, { x: element.x - step })
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        compose.update(selected, { x: element.x + step })
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        compose.update(selected, { y: element.y - step })
      } else if (event.key === 'ArrowDown') {
        event.preventDefault()
        compose.update(selected, { y: element.y + step })
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [compose])

  const acceptBase = (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/') && !/\.(jpe?g|png|webp|gif|bmp|tiff?|heic|heif|avif)$/i.test(file.name)) {
      toast('That file is not an image', {
        description: 'Upload a JPG, PNG, WebP or TIFF file.',
        variant: 'error',
      })
      return
    }
    void compose.uploadBase(file)
  }

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh lg:overflow-hidden">
      <Header
        page="composer"
        onNavigate={onNavigate}
        onReset={() => void compose.reset()}
        canReset={Boolean(compose.jobId)}
      />

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <main
          className="flex min-h-0 flex-1 flex-col gap-3 p-4 lg:overflow-hidden"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault()
            // The guided panel is the only accepted way to add the product
            // image while it is showing - a stray drop must not bypass it.
            if (catalogSetup) return
            acceptBase(event.dataTransfer.files)
          }}
        >
          {!catalogSetup ? (
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Button size="sm" onClick={() => baseInput.current?.click()}>
                  <UploadCloud className="size-3.5" />
                  {compose.baseImage ? 'Replace image' : 'Upload image'}
                </Button>
                <input
                  ref={baseInput}
                  type="file"
                  accept={IMAGE_ACCEPT}
                  className="hidden"
                  onChange={(event) => {
                    acceptBase(event.target.files)
                    event.target.value = ''
                  }}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={compose.undo}
                  disabled={!compose.canUndo}
                  title="Undo (Ctrl+Z)"
                  aria-label="Undo"
                >
                  <Undo2 className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={compose.redo}
                  disabled={!compose.canRedo}
                  title="Redo (Ctrl+Shift+Z)"
                  aria-label="Redo"
                >
                  <Redo2 className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={!compose.selectedId}
                  onClick={() => compose.selectedId && compose.remove(compose.selectedId)}
                  title="Delete the selected element"
                  aria-label="Delete element"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>

              <div className="flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => compose.setViewZoom(compose.viewZoom - 0.1)}
                  aria-label="Zoom out the view"
                >
                  <Minus className="size-3.5" />
                </Button>
                <button
                  type="button"
                  onClick={() => compose.setViewZoom(1)}
                  className="w-14 font-mono text-[12px] tabular-nums text-muted-foreground transition-colors hover:text-foreground"
                  title="This view zoom never changes the export"
                >
                  {Math.round(compose.viewZoom * 100)}%
                </button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => compose.setViewZoom(compose.viewZoom + 0.1)}
                  aria-label="Zoom in the view"
                >
                  <Plus className="size-3.5" />
                </Button>
              </div>
            </div>
          ) : null}

          <ComposerCanvas
            compose={compose}
            className="h-[52vh] min-h-72 shrink-0 lg:h-auto lg:min-h-0 lg:flex-1"
          />
        </main>

        {!catalogSetup ? (
          <ComposerSidebar
            compose={compose}
            className="w-full shrink-0 border-t border-border bg-card/40 p-4 lg:w-[364px] lg:border-t-0 lg:border-l"
          />
        ) : null}
      </div>
    </div>
  )
}
