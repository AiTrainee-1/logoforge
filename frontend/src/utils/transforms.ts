/**
 * Port of `backend/services/transform_service.py` + the logo/label geometry.
 *
 * The preview and the exported file MUST use the same maths, so every function
 * here has a Python twin. Values are resolution independent (offsets are
 * percentages, pixel settings are authored against a 1080 px reference width),
 * which is what lets a 480 px preview describe a 4000 px export exactly.
 */
import type {
  CharacterLabelSettings,
  ExportFormat,
  ExportSettings,
  FitMode,
  ImageTransform,
  LogoSettings,
} from '@/types/editor'

/** Frame width that pixel-valued settings (margins, font size) refer to. */
export const REFERENCE_WIDTH = 1080

export const EXPORT_PRESETS: Record<ExportFormat, { width: number; height: number } | null> = {
  original: null,
  'instagram-portrait': { width: 1080, height: 1350 },
  'instagram-square': { width: 1080, height: 1080 },
  'instagram-landscape': { width: 1080, height: 566 },
  '925x1131': { width: 925, height: 1131 },
}

export const EXPORT_LABELS: Record<ExportFormat, string> = {
  original: 'Original',
  'instagram-portrait': 'Instagram Portrait 4:5',
  'instagram-square': 'Instagram Square 1:1',
  'instagram-landscape': 'Instagram Landscape 1.91:1',
  '925x1131': '925 × 1131',
}

export interface Size {
  width: number
  height: number
}

export interface Placement {
  x: number
  y: number
  width: number
  height: number
  scale: number
}

export const SCALE_MIN = 0.5
export const SCALE_MAX = 3
export const OFFSET_LIMIT = 100

export function clamp(value: number, low: number, high: number): number {
  if (!Number.isFinite(value)) return low
  return value < low ? low : value > high ? high : value
}

export function roundTo(value: number, decimals = 2): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

/** The output frame for one image. "original" keeps the source's own size. */
export function computeFrame(source: Size, settings: ExportSettings): Size {
  const preset = EXPORT_PRESETS[settings.format]
  if (!preset) return { width: source.width, height: source.height }
  return { ...preset }
}

/** Scale that makes the source cover (or fit inside) the frame. */
export function baseScale(source: Size, frame: Size, fit: FitMode = 'cover'): number {
  if (source.width <= 0 || source.height <= 0) return 1
  const sx = frame.width / source.width
  const sy = frame.height / source.height
  return fit === 'cover' ? Math.max(sx, sy) : Math.min(sx, sy)
}

/** Where the source image is drawn inside the frame, in frame pixels. */
export function computePlacement(
  source: Size,
  frame: Size,
  transform: ImageTransform,
  fit: FitMode = 'cover',
): Placement {
  const effective = baseScale(source, frame, fit) * Math.max(transform.scale, 1e-6)
  const width = source.width * effective
  const height = source.height * effective
  const x = (frame.width - width) / 2 + (transform.offsetX / 100) * frame.width
  const y = (frame.height - height) / 2 + (transform.offsetY / 100) * frame.height
  return { x, y, width, height, scale: effective }
}

/** Multiplier turning reference-width pixels into frame pixels. */
export function referenceFactor(frameWidth: number): number {
  return Math.max(frameWidth, 1) / REFERENCE_WIDTH
}

export function scaledPx(value: number, frameWidth: number): number {
  return value * referenceFactor(frameWidth)
}

/** The un-rotated logo box, in frame pixels. Rotation happens about its centre. */
export function logoBox(frame: Size, logo: Size, settings: LogoSettings): Placement {
  const width = (settings.sizePercent / 100) * frame.width
  const height = logo.width > 0 ? width * (logo.height / logo.width) : width
  const margin = scaledPx(settings.margin, frame.width)

  let x: number
  let y: number
  if (settings.position === 'custom') {
    x = (settings.customX / 100) * frame.width - width / 2
    y = (settings.customY / 100) * frame.height - height / 2
  } else if (settings.position === 'center') {
    x = (frame.width - width) / 2
    y = (frame.height - height) / 2
  } else {
    const [vertical, horizontal] = settings.position.split('-')
    x = horizontal === 'left' ? margin : frame.width - width - margin
    y = vertical === 'top' ? margin : frame.height - height - margin
  }
  return { x, y, width, height, scale: 1 }
}

