/** Export format, quality and the "what will I actually get" summary. */
import { Download, Loader2, ShieldCheck, Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge, FieldRow, Label, Progress, SectionTitle } from '@/components/ui/primitives'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { useStudio } from '@/hooks/useStudio'
import type { ExportFormat, FitMode } from '@/types/editor'
import { formatDimensions } from '@/utils/format'
import { EXPORT_LABELS, outputInfo } from '@/utils/transforms'

const FORMATS: { value: ExportFormat; hint: string }[] = [
  { value: 'original', hint: 'Keeps the source size and format' },
  { value: 'instagram-portrait', hint: '1080 × 1350' },
  { value: 'instagram-square', hint: '1080 × 1080' },
  { value: 'instagram-landscape', hint: '1080 × 566' },
]

export function ExportPanel() {
  const { images, editor, processing, process } = useStudio()
  const settings = editor.exportSettings
  const selected = images.selected
  const busy = processing.phase === 'processing'

  const info = selected
    ? outputInfo(
        { width: selected.width, height: selected.height, format: selected.format },
        settings,
      )
    : null

  const lossy = info?.format === 'JPEG' || (info?.format === 'WEBP' && settings.quality < 100)

  return (
    <div className="space-y-5">
      <SectionTitle icon={Download}>Export</SectionTitle>

      <FieldRow label="Output size">
        <Select
          value={settings.format}
          onValueChange={(value) => editor.setExportSettings({ format: value as ExportFormat })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FORMATS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {EXPORT_LABELS[item.value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldRow>

      {settings.format !== 'original' ? (
        <FieldRow label="Fit" hint="Cover fills the frame and crops; contain fits the whole image in.">
          <Select
            value={settings.fit}
            onValueChange={(value) => editor.setExportSettings({ fit: value as FitMode })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cover">Cover (crop to fill)</SelectItem>
              <SelectItem value="contain">Contain (fit inside)</SelectItem>
            </SelectContent>
          </Select>
        </FieldRow>
      ) : null}

      <FieldRow
        label="Quality"
        value={settings.quality === 100 ? 'Maximum' : `${settings.quality}`}
        hint={
          settings.quality === 100
            ? 'JPEG is written at maximum quality with 4:4:4 colour; PNG and WebP stay lossless.'
            : 'Lower values shrink the file but discard detail.'
        }
      >
        <Slider
          value={[settings.quality]}
          min={60}
          max={100}
          step={1}
          onValueChange={([value]) => editor.setExportSettings({ quality: value })}
          aria-label="Export quality"
        />
      </FieldRow>

      <div className="flex items-center justify-between gap-3">
        <div>
          <Label className="text-muted-foreground">Keep transparency</Label>
          <p className="text-[11px] text-muted-foreground">PNG and WebP only</p>
        </div>
        <Switch
          checked={settings.keepTransparency}
          onCheckedChange={(checked) => editor.setExportSettings({ keepTransparency: checked })}
          aria-label="Keep transparency"
        />
      </div>

      {info && selected ? (
        <div className="space-y-2 rounded-xl border border-border bg-card p-3">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-semibold">Output</p>
            <Badge variant={info.resized ? 'muted' : 'success'}>
              {info.resized ? 'Resized' : 'Original size'}
            </Badge>
          </div>
          <dl className="grid grid-cols-2 gap-y-1 text-[12px]">
            <dt className="text-muted-foreground">Preset</dt>
            <dd className="text-right font-medium">{EXPORT_LABELS[settings.format]}</dd>
            <dt className="text-muted-foreground">Dimensions</dt>
            <dd className="text-right font-mono">{formatDimensions(info.width, info.height)}</dd>
            <dt className="text-muted-foreground">Format</dt>
            <dd className="text-right font-medium">{info.format}</dd>
            <dt className="text-muted-foreground">Quality</dt>
            <dd className="text-right font-medium">
              {settings.quality === 100 ? 'Maximum' : settings.quality}
            </dd>
          </dl>
          <p className="flex items-start gap-1.5 pt-1 text-[11px] leading-snug text-muted-foreground">
            <ShieldCheck className="mt-px size-3.5 shrink-0 text-success" />
            {info.resized
              ? 'Resampled once, at the end, with Lanczos filtering.'
              : lossy
                ? 'Decoded once and re-encoded once at maximum quality — no extra generation loss.'
                : 'Written back losslessly at the original resolution.'}
          </p>
        </div>
      ) : null}

      {busy ? (
        <div className="space-y-2">
          <Progress value={processing.progress} />
          <p className="text-center text-[12px] text-muted-foreground">
            Processing {processing.completed} of {processing.total}…
          </p>
        </div>
      ) : null}

      <Button
        className="w-full"
        size="lg"
        disabled={busy || images.images.length === 0}
        onClick={() => void process()}
      >
        {busy ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Processing…
          </>
        ) : (
          <>
            <Sparkles className="size-4" />
            Process {images.images.length || ''} {images.images.length === 1 ? 'image' : 'images'}
          </>
        )}
      </Button>

      <p className="text-center text-[11px] text-muted-foreground">
        Images are processed temporarily and are not permanently stored.
      </p>
    </div>
  )
}
