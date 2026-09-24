/**
 * Guided entry point for the Catalog Composer: upload one product image,
 * paste catalog text, get an automatically laid out 925x1131 slide.
 *
 * This is only a starting point. Once the slide exists (the text box +
 * image elements are created), this panel is gone and the ordinary composer
 * canvas/sidebar - drag, resize, font controls, undo, export - take over
 * completely. There is no separate editor here.
 */
import { ImagePlus, Sparkles } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/primitives'
import { useToast } from '@/components/ui/toast'
import type { UseCompose } from '@/hooks/useCompose'
import { useFontSync } from '@/hooks/useFontSync'
import { parseCatalogText } from '@/utils/catalogParser'

const SECTION_LABELS = [
  { key: 'title', label: 'Title' },
  { key: 'description', label: 'Description' },
  { key: 'details', label: 'Details' },
  { key: 'price', label: 'Price' },
] as const

export function CatalogSetup({ compose }: { compose: UseCompose }) {
  const [assetId, setAssetId] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const { toast } = useToast()
  const { displayName } = useFontSync()

  const sections = useMemo(() => parseCatalogText(text), [text])
  const canCreate = Boolean(assetId) && text.trim().length > 0 && !busy

  const handleFile = async (file: File) => {
    setBusy(true)
    const asset = await compose.uploadCatalogImage(file)
    setBusy(false)
    if (!asset) return
    setAssetId(asset.id)
    setPreviewUrl(asset.previewUrl)
  }

  const create = () => {
    if (!assetId || !text.trim()) return
    const result = compose.createCatalogSlide(text, assetId)
    if (result?.fontSizeReduced) {
      toast('Font size reduced to fit', {
        description:
          'The text needed more room than the default size allowed, so it shrank automatically to leave the image a sane amount of space. Change it any time from the text panel.',
      })
    }
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-5 rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="space-y-1 text-center">
        <p className="text-[15px] font-semibold">Catalog slide</p>
        <p className="text-[12px] text-muted-foreground">
          Upload one product photo, paste your catalog text, and a 925 × 1131 slide is laid out
          automatically — title, description, details and price each become their own text box,
          independently editable and styleable. Everything stays adjustable afterwards.
        </p>
        {displayName ? (
          <p className="text-[11px] text-muted-foreground">
            Font: <span className="font-medium">{displayName}</span> — the one face the whole app
            renders with, so the preview and the export always match exactly.
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label className="text-muted-foreground">1. Product image</Label>
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="flex h-32 w-full items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-muted/40 transition-colors hover:border-primary/60"
        >
          {previewUrl ? (
            <img src={previewUrl} alt="" className="size-full object-contain p-2" />
          ) : (
            <span className="flex flex-col items-center gap-1.5 text-muted-foreground">
              <ImagePlus className="size-5" />
              <span className="text-[12px]">{busy ? 'Uploading…' : 'Click to upload'}</span>
            </span>
          )}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*,.heic,.heif,.avif"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void handleFile(file)
            event.target.value = ''
          }}
        />
      </div>

      <div className="space-y-2">
        <Label className="text-muted-foreground">2. Catalog text</Label>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={8}
          spellCheck={false}
          placeholder={
            'Title\n\nDescription...\n\nMaterial: ...\nDimensions: ...\nWeight: ...\nPrice: ...'
          }
          className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-[13px] shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        />
        <p className="text-[11px] text-muted-foreground">
          Paste as much as you like — title, description, material, dimensions, weight, price.
          Nothing is rearranged, only routed into sections and wrapped to fit.
        </p>
        {text.trim() ? (
          <div className="flex flex-wrap gap-1.5">
            {SECTION_LABELS.map(({ key, label }) => {
              const detected = sections[key].trim().length > 0
              return (
                <span
                  key={key}
                  className={
                    'rounded-full border px-2 py-0.5 text-[10px] font-medium ' +
                    (detected
                      ? 'border-primary/40 bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground/60')
                  }
                >
                  {label}
                  {detected ? '' : ' (none)'}
                </span>
              )
            })}
          </div>
        ) : null}
      </div>

      <Button size="lg" disabled={!canCreate} onClick={create}>
        <Sparkles className="size-4" />
        Create slide
      </Button>
    </div>
  )
}
