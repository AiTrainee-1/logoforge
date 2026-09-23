/**
 * Geometry and CSS for free-position elements.
 *
 * Port of `backend/services/text_service.py` + `overlay_service.py`. The
 * browser lays a line out as `fontSize × lineHeight`, with the baseline at
 * `halfLeading + ascent`; Pillow is driven with exactly the same numbers, so a
 * block of text lands in the same place in the preview and in the export.
 *
 * The remaining variable is the font file itself. When the server has one
 * bundled in `assets/fonts` it is served to the browser and the two become
 * pixel-identical; otherwise the preview uses Inter and the match is close.
 */
import type { CSSProperties } from 'react'

import type { CanvasAsset, OverlayElement, TextAlign } from '@/types/editor'
import { DEFAULT_ELEMENT } from '@/types/editor'
import { clamp, rgba, scaledPx, type Size } from '@/utils/transforms'

export const ELEMENT_LIMIT = 60
export const FONT_SIZE_MIN = 6
export const FONT_SIZE_MAX = 400
export const ELEMENT_WIDTH_MIN = 1
export const ELEMENT_WIDTH_MAX = 200

let counter = 0

export function createElement(overrides: Partial<OverlayElement> = {}): OverlayElement {
  counter += 1
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 12)
      : `el${Date.now().toString(36)}${counter}`
  return { ...DEFAULT_ELEMENT, ...overrides, id }
}

export interface TextMetrics {
  fontPx: number
  strokePx: number
  padX: number
  padY: number
  lineHeightPx: number
}

/** Mirrors `text_service.text_metrics`. */
export function textMetrics(frameWidth: number, element: OverlayElement): TextMetrics {
  const fontPx = Math.max(1, Math.round(scaledPx(element.fontSize, frameWidth)))
  const strokePx = element.background === 'shadow' ? Math.round(fontPx * 0.08) : 0
  const pill = element.background === 'pill'
  return {
    fontPx,
    strokePx,
    padX: pill ? Math.round(fontPx * 0.5) : strokePx + 2,
    padY: pill ? Math.round(fontPx * 0.26) : strokePx + 2,
    lineHeightPx: Math.round(fontPx * element.lineHeight),
  }
}

/** Drawn size of an image element, in frame pixels. */
export function imageElementSize(
  frame: Size,
  element: OverlayElement,
  asset: CanvasAsset | undefined,
): Size {
  const width = (element.widthPercent / 100) * frame.width
  const ratio = asset && asset.width > 0 ? asset.height / asset.width : 1
  return { width, height: width * ratio }
}

/**
 * The element's box, positioned by its centre and rotated about it — the same
 * anchor the server pastes the rendered tile at.
 */
export function elementStyle(
  frame: Size,
  element: OverlayElement,
  asset?: CanvasAsset,
): CSSProperties {
  const base: CSSProperties = {
    position: 'absolute',
    left: `${element.x}%`,
    top: `${element.y}%`,
    transform: `translate(-50%, -50%) rotate(${element.rotation}deg)`,
    transformOrigin: 'center center',
  }

  if (element.type === 'image') {
    const size = imageElementSize(frame, element, asset)
    return { ...base, width: size.width, height: size.height }
  }

  // Opacity is folded into the colours rather than set on the box, exactly as
  // the server multiplies the rendered tile's alpha — and it leaves the
  // selection outline and handles at full strength.
  const alpha = clamp(element.opacity, 0, 100)
  const metrics = textMetrics(frame.width, element)
  const style: CSSProperties = {
    ...base,
    fontFamily: 'var(--font-label)',
    fontSize: metrics.fontPx,
    lineHeight: `${metrics.lineHeightPx}px`,
    fontWeight: element.bold ? 700 : 400,
    padding: `${metrics.padY}px ${metrics.padX}px`,
    color: rgba(element.color, alpha),
    textAlign: element.align as TextAlign,
    whiteSpace: 'pre',
  }

  if (element.background === 'pill') {
    style.borderRadius = 9999
    style.backgroundColor = rgba(
      element.backgroundColor,
      (element.backgroundOpacity * alpha) / 100,
    )
  } else if (element.background === 'shadow') {
    style.WebkitTextStrokeWidth = `${metrics.strokePx}px`
    // 140/255 — the alpha the server strokes with.
    style.WebkitTextStrokeColor = rgba(element.backgroundColor, (55 * alpha) / 100)
    style.paintOrder = 'stroke fill'
  }
  return style
}

export function clampElement(element: OverlayElement): OverlayElement {
  return {
    ...element,
    x: clamp(element.x, -50, 150),
    y: clamp(element.y, -50, 150),
    rotation: clamp(element.rotation, -180, 180),
    opacity: clamp(element.opacity, 0, 100),
    fontSize: clamp(element.fontSize, FONT_SIZE_MIN, FONT_SIZE_MAX),
    lineHeight: clamp(element.lineHeight, 0.6, 3),
    widthPercent: clamp(element.widthPercent, ELEMENT_WIDTH_MIN, ELEMENT_WIDTH_MAX),
  }
}

/** Strip the element down to what the API accepts. */
export function toPayload(element: OverlayElement) {
  const common = {
    id: element.id,
    type: element.type,
    x: element.x,
    y: element.y,
    rotation: element.rotation,
    opacity: element.opacity,
  }
  if (element.type === 'image') {
    return { ...common, assetId: element.assetId, widthPercent: element.widthPercent }
  }
  return {
    ...common,
    text: element.text,
    fontSize: element.fontSize,
    lineHeight: element.lineHeight,
    color: element.color,
    bold: element.bold,
    align: element.align,
    background: element.background,
    backgroundColor: element.backgroundColor,
    backgroundOpacity: element.backgroundOpacity,
  }
}

export function elementsPayload(elements: OverlayElement[]) {
  return elements.map(toPayload)
}

/** A short human label for the layer list. */
export function elementLabel(element: OverlayElement, asset?: CanvasAsset): string {
  if (element.type === 'image') return asset?.name ?? 'Image'
  const first = element.text.split('\n')[0]?.trim()
  return first ? (first.length > 18 ? `${first.slice(0, 18)}…` : first) : 'Empty text'
}

/** Next letter in the A, B, C… sequence that this list has not used yet. */
export function nextLetter(elements: OverlayElement[]): string {
  const used = new Set(
    elements
      .filter((element) => element.type === 'text')
      .map((element) => element.text.trim().toUpperCase()),
  )
  for (let index = 0; index < 26; index += 1) {
    const letter = String.fromCharCode(65 + index)
    if (!used.has(letter)) return letter
  }
  return 'A'
}
