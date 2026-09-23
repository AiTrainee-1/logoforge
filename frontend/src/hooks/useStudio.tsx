/** Composes the editor hooks into one context so components stay thin. */
import { createContext, use, useCallback, useMemo } from 'react'
import type { ReactNode } from 'react'

import { useToast } from '@/components/ui/toast'
import { useEditor, type UseEditor } from '@/hooks/useEditor'
import { useImages, type UseImages } from '@/hooks/useImages'
import { useProcessing, type UseProcessing } from '@/hooks/useProcessing'

export interface Studio {
  images: UseImages
  editor: UseEditor
  processing: UseProcessing
  process: () => Promise<void>
  resetAll: () => Promise<void>
}

const StudioContext = createContext<Studio | null>(null)

export function StudioProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast()

  const notifyError = useCallback(
    (message: string) => toast('Something went wrong', { description: message, variant: 'error' }),
    [toast],
  )

  const images = useImages(notifyError)
  const editor = useEditor()
  const processing = useProcessing(notifyError)

  const process = useCallback(async () => {
    if (!images.jobId || images.images.length === 0) {
      toast('Nothing to process', {
        description: 'Upload at least one image first.',
        variant: 'error',
      })
      return
    }
    await processing.start({
      jobId: images.jobId,
      images: images.images,
      logo: editor.logoSettings,
      label: editor.labelSettings,
      exportSettings: editor.exportSettings,
    })
  }, [editor, images, processing, toast])

  const resetAll = useCallback(async () => {
    processing.reset()
    editor.resetSettings()
    await images.removeAll()
  }, [editor, images, processing])

  const value = useMemo<Studio>(
    () => ({ images, editor, processing, process, resetAll }),
    [editor, images, process, processing, resetAll],
  )

  return <StudioContext value={value}>{children}</StudioContext>
}

export function useStudio(): Studio {
  const context = use(StudioContext)
  if (!context) throw new Error('useStudio must be used inside <StudioProvider>')
  return context
}
