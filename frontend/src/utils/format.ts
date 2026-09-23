/** Small display helpers. */

export function formatBytes(bytes: number | undefined): string {
  if (!bytes || bytes <= 0) return '0 KB'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function formatDimensions(width?: number, height?: number): string {
  if (!width || !height) return '—'
  return `${width} × ${height}`
}

export function megapixels(width: number, height: number): string {
  return `${((width * height) / 1_000_000).toFixed(1)} MP`
}

export function aspectLabel(width: number, height: number): string {
  if (!width || !height) return ''
  const divisor = greatestCommonDivisor(width, height)
  const w = width / divisor
  const h = height / divisor
  if (w > 40 || h > 40) return `${(width / height).toFixed(2)}:1`
  return `${w}:${h}`
}

function greatestCommonDivisor(a: number, b: number): number {
  return b === 0 ? a : greatestCommonDivisor(b, a % b)
}

/** Strip the extension so long filenames stay readable in tight columns. */
export function shortName(name: string, max = 22): string {
  if (name.length <= max) return name
  const dot = name.lastIndexOf('.')
  const ext = dot > 0 ? name.slice(dot) : ''
  const stem = dot > 0 ? name.slice(0, dot) : name
  return `${stem.slice(0, Math.max(4, max - ext.length - 1))}…${ext}`
}
