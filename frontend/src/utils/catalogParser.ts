/**
 * Splits pasted catalog text into up to four sections - title, description,
 * labelled details (Material / Dimensions / Weight / ...) and price - so
 * each can be styled and edited independently, matching how the reference
 * catalog slides look.
 *
 * This only ROUTES existing paragraphs into buckets by position and an exact,
 * known set of catalog field labels (see `DETAIL_LABELS`) or the price
 * pattern. It never reorders, rewrites, merges wording, or drops content - a
 * paragraph that doesn't match one of those known labels is never guessed
 * at, it simply joins the description. Text that has no blank-line
 * paragraphs at all becomes a title-only slide: nothing is ever lost.
 */

export interface CatalogSections {
  title: string
  description: string
  details: string
  price: string
}

// Only these exact field names count as a "Details" line - an arbitrary
// "Note: ..." or "Care: ..." paragraph is prose, not a catalog field, and
// must not be guessed into Details merely because it contains a colon.
const DETAIL_LABELS = [
  'material',
  'materials',
  'dimensions',
  'dimension',
  'size',
  'weight',
  'origin',
  'source',
  'period',
  'medium',
  'condition',
  'provenance',
]
const LABEL_PATTERN = new RegExp(`^\\s*(?:${DETAIL_LABELS.join('|')})\\s*:`, 'i')

// "Price:", "Price -", "Price —" (colon, hyphen or em dash after the word).
const PRICE_PATTERN = /^\s*price\b\s*(?::|-|—)/i

function splitParagraphs(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
}

type Bucket = 'description' | 'details' | 'price'

export function parseCatalogText(raw: string): CatalogSections {
  const paragraphs = splitParagraphs(raw)
  if (paragraphs.length === 0) {
    return { title: '', description: '', details: '', price: '' }
  }

  const title = paragraphs[0]
  const descriptionParts: string[] = []
  const detailsParts: string[] = []
  const priceParts: string[] = []

  // Classified line by line, not paragraph by paragraph: a catalog paste
  // often runs "Dimensions:", "Weight:" and "Price:" on consecutive lines
  // with no blank line between them. A label or the price pattern starts a
  // new field *within* the same paragraph; any other line continues
  // whatever field is already open (e.g. the "C:"/"D:" rows under
  // "Dimensions:"), or starts the description if nothing has opened yet.
  for (const paragraph of paragraphs.slice(1)) {
    let current: Bucket | null = null
    let buffer: string[] = []

    const flush = () => {
      if (buffer.length === 0) return
      const text = buffer.join('\n')
      if (current === 'price') priceParts.push(text)
      else if (current === 'details') detailsParts.push(text)
      else descriptionParts.push(text)
      buffer = []
    }

    for (const line of paragraph.split('\n')) {
      if (PRICE_PATTERN.test(line)) {
        flush()
        current = 'price'
        buffer = [line]
      } else if (LABEL_PATTERN.test(line)) {
        flush()
        current = 'details'
        buffer = [line]
      } else {
        if (current === null) current = 'description'
        buffer.push(line)
      }
    }
    flush()
  }

  return {
    title,
    description: descriptionParts.join('\n\n'),
    details: detailsParts.join('\n\n'),
    price: priceParts.join('\n\n'),
  }
}

/**
 * Small icon name for a recognised Details/Price line, or null. Mirrors
 * `backend/utils/icons.py::icon_for_line` exactly - same curated whitelist
 * (an unmapped label like "Origin:" gets no icon, never a mismatched
 * generic one), same "Price:"/"Price -"/"Price —" detection. Used to show
 * the same icon in the live preview that the export will actually draw.
 */
export type CatalogIconName = 'dimensions' | 'weight' | 'material' | 'price'

const ICON_FOR_LABEL: Record<string, CatalogIconName> = {
  dimensions: 'dimensions',
  dimension: 'dimensions',
  size: 'dimensions',
  weight: 'weight',
  material: 'material',
  materials: 'material',
  medium: 'material',
}

export function iconForLine(line: string): CatalogIconName | null {
  if (PRICE_PATTERN.test(line)) return 'price'
  const match = LABEL_PATTERN.exec(line)
  if (!match) return null
  const word = line.trim().split(':', 1)[0].trim().toLowerCase()
  return ICON_FOR_LABEL[word] ?? null
}
