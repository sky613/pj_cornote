import { useLiveQuery } from 'dexie-react-hooks'
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { db } from '@/db/local/db'
import { supabase } from '@/db/remote/supabaseClient'
import { createSupabaseRemote } from '@/db/remote/supabaseRemote'
import { useAuth } from '@/features/auth/AuthProvider'
import { useOnlineStatus } from '@/lib/hooks'
import { onLocalChange } from '@/lib/localChanges'
import { runSync } from './engine'
import type { SyncResult } from './types'

export type SyncState = 'local-only' | 'signed-out' | 'offline' | 'idle' | 'syncing' | 'error'

interface SyncContextValue {
  state: SyncState
  lastSyncedAt: string | null
  lastResult: SyncResult | null
  error: string | null
  pendingCount: number
  conflictCount: number
  syncNow(): Promise<void>
}

const SyncContext = createContext<SyncContextValue | null>(null)

const LOCAL_CHANGE_DEBOUNCE_MS = 3_000
const PERIODIC_SYNC_MS = 60_000

export function SyncProvider({ children }: { children: ReactNode }) {
  const { userId } = useAuth()
  const online = useOnlineStatus()
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<SyncResult | null>(null)
  const inFlight = useRef<Promise<void> | null>(null)
  const again = useRef(false)

  const remote = useMemo(() => (supabase ? createSupabaseRemote(supabase) : null), [])

  const pendingCount =
    useLiveQuery(async () => {
      const counts = await Promise.all(
        [db.notes, db.cues, db.questions, db.reviewLogs].map((t) => t.where('syncStatus').equals('pending').count()),
      )
      return counts.reduce((a, b) => a + b, 0)
    }) ?? 0
  const conflictCount = useLiveQuery(() => db.conflicts.filter((c) => !c.resolvedAt).count()) ?? 0

  const syncNow = useCallback(async () => {
    if (!remote || !userId || !navigator.onLine) return
    if (inFlight.current) {
      again.current = true
      return inFlight.current
    }
    const run = (async () => {
      setRunning(true)
      try {
        do {
          again.current = false
          const result = await runSync(remote, userId)
          setLastResult(result)
          setError(result.errors ? `${result.errors}건을 동기화하지 못했습니다. 다음 시도에서 다시 보냅니다.` : null)
          setLastSyncedAt(new Date().toISOString())
        } while (again.current)
      } catch (e) {
        // 동기화 실패는 로컬 데이터에 영향을 주지 않는다. 다음 주기에 재시도.
        setError(e instanceof Error ? e.message : '동기화 실패')
      } finally {
        setRunning(false)
        inFlight.current = null
      }
    })()
    inFlight.current = run
    return run
  }, [remote, userId])

  // 로그인, 온라인 복귀 시 즉시 동기화
  useEffect(() => {
    if (online && userId) void syncNow()
  }, [online, userId, syncNow])

  // 로컬 변경 후 잠시 뒤 백그라운드 동기화 + 주기적 동기화
  useEffect(() => {
    if (!userId) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const off = onLocalChange(() => {
      clearTimeout(timer)
      timer = setTimeout(() => void syncNow(), LOCAL_CHANGE_DEBOUNCE_MS)
    })
    const interval = setInterval(() => void syncNow(), PERIODIC_SYNC_MS)
    const onVisible = () => document.visibilityState === 'visible' && void syncNow()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      off()
      clearTimeout(timer)
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [userId, syncNow])

  const state: SyncState = !remote
    ? 'local-only'
    : !userId
      ? 'signed-out'
      : !online
        ? 'offline'
        : running
          ? 'syncing'
          : error
            ? 'error'
            : 'idle'

  const value = useMemo(
    () => ({ state, lastSyncedAt, lastResult, error, pendingCount, conflictCount, syncNow }),
    [state, lastSyncedAt, lastResult, error, pendingCount, conflictCount, syncNow],
  )
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext)
  if (!ctx) throw new Error('useSync must be used within SyncProvider')
  return ctx
}
