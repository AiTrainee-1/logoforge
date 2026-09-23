/** Results: individual downloads and the ZIP of the exact same files. */
import { AlertTriangle, CheckCircle2, Download, FileArchive, RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/primitives'
import { useStudio } from '@/hooks/useStudio'
import { api } from '@/services/api'
import { formatBytes, formatDimensions } from '@/utils/format'

export function ResultsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { processing, process } = useStudio()
  const succeeded = processing.results.filter((entry) => entry.status === 'completed')
  const failed = processing.results.filter((entry) => entry.status === 'failed')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-success" />
            {succeeded.length} image{succeeded.length === 1 ? '' : 's'} ready
          </DialogTitle>
          <DialogDescription>
            The ZIP contains exactly these files — packaged, never re-encoded.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="lg" disabled={succeeded.length === 0}>
            <a href={processing.zipUrl ?? '#'} download>
              <FileArchive className="size-4" />
              Download all as ZIP
            </a>
          </Button>
          <Button variant="outline" onClick={() => void process()}>
            <RefreshCw className="size-4" />
            Process again
          </Button>
        </div>

        {failed.length > 0 ? (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-[13px]">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div>
              <p className="font-medium">
                {failed.length} image{failed.length === 1 ? '' : 's'} could not be processed
              </p>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                {failed.map((entry) => (
                  <li key={entry.imageId}>
                    {entry.sourceName} — {entry.error}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}

        <ul className="scrollbar-thin -mr-2 max-h-[46vh] space-y-2 overflow-y-auto pr-2">
          {succeeded.map((entry) => (
            <li
              key={entry.imageId}
              className="flex items-center gap-3 rounded-lg border border-border bg-card p-2.5"
            >
              <Badge>{entry.label}</Badge>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">{entry.filename}</p>
                <p className="font-mono text-[11px] text-muted-foreground">
                  {formatDimensions(entry.width, entry.height)} · {entry.format} ·{' '}
                  {formatBytes(entry.size)}
                  {entry.passthrough ? ' · original bytes' : ''}
                </p>
                {entry.notes?.length ? (
                  <p className="text-[11px] text-muted-foreground">{entry.notes.join(' ')}</p>
                ) : null}
              </div>
              <Button asChild variant="outline" size="sm">
                <a href={api.fileUrl(entry.downloadUrl ?? '')} download={entry.filename ?? true}>
                  <Download className="size-3.5" />
                  Download
                </a>
              </Button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
