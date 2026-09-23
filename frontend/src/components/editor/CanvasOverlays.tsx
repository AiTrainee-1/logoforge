/**
 * The logo and character label as they will be burned into the export.
 *
 * Both are positioned against the *frame*, not the photo, which is why moving
 * the image underneath never moves them - exactly like the backend does it.
 */
import type { CSSProperties } from 'react'

import type { CharacterLabelSettings, LogoAsset, LogoSettings } from '@/types/editor'
import { labelGeometry, logoBox, rgba, type Size } from '@/utils/transforms'

export function LogoOverlay({
  frame,
  logo,
  settings,
}: {
  frame: Size
  logo: LogoAsset
  settings: LogoSettings
}) {
  const box = logoBox(frame, { width: logo.width, height: logo.height }, settings)
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute"
      style={{
        left: box.x,
        top: box.y,
        width: box.width,
        height: box.height,
        opacity: settings.opacity / 100,
        transform: `rotate(${settings.rotation}deg)`,
        transformOrigin: 'center center',
      }}
    >
      <img
        src={logo.previewUrl}
        alt=""
        draggable={false}
        className="size-full object-fill select-none"
      />
    </div>
  )
}

export function LabelOverlay({
  frame,
  text,
  settings,
}: {
  frame: Size
  text: string
  settings: CharacterLabelSettings
}) {
  if (!settings.enabled || !text) return null
  const geometry = labelGeometry(frame, settings)
  const isPill = settings.background === 'pill'

  const style: CSSProperties = {
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
    fontFamily: 'var(--font-label)',
    fontSize: geometry.fontPx,
    fontWeight: settings.bold ? 700 : 500,
    color: rgba(settings.color, settings.opacity),
    whiteSpace: 'nowrap',
    letterSpacing: '0.01em',
  }

  if (isPill) {
    style.bottom = geometry.marginPx
    style.lineHeight = `${geometry.capHeightPx}px`
    style.padding = `${geometry.padY}px ${geometry.padX}px`
    style.borderRadius = 9999
    style.backgroundColor = rgba(
      settings.backgroundColor,
      (settings.backgroundOpacity * settings.opacity) / 100,
    )
  } else {
    style.bottom = geometry.bottomPx
    style.lineHeight = 1
    if (settings.background === 'shadow') {
      style.WebkitTextStrokeWidth = `${geometry.strokePx}px`
      style.WebkitTextStrokeColor = rgba(settings.backgroundColor, 55 * (settings.opacity / 100))
      style.paintOrder = 'stroke fill'
    }
  }

  return (
    <span aria-hidden className="pointer-events-none select-none" style={style}>
      {text}
    </span>
  )
}
