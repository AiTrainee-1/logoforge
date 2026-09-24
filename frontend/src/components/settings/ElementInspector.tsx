/**
 * Property editor for one free-position element.
 *
 * Shared by the batch editor's "extra letters" panel and the composer, so a
 * text box behaves identically wherever it is placed.
 */
import { AlignCenter, AlignLeft, AlignRight, Bold } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { FieldRow, Input, Label } from '@/components/ui/primitives'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'
import type { LabelBackground, OverlayElement, TextAlign } from '@/types/editor'
import {
  BOX_HEIGHT_MAX,
  BOX_WIDTH_MAX,
  BOX_WIDTH_MIN,
  ELEMENT_WIDTH_MAX,
  ELEMENT_WIDTH_MIN,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
} from '@/utils/overlays'

const ALIGNMENTS: { value: TextAlign; icon: typeof AlignLeft; label: string }[] = [
  { value: 'left', icon: AlignLeft, label: 'Align left' },
  { value: 'center', icon: AlignCenter, label: 'Align centre' },
  { value: 'right', icon: AlignRight, label: 'Align right' },
]

const BACKINGS: { value: LabelBackground; label: string }[] = [
  { value: 'shadow', label: 'Outline / shadow' },
  { value: 'pill', label: 'Background pill' },
  { value: 'none', label: 'Plain text' },
]

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="space-y-2">
      <Label className="text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          className="size-9 cursor-pointer rounded-lg border border-input bg-card p-1"
          aria-label={label}
        />
        <span className="font-mono text-[12px] text-muted-foreground">{value}</span>
      </div>
    </div>
  )
}

