/** Global logo settings - they apply to every image. */
import { Stamp } from 'lucide-react'

import { LogoUpload } from '@/components/upload/LogoUpload'
import { Button } from '@/components/ui/button'
import { FieldRow, SectionTitle } from '@/components/ui/primitives'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { useStudio } from '@/hooks/useStudio'
import type { LogoPosition } from '@/types/editor'
import { DEFAULT_LOGO_SETTINGS } from '@/types/editor'

const POSITIONS: { value: LogoPosition; label: string }[] = [
  { value: 'top-left', label: 'Top Left' },
  { value: 'top-right', label: 'Top Right' },
  { value: 'bottom-left', label: 'Bottom Left' },
  { value: 'bottom-right', label: 'Bottom Right' },
  { value: 'center', label: 'Center' },
  { value: 'custom', label: 'Custom' },
]

export function LogoPanel() {
  const { images, editor } = useStudio()
  const settings = editor.logoSettings
  const disabled = !images.logo

  return (
    <div className="space-y-5">
      <SectionTitle
        icon={Stamp}
        action={
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => editor.setLogoSettings(DEFAULT_LOGO_SETTINGS)}
          >
            Reset
          </Button>
        }
      >
        Logo
      </SectionTitle>

      <LogoUpload />

      <FieldRow label="Position">
        <Select
          value={settings.position}
          onValueChange={(value) => editor.setLogoSettings({ position: value as LogoPosition })}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {POSITIONS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldRow>

      {settings.position === 'custom' ? (
        <div className="grid grid-cols-2 gap-3">
          <FieldRow label="Custom X" value={`${settings.customX.toFixed(0)}%`}>
            <Slider
              value={[settings.customX]}
              min={0}
              max={100}
              step={0.5}
              disabled={disabled}
              onValueChange={([value]) => editor.setLogoSettings({ customX: value })}
              aria-label="Logo horizontal position"
            />
          </FieldRow>
          <FieldRow label="Custom Y" value={`${settings.customY.toFixed(0)}%`}>
            <Slider
              value={[settings.customY]}
              min={0}
              max={100}
              step={0.5}
              disabled={disabled}
              onValueChange={([value]) => editor.setLogoSettings({ customY: value })}
              aria-label="Logo vertical position"
            />
          </FieldRow>
        </div>
      ) : null}

      <FieldRow
        label="Logo size"
        value={`${settings.sizePercent.toFixed(0)}%`}
        hint="Percentage of the output width — a 10% logo is 400 px wide on a 4000 px image."
      >
        <Slider
          value={[settings.sizePercent]}
          min={2}
          max={50}
          step={0.5}
          disabled={disabled}
          onValueChange={([value]) => editor.setLogoSettings({ sizePercent: value })}
          aria-label="Logo size"
        />
      </FieldRow>

      <FieldRow
        label="Margin"
        value={`${settings.margin.toFixed(0)}px`}
        hint="Measured at 1080 px wide and scaled up with the export."
      >
        <Slider
          value={[settings.margin]}
          min={0}
          max={200}
          step={1}
          disabled={disabled || settings.position === 'custom' || settings.position === 'center'}
          onValueChange={([value]) => editor.setLogoSettings({ margin: value })}
          aria-label="Logo margin"
        />
      </FieldRow>

      <FieldRow label="Opacity" value={`${settings.opacity.toFixed(0)}%`}>
        <Slider
          value={[settings.opacity]}
          min={0}
          max={100}
          step={1}
          disabled={disabled}
          onValueChange={([value]) => editor.setLogoSettings({ opacity: value })}
          aria-label="Logo opacity"
        />
      </FieldRow>

      <FieldRow label="Rotation" value={`${settings.rotation.toFixed(0)}°`}>
        <Slider
          value={[settings.rotation]}
          min={-180}
          max={180}
          step={1}
          disabled={disabled}
          onValueChange={([value]) => editor.setLogoSettings({ rotation: value })}
          aria-label="Logo rotation"
        />
      </FieldRow>

      {disabled ? (
        <p className="rounded-lg bg-muted/60 px-3 py-2 text-[12px] text-muted-foreground">
          Upload a logo to enable these controls. Images can still be exported with just the
          character label.
        </p>
      ) : null}
    </div>
  )
}
