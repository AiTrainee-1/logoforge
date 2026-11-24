/**
 * Tests for the frame-background port (`background.ts`).
 *
 * Run with: node --test src/utils/background.test.ts
 * The numbers mirror backend/tests/test_background.py: a square photo fitted
 * inside a 925 x 1131 frame sits at y 103-1028, leaving bands above and below.
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  edgeRating,
  edgesDiffer,
  frameFill,
  matchedEdges,
  openEdges,
  seamMaskImage,
  seamWidth,
} from './background.ts'

const EDGE = {
  transparent: false as const,
  color: '#ECECEC',
  top: '#DCD4C6',
  bottom: '#96785A',
  left: '#ECECEC',
  right: '#ECECEC',
  agreement: 0.97,
}
const FRAME = { width: 925, height: 1131 }
const CONTAIN = { x: 0, y: 103, width: 925, height: 925, scale: 0.925 }
const FIXED = { background: '#FFFFFF', backgroundMode: 'color' as const, backgroundStyle: 'solid' as const }
const MATCH = { ...FIXED, backgroundMode: 'match' as const }

test('the fixed colour fills the frame unless matching is on', () => {
  assert.deepEqual(frameFill(FIXED, EDGE, CONTAIN, FRAME), { backgroundColor: '#FFFFFF' })
  assert.equal(matchedEdges(FIXED, EDGE), null)
})

test('a solid match uses the colour measured around the whole photo', () => {
  assert.deepEqual(frameFill(MATCH, EDGE, CONTAIN, FRAME), { backgroundColor: '#ECECEC' })
})

test('photos with nothing to match keep the fixed colour', () => {
  assert.deepEqual(frameFill(MATCH, { transparent: true }, CONTAIN, FRAME), {
    backgroundColor: '#FFFFFF',
  })
  assert.deepEqual(frameFill(MATCH, null, CONTAIN, FRAME), { backgroundColor: '#FFFFFF' })
  const garbage = { ...EDGE, color: 'red; background: url(x)' }
  assert.equal(matchedEdges(MATCH, garbage), null)
})

test('a blend holds each edge colour across the band it touches', () => {
  const fill = frameFill({ ...MATCH, backgroundStyle: 'vertical' }, EDGE, CONTAIN, FRAME)
  assert.equal(fill.backgroundColor, '#DCD4C6')
  // 103 / 1131 and 1028 / 1131 - the photo's top and bottom edges.
  assert.equal(fill.backgroundImage, 'linear-gradient(to bottom, #DCD4C6 9.107%, #96785A 90.893%)')
})

test('a blend stays anchored to the real edges of a cropped photo', () => {
  // Zoomed to 120% in a 1080 x 1080 frame, the photo runs from y -108 to 1188,
  // so the side bands must pick up the blend part-way, as the renderer does.
  const zoomed = { x: 151.2, y: -108, width: 777.6, height: 1296, scale: 1.296 }
  const fill = frameFill({ ...MATCH, backgroundStyle: 'vertical' }, EDGE, zoomed, {
    width: 1080,
    height: 1080,
  })
  assert.equal(fill.backgroundImage, 'linear-gradient(to bottom, #DCD4C6 -10.000%, #96785A 110.000%)')
})

test('a blend with matching top and bottom is just that colour', () => {
  const even = { ...EDGE, top: '#EEEEEE', bottom: '#eeeeee' }
  assert.deepEqual(frameFill({ ...MATCH, backgroundStyle: 'vertical' }, even, CONTAIN, FRAME), {
    backgroundColor: '#EEEEEE',
  })
})

test('only sides with background beyond them are open', () => {
  assert.deepEqual(openEdges(CONTAIN, FRAME), { left: false, right: false, top: true, bottom: true })
  const scaledDown = { x: 231.25, y: 334.25, width: 462.5, height: 462.5, scale: 0.4625 }
  assert.deepEqual(openEdges(scaledDown, FRAME), { left: true, right: true, top: true, bottom: true })
  const cover = { x: -103, y: 0, width: 1131, height: 1131, scale: 1.131 }
  assert.deepEqual(openEdges(cover, FRAME), { left: false, right: false, top: false, bottom: false })
})

test('the seam width scales with the frame and never passes half the photo', () => {
  assert.equal(seamWidth(40, CONTAIN, FRAME).toFixed(3), '34.259')
  const sliver = { x: 0, y: 500, width: 925, height: 40, scale: 0.04 }
  assert.equal(seamWidth(60, sliver, FRAME), 20)
})

test('no mask when softening is off or no edge meets the background', () => {
  assert.equal(seamMaskImage(0, CONTAIN, FRAME, 0.5), undefined)
  const cover = { x: -103, y: 0, width: 1131, height: 1131, scale: 1.131 }
  assert.equal(seamMaskImage(40, cover, FRAME, 0.5), undefined)
})

test('the mask fades only the open edges, in display pixels', () => {
  const mask = seamMaskImage(40, CONTAIN, FRAME, 0.5)
  assert.ok(mask)
  // Contain leaves bands above and below only: one top/bottom layer.
  assert.ok(mask.startsWith('linear-gradient(to bottom, rgba(0, 0, 0, 0) 0.00px'))
  assert.ok(!mask.includes('to right'))
  // 34.259 export px at half size = 17.13 display px, from each end of 462.5.
  assert.ok(mask.includes('rgba(0, 0, 0, 1) 17.13px'))
  assert.ok(mask.includes('rgba(0, 0, 0, 1) 445.37px'))
  assert.ok(mask.endsWith('rgba(0, 0, 0, 0) 462.50px)'))
})

test('a scaled-down photo fades on all four sides', () => {
  const scaledDown = { x: 231.25, y: 334.25, width: 462.5, height: 462.5, scale: 0.4625 }
  const mask = seamMaskImage(40, scaledDown, FRAME, 1)
  assert.ok(mask)
  assert.equal(mask.match(/linear-gradient/g)?.length, 2)
  assert.ok(mask.startsWith('linear-gradient(to right'))
})

test('ratings and the top/bottom hint', () => {
  assert.equal(edgeRating(0.97), 'plain')
  assert.equal(edgeRating(0.85), 'plain')
  assert.equal(edgeRating(0.7), 'mostly-plain')
  assert.equal(edgeRating(0.41), 'busy')
  assert.equal(edgesDiffer(EDGE), true)
  // A sweep that darkens by 6 levels already shows a line with one flat colour.
  assert.equal(edgesDiffer({ ...EDGE, top: '#EFEFEF', bottom: '#E9E9E9' }), true)
  assert.equal(edgesDiffer({ ...EDGE, top: '#ECECEC', bottom: '#EAEAEA' }), false)
})
