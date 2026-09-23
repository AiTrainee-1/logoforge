/** Small presentational primitives shared across the app. */
import * as LabelPrimitive from '@radix-ui/react-label'
import type * as React from 'react'

import { cn } from '@/lib/utils'

export function Label({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      className={cn(
        'text-[13px] leading-none font-medium text-foreground select-none peer-disabled:opacity-60',
        className,
      )}
      {...props}
    />
  )
}

export function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-card text-card-foreground shadow-xs',
        className,
      )}
      {...props}
    />
  )
}

export function Badge({
  className,
  variant = 'default',
  ...props
}: React.ComponentProps<'span'> & { variant?: 'default' | 'muted' | 'success' | 'outline' }) {
  const variants = {
    default: 'bg-primary/10 text-primary',
    muted: 'bg-muted text-muted-foreground',
    success: 'bg-success/15 text-success',
    outline: 'border border-border text-muted-foreground',
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium tracking-wide',
        variants[variant],
        className,
      )}
      {...props}
    />
  )
}

export function Separator({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('h-px w-full bg-border', className)} role="separator" {...props} />
}

export function Progress({
  value,
  className,
  ...props
}: React.ComponentProps<'div'> & { value: number }) {
  return (
    <div
      className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)}
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
      {...props}
    >
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  )
}

export function Input({ className, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'h-9 w-full rounded-lg border border-input bg-card px-3 py-1 text-sm shadow-xs transition-colors outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export function FieldRow({
  label,
  value,
  children,
  hint,
}: {
  label: string
  value?: React.ReactNode
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <Label className="text-muted-foreground">{label}</Label>
        {value !== undefined ? (
          <span className="font-mono text-[12px] tabular-nums text-foreground">{value}</span>
        ) : null}
      </div>
      {children}
      {hint ? <p className="text-[11px] leading-snug text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

export function SectionTitle({
  icon: Icon,
  children,
  action,
}: {
  icon?: React.ComponentType<{ className?: string }>
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 text-[13px] font-semibold tracking-wide text-foreground uppercase">
        {Icon ? <Icon className="size-3.5 text-muted-foreground" /> : null}
        {children}
      </h3>
      {action}
    </div>
  )
}
