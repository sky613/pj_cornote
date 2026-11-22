import { useCallback, useEffect, useRef, useState } from 'react'
import { clearDraft, writeDraft } from './draftJournal'

export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict'

export const AUTO_SAVE_DELAY_MS = 600

export interface AutoSaveJournal {
  key: string
  /** 저널에 함께 기록할 저장 기준 값. */
  base(): string | undefined
}

/**
 * 변경 사항을 병합해 두었다가 마지막 입력 후 delay 만큼 조용하면 저장한다.
 * 페이지 숨김/이탈, 언마운트 시에는 즉시 저장하고, journal 이 있으면 미저장분을 동기식으로 기록해 둔다.
 */
export function useAutoSave<P extends object>(
  save: (patch: P) => Promise<'saved' | 'conflict' | 'missing'>,
  delay = AUTO_SAVE_DELAY_MS,
  journal?: AutoSaveJournal,
) {
  const [status, setStatus] = useState<SaveStatus>('saved')
  const pending = useRef<Partial<P> | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const inFlight = useRef<Promise<void> | null>(null)
  const inFlightPatch = useRef<Partial<P> | null>(null)
  const saveRef = useRef(save)
  const journalRef = useRef(journal)
  useEffect(() => {
    saveRef.current = save
    journalRef.current = journal
  }, [save, journal])

  const flush = useCallback(async (): Promise<void> => {
    clearTimeout(timer.current)
    if (inFlight.current) await inFlight.current
    const patch = pending.current
    if (!patch) return
    pending.current = null
    inFlightPatch.current = patch
    setStatus('saving')
    const run = (async () => {
      try {
        const result = await saveRef.current(patch as P)
        if (result === 'conflict') setStatus('conflict')
        else if (result === 'missing') setStatus('error')
        else setStatus(pending.current ? 'dirty' : 'saved')
        if (!pending.current && journalRef.current) clearDraft(journalRef.current.key)
      } catch {
        // 저장 실패 시 입력을 버리지 않고 다음 저장에 다시 포함한다.
        pending.current = { ...patch, ...pending.current }
        setStatus('error')
      }
    })()
    inFlight.current = run
    await run
    inFlight.current = null
    inFlightPatch.current = null
  }, [])

  /** 페이지 종료 직전: 비동기 저장이 끝나지 못할 수 있으므로 미저장분을 동기식으로 기록한다. */
  const writeJournal = useCallback(() => {
    const j = journalRef.current
    const unsaved = inFlightPatch.current || pending.current ? { ...inFlightPatch.current, ...pending.current } : null
    if (j && unsaved) writeDraft(j.key, unsaved, j.base())
  }, [])

  const schedule = useCallback(
    (patch: Partial<P>) => {
      pending.current = { ...pending.current, ...patch }
      setStatus('dirty')
      clearTimeout(timer.current)
      timer.current = setTimeout(() => void flush(), delay)
    },
    [delay, flush],
  )

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState !== 'hidden') return
      writeJournal()
      void flush()
    }
    const onPageHide = () => {
      writeJournal()
      void flush()
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onPageHide)
      void flush()
    }
  }, [flush, writeJournal])

  const hasPending = useCallback(() => pending.current !== null || inFlight.current !== null, [])

  return { status, schedule, flush, hasPending }
}
