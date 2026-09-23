/** Character label settings - burned into every exported file. */
import { Type } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { FieldRow, Label, SectionTitle } from '@/components/ui/primitives'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { useStudio } from '@/hooks/useStudio'
import type { LabelBackground } from '@/types/editor'
import { DEFAULT_LABEL_SETTINGS } from '@/types/editor'
import { alphabeticLabel } from '@/utils/labels'
import { rgba } from '@/utils/transforms'

const BACKGROUNDS: { value: LabelBackground; label: string }[] = [
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

export function CharacterPanel() {
  const { images, editor } = useStudio()
  const settings = editor.labelSettings
  const preview = alphabeticLabel(images.selectedIndex)

  return (
    <div className="space-y-5">
      <SectionTitle
        icon={Type}
        action={
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => editor.setLabelSettings(DEFAULT_LABEL_SETTINGS)}
          >
            Reset
          </Button>
        }
      >
        Character Label
      </SectionTitle>

      <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
        <div>
          <p className="text-[13px] font-medium">Enable label</p>
          <p className="text-[11px] text-muted-foreground">
            A, B, C … rendered bottom-centre into the file
          </p>
        </div>
        <Switch
          checked={settings.enabled}
          onCheckedChange={(checked) => editor.setLabelSettings({ enabled: checked })}
          aria-label="Enable character label"
        />
      </div>

      <div
        className="flex h-24 items-end justify-center rounded-xl border border-border bg-neutral-800 pb-3"
        aria-hidden
      >
        <span
          style={{
            fontSize: 34,
            lineHeight: 1,
            fontWeight: settings.bold ? 700 : 500,
            color: rgba(settings.color, settings.opacity),
            padding: settings.background === 'pill' ? '6px 14px' : undefined,
            borderRadius: 9999,
            backgroundColor:
              settings.background === 'pill'
                ? rgba(settings.backgroundColor, settings.backgroundOpacity)
                : undefined,
            WebkitTextStrokeWidth: settings.background === 'shadow' ? '2px' : undefined,
            WebkitTextStrokeColor:
              settings.background === 'shadow' ? rgba(settings.backgroundColor, 55) : undefined,
            paintOrder: 'stroke fill',
            opacity: settings.enabled ? 1 : 0.25,
          }}
        >
          {preview || 'A'}
        </span>
      </div>

      <FieldRow
        label="Font size"
        value={`${settings.fontSize.toFixed(0)}px`}
        hint="Measured at 1080 px wide and scaled up with the export."
      >
        <Slider
          value={[settings.fontSize]}
          min={10}
          max={160}
          step={1}
          disabled={!settings.enabled}
          onValueChange={([value]) => editor.setLabelSettings({ fontSize: value })}
          aria-label="Label font size"
        />
      </FieldRow>

      <div className="flex items-center justify-between gap-3">
        <Label className="text-muted-foreground">Bold</Label>
        <Switch
          checked={settings.bold}
          disabled={!settings.enabled}
          onCheckedChange={(checked) => editor.setLabelSettings({ bold: checked })}
          aria-label="Bold label"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <ColorField
          label="Text colour"
          value={settings.color}
          onChange={(value) => editor.setLabelSettings({ color: value })}
        />
        <ColorField
          label="Outline / pill"
          value={settings.backgroundColor}
          onChange={(value) => editor.setLabelSettings({ backgroundColor: value })}
        />
      </div>

      <FieldRow label="Backing" hint="Keeps the label readable on light and dark photos.">
        <Select
          value={settings.background}
          onValueChange={(value) =>
            editor.setLabelSettings({ background: value as LabelBackground })
          }
          disabled={!settings.enabled}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BACKGROUNDS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldRow>

      {settings.background === 'pill' ? (
        <FieldRow label="Pill opacity" value={`${settings.backgroundOpacity.toFixed(0)}%`}>
          <Slider
            value={[settings.backgroundOpacity]}
            min={0}
            max={100}
            step={1}
            disabled={!settings.enabled}
            onValueChange={([value]) => editor.setLabelSettings({ backgroundOpacity: value })}
            aria-label="Pill opacity"
          />
        </FieldRow>
      ) : null}

      <FieldRow label="Opacity" value={`${settings.opacity.toFixed(0)}%`}>
        <Slider
          value={[settings.opacity]}
          min={0}
          max={100}
          step={1}
          disabled={!settings.enabled}
          onValueChange={([value]) => editor.setLabelSettings({ opacity: value })}
          aria-label="Label opacity"
        />
      </FieldRow>

      <FieldRow label="Bottom margin" value={`${settings.bottomMargin.toFixed(0)}px`}>
        <Slider
          value={[settings.bottomMargin]}
          min={0}
          max={200}
          step={1}
          disabled={!settings.enabled}
          onValueChange={([value]) => editor.setLabelSettings({ bottomMargin: value })}
          aria-label="Label bottom margin"
        />
      </FieldRow>

      <p className="rounded-lg bg-muted/60 px-3 py-2 text-[12px] leading-snug text-muted-foreground">
        Labels follow the list order — reorder the images and they renumber themselves.
      </p>
    </div>
  )
}
