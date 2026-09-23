import { Images, Keyboard, LayoutTemplate, Moon, RotateCcw, Sun } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useTheme } from '@/hooks/useTheme'
import { cn } from '@/lib/utils'

export type Page = 'landing' | 'studio' | 'composer'

const SHORTCUTS: [string, string][] = [
  ['← / →', 'Previous / next image (batch editor)'],
  ['↑ / ↓', 'Nudge the image up / down'],
  ['Shift + arrows', 'Nudge in any direction, faster'],
  ['+ / −', 'Image scale'],
  ['R', "Reset this image's position"],
  ['B', 'Before / after'],
  ['F', 'Fullscreen preview'],
  ['Delete', 'Remove the selected element (composer)'],
  ['Ctrl / ⌘ + Z', 'Undo'],
  ['Ctrl / ⌘ + Shift + Z', 'Redo'],
]

export function Logomark() {
  return (
    <span className="flex items-center gap-2">
      <span className="relative grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm">
        <span className="text-[15px] leading-none font-bold">L</span>
        <span className="absolute -top-1 -right-1 size-3 rounded-[4px] bg-foreground/80" />
      </span>
      <span className="text-[15px] font-semibold tracking-tight">LogoForge</span>
    </span>
  )
}

export function Header({
  page,
  onNavigate,
  onReset,
  canReset = false,
}: {
  page: Page
  onNavigate: (page: Page) => void
  onReset?: () => void
  canReset?: boolean
}) {
  const { theme, toggle } = useTheme()
  const [shortcutsOpen, setShortcutsOpen] = useState(false)

  const tab = (value: Page, label: string, Icon: typeof Images) => (
    <button
      type="button"
      onClick={() => onNavigate(value)}
      className={cn(
        'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[13px] font-medium transition-colors',
        page === value
          ? 'bg-card text-foreground shadow-xs'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon className="size-3.5" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  )

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-card/70 px-4 backdrop-blur">
      <button
        type="button"
        onClick={() => onNavigate('landing')}
        className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <Logomark />
      </button>

      <nav className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
        {tab('studio', 'Batch editor', Images)}
        {tab('composer', 'Image editor', LayoutTemplate)}
      </nav>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setShortcutsOpen(true)}
          title="Keyboard shortcuts"
          aria-label="Keyboard shortcuts"
        >
          <Keyboard className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={toggle}
          title="Toggle theme"
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          disabled={!canReset}
          onClick={onReset}
        >
          <RotateCcw className="size-3.5" />
          <span className="hidden sm:inline">Reset</span>
        </Button>
      </div>

      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent className="w-[min(32rem,94vw)]">
          <DialogHeader>
            <DialogTitle>Keyboard shortcuts</DialogTitle>
            <DialogDescription>They pause automatically while you type.</DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
            {SHORTCUTS.map(([keys, description]) => (
              <div key={keys} className="contents">
                <dt>
                  <kbd className="rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                    {keys}
                  </kbd>
                </dt>
                <dd className="text-muted-foreground">{description}</dd>
              </div>
            ))}
          </dl>
        </DialogContent>
      </Dialog>
    </header>
  )
}
