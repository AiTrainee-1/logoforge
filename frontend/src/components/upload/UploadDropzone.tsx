/** Click-to-upload and drag-and-drop for the base images. */
import { Loader2, UploadCloud } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'

import { Progress } from '@/components/ui/primitives'
import { useToast } from '@/components/ui/toast'
import { useStudio } from '@/hooks/useStudio'
import { cn } from '@/lib/utils'

const ACCEPT = 'image/*,.jpg,.jpeg,.png,.webp,.gif,.bmp,.tif,.tiff,.heic,.heif,.avif'

export function UploadDropzone({ compact = false }: { compact?: boolean }) {
  const { images } = useStudio()
  const { toast } = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [isOver, setOver] = useState(false)

  const accept = useCallback(
    (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return
      const files = [...fileList].filter((file) => file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp|tiff?|heic|heif|avif)$/i.test(file.name))
      if (files.length === 0) {
        toast('Those files are not images', {
          description: 'Upload JPG, PNG, WebP, GIF or TIFF files.',
          variant: 'error',
        })
        return
      }
      void images.addFiles(files)
    },
    [images, toast],
  )

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault()
          setOver(false)
          accept(event.dataTransfer.files)
        }}
        disabled={images.isUploading}
        className={cn(
          'flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-card/60 text-center transition-colors hover:border-primary/60 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-60',
          compact ? 'px-3 py-3' : 'px-4 py-8',
          isOver && 'border-primary bg-accent/60',
        )}
      >
        {images.isUploading ? (
          <Loader2 className="size-5 animate-spin text-primary" />
        ) : (
          <UploadCloud className={cn('text-muted-foreground', compact ? 'size-4' : 'size-7')} />
        )}
        <span className={cn('font-medium', compact ? 'text-[13px]' : 'text-sm')}>
          {images.isUploading ? 'Uploading…' : compact ? 'Add more images' : 'Upload images'}
        </span>
        {!compact ? (
          <span className="text-[12px] text-muted-foreground">
            Click to browse or drop files here · JPG, PNG, WebP, GIF, TIFF
          </span>
        ) : null}
      </button>

      {images.isUploading ? <Progress value={images.uploadProgress} /> : null}

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        onChange={(event) => {
          accept(event.target.files)
          event.target.value = ''
        }}
      />
    </div>
  )
}
