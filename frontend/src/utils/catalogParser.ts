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

export function parseCatalogText(raw: string): CatalogSections {
  const paragraphs = splitParagraphs(raw)
  if (paragraphs.length === 0) {
    return { title: '', description: '', details: '', price: '' }
  }

  const title = paragraphs[0]
  const descriptionParts: string[] = []
  const detailsParts: string[] = []
  const priceParts: string[] = []

  for (const paragraph of paragraphs.slice(1)) {
    const firstLine = paragraph.split('\n', 1)[0]
    if (PRICE_PATTERN.test(firstLine)) {
      priceParts.push(paragraph)
    } else if (LABEL_PATTERN.test(firstLine)) {
      detailsParts.push(paragraph)
    } else {
      descriptionParts.push(paragraph)
    }
  }

  return {
    title,
    description: descriptionParts.join('\n\n'),
    details: detailsParts.join('\n\n'),
    price: priceParts.join('\n\n'),
  }
}
