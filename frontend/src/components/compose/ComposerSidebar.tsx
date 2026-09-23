/** Canvas settings, the layer list, the element inspector and the export. */
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Download,
  FileImage,
  Image as ImageIcon,
  Layers,
  Loader2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Type,
} from 'lucide-react'
import { useRef } from 'react'

import { ElementInspector } from '@/components/settings/ElementInspector'
import { Button } from '@/components/ui/button'
import { Badge, FieldRow, Input, Label, SectionTitle } from '@/components/ui/primitives'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { CARD_PRESETS, type UseCompose } from '@/hooks/useCompose'
import { api } from '@/services/api'
import { cn } from '@/lib/utils'
import type { CardPreset } from '@/types/editor'
import { formatBytes, formatDimensions } from '@/utils/format'
import { elementLabel } from '@/utils/overlays'

export function ComposerSidebar({
  compose,
  className,
}: {
  compose: UseCompose
  className?: string
}) {
  const logoInput = useRef<HTMLInputElement>(null)
  const { canvas, elements } = compose

  return (
    <aside className={cn('scrollbar-thin space-y-6 overflow-y-auto', className)}>
      {/* ---------------------------------------------------------------- */}
      <section className="space-y-4">
        <SectionTitle icon={FileImage}>Canvas</SectionTitle>

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant={canvas.mode === 'image' ? 'default' : 'outline'}
            size="sm"
            onClick={() => compose.setMode('image')}
          >
            <ImageIcon className="size-3.5" />
            The image
          </Button>
          <Button
            variant={canvas.mode === 'card' ? 'default' : 'outline'}
            size="sm"
            onClick={() => compose.setMode('card')}
          >
            <FileImage className="size-3.5" />
            A card
          </Button>
        </div>

        <p className="rounded-lg bg-muted/60 px-3 py-2 text-[12px] leading-snug text-muted-foreground">
          {canvas.mode === 'image'
            ? 'The canvas is your photo at its own resolution — the export comes back the same size, in the same format.'
            : 'The canvas is a page. Your photo sits on it as an element you can move and resize.'}
        </p>

        {canvas.mode === 'card' ? (
          <>
            <FieldRow label="Page size">
              <Select
                value={canvas.preset}
                onValueChange={(value) => compose.setCanvas({ preset: value as CardPreset })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CARD_PRESETS).map(([key, preset]) => (
                    <SelectItem key={key} value={key}>
                      {preset.label} · {preset.width}×{preset.height}
                    </SelectItem>
                  ))}
                  <SelectItem value="custom">Custom size</SelectItem>
                </SelectContent>
              </Select>
            </FieldRow>

            {canvas.preset === 'custom' ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Width</Label>
                  <Input
                    type="number"
                    min={16}
                    max={10000}
                    value={canvas.width}
                    onChange={(event) =>
                      compose.setCanvas({ width: Number(event.target.value) || 16 })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Height</Label>
                  <Input
                    type="number"
                    min={16}
                    max={10000}
                    value={canvas.height}
                    onChange={(event) =>
                      compose.setCanvas({ height: Number(event.target.value) || 16 })
                    }
                  />
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-muted-foreground">Background</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={canvas.background}
                    disabled={canvas.transparent}
                    onChange={(event) =>
                      compose.setCanvas({ background: event.target.value.toUpperCase() })
                    }
                    className="size-9 cursor-pointer rounded-lg border border-input bg-card p-1 disabled:opacity-40"
                    aria-label="Card background colour"
                  />
                  <span className="font-mono text-[12px] text-muted-foreground">
                    {canvas.background}
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Transparent</Label>
                <Switch
                  checked={canvas.transparent}
                  onCheckedChange={(checked) => compose.setCanvas({ transparent: checked })}
                  aria-label="Transparent background"
                />
              </div>
            </div>
          </>
        ) : null}
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="space-y-3">
        <SectionTitle
          icon={Layers}
          action={elements.length ? <Badge variant="muted">{elements.length}</Badge> : null}
        >
          Elements
        </SectionTitle>

        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" onClick={() => compose.addText()}>
            <Type className="size-3.5" />
            Add text
          </Button>
          <Button variant="outline" size="sm" onClick={() => logoInput.current?.click()}>
            <ImageIcon className="size-3.5" />
            Add logo
          </Button>
        </div>
        <input
          ref={logoInput}
          type="file"
          accept=".png,.jpg,.jpeg,.webp,.bmp,.gif"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void compose.uploadAsset(file)
            event.target.value = ''
          }}
        />

        {elements.length > 0 ? (
          <ul className="space-y-1.5">
            {[...elements].reverse().map((element) => (
              <li
                key={element.id}
                className={cn(
                  'flex items-center gap-1 rounded-lg border p-1.5 pl-2.5 transition-colors',
                  element.id === compose.selectedId
                    ? 'border-primary/60 bg-primary/5'
                    : 'border-border bg-card hover:bg-accent/40',
                )}
              >
                <button
                  type="button"
                  onClick={() => compose.select(element.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  {element.type === 'image' ? (
                    <ImageIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <Type className="size-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="truncate text-[13px] font-medium">
                    {elementLabel(element, compose.assetMap[element.assetId])}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label="Bring forward"
                  className="rounded p-1 text-muted-foreground hover:text-foreground"
                  onClick={() => compose.moveLayer(element.id, 1)}
                >
                  <ArrowUp className="size-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Send backward"
                  className="rounded p-1 text-muted-foreground hover:text-foreground"
                  onClick={() => compose.moveLayer(element.id, -1)}
                >
                  <ArrowDown className="size-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Duplicate"
                  className="rounded p-1 text-muted-foreground hover:text-foreground"
                  onClick={() => compose.duplicate(element.id)}
                >
                  <Copy className="size-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Remove"
                  className="rounded p-1 text-muted-foreground hover:text-destructive"
                  onClick={() => compose.remove(element.id)}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed border-border p-3 text-center text-[12px] text-muted-foreground">
            Nothing placed yet.
          </p>
        )}

        {compose.assets.length > 1 ? (
          <div className="space-y-1.5 pt-1">
            <Label className="text-muted-foreground">Uploaded files</Label>
            {compose.assets.map((asset) => (
              <div
                key={asset.id}
                className="flex items-center gap-2 rounded-lg border border-border bg-card p-1.5"
              >
                <img
                  src={asset.previewUrl}
                  alt=""
                  className="size-8 shrink-0 rounded object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-medium">{asset.name}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {formatDimensions(asset.width, asset.height)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Place on canvas"
                  onClick={() => compose.addImageElement(asset.id)}
                >
                  <Layers className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Delete file"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => void compose.removeAsset(asset.id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      {/* ---------------------------------------------------------------- */}
      {compose.selected ? (
        <section className="space-y-4 rounded-xl border border-border bg-card p-3">
          <p className="text-[13px] font-semibold">Selected element</p>
          <ElementInspector
            element={compose.selected}
            onChange={(patch, commitNow) =>
              compose.update(compose.selected!.id, patch, commitNow)
            }
            onCommit={compose.commit}
          />
        </section>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      <section className="space-y-4">
        <SectionTitle icon={Download}>Export</SectionTitle>

        <FieldRow label="File format">
          <Select
            value={canvas.outputFormat}
            onValueChange={(value) =>
              compose.setCanvas({ outputFormat: value as typeof canvas.outputFormat })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">
                {canvas.mode === 'image' ? 'Same as the original' : 'PNG (lossless)'}
              </SelectItem>
              <SelectItem value="png">PNG · lossless</SelectItem>
              <SelectItem value="jpeg">JPEG</SelectItem>
              <SelectItem value="webp">WebP</SelectItem>
            </SelectContent>
          </Select>
        </FieldRow>

        <FieldRow
          label="Quality"
          value={canvas.quality === 100 ? 'Maximum' : `${canvas.quality}`}
          hint="At 100 the JPEG encoder uses 4:4:4 colour and WebP stays lossless."
        >
          <Slider
            value={[canvas.quality]}
            min={60}
            max={100}
            step={1}
            onValueChange={([value]) => compose.setCanvas({ quality: value })}
            aria-label="Export quality"
          />
        </FieldRow>

        <div className="space-y-2 rounded-xl border border-border bg-card p-3 text-[12px]">
          <div className="flex items-center justify-between">
            <span className="font-semibold">Output</span>
            <Badge variant={canvas.mode === 'image' ? 'success' : 'muted'}>
              {canvas.mode === 'image' ? 'Original size' : 'Card'}
            </Badge>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Dimensions</span>
            <span className="font-mono">
              {formatDimensions(compose.frame.width, compose.frame.height)}
            </span>
          </div>
          <p className="flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
            <ShieldCheck className="mt-px size-3.5 shrink-0 text-success" />
            {canvas.mode === 'image'
              ? 'The photo is never resized or resampled — only what you place on it is drawn.'
              : 'Elements are drawn once onto a fresh page at this exact size.'}
          </p>
        </div>

        <Button
          className="w-full"
          size="lg"
          disabled={compose.isExporting || (canvas.mode === 'image' && !compose.baseImage)}
          onClick={() => void compose.exportCanvas()}
        >
          {compose.isExporting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Rendering…
            </>
          ) : (
            <>
              <Sparkles className="size-4" />
              Render canvas
            </>
          )}
        </Button>

        {compose.result ? (
          <div className="space-y-2 rounded-xl border border-success/40 bg-success/5 p-3">
            <p className="text-[13px] font-semibold">{compose.result.filename}</p>
            <p className="font-mono text-[11px] text-muted-foreground">
              {formatDimensions(compose.result.width, compose.result.height)} ·{' '}
              {compose.result.format} · {formatBytes(compose.result.size)}
              {compose.result.passthrough ? ' · original bytes' : ''}
            </p>
            <Button asChild className="w-full" size="sm">
              <a
                href={api.fileUrl(compose.result.downloadUrl)}
                download={compose.result.filename}
              >
                <Download className="size-3.5" />
                Download
              </a>
            </Button>
          </div>
        ) : null}

        <p className="text-center text-[11px] text-muted-foreground">
          Images are processed temporarily and are not permanently stored.
        </p>
      </section>
    </aside>
  )
}
