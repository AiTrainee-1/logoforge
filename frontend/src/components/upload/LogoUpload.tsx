/** Single logo / watermark upload with a live preview. */
import { Trash2, UploadCloud } from 'lucide-react'
import { useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { useStudio } from '@/hooks/useStudio'
import { cn } from '@/lib/utils'
import { formatDimensions } from '@/utils/format'

const ACCEPT = '.png,.jpg,.jpeg,.webp,.bmp,.gif'

export function LogoUpload() {
  const { images } = useStudio()
  const { toast } = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [isOver, setOver] = useState(false)
  const logo = images.logo

  const accept = (fileList: FileList | null) => {
    const file = fileList?.[0]
    if (!file) return
    if (!/\.(png|jpe?g|webp|bmp|gif)$/i.test(file.name)) {
      toast('Unsupported logo format', {
        description: 'Use a PNG (transparent background works best), JPG or WebP.',
        variant: 'error',
      })
      return
    }
    void images.setLogoFile(file)
  }

  return (
    <div className="space-y-2">
      {logo ? (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-2">
          <div className="bg-checkerboard flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg">
            <img src={logo.previewUrl} alt={logo.name} className="max-h-full max-w-full" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium" title={logo.name}>
              {logo.name}
            </p>
            <p className="font-mono text-[11px] text-muted-foreground">
              {formatDimensions(logo.width, logo.height)}
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
              Change
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => void images.clearLogo()}
            >
              <Trash2 className="size-3.5" />
              Remove
            </Button>
          </div>
        </div>
      ) : (
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
          className={cn(
            'flex w-full flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-border bg-card/60 px-4 py-6 text-center transition-colors hover:border-primary/60 hover:bg-accent/40',
            isOver && 'border-primary bg-accent/60',
          )}
        >
          <UploadCloud className="size-6 text-muted-foreground" />
          <span className="text-[13px] font-medium">Upload your logo</span>
          <span className="text-[11px] text-muted-foreground">
            PNG with transparency recommended
          </span>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
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
