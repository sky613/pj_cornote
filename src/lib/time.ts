export const nowIso = (): string => new Date().toISOString()

export function newId(): string {
  return crypto.randomUUID()
}

const relative = new Intl.RelativeTimeFormat('ko', { numeric: 'auto' })
const absolute = new Intl.DateTimeFormat('ko', { dateStyle: 'medium', timeStyle: 'short' })

export function formatRelative(iso: string, now = new Date()): string {
  const diffSec = Math.round((new Date(iso).getTime() - now.getTime()) / 1000)
  const abs = Math.abs(diffSec)
  if (abs < 60) return relative.format(diffSec, 'second')
  if (abs < 3600) return relative.format(Math.round(diffSec / 60), 'minute')
  if (abs < 86_400) return relative.format(Math.round(diffSec / 3600), 'hour')
  if (abs < 86_400 * 30) return relative.format(Math.round(diffSec / 86_400), 'day')
  return absolute.format(new Date(iso))
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('ko', { dateStyle: 'medium' }).format(new Date(iso))
}