/**
 * Preview geometry for the character label.
 *
 * Pillow positions the label by its *ink* box; CSS positions a line box that
 * also contains the descender. `BASELINE_RATIO` compensates so the preview
 * sits where the rendered pixels will.
 */
const BASELINE_RATIO = 0.2
const CAP_HEIGHT_RATIO = 0.72

export interface LabelGeometry {
  fontPx: number
  /** Distance from the frame bottom to the bottom of the CSS line box. */
  bottomPx: number
  /** The raw bottom margin, used for the pill background's own box. */
  marginPx: number
  strokePx: number
  padX: number
  padY: number
  capHeightPx: number
  pillHeight: number
}

export function labelGeometry(frame: Size, settings: CharacterLabelSettings): LabelGeometry {
  const fontPx = scaledPx(settings.fontSize, frame.width)
  const strokePx = settings.background === 'shadow' ? fontPx * 0.08 : 0
  const padX = settings.background === 'pill' ? fontPx * 0.5 : strokePx + 2
  const padY = settings.background === 'pill' ? fontPx * 0.26 : strokePx + 2
  const margin = scaledPx(settings.bottomMargin, frame.width)
  return {
    fontPx,
    strokePx,
    padX,
    padY,
    marginPx: margin,
    capHeightPx: fontPx * CAP_HEIGHT_RATIO,
    pillHeight: fontPx * CAP_HEIGHT_RATIO + padY * 2,
    bottomPx: margin + padY - fontPx * BASELINE_RATIO,
  }
}

/** `rgba()` string from `#rrggbb` + 0-100 opacity. */
export function rgba(hex: string, opacity: number): string {
  const value = hex.replace('#', '')
  const full =
    value.length === 3
      ? value
          .split('')
          .map((char) => char + char)
          .join('')
      : value
  const red = Number.parseInt(full.slice(0, 2), 16) || 0
  const green = Number.parseInt(full.slice(2, 4), 16) || 0
  const blue = Number.parseInt(full.slice(4, 6), 16) || 0
  return `rgba(${red}, ${green}, ${blue}, ${clamp(opacity, 0, 100) / 100})`
}

/** What the user will actually get, for the "Output" summary panel. */
export interface OutputInfo {
  width: number
  height: number
  format: string
  resized: boolean
  quality: number
}

const FORMAT_MAP: Record<string, string> = {
  JPEG: 'JPEG',
  MPO: 'JPEG',
  PNG: 'PNG',
  WEBP: 'WEBP',
  TIFF: 'TIFF',
  BMP: 'PNG',
  GIF: 'PNG',
  HEIF: 'JPEG',
  AVIF: 'JPEG',
}

export function outputInfo(
  source: Size & { format: string },
  settings: ExportSettings,
): OutputInfo {
  const frame = computeFrame(source, settings)
  const format = FORMAT_MAP[(source.format || '').toUpperCase()] ?? 'PNG'
  return {
    width: frame.width,
    height: frame.height,
    format,
    resized: frame.width !== source.width || frame.height !== source.height,
    quality: settings.quality,
  }
}

/** Clamp a transform to the editor's slider ranges. */
export function normaliseTransform(transform: ImageTransform): ImageTransform {
  return {
    scale: roundTo(clamp(transform.scale, SCALE_MIN, SCALE_MAX), 3),
    offsetX: roundTo(clamp(transform.offsetX, -OFFSET_LIMIT, OFFSET_LIMIT), 2),
    offsetY: roundTo(clamp(transform.offsetY, -OFFSET_LIMIT, OFFSET_LIMIT), 2),
  }
}

export function transformsEqual(a: ImageTransform, b: ImageTransform): boolean {
  return (
    Math.abs(a.scale - b.scale) < 1e-6 &&
    Math.abs(a.offsetX - b.offsetX) < 1e-6 &&
    Math.abs(a.offsetY - b.offsetY) < 1e-6
  )
}
