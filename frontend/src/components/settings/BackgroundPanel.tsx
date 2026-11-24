/**
 * What fills the frame where the photo doesn't reach: a fixed colour, or
 * "Match background", which continues each photo's own backdrop.
 *
 * The settings here apply to every image (they travel with the export
 * settings), but a matched colour is per photo: each one is filled with the
 * colour the server measured along its own edges at upload.
 */
import { Check, PaintBucket, Pipette, WandSparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge, FieldRow, SectionTitle } from '@/components/ui/primitives'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { useStudio } from '@/hooks/useStudio'
import { cn } from '@/lib/utils'
import type { BackgroundStyle, UploadedImage } from '@/types/editor'
import { edgeRating, edgesDiffer, matchedEdges, SEAM_SOFTEN_MAX } from '@/utils/background'
import type { EdgeRating } from '@/utils/background'

const SWATCHES = [
  { value: '#FFFFFF', label: 'White' },
  { value: '#F7F5EE', label: 'Cream' },
  { value: '#EDEDED', label: 'Light grey' },
  { value: '#1E1B14', label: 'Charcoal' },
]

const SIDES = [
  ['top', 'Top'],
  ['bottom', 'Bottom'],
  ['left', 'Left'],
  ['right', 'Right'],
] as const

const RATINGS: Record<
  EdgeRating,
  { label: string; variant: 'success' | 'outline' | 'muted'; className?: string }
> = {
  plain: { label: 'Plain backdrop', variant: 'success' },
  'mostly-plain': { label: 'Mostly plain', variant: 'outline' },
  busy: { label: 'Busy edges', variant: 'muted', className: 'bg-destructive/10 text-destructive' },
}

/** Chromium's screen colour picker. Not in TypeScript's DOM types yet. */
type EyeDropperConstructor = new () => { open: () => Promise<{ sRGBHex: string }> }

function eyeDropper(): EyeDropperConstructor | null {
  return (window as unknown as { EyeDropper?: EyeDropperConstructor }).EyeDropper ?? null
}

export function BackgroundPanel() {
  const { images, editor } = useStudio()
  const settings = editor.exportSettings
  const selected = images.selected
  const matching = settings.backgroundMode === 'match'
  const EyeDropper = eyeDropper()
  const fixed = settings.background.toUpperCase()
  const customActive = !matching && !SWATCHES.some((swatch) => swatch.value === fixed)
  // A photo with an alpha channel keeps transparent empty space (PNG/WebP)
  // unless its own backdrop is matched; a fixed colour can't show there.
  const staysTransparent = Boolean(
    selected?.hasAlpha && settings.keepTransparency && !matchedEdges(settings, selected.edge),
  )

  const applyColor = (value: string) =>
    editor.setExportSettings({ background: value.toUpperCase(), backgroundMode: 'color' })

  const pickFromScreen = async () => {
    if (!EyeDropper) return
    try {
      const { sRGBHex } = await new EyeDropper().open()
      if (/^#[0-9a-f]{6}$/i.test(sRGBHex)) applyColor(sRGBHex)
    } catch {
      // Esc closes the picker without choosing - nothing to do.
    }
  }

  return (
    <div className="space-y-5">
      <SectionTitle
        icon={PaintBucket}
        action={
          <Badge variant="muted" title="These settings apply to every image; each photo is matched to its own edges.">
            All images
          </Badge>
        }
      >
        Background
      </SectionTitle>

      <div className="space-y-2">
        <Button
          size="lg"
          variant={matching ? 'outline' : 'default'}
          aria-pressed={matching}
          className={cn(
            'w-full',
            matching && 'border-success/50 bg-success/10 hover:bg-success/15 hover:text-foreground',
          )}
          onClick={() => editor.setExportSettings({ backgroundMode: matching ? 'color' : 'match' })}
        >
          {matching ? <Check /> : <WandSparkles />}
          {matching ? 'Background matched' : 'Match background'}
        </Button>
        <p className="text-[11px] leading-snug text-muted-foreground">
          {matching
            ? 'Every photo is filled with the colour along its own edges. Click again to go back to a fixed colour.'
            : 'Fills the empty part of the frame with the colour along the photo’s edges. Each photo gets its own match.'}
        </p>
      </div>

      {selected ? <EdgeSummary image={selected} /> : null}

      <FieldRow
        label="Fill style"
        hint="Top → bottom blends the top edge colour into the bottom one, for photos with a wall and a floor."
      >
        <Select
          value={settings.backgroundStyle}
          disabled={!matching}
          onValueChange={(value) =>
            editor.setExportSettings({ backgroundStyle: value as BackgroundStyle })
          }
        >
          <SelectTrigger aria-label="Fill style">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="solid">Solid colour</SelectItem>
            <SelectItem value="vertical">Top → bottom blend</SelectItem>
          </SelectContent>
        </Select>
      </FieldRow>

      <FieldRow
        label="Soften seam"
        value={settings.seamSoften ? `${settings.seamSoften} px` : 'Off'}
        hint="Fades the photo’s edge into the background, so a slight colour difference doesn’t show as a line."
      >
        <Slider
          value={[settings.seamSoften]}
          min={0}
          max={SEAM_SOFTEN_MAX}
          step={1}
          onValueChange={([value]) => editor.setExportSettings({ seamSoften: value })}
          aria-label="Soften seam"
        />
      </FieldRow>

      <FieldRow
        label={matching ? 'Or use a fixed colour' : 'Background colour'}
        value={fixed}
        hint={
          staysTransparent
            ? 'Keep transparency is on (Export tab), so this photo’s empty space stays transparent. Turn it off to fill it with a colour.'
            : undefined
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          {SWATCHES.map((swatch) => {
            const active = !matching && fixed === swatch.value
            return (
              <button
                key={swatch.value}
                type="button"
                title={swatch.label}
                aria-label={swatch.label}
                aria-pressed={active}
                onClick={() => applyColor(swatch.value)}
                className={cn(
                  'size-8 rounded-lg border border-border shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                  active && 'ring-2 ring-ring ring-offset-2 ring-offset-background',
                )}
                style={{ backgroundColor: swatch.value }}
              />
            )
          })}
          <input
            type="color"
            value={settings.background}
            onChange={(event) => applyColor(event.target.value)}
            title="Custom colour"
            aria-label="Custom background colour"
            className={cn(
              'size-8 cursor-pointer rounded-lg border border-input bg-card p-0.5',
              customActive && 'ring-2 ring-ring ring-offset-2 ring-offset-background',
            )}
          />
          {EyeDropper ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void pickFromScreen()}
              title="Pick a colour from anywhere on screen"
            >
              <Pipette className="size-3.5" />
              Pick
            </Button>
          ) : null}
        </div>
      </FieldRow>
    </div>
  )
}

