import { useCallback, useState } from 'react'

import { ComposerPage } from '@/components/compose/ComposerPage'
import { Landing } from '@/components/landing/Landing'
import type { Page } from '@/components/layout/Header'
import { Studio } from '@/components/layout/Studio'
import { ToastProvider, useToast } from '@/components/ui/toast'
import { useCompose } from '@/hooks/useCompose'
import { useFontSync } from '@/hooks/useFontSync'
import { StudioProvider } from '@/hooks/useStudio'

function Shell() {
  const [page, setPage] = useState<Page>('landing')
  const { toast } = useToast()

  // Load the server's label font when it bundles one, so the preview and the
  // exported pixels use the very same glyphs.
  useFontSync()

  const notifyError = useCallback(
    (message: string) =>
      toast('Something went wrong', { description: message, variant: 'error' }),
    [toast],
  )

  // The composer keeps its own session so the two editors never interfere.
  const compose = useCompose(notifyError)

  if (page === 'composer') {
    return <ComposerPage compose={compose} onNavigate={setPage} />
  }
  if (page === 'studio') {
    return <Studio onNavigate={setPage} />
  }
  return (
    <Landing
      onStart={() => setPage('studio')}
      onOpenComposer={() => setPage('composer')}
      onOpenCatalog={() => {
        // A fresh catalog card, so the guided upload + paste panel shows up
        // right away instead of whatever the general image editor left behind.
        if (!compose.elements.length) {
          compose.setCanvas({ mode: 'card', preset: 'catalog' })
        }
        setPage('composer')
      }}
    />
  )
}

function App() {
  return (
    <ToastProvider>
      <StudioProvider>
        <Shell />
      </StudioProvider>
    </ToastProvider>
  )
}

export default App
