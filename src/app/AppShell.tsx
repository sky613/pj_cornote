import { useLiveQuery } from 'dexie-react-hooks'
import { AlertTriangle, BookOpenCheck, Cloud, CloudOff, Loader2, NotebookPen, Settings } from 'lucide-react'
import { NavLink, Outlet } from 'react-router'
import { getDueQuestions } from '@/features/review/repository'
import { useSync } from '@/features/sync/SyncProvider'
import { cn } from '@/lib/cn'
import { useOnlineStatus } from '@/lib/hooks'
import { ReloadPrompt } from './ReloadPrompt'

function SyncIndicator() {
  const { state, conflictCount } = useSync()
  const online = useOnlineStatus()
  if (!online) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-warning" title="오프라인: 변경 내용은 기기에 저장됩니다">
        <CloudOff className="h-4 w-4" /> <span className="hidden sm:inline">오프라인</span>
      </span>
    )
  }
  if (conflictCount > 0) {
    return (
      <NavLink to="/settings" className="inline-flex items-center gap-1 text-xs text-warning" title="동기화 충돌 확인">
        <AlertTriangle className="h-4 w-4" /> <span className="hidden sm:inline">충돌 {conflictCount}</span>
      </NavLink>
    )
  }
  if (state === 'syncing') return <Loader2 className="h-4 w-4 animate-spin text-muted" aria-label="동기화 중" />
  if (state === 'error') return <AlertTriangle className="h-4 w-4 text-danger" aria-label="동기화 오류" />
  if (state === 'idle') return <Cloud className="h-4 w-4 text-success" aria-label="동기화됨" />
  return null
}

const navClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium sm:px-3',
    isActive ? 'bg-cue text-primary' : 'text-muted hover:bg-surface-2 hover:text-text',
  )

export function AppShell() {
  const due = useLiveQuery(async () => (await getDueQuestions()).length) ?? 0
  const online = useOnlineStatus()
  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:p-2">
        본문으로 건너뛰기
      </a>
      <header className="sticky top-0 z-30 h-14 border-b border-border bg-surface/95 backdrop-blur pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-full max-w-7xl items-center gap-1 px-3 sm:px-4">
          <NavLink to="/" className="mr-auto flex items-center gap-2 font-bold text-primary">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-fg text-sm">C</span>
            <span className="hidden sm:inline">Cornote</span>
          </NavLink>
          <SyncIndicator />
          <nav aria-label="주 메뉴" className="ml-2 flex items-center gap-1">
            <NavLink to="/" end className={navClass}>
              <NotebookPen className="h-4 w-4" /> <span>노트</span>
            </NavLink>
            <NavLink to="/review" className={navClass}>
              <BookOpenCheck className="h-4 w-4" /> <span>복습</span>
              {due > 0 && (
                <span className="rounded-full bg-accent px-1.5 text-[11px] font-semibold text-white dark:text-bg" aria-label={`${due}문항 예정`}>
                  {due}
                </span>
              )}
            </NavLink>
            <NavLink to="/settings" className={navClass} aria-label="설정">
              <Settings className="h-4 w-4" />
            </NavLink>
          </nav>
        </div>
      </header>
      {!online && (
        <div role="status" className="bg-warning-soft px-4 py-1.5 text-center text-xs text-warning">
          오프라인 상태입니다. 작성한 내용은 이 기기에 안전하게 저장되며, 연결되면 동기화됩니다.
        </div>
      )}
      <main id="main" className="pb-24">
        <Outlet />
      </main>
      <ReloadPrompt />
    </div>
  )
}
