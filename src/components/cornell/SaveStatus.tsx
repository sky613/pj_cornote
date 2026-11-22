import { AlertTriangle, CheckCircle2, CloudOff, Loader2 } from 'lucide-react'
import type { SaveStatus as Status } from '@/features/notes/useAutoSave'
import { useOnlineStatus } from '@/lib/hooks'

export function SaveStatus({ status }: { status: Status }) {
  const online = useOnlineStatus()
  const content = (() => {
    switch (status) {
      case 'dirty':
      case 'saving':
        return { icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />, text: '저장 중…', tone: 'text-muted' }
      case 'error':
        return { icon: <AlertTriangle className="h-3.5 w-3.5" />, text: '저장 실패 · 입력 내용은 유지됩니다', tone: 'text-danger' }
      case 'conflict':
        return { icon: <AlertTriangle className="h-3.5 w-3.5" />, text: '충돌 사본 보존됨', tone: 'text-warning' }
      default:
        return online
          ? { icon: <CheckCircle2 className="h-3.5 w-3.5" />, text: '저장됨', tone: 'text-success' }
          : { icon: <CloudOff className="h-3.5 w-3.5" />, text: '오프라인 · 기기에 저장됨', tone: 'text-warning' }
    }
  })()
  return (
    <span role="status" aria-live="polite" className={`inline-flex items-center gap-1 text-xs ${content.tone}`}>
      {content.icon}
      {content.text}
    </span>
  )
}