export function ElementInspector({
  element,
  onChange,
  onCommit,
}: {
  element: OverlayElement
  onChange: (patch: Partial<OverlayElement>, commit?: boolean) => void
  onCommit: () => void
}) {
  const isText = element.type === 'text'
  const isBox = isText && element.boxWidth > 0

  return (
    <div className="space-y-4">
      {isText ? (
        <div className="space-y-2">
          <Label className="text-muted-foreground">Text</Label>
          <textarea
            value={element.text}
            rows={isBox ? 8 : 2}
            spellCheck={false}
            onChange={(event) => onChange({ text: event.target.value })}
            className="w-full resize-y rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            placeholder="Type a letter, or paste your catalog text"
          />
          <p className="text-[11px] text-muted-foreground">
            {isBox
              ? 'Pasted text is never rearranged - only wrapped to the box width. Edit freely.'
              : 'Press Enter for a second line. Up to 20 lines.'}
          </p>
        </div>
      ) : null}

      {isBox ? (
        <div className="grid grid-cols-2 gap-3">
          <FieldRow
            label="Box width"
            value={`${element.boxWidth.toFixed(1)}%`}
            hint="Percent of the canvas width - text rewraps as this changes."
          >
            <Slider
              value={[element.boxWidth]}
              min={BOX_WIDTH_MIN}
              max={BOX_WIDTH_MAX}
              step={0.5}
              onValueChange={([value]) => onChange({ boxWidth: value }, false)}
              onValueCommit={onCommit}
              aria-label="Text box width"
            />
          </FieldRow>
          <FieldRow
            label="Min height"
            value={element.boxHeight > 0 ? `${element.boxHeight.toFixed(1)}%` : 'Auto'}
            hint="A target only - the box always grows to fit its text."
          >
            <Slider
              value={[element.boxHeight]}
              min={0}
              max={BOX_HEIGHT_MAX}
              step={0.5}
              onValueChange={([value]) => onChange({ boxHeight: value }, false)}
              onValueCommit={onCommit}
              aria-label="Text box minimum height"
            />
          </FieldRow>
        </div>
      ) : null}

      {isText ? (
        <FieldRow
          label="Size"
          value={`${Math.round(element.fontSize)}px`}
          hint="Measured at 1080 px wide and scaled with the export."
        >
          <Slider
            value={[element.fontSize]}
            min={FONT_SIZE_MIN}
            max={FONT_SIZE_MAX}
            step={1}
            onValueChange={([value]) => onChange({ fontSize: value }, false)}
            onValueCommit={onCommit}
            aria-label="Text size"
          />
        </FieldRow>
      ) : (
        <FieldRow
          label="Width"
          value={`${element.widthPercent.toFixed(1)}%`}
          hint="Percentage of the canvas width; the aspect ratio is kept."
        >
          <Slider
            value={[element.widthPercent]}
            min={ELEMENT_WIDTH_MIN}
            max={ELEMENT_WIDTH_MAX}
            step={0.5}
            onValueChange={([value]) => onChange({ widthPercent: value }, false)}
            onValueCommit={onCommit}
            aria-label="Element width"
          />
        </FieldRow>
      )}

      {isText ? (
        <div className="flex items-center gap-2">
          <Button
            variant={element.bold ? 'default' : 'outline'}
            size="icon-sm"
            onClick={() => onChange({ bold: !element.bold })}
            title="Bold"
            aria-label="Bold"
          >
            <Bold className="size-3.5" />
          </Button>
          <div className="flex items-center gap-1">
            {ALIGNMENTS.map((item) => (
              <Button
                key={item.value}
                variant={element.align === item.value ? 'default' : 'outline'}
                size="icon-sm"
                onClick={() => onChange({ align: item.value })}
                title={item.label}
                aria-label={item.label}
              >
                <item.icon className="size-3.5" />
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      {isText ? (
        <div className="grid grid-cols-2 gap-3">
          <FieldRow label="Line height" value={element.lineHeight.toFixed(2)}>
            <Slider
              value={[element.lineHeight]}
              min={0.6}
              max={3}
              step={0.05}
              onValueChange={([value]) => onChange({ lineHeight: value }, false)}
              onValueCommit={onCommit}
              aria-label="Line height"
            />
          </FieldRow>
          <FieldRow label="Letter spacing" value={`${element.letterSpacing.toFixed(1)}px`}>
            <Slider
              value={[element.letterSpacing]}
              min={-5}
              max={40}
              step={0.5}
              onValueChange={([value]) => onChange({ letterSpacing: value }, false)}
              onValueCommit={onCommit}
              aria-label="Letter spacing"
            />
          </FieldRow>
        </div>
      ) : null}

      {isText ? (
        <div className="grid grid-cols-2 gap-3">
          <ColorField
            label="Text colour"
            value={element.color}
            onChange={(value) => onChange({ color: value })}
          />
          <ColorField
            label="Outline / pill"
            value={element.backgroundColor}
            onChange={(value) => onChange({ backgroundColor: value })}
          />
        </div>
      ) : null}

      {isText ? (
        <FieldRow label="Backing" hint="Keeps text readable on light and dark photos.">
          <Select
            value={element.background}
            onValueChange={(value) => onChange({ background: value as LabelBackground })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BACKINGS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldRow>
      ) : null}

      {isText && element.background === 'pill' ? (
        <FieldRow label="Pill opacity" value={`${Math.round(element.backgroundOpacity)}%`}>
          <Slider
            value={[element.backgroundOpacity]}
            min={0}
            max={100}
            step={1}
            onValueChange={([value]) => onChange({ backgroundOpacity: value }, false)}
            onValueCommit={onCommit}
            aria-label="Pill opacity"
          />
        </FieldRow>
      ) : null}

      <FieldRow label="Opacity" value={`${Math.round(element.opacity)}%`}>
        <Slider
          value={[element.opacity]}
          min={0}
          max={100}
          step={1}
          onValueChange={([value]) => onChange({ opacity: value }, false)}
          onValueCommit={onCommit}
          aria-label="Element opacity"
        />
      </FieldRow>

      <FieldRow label="Rotation" value={`${Math.round(element.rotation)}°`}>
        <Slider
          value={[element.rotation]}
          min={-180}
          max={180}
          step={1}
          onValueChange={([value]) => onChange({ rotation: value }, false)}
          onValueCommit={onCommit}
          aria-label="Element rotation"
        />
      </FieldRow>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label className="text-muted-foreground">X position</Label>
          <Input
            type="number"
            value={Number(element.x.toFixed(1))}
            step={0.5}
            onChange={(event) => onChange({ x: Number(event.target.value) })}
            aria-label="Horizontal position"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-muted-foreground">Y position</Label>
          <Input
            type="number"
            value={Number(element.y.toFixed(1))}
            step={0.5}
            onChange={(event) => onChange({ y: Number(event.target.value) })}
            aria-label="Vertical position"
          />
        </div>
      </div>
      <p className={cn('text-[11px] leading-snug text-muted-foreground')}>
        Positions are a percentage of the canvas, so they hold at any export size.
      </p>
    </div>
  )
}
