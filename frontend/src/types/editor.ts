/**
 * The editor's data model.
 *
 * `ImageTransform` is per image and never shared: editing image A must not
 * change image B. Logo, character label and export settings are global.
 */

export type LogoPosition =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'center'
  | 'custom'

export type ExportFormat =
  | 'original'
  | 'instagram-portrait'
  | 'instagram-square'
  | 'instagram-landscape'
  | '925x1131'

export type FitMode = 'cover' | 'contain'

export type LabelBackground = 'none' | 'shadow' | 'pill'

export interface ImageTransform {
  /** Multiplier on top of the base "cover" fit. 1 = fills the frame. */
  scale: number
  /** Horizontal shift, percent of the frame width. */
  offsetX: number
  /** Vertical shift, percent of the frame height. */
  offsetY: number
}

export const DEFAULT_TRANSFORM: ImageTransform = {
  scale: 1,
  offsetX: 0,
  offsetY: 0,
}

export type ProcessingStatus = 'idle' | 'processing' | 'completed' | 'failed'

export interface UploadedImage {
  /** Server-side id; also the key for this image's transform. */
  id: string
  name: string
  width: number
  height: number
  size: number
  format: string
  mime: string
  hasAlpha: boolean
  /** Object URL of the original file - preview only, never the export source. */
  previewUrl: string
  /** Small data URL used by the thumbnail grid. */
  thumbUrl: string
  transform: ImageTransform
  /** Extra letters / text placed on this image. Never shared with another. */
  overlays: OverlayElement[]
  processing?: {
    status: ProcessingStatus
    outputUrl?: string
    error?: string
  }
}

export interface LogoAsset {
  id: string
  name: string
  width: number
  height: number
  size: number
  previewUrl: string
}

export interface LogoSettings {
  position: LogoPosition
  /** Logo width as a percentage of the output frame width. */
  sizePercent: number
  /** Margin in pixels at a 1080 px reference width; scales with the output. */
  margin: number
  opacity: number
  rotation: number
  /** Only used when position is "custom" - centre of the logo, in percent. */
  customX: number
  customY: number
}

export interface CharacterLabelSettings {
  enabled: boolean
  /** Font size in pixels at a 1080 px reference width. */
  fontSize: number
  color: string
  opacity: number
  bottomMargin: number
  bold: boolean
  background: LabelBackground
  backgroundColor: string
  backgroundOpacity: number
}

export interface ExportSettings {
  format: ExportFormat
  fit: FitMode
  quality: number
  background: string
  keepTransparency: boolean
}

export interface EditorView {
  /** How large the canvas is drawn on screen. Never affects the output. */
  zoom: number
}

export interface ProcessedResult {
  imageId: string
  index: number
  label: string
  sourceName: string
  filename: string | null
  width?: number
  height?: number
  format?: string
  mime?: string
  size?: number
  passthrough?: boolean
  resampled?: boolean
  notes?: string[]
  status: 'completed' | 'failed'
  error?: string
  downloadUrl?: string
}

export interface JobStatus {
  jobId: string
  status: 'idle' | 'processing' | 'completed' | 'failed' | 'partial'
  progress: number
  total: number
  completed: number
  failed: number
  results: ProcessedResult[]
}

export const DEFAULT_LOGO_SETTINGS: LogoSettings = {
  position: 'top-right',
  sizePercent: 12,
  margin: 30,
  opacity: 100,
  rotation: 0,
  customX: 50,
  customY: 50,
}

export const DEFAULT_LABEL_SETTINGS: CharacterLabelSettings = {
  enabled: true,
  fontSize: 36,
  color: '#FFFFFF',
  opacity: 100,
  bottomMargin: 30,
  bold: true,
  background: 'shadow',
  backgroundColor: '#000000',
  backgroundOpacity: 45,
}

export const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  format: 'original',
  fit: 'cover',
  quality: 100,
  background: '#FFFFFF',
  keepTransparency: true,
}

/* --------------------------------------------------------------------------
   Free-position elements
   --------------------------------------------------------------------------
   Used by BOTH editors: the "extra letters" dropped onto a batch image, and
   everything on the composer canvas. One shape, one renderer on the server.

   `x` / `y` are the element's CENTRE as a percentage of the frame, so the same
   numbers describe a 480 px preview and a 4000 px export. Sizes are pixels at
   the 1080 px reference width and scale with the output.
   -------------------------------------------------------------------------- */

export type ElementType = 'text' | 'image'

export type TextAlign = 'left' | 'center' | 'right'

export interface OverlayElement {
  id: string
  type: ElementType
  x: number
  y: number
  rotation: number
  opacity: number

  // text elements
  text: string
  fontSize: number
  lineHeight: number
  /** Extra space between characters, in reference-width px. 0 = normal. */
  letterSpacing: number
  color: string
  bold: boolean
  align: TextAlign
  background: LabelBackground
  backgroundColor: string
  backgroundOpacity: number
  /**
   * Text BOX width, percent of frame width. 0 = not a box: the element keeps
   * the free-floating, never-wraps behaviour every existing text element
   * (Studio's extra letters, plain composer stamps) already relies on.
   * A positive value switches the same element to word-wrapped rendering.
   */
  boxWidth: number
  /** Target box height, percent of frame height. 0/too small = auto - the
   * box always grows to fit its wrapped content; text is never clipped. */
  boxHeight: number

  // image elements
  assetId: string
  widthPercent: number
}

export const DEFAULT_ELEMENT: Omit<OverlayElement, 'id'> = {
  type: 'text',
  x: 50,
  y: 50,
  rotation: 0,
  opacity: 100,
  text: 'A',
  fontSize: 48,
  lineHeight: 1.2,
  letterSpacing: 0,
  color: '#FFFFFF',
  bold: true,
  align: 'center',
  background: 'shadow',
  backgroundColor: '#000000',
  backgroundOpacity: 45,
  boxWidth: 0,
  boxHeight: 0,
  assetId: '',
  widthPercent: 20,
}

/** An image uploaded to be placed on a canvas (photo or logo). */
export interface CanvasAsset {
  id: string
  name: string
  width: number
  height: number
  size: number
  format: string
  previewUrl: string
}

export type CanvasMode = 'image' | 'card'

export type CardPreset =
  | 'a4-150'
  | 'a4-300'
  | 'square-1080'
  | 'square-2048'
  | 'portrait-1080'
  | 'story-1080'
  | 'catalog'
  | 'custom'

export interface CanvasSettings {
  mode: CanvasMode
  preset: CardPreset
  width: number
  height: number
  background: string
  transparent: boolean
  outputFormat: 'auto' | 'jpeg' | 'png' | 'webp'
  quality: number
}

export const DEFAULT_CANVAS: CanvasSettings = {
  mode: 'image',
  preset: 'a4-150',
  width: 1240,
  height: 1754,
  background: '#FFFFFF',
  transparent: false,
  outputFormat: 'auto',
  quality: 100,
}

export interface ComposeResult {
  width: number
  height: number
  format: string
  size: number
  filename: string
  passthrough: boolean
  downloadUrl: string
}
