/** Minimal toast system used for friendly error and success messages. */
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { createContext, use, useCallback, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export type ToastVariant = 'info' | 'success' | 'error'

interface Toast {
  id: number
  title: string
  description?: string
  variant: ToastVariant
}

interface ToastContextValue {
  toast: (title: string, options?: { description?: string; variant?: ToastVariant }) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const ICONS = {
  info: Info,
  success: CheckCircle2,
  error: AlertTriangle,
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id))
  }, [])

  const toast = useCallback<ToastContextValue['toast']>(
    (title, options) => {
      const id = nextId.current++
      setToasts((current) => [
        ...current.slice(-3),
        { id, title, description: options?.description, variant: options?.variant ?? 'info' },
      ])
      window.setTimeout(() => dismiss(id), options?.variant === 'error' ? 8000 : 4500)
    },
    [dismiss],
  )

  const value = useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext value={value}>
      {children}
      <div className="pointer-events-none fixed top-4 right-4 z-[100] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((item) => {
          const Icon = ICONS[item.variant]
          return (
            <div
              key={item.id}
              role="status"
              className={cn(
                'animate-fade-in pointer-events-auto flex items-start gap-3 rounded-xl border border-border bg-card p-3 shadow-lg',
                item.variant === 'error' && 'border-destructive/40',
                item.variant === 'success' && 'border-success/40',
              )}
            >
              <Icon
                className={cn(
                  'mt-0.5 size-4 shrink-0',
                  item.variant === 'error' && 'text-destructive',
                  item.variant === 'success' && 'text-success',
                  item.variant === 'info' && 'text-primary',
                )}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{item.title}</p>
                {item.description ? (
                  <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">
                    {item.description}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Dismiss"
              >
                <X className="size-3.5" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext>
  )
}

export function useToast(): ToastContextValue {
  const context = use(ToastContext)
  if (!context) throw new Error('useToast must be used inside <ToastProvider>')
  return context
}
