/**
 * Guided entry point for the Catalog Composer: upload one product image,
 * paste catalog text, get an automatically laid out catalog sheet.
 *
 * This is only a starting point. Once the slide exists (the title/
 * description/details/price + image elements are created), this panel is
 * gone and the ordinary composer canvas/sidebar - drag, resize, font
 * controls, undo, export - take over completely. There is no separate
 * editor here.
 */
import { Check, ImagePlus, Sparkles } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/primitives'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/toast'
import type { UseCompose } from '@/hooks/useCompose'
import { useFontSync } from '@/hooks/useFontSync'
import { parseCatalogText } from '@/utils/catalogParser'
import { cn } from '@/lib/utils'

const SECTION_LABELS = [
  { key: 'title', label: 'Title' },
  { key: 'description', label: 'Description' },
  { key: 'details', label: 'Details' },
  { key: 'price', label: 'Price' },
] as const

const PAGE_SIZES = [
  {
    preset: 'catalog-large' as const,
    title: 'Catalog sheet',
    dims: '1240 × 1754',
    hint: 'Portrait · high-resolution · recommended',
    recommended: true,
  },
  {
    preset: 'catalog' as const,
    title: 'Catalog card',
    dims: '925 × 1131',
    hint: 'Portrait · compact',
    recommended: false,
  },
]

export function CatalogSetup({ compose }: { compose: UseCompose }) {
  const [assetId, setAssetId] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [preset, setPreset] = useState<'catalog' | 'catalog-large'>('catalog-large')
  const [detailMarkers, setDetailMarkers] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const { toast } = useToast()
  const { serifDisplayName } = useFontSync()

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
    const result = compose.createCatalogSlide(text, assetId, { preset, detailMarkers })
    if (result?.fontSizeReduced) {
      toast('Font size reduced to fit', {
        description:
          'The text needed more room than the default size allowed, so it shrank automatically to leave the image a sane amount of space. Change it any time from the text panel.',
      })
    }
  }

  return (
    <div className="flex w-full max-w-lg flex-col gap-6 rounded-2xl border border-border bg-card p-7 shadow-lg">
      <div className="space-y-1.5 text-center">
        <p className="text-[17px] font-semibold tracking-tight">Catalog Studio</p>
        <p className="text-[12.5px] leading-relaxed text-muted-foreground">
          Upload one product photo, paste your catalog text, and a page is laid out
          automatically — title, description, details and price each become their own text box,
          independently editable and styleable. Everything stays adjustable afterwards.
        </p>
        {serifDisplayName ? (
          <p className="text-[11px] text-muted-foreground">
            Catalog font: <span className="font-medium">{serifDisplayName}</span> — the same face
            in the preview and the export.
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label className="text-muted-foreground">Page size</Label>
        <div className="grid grid-cols-2 gap-2">
          {PAGE_SIZES.map((size) => {
            const selected = preset === size.preset
            return (
              <button
                key={size.preset}
                type="button"
                onClick={() => setPreset(size.preset)}
                className={cn(
                  'relative flex flex-col items-start gap-0.5 rounded-xl border p-3 text-left transition-colors',
                  selected
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                    : 'border-border hover:border-primary/40',
                )}
              >
                {selected ? (
                  <span className="absolute top-2 right-2 grid size-4 place-items-center rounded-full bg-primary text-primary-foreground">
                    <Check className="size-2.5" />
                  </span>
                ) : null}
                <span className="text-[13px] font-semibold">{size.title}</span>
                <span className="font-mono text-[12px] text-muted-foreground">{size.dims}</span>
                <span className="text-[10.5px] text-muted-foreground">{size.hint}</span>
              </button>
            )
          })}
        </div>
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

      <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 px-3 py-2.5">
        <div>
          <p className="text-[12.5px] font-medium">Detail markers</p>
          <p className="text-[11px] text-muted-foreground">
            A subtle dash before each Details line (Dimensions, Weight, …). Off by default.
          </p>
        </div>
        <Switch
          checked={detailMarkers}
          onCheckedChange={setDetailMarkers}
          aria-label="Add subtle markers before each detail line"
        />
      </div>

      <Button size="lg" disabled={!canCreate} onClick={create}>
        <Sparkles className="size-4" />
        Create Catalog
      </Button>
    </div>
  )
}
