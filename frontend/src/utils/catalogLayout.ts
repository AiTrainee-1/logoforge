/**
 * Auto-layout for the Catalog Composer: title / description / details /
 * price text sections, stacked above one product image.
 *
 * This is a one-shot calculation, not a reactive effect. It runs exactly
 * when something explicitly asks for it (creating the slide) and never on
 * its own - so it can never fight a manual drag/resize the way a background
 * layout effect could. Changing a section's font size afterwards only ever
 * changes that section's own rendered height (an unavoidable, and correct,
 * side effect of word-wrap); it never repositions anything else, because
 * nothing here re-runs implicitly.
 *
 * Each section becomes its own ordinary text-box `OverlayElement` - the same
 * kind the rest of the Composer already renders, drags, resizes and edits.
 * That is what lets title/description/details/price be styled and edited
 * completely independently without any new rendering or editing machinery:
 * selecting one in the layer list and using the existing Inspector panel
 * (size, weight, colour, alignment, line height, letter spacing) is already
 * "controls for" every one of those, per element.
 *
 * All geometry is expressed the same way every other element in this app is:
 * percentages of the frame, plus reference-width pixels for margins - so the
 * same layout numbers describe a small preview and the 925x1131 export.
 */
import type { CanvasAsset, OverlayElement, TextAlign } from '@/types/editor'
import { type CatalogSections, parseCatalogText } from '@/utils/catalogParser'
import { createElement, textBoxHeight } from '@/utils/overlays'
import { scaledPx, type Size } from '@/utils/transforms'

export type CatalogSectionKey = 'title' | 'description' | 'details' | 'price'

export interface CatalogSectionStyle {
  fontSize: number
  bold: boolean
  color: string
  align: TextAlign
  lineHeight: number
}

/**
 * Default styling per section. All four share the app's one configured
 * catalog font (`--font-label` / the server's bundled face) - only size,
 * weight, colour, alignment and line height differ, and every one of those
 * stays independently adjustable afterwards through the ordinary per-element
 * Inspector panel.
 */
export const CATALOG_SECTION_DEFAULTS: Record<CatalogSectionKey, CatalogSectionStyle> = {
  title: { fontSize: 38, bold: true, color: '#111111', align: 'center', lineHeight: 1.2 },
  description: { fontSize: 22, bold: false, color: '#333333', align: 'center', lineHeight: 1.45 },
  details: { fontSize: 21, bold: false, color: '#111111', align: 'center', lineHeight: 1.35 },
  price: { fontSize: 26, bold: true, color: '#111111', align: 'center', lineHeight: 1.2 },
}

const SECTION_ORDER: CatalogSectionKey[] = ['title', 'description', 'details', 'price']

export const CATALOG_MIN_FONT_SIZE = 14
/** Below this share of the frame height, the image is considered too cramped
 * and the auto-fit ladder starts shrinking every section's font instead. */
const MIN_IMAGE_HEIGHT_PERCENT = 16

export interface CatalogMargins {
  top: number
  left: number
  right: number
  bottom: number
  /** Gap between two consecutive text sections (title/description/…). */
  sectionGap: number
  /** Gap between the last text section and the image. */
  imageGap: number
}

/** Reference-width pixels (scale with the frame like every other margin). */
export const CATALOG_DEFAULT_MARGINS: CatalogMargins = {
  top: 64,
  left: 56,
  right: 56,
  bottom: 56,
  sectionGap: 18,
  imageGap: 32,
}

export interface CatalogLayoutInput {
  frame: Size
  text: string
  asset?: Pick<CanvasAsset, 'width' | 'height'> | null
  margins?: CatalogMargins
  /** Per-section style overrides, merged onto `CATALOG_SECTION_DEFAULTS`. */
  styles?: Partial<Record<CatalogSectionKey, Partial<CatalogSectionStyle>>>
}

export interface CatalogSectionResult {
  key: CatalogSectionKey
  text: string
  element: Partial<OverlayElement>
}

export interface CatalogLayoutResult {
  sections: CatalogSectionResult[]
  image: Partial<OverlayElement> | null
  /** True when sections had to shrink together to leave the image room. */
  fontSizeReduced: boolean
}

function styleFor(
  key: CatalogSectionKey,
  overrides?: CatalogLayoutInput['styles'],
): CatalogSectionStyle {
  return { ...CATALOG_SECTION_DEFAULTS[key], ...(overrides?.[key] ?? {}) }
}

