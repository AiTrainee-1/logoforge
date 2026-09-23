/**
 * Browser-side thumbnail generation for the image grid.
 *
 * These are *display only*. The export is always rendered by the server from
 * the original uploaded file - a preview proxy never becomes the source.
 */
const THUMB_MAX = 256

export async function createThumbnail(file: File, max = THUMB_MAX): Promise<string> {
  try {
    const bitmap = await createImageBitmap(file)
    const ratio = Math.min(max / bitmap.width, max / bitmap.height, 1)
    const width = Math.max(1, Math.round(bitmap.width * ratio))
    const height = Math.max(1, Math.round(bitmap.height * ratio))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) {
      bitmap.close()
      return ''
    }
    context.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()
    return canvas.toDataURL('image/jpeg', 0.72)
  } catch {
    return ''
  }
}

/** Natural size of an image file, used before the server answers. */
export function readImageSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight })
      URL.revokeObjectURL(url)
    }
    image.onerror = () => {
      resolve({ width: 0, height: 0 })
      URL.revokeObjectURL(url)
    }
    image.src = url
  })
}
