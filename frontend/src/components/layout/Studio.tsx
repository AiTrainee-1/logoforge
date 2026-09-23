/** The editor screen: image rail, canvas and settings. */
import { useCallback, useEffect, useState } from 'react'

import { CanvasNavigation } from '@/components/editor/CanvasNavigation'
import { EditorCanvas } from '@/components/editor/EditorCanvas'
import { ImageRail } from '@/components/editor/ImageRail'
import { Header, type Page } from '@/components/layout/Header'
import { ResultsDialog } from '@/components/results/ResultsDialog'
import { SettingsAccordion, SettingsSidebar } from '@/components/settings/SettingsSidebar'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { useKeyboardNavigation } from '@/hooks/useKeyboardNavigation'
import { useStudio } from '@/hooks/useStudio'
import { useToast } from '@/components/ui/toast'

export function Studio({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const { images, editor, processing, resetAll } = useStudio()
  const { toast } = useToast()
  const [fullscreen, setFullscreen] = useState(false)
  const [resultsOpen, setResultsOpen] = useState(false)

  const selected = images.selected

  useEffect(() => {
    if (processing.phase === 'done') {
      setResultsOpen(true)
      toast('Processing finished', {
        description: `${processing.completed} image${processing.completed === 1 ? '' : 's'} ready to download.`,
        variant: 'success',
      })
    }
  }, [processing.completed, processing.phase, toast])

  const nudge = useCallback(
    (deltaX: number, deltaY: number) => {
      if (!selected) return
      images.updateTransform(
        selected.id,
        {
          offsetX: selected.transform.offsetX + deltaX,
          offsetY: selected.transform.offsetY + deltaY,
        },
        false,
      )
    },
    [images, selected],
  )

  const scale = useCallback(
    (delta: number) => {
      if (!selected) return
      images.updateTransform(selected.id, { scale: selected.transform.scale + delta }, false)
    },
    [images, selected],
  )

  useKeyboardNavigation({
    enabled: images.images.length > 0 && !resultsOpen,
    onPrevious: images.previous,
    onNext: images.next,
    onNudge: nudge,
    onScale: scale,
    onCommit: images.commitHistory,
    onReset: () => selected && images.resetTransform(selected.id),
    onUndo: images.undo,
    onRedo: images.redo,
    onToggleFullscreen: () => setFullscreen((value) => !value),
    onToggleBefore: () => editor.setShowBefore(!editor.showBefore),
  })

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh lg:overflow-hidden">
      <Header
        page="studio"
        onNavigate={onNavigate}
        onReset={() => void resetAll()}
        canReset={images.images.length > 0 || Boolean(images.jobId)}
      />

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="hidden w-[288px] shrink-0 border-r border-border bg-card/40 p-4 lg:flex lg:flex-col">
          <ImageRail className="flex-1" />
        </aside>

        <main className="flex min-h-0 flex-1 flex-col gap-3 p-4 lg:overflow-hidden">
          <EditorCanvas className="h-[46vh] min-h-64 shrink-0 lg:h-auto lg:min-h-0 lg:flex-1" />
          <CanvasNavigation onFullscreen={() => setFullscreen(true)} className="shrink-0" />

          <div className="flex flex-col gap-4 lg:hidden">
            <ImageRail />
            <SettingsAccordion />
          </div>
        </main>

        <SettingsSidebar className="hidden w-[352px] shrink-0 border-l border-border bg-card/40 p-4 lg:flex" />
      </div>

      {processing.phase === 'done' && !resultsOpen ? (
        <div className="fixed right-4 bottom-4 z-40">
          <Button size="lg" onClick={() => setResultsOpen(true)}>
            View {processing.completed} results
          </Button>
        </div>
      ) : null}

      <Dialog open={fullscreen} onOpenChange={setFullscreen}>
        <DialogContent className="flex h-[92vh] w-[96vw] max-w-none flex-col gap-3">
          <EditorCanvas className="min-h-0 flex-1" />
          <CanvasNavigation />
        </DialogContent>
      </Dialog>

      <ResultsDialog open={resultsOpen} onOpenChange={setResultsOpen} />
    </div>
  )
}
