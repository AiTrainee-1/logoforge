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

/**
 * Word-wrap measurement for text boxes (the catalog text box).
 *
 * Mirrors `text_service.wrap_lines`: greedy word-wrap, explicit newlines stay
 * paragraph breaks, and a single word wider than the box is kept whole
 * rather than split. Uses an offscreen canvas 2D context so the wrap point
 * tracks the actual glyph widths of the preview font - the same approach the
 * server uses with Pillow's own metrics. As with every other preview/export
 * pairing in this app, geometry matches exactly; the exact glyph shapes only
 * match when the server's bundled font is also the one loaded in the browser.
 */
let measureCanvas: HTMLCanvasElement | null = null
let cachedFontFamily: string | null = null

function measureContext(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null
  if (!measureCanvas) measureCanvas = document.createElement('canvas')
  return measureCanvas.getContext('2d')
}

function labelFontFamily(): string {
  if (cachedFontFamily) return cachedFontFamily
  if (typeof window === 'undefined') return 'sans-serif'
  const value = getComputedStyle(document.documentElement).getPropertyValue('--font-label')
  cachedFontFamily = value.trim() || 'sans-serif'
  return cachedFontFamily
}

/** A line's rendered width, including letter-spacing gaps between glyphs. */
export function lineWidthPx(
  ctx: CanvasRenderingContext2D,
  line: string,
  letterSpacingPx = 0,
): number {
  if (!line) return 0
  let width = ctx.measureText(line).width
  if (letterSpacingPx && line.length > 1) width += letterSpacingPx * (line.length - 1)
  return width
}

export function wrapLines(
  text: string,
  fontPx: number,
  bold: boolean,
  maxWidthPx: number,
  letterSpacingPx = 0,
): string[] {
  const ctx = measureContext()
  if (!ctx || maxWidthPx <= 0) return text.split('\n')
  ctx.font = `${bold ? 700 : 400} ${fontPx}px ${labelFontFamily()}`
  const wrapped: string[] = []
  for (const paragraph of text.split('\n')) {
    if (paragraph === '') {
      wrapped.push('')
      continue
    }
    let line = ''
    for (const word of paragraph.split(' ')) {
      const candidate = line ? `${line} ${word}` : word
      if (!line || lineWidthPx(ctx, candidate, letterSpacingPx) <= maxWidthPx) {
        line = candidate
      } else {
        wrapped.push(line)
        line = word
      }
    }
    wrapped.push(line)
  }
  return wrapped.length ? wrapped : ['']
}

/** The wrapped lines a text-box element would render, at its current width. */
export function textBoxLines(frame: Size, element: OverlayElement): string[] {
  const metrics = textMetrics(frame.width, element)
  const boxWidthPx = (element.boxWidth / 100) * frame.width
  const innerWidth = Math.max(1, boxWidthPx - metrics.padX * 2)
  const letterPx = scaledPx(element.letterSpacing, frame.width)
  return wrapLines(element.text, metrics.fontPx, element.bold, innerWidth, letterPx)
}

/**
 * The box's rendered height: always tall enough for its wrapped content.
 * `boxHeight` (percent of frame) is a target only, never a clip - mirrors
 * `text_service.render_text_box`.
 */
export function textBoxHeight(frame: Size, element: OverlayElement): number {
  const metrics = textMetrics(frame.width, element)
  const lines = textBoxLines(frame, element)
  const contentHeight = metrics.lineHeightPx * lines.length + metrics.padY * 2
  const targetHeight = (element.boxHeight / 100) * frame.height
  return Math.max(targetHeight, contentHeight)
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
  const isBox = element.boxWidth > 0
  const style: CSSProperties = {
    ...base,
    fontFamily: 'var(--font-label)',
    fontSize: metrics.fontPx,
    lineHeight: `${metrics.lineHeightPx}px`,
    fontWeight: element.bold ? 700 : 400,
    letterSpacing: scaledPx(element.letterSpacing, frame.width),
    padding: `${metrics.padY}px ${metrics.padX}px`,
    color: rgba(element.color, alpha),
    textAlign: element.align as TextAlign,
    whiteSpace: isBox ? 'pre-wrap' : 'pre',
  }

  if (isBox) {
    style.width = (element.boxWidth / 100) * frame.width
    style.height = textBoxHeight(frame, element)
    style.wordBreak = 'break-word'
    style.overflowWrap = 'break-word'
    style.boxSizing = 'border-box'
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

export const BOX_WIDTH_MIN = 5
export const BOX_WIDTH_MAX = 200
export const BOX_HEIGHT_MAX = 400

export function clampElement(element: OverlayElement): OverlayElement {
  return {
    ...element,
    x: clamp(element.x, -50, 150),
    y: clamp(element.y, -50, 150),
    rotation: clamp(element.rotation, -180, 180),
    opacity: clamp(element.opacity, 0, 100),
    fontSize: clamp(element.fontSize, FONT_SIZE_MIN, FONT_SIZE_MAX),
    lineHeight: clamp(element.lineHeight, 0.6, 3),
    letterSpacing: clamp(element.letterSpacing, -20, 200),
    boxWidth: element.boxWidth > 0 ? clamp(element.boxWidth, BOX_WIDTH_MIN, BOX_WIDTH_MAX) : 0,
    boxHeight: clamp(element.boxHeight, 0, BOX_HEIGHT_MAX),
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
    letterSpacing: element.letterSpacing,
    color: element.color,
    bold: element.bold,
    align: element.align,
    background: element.background,
    backgroundColor: element.backgroundColor,
    backgroundOpacity: element.backgroundOpacity,
    boxWidth: element.boxWidth,
    boxHeight: element.boxHeight,
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
