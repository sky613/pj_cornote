import { useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { Button } from '@/components/ui/Button'

/** 서비스 워커 상태 알림: 오프라인 준비 완료 / 새 버전 적용. */
export function ReloadPrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  // "오프라인 준비 완료"는 정보성 알림이므로 잠시 후 자동으로 닫는다.
  useEffect(() => {
    if (!offlineReady) return
    const timer = setTimeout(() => setOfflineReady(false), 4000)
    return () => clearTimeout(timer)
  }, [offlineReady, setOfflineReady])

  if (!offlineReady && !needRefresh) return null
  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-md items-center gap-3 rounded-xl border border-border bg-surface p-3 text-sm shadow-lg"
    >
      <span className="flex-1">{needRefresh ? '새 버전이 있습니다.' : '오프라인에서도 사용할 수 있습니다.'}</span>
      {needRefresh && (
        <Button size="sm" onClick={() => void updateServiceWorker(true)}>
          새로고침
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          setOfflineReady(false)
          setNeedRefresh(false)
        }}
      >
        닫기
      </Button>
    </div>
  )
}
