import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'

const base =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-muted/70 ' +
  'focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:opacity-60'

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(base, 'h-10', className)} {...props} />
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(base, 'min-h-20 leading-relaxed', className)} {...props} />
}

export function Label({ className, ...props }: ComponentProps<'label'>) {
  return <label className={cn('mb-1 block text-xs font-medium text-muted', className)} {...props} />
}
