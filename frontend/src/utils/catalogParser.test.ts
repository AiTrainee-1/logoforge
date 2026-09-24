/**
 * Tests for the catalog-text section parser.
 *
 * Run with: node --test src/utils/catalogParser.test.ts
 * (Node's built-in test runner + its native TypeScript support - no new
 * dependency, no build step, no change to package.json.)
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { parseCatalogText, withDetailMarkers } from './catalogParser.ts'

const FULL_CATALOG_TEXT = `Terracotta Votive figure | Aiyanar Tradition

These terracotta votive figures are associated with the Aiyanar worship tradition of Tamil Nadu, where devotees offer sculpted forms as expressions of gratitude for protection, healing, and answered prayers.

Material: Terracotta

Dimensions:
C: 12" x 5.5" x 4"
D: 10" x 4.5" x 4.5"

Weight: 1.175 kg

Price: Rs.10500/- (Shipping additional) - for each piece`

test('Dimensions/Weight/Price on consecutive lines (no blank lines between them) still split correctly', () => {
  // This is exactly how the task's own reference content is formatted -
  // Price sits right after Weight with no blank line, so paragraph-level
  // classification alone would swallow it into Details.
  const result = parseCatalogText(
    'Vintage wooden Peacock\n\n' +
      'A short description paragraph.\n\n' +
      'Dimensions: 23.5"H\n' +
      'Weight: 4.7kg approx.\n' +
      'Price: Rs. 25,000/- (shipping additional)',
  )
  assert.equal(result.title, 'Vintage wooden Peacock')
  assert.equal(result.description, 'A short description paragraph.')
  assert.equal(result.details, 'Dimensions: 23.5"H\n\nWeight: 4.7kg approx.')
  assert.equal(result.price, 'Price: Rs. 25,000/- (shipping additional)')
})

test('a multi-line Dimensions entry followed by Weight/Price on the next lines splits correctly', () => {
  const result = parseCatalogText(
    'Title\n\n' +
      'Dimensions:\n' +
      'C: 12" x 5.5" x 4"\n' +
      'D: 10" x 4.5" x 4.5"\n' +
      'Weight: 1.175 kg\n' +
      'Price: Rs.10500/-',
  )
  assert.equal(result.details, 'Dimensions:\nC: 12" x 5.5" x 4"\nD: 10" x 4.5" x 4.5"\n\nWeight: 1.175 kg')
  assert.equal(result.price, 'Price: Rs.10500/-')
})

test('title + description + details + price: the full reference structure', () => {
  const result = parseCatalogText(FULL_CATALOG_TEXT)
  assert.equal(result.title, 'Terracotta Votive figure | Aiyanar Tradition')
  assert.match(result.description, /^These terracotta votive figures/)
  assert.doesNotMatch(result.description, /Material|Price/)
  assert.match(result.details, /Material: Terracotta/)
  assert.match(result.details, /Dimensions:\nC: 12" x 5\.5" x 4"\nD: 10" x 4\.5" x 4\.5"/)
  assert.match(result.details, /Weight: 1\.175 kg/)
  assert.doesNotMatch(result.details, /Price/)
  assert.equal(result.price, 'Price: Rs.10500/- (Shipping additional) - for each piece')
})

test('title + description only: no labelled fields, no price', () => {
  const result = parseCatalogText(
    'Title\n\nJust a description paragraph with no labels at all.',
  )
  assert.equal(result.title, 'Title')
  assert.equal(result.description, 'Just a description paragraph with no labels at all.')
  assert.equal(result.details, '')
  assert.equal(result.price, '')
})

test('single paragraph: the whole text becomes the title, nothing is lost', () => {
  const result = parseCatalogText('Just a title, nothing else')
  assert.equal(result.title, 'Just a title, nothing else')
  assert.equal(result.description, '')
  assert.equal(result.details, '')
  assert.equal(result.price, '')
})

test('empty input: every section is empty, no crash', () => {
  assert.deepEqual(parseCatalogText(''), { title: '', description: '', details: '', price: '' })
  assert.deepEqual(parseCatalogText('   \n\n  '), {
    title: '',
    description: '',
    details: '',
    price: '',
  })
})

// --- known catalog field labels -> Details ----------------------------------

for (const label of [
  'Material:',
  'Materials:',
  'Dimensions:',
  'Dimension:',
  'Size:',
  'Weight:',
  'Origin:',
  'Source:',
  'Period:',
  'Medium:',
  'Condition:',
  'Provenance:',
]) {
  test(`"${label}" is recognised as a Details field`, () => {
    const result = parseCatalogText(`Title\n\n${label} some value here`)
    assert.equal(result.details, `${label} some value here`)
    assert.equal(result.description, '')
  })
}

test('label matching is case-insensitive', () => {
  const result = parseCatalogText('Title\n\nmaterial: terracotta')
  assert.equal(result.details, 'material: terracotta')
})

// --- price recognition -------------------------------------------------------

for (const priceLine of ['Price: Rs.500', 'Price - Rs.500', 'Price — Rs.500', 'price: Rs.500']) {
  test(`"${priceLine}" is recognised as Price`, () => {
    const result = parseCatalogText(`Title\n\n${priceLine}`)
    assert.equal(result.price, priceLine)
    assert.equal(result.details, '')
  })
}

// --- must NOT be guessed into Details merely for containing a colon --------

test('"Note: ..." is prose, not a catalog field - stays in Description', () => {
  const result = parseCatalogText(
    'Title\n\nNote: This piece was collected from Tamil Nadu.',
  )
  assert.equal(result.details, '')
  assert.equal(result.description, 'Note: This piece was collected from Tamil Nadu.')
})

test('arbitrary colon-containing prose is not classified as Details', () => {
  const result = parseCatalogText(
    'Title\n\nAs the saying goes: patience is a virtue, and this piece proves it.',
  )
  assert.equal(result.details, '')
  assert.match(result.description, /As the saying goes/)
})

test('"Care:" and other unlisted labels stay in Description, not Details', () => {
  const result = parseCatalogText('Title\n\nCare: Wipe with a dry cloth only.')
  assert.equal(result.details, '')
  assert.equal(result.description, 'Care: Wipe with a dry cloth only.')
})

// --- content is preserved exactly, never rewritten --------------------------

test('exact user text survives, including quotes and multiple detail lines', () => {
  const result = parseCatalogText(FULL_CATALOG_TEXT)
  const rebuilt = [result.title, result.description, result.details, result.price]
    .filter(Boolean)
    .join('\n\n')
  // Every original word still appears somewhere in the rebuilt text - the
  // parser only routes paragraphs into buckets, it never edits wording.
  for (const word of FULL_CATALOG_TEXT.split(/\s+/)) {
    assert.ok(rebuilt.includes(word), `expected "${word}" to survive parsing`)
  }
})

// --- optional detail markers (off by default) --------------------------------

test('withDetailMarkers prefixes only recognised label lines', () => {
  const details = 'Material: Terracotta\n\nDimensions:\nC: 12" x 5.5" x 4"\nWeight: 1.175 kg'
  const marked = withDetailMarkers(details)
  assert.equal(
    marked,
    '– Material: Terracotta\n\n– Dimensions:\nC: 12" x 5.5" x 4"\n– Weight: 1.175 kg',
  )
})

test('withDetailMarkers leaves an empty details section untouched', () => {
  assert.equal(withDetailMarkers(''), '')
})

test('withDetailMarkers never touches continuation lines under a label', () => {
  const marked = withDetailMarkers('Dimensions:\nC: 12" x 5.5" x 4"\nD: 10" x 4.5" x 4.5"')
  const lines = marked.split('\n')
  assert.equal(lines[0], '– Dimensions:')
  assert.equal(lines[1], 'C: 12" x 5.5" x 4"')
  assert.equal(lines[2], 'D: 10" x 4.5" x 4.5"')
})
