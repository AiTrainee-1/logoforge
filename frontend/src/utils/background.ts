/**
 * Port of `backend/services/background_service.py`: what fills the frame where
 * the photo doesn't cover it, and how the photo's edges fade into that fill.
 *
 * The edge colours themselves are measured once, by the server, at upload
 * (`UploadedImage.edge`). This file only turns those numbers - or the fixed
 * colour - into the preview's CSS, using the same geometry the renderer uses,
 * so the frame on screen matches the exported file.
 */
import type { EdgeColors, ExportSettings } from '@/types/editor'

import { REFERENCE_WIDTH } from './transforms.ts'
import type { Placement, Size } from './transforms.ts'

/** Widest seam fade, in pixels at the 1080 px reference width. */
export const SEAM_SOFTEN_MAX = 60

/** Smoothstep sampled at six points - the same stops as `EASE_STOPS` in Python. */
export const EASE_STOPS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [0.2, 0.104],
  [0.4, 0.352],
  [0.6, 0.648],
  [0.8, 0.896],
  [1, 1],
]

export type MatchedEdges = Extract<EdgeColors, { transparent: false }>

const HEX = /^#[0-9a-f]{6}$/i

/** The edge colours to fill with, when matching is on and the photo has some. */
export function matchedEdges(
  settings: Pick<ExportSettings, 'backgroundMode'>,
  edge: EdgeColors | null | undefined,
): MatchedEdges | null {
  if (settings.backgroundMode !== 'match' || !edge || edge.transparent) return null
  if (![edge.color, edge.top, edge.bottom].every((value) => HEX.test(value))) return null
  return edge
}

export interface FrameFill {
  backgroundColor: string
  backgroundImage?: string
}

/**
 * CSS for the frame behind the photo. Mirrors `background_fill` and
 * `paint_background`: a blend holds the top colour down to the photo's top
 * edge, moves to the bottom colour by its bottom edge and holds it below. The
 * two stops sit at the photo's real edges, even outside the frame (below 0% or
 * past 100%), and CSS extends the end colours beyond them - exactly what the
 * renderer paints for a cropped photo.
 */
export function frameFill(
  settings: Pick<ExportSettings, 'background' | 'backgroundMode' | 'backgroundStyle'>,
  edge: EdgeColors | null | undefined,
  placement: Placement,
  frame: Size,
): FrameFill {
  const matched = matchedEdges(settings, edge)
  if (!matched) return { backgroundColor: settings.background }
  if (settings.backgroundStyle !== 'vertical') return { backgroundColor: matched.color }

  const { top, bottom } = matched
  if (top.toUpperCase() === bottom.toUpperCase()) return { backgroundColor: top }
  const start = placement.y / frame.height
  const end = (placement.y + placement.height) / frame.height
  return {
    backgroundColor: top,
    backgroundImage: `linear-gradient(to bottom, ${top} ${percent(start)}, ${bottom} ${percent(end)})`,
  }
}

export interface OpenEdges {
  left: boolean
  right: boolean
  top: boolean
  bottom: boolean
}

/** Sides of the photo with background beyond them. Mirrors `open_edges`. */
export function openEdges(placement: Placement, frame: Size): OpenEdges {
  return {
    left: placement.x > 0.5,
    right: placement.x + placement.width < frame.width - 0.5,
    top: placement.y > 0.5,
    bottom: placement.y + placement.height < frame.height - 0.5,
  }
}

/** Fade width in frame pixels, capped so opposite fades never overlap. */
export function seamWidth(soften: number, placement: Placement, frame: Size): number {
  const width = (soften * frame.width) / REFERENCE_WIDTH
  return Math.min(width, placement.width / 2, placement.height / 2)
}

/**
 * CSS `mask-image` for the photo element, fading the edges that meet the
 * background. Mirrors `seam_mask`.
 *
 * `placement` and `frame` are in export pixels, so which edges fade and by
 * how much is decided exactly as the renderer decides it; `displayScale`
 * converts the result to the preview's own pixels. Undefined when nothing
 * fades. Two layers (sides, then top/bottom) combine with
 * `mask-composite: intersect`.
 */
export function seamMaskImage(
  soften: number,
  placement: Placement,
  frame: Size,
  displayScale: number,
): string | undefined {
  const width = seamWidth(soften, placement, frame)
  const open = openEdges(placement, frame)
  if (width < 0.5 || !(open.left || open.right || open.top || open.bottom)) return undefined

  const fade = width * displayScale
  const layers: string[] = []
  if (open.left || open.right) {
    layers.push(axisGradient('to right', placement.width * displayScale, fade, open.left, open.right))
  }
  if (open.top || open.bottom) {
    layers.push(axisGradient('to bottom', placement.height * displayScale, fade, open.top, open.bottom))
  }
  return layers.join(', ')
}

function axisGradient(
  direction: 'to right' | 'to bottom',
  length: number,
  fade: number,
  fadeStart: boolean,
  fadeEnd: boolean,
): string {
  const stops: string[] = []
  if (fadeStart) {
    for (const [t, alpha] of EASE_STOPS) stops.push(`rgba(0, 0, 0, ${alpha}) ${px(t * fade)}`)
  } else {
    stops.push('#000 0px')
  }
  if (fadeEnd) {
    for (const [t, alpha] of [...EASE_STOPS].reverse()) {
      stops.push(`rgba(0, 0, 0, ${alpha}) ${px(length - t * fade)}`)
    }
  } else {
    stops.push(`#000 ${px(length)}`)
  }
  return `linear-gradient(${direction}, ${stops.join(', ')})`
}

/** How plain the backdrop is, from the share of edge pixels near its colour. */
export type EdgeRating = 'plain' | 'mostly-plain' | 'busy'

export function edgeRating(agreement: number): EdgeRating {
  if (agreement >= 0.85) return 'plain'
  if (agreement >= 0.6) return 'mostly-plain'
  return 'busy'
}

/**
 * True when the top and bottom edges differ enough that one flat colour would
 * leave a faint line along one of them - typical of a studio sweep, which
 * darkens towards the floor. Four levels is already visible on a plain backdrop.
 */
export function edgesDiffer(edge: MatchedEdges): boolean {
  const a = rgb(edge.top)
  const b = rgb(edge.bottom)
  return Math.max(...a.map((value, index) => Math.abs(value - b[index]))) >= 4
}

function rgb(hex: string): number[] {
  const value = HEX.test(hex) ? parseInt(hex.slice(1), 16) : 0xffffff
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

function percent(fraction: number): string {
  return `${(fraction * 100).toFixed(3)}%`
}

function px(value: number): string {
  return `${value.toFixed(2)}px`
}