/** The selected photo's measured edge colour, and how plain its backdrop is. */
function EdgeSummary({ image }: { image: UploadedImage }) {
  const { editor } = useStudio()
  const settings = editor.exportSettings
  const edge = image.edge

  if (!edge || edge.transparent) {
    return (
      <p className="rounded-lg bg-muted/60 px-3 py-2 text-[12px] leading-snug text-muted-foreground">
        <span className="font-medium text-foreground">{image.name}</span>
        {edge
          ? ' has transparent edges, so there is no colour to match. Its background follows the fixed colour and transparency settings.'
          : '’s edge colour couldn’t be measured, so it keeps the fixed colour below.'}
      </p>
    )
  }

  const tone = edgeRating(edge.agreement)
  const rating = RATINGS[tone]
  const percent = Math.round(edge.agreement * 100)
  const note =
    tone === 'plain'
      ? `${percent}% of the edge pixels match this colour, so the fill blends in cleanly.`
      : tone === 'mostly-plain'
        ? `${percent}% of the edge pixels match this colour. Soften seam hides small differences.`
        : `Only ${percent}% of the edge pixels match, so a flat fill may show a line. Try Top → bottom blend or Soften seam.`
  const suggestBlend =
    edgesDiffer(edge) &&
    !(settings.backgroundMode === 'match' && settings.backgroundStyle === 'vertical')

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="size-11 shrink-0 rounded-lg ring-1 ring-black/10 ring-inset"
          style={{ backgroundColor: edge.color }}
        />
        <div className="min-w-0 space-y-1">
          <p className="truncate text-[12px] text-muted-foreground" title={image.name}>
            Edge colour of {image.name}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[14px] font-medium tabular-nums">{edge.color}</span>
            <Badge variant={rating.variant} className={rating.className}>
              {rating.label}
            </Badge>
          </div>
        </div>
      </div>

      <p className="text-[11px] leading-snug text-muted-foreground">{note}</p>

      <div className="grid grid-cols-4 gap-1.5">
        {SIDES.map(([side, label]) => (
          <div key={side} className="min-w-0 space-y-1 text-center">
            <span
              aria-hidden="true"
              className="block h-5 rounded-md ring-1 ring-black/10 ring-inset"
              style={{ backgroundColor: edge[side] }}
            />
            <span className="block text-[10px] text-muted-foreground">{label}</span>
            <span className="block font-mono text-[10px] tabular-nums">{edge[side]}</span>
          </div>
        ))}
      </div>

      {suggestBlend ? (
        <p className="rounded-lg bg-accent px-2.5 py-2 text-[11px] leading-snug text-accent-foreground">
          The top and bottom edges are different shades, so one flat colour can leave a faint
          line. Top → bottom blend matches each band to the edge it touches.
        </p>
      ) : null}
    </div>
  )
}