function measureHeight(frame: Size, text: string, style: CatalogSectionStyle, boxWidthPercent: number) {
  const probe = createElement({
    text,
    fontSize: style.fontSize,
    lineHeight: style.lineHeight,
    boxWidth: boxWidthPercent,
    boxHeight: 0,
    background: 'none',
    align: style.align,
  })
  return textBoxHeight(frame, probe)
}

export function computeCatalogLayout(input: CatalogLayoutInput): CatalogLayoutResult {
  const { frame, asset } = input
  const margins = input.margins ?? CATALOG_DEFAULT_MARGINS
  const sections: CatalogSections = parseCatalogText(input.text)

  const marginTopPx = scaledPx(margins.top, frame.width)
  const marginLeftPx = scaledPx(margins.left, frame.width)
  const marginRightPx = scaledPx(margins.right, frame.width)
  const marginBottomPx = scaledPx(margins.bottom, frame.width)
  const sectionGapPx = scaledPx(margins.sectionGap, frame.width)
  const imageGapPx = scaledPx(margins.imageGap, frame.width)

  const boxWidthPx = Math.max(1, frame.width - marginLeftPx - marginRightPx)
  const boxWidthPercent = (boxWidthPx / frame.width) * 100
  const minImageHeightPx = (MIN_IMAGE_HEIGHT_PERCENT / 100) * frame.height

  const present = SECTION_ORDER.filter((key) => sections[key].trim().length > 0)

  let scale = 1
  let heights: Record<CatalogSectionKey, number> = { title: 0, description: 0, details: 0, price: 0 }

  const measureAll = () => {
    heights = { title: 0, description: 0, details: 0, price: 0 }
    let sum = 0
    for (const key of present) {
      const base = styleFor(key, input.styles)
      const scaled = { ...base, fontSize: Math.max(CATALOG_MIN_FONT_SIZE, base.fontSize * scale) }
      const height = measureHeight(frame, sections[key], scaled, boxWidthPercent)
      heights[key] = height
      sum += height
    }
    return sum + Math.max(0, present.length - 1) * sectionGapPx
  }

  let totalTextHeightPx = measureAll()

  // Auto-fit ladder: shrink every section's font together (this keeps their
  // relative sizes - title still bigger than body - intact) until the image
  // gets a sane minimum of room, or the smallest section hits the floor.
  // Text is never clipped at any step: each box still grows to fit whatever
  // it ends up needing at the current scale.
  while (asset) {
    const availableForImage = frame.height - marginTopPx - totalTextHeightPx - imageGapPx - marginBottomPx
    const smallestFontNow = Math.min(
      ...present.map((key) => styleFor(key, input.styles).fontSize * scale),
    )
    if (availableForImage >= minImageHeightPx || smallestFontNow <= CATALOG_MIN_FONT_SIZE) break
    scale = Math.max(0.4, scale - 0.05)
    totalTextHeightPx = measureAll()
  }

  let cursorY = marginTopPx
  const sectionResults: CatalogSectionResult[] = []
  for (const key of present) {
    const base = styleFor(key, input.styles)
    const fontSize = Math.max(CATALOG_MIN_FONT_SIZE, Math.round(base.fontSize * scale))
    const height = heights[key]
    const centerYPx = cursorY + height / 2
    sectionResults.push({
      key,
      text: sections[key],
      element: {
        x: 50,
        y: (centerYPx / frame.height) * 100,
        boxWidth: boxWidthPercent,
        boxHeight: 0,
        fontSize,
        bold: base.bold,
        color: base.color,
        align: base.align,
        lineHeight: base.lineHeight,
        background: 'none',
      },
    })
    cursorY += height + sectionGapPx
  }
  if (present.length > 0) cursorY -= sectionGapPx // drop the trailing gap

  let imageElement: Partial<OverlayElement> | null = null
  if (asset && asset.width > 0 && asset.height > 0) {
    const imageTopPx = present.length > 0 ? cursorY + imageGapPx : marginTopPx
    const availableHeightPx = Math.max(1, frame.height - imageTopPx - marginBottomPx)
    const ratio = asset.height / asset.width

    // Contain: fit the whole product inside the available box.
    let imageWidthPx = boxWidthPx
    let imageHeightPx = imageWidthPx * ratio
    if (imageHeightPx > availableHeightPx) {
      imageHeightPx = availableHeightPx
      imageWidthPx = imageHeightPx / ratio
    }
    const imageCenterYPx = imageTopPx + imageHeightPx / 2
    imageElement = {
      x: 50,
      y: (imageCenterYPx / frame.height) * 100,
      widthPercent: (imageWidthPx / frame.width) * 100,
    }
  }

  return {
    sections: sectionResults,
    image: imageElement,
    fontSizeReduced: scale < 1,
  }
}
