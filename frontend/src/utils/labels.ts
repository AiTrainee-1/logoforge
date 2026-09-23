/**
 * Excel style alphabetic labels: 0 -> A, 25 -> Z, 26 -> AA, 27 -> AB.
 *
 * Labels are always derived from the image's *current* position in the list,
 * never stored on the image, so reordering renumbers everything for free.
 * This mirrors `backend/utils/filenames.py::alphabetic_label`.
 */
export function alphabeticLabel(index: number): string {
  if (!Number.isFinite(index) || index < 0) return ''
  let label = ''
  let value = Math.floor(index) + 1
  while (value > 0) {
    const remainder = (value - 1) % 26
    label = String.fromCharCode(65 + remainder) + label
    value = Math.floor((value - 1) / 26)
  }
  return label
}

/** Labels for a whole list, in order. */
export function labelsFor(count: number): string[] {
  return Array.from({ length: count }, (_, index) => alphabeticLabel(index))
}
