import { Download, HardDrive, LogOut, RefreshCw, Upload } from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { ConflictList } from '@/components/cornell/ConflictBanner'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/Dialog'
import { clearLocalData } from '@/db/local/db'
import { aiModeLabel } from '@/features/ai/client'
import { useAuth } from '@/features/auth/AuthProvider'
import { LoginForm } from '@/features/auth/LoginForm'
import { BackupFormatError, backupFileName, exportBackup, importBackup, parseBackup } from '@/features/backup/backup'
import { useSync } from '@/features/sync/SyncProvider'
import { isCloudConfigured } from '@/lib/env'
import { isStoragePersisted, requestPersistentStorage } from '@/lib/storage'
import { formatRelative } from '@/lib/time'

function Section({ title, children, description }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-4 sm:p-6">
      <h2 className="text-base font-semibold">{title}</h2>
      {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

export function SettingsPage() {
  const auth = useAuth()
  const sync = useSync()
  const fileInput = useRef<HTMLInputElement>(null)
  const [importMessage, setImportMessage] = useState<{ tone: 'error' | 'info'; text: string } | null>(null)
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [logoutOpen, setLogoutOpen] = useState(false)
  const [wipeOpen, setWipeOpen] = useState(false)

  useEffect(() => {
    void isStoragePersisted().then(setPersisted)
  }, [])

  const download = async () => {
    try {
      const contents = JSON.stringify(await exportBackup(), null, 2)
      const filename = backupFileName()
      if (window.cornoteDesktop) {
        await window.cornoteDesktop.saveBackup(filename, contents)
      } else {
        const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }))
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        a.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
    } catch {
      setImportMessage({ tone: 'error', text: '백업 파일을 저장하지 못했습니다.' })
    }
  }

  const upload = async (file: File) => {
    setImportMessage(null)
    try {
      const report = await importBackup(parseBackup(await file.text()))
      setImportMessage({
        tone: 'info',
        text: `가져오기 완료: 추가 ${report.added} · 갱신 ${report.updated} · 건너뜀(로컬이 더 최신) ${report.skipped}`,
      })
    } catch (e) {
      setImportMessage({ tone: 'error', text: e instanceof BackupFormatError ? e.message : '파일을 읽지 못했습니다.' })
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6 sm:px-6">
      <h1 className="text-2xl font-bold">설정</h1>

      <Section
        title="계정 · 동기화"
        description={
          isCloudConfigured
            ? '로그인하면 이 기기의 노트가 클라우드에 백업되고 다른 기기와 동기화됩니다.'
            : '클라우드가 설정되지 않아 local-only 모드로 동작 중입니다. 모든 데이터는 이 기기에만 저장됩니다.'
        }
      >
        {!isCloudConfigured ? (
          <Badge>local-only 모드</Badge>
        ) : auth.loading ? null : !auth.userId ? (
          <LoginForm />
        ) : (
          <div className="space-y-3 text-sm">
            <p>
              <span className="text-muted">로그인:</span> <strong>{auth.email}</strong>
            </p>
            <p className="flex flex-wrap items-center gap-2">
              <span className="text-muted">상태:</span>
              <Badge tone={sync.state === 'error' ? 'danger' : sync.state === 'offline' ? 'warning' : 'success'}>
                {{ syncing: '동기화 중', idle: '동기화됨', error: '오류', offline: '오프라인', 'signed-out': '로그아웃', 'local-only': 'local-only' }[sync.state]}
              </Badge>
              {sync.pendingCount > 0 && <Badge tone="warning">전송 대기 {sync.pendingCount}</Badge>}
              {sync.lastSyncedAt && <span className="text-muted">마지막 동기화 {formatRelative(sync.lastSyncedAt)}</span>}
            </p>
            {sync.error && <p className="text-danger">{sync.error}</p>}
            {(sync.lastResult?.skippedForeign ?? 0) > 0 && (
              <p className="text-warning">
                이 기기에 다른 계정의 노트 {sync.lastResult?.skippedForeign}개가 있어 동기화에서 제외했습니다.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => void sync.syncNow()} disabled={sync.state === 'syncing'}>
                <RefreshCw className="h-4 w-4" /> 지금 동기화
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setLogoutOpen(true)}>
                <LogOut className="h-4 w-4" /> 로그아웃
              </Button>
            </div>
          </div>
        )}
      </Section>

      <Section title="AI" description="질문 생성과 답변 평가에 사용됩니다. 로그인하지 않았거나 서버에 OpenAI 키가 없으면 Mock AI가 동작합니다.">
        <Badge tone="accent">{aiModeLabel({ accessToken: auth.session?.access_token ?? null })}</Badge>
      </Section>

      <Section title="데이터 백업" description="이 기기의 모든 노트, 질문, 복습 기록을 JSON 파일로 내보내거나 복원합니다.">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={download}>
            <Download className="h-4 w-4" /> JSON 내보내기
          </Button>
          <Button variant="secondary" onClick={() => fileInput.current?.click()}>
            <Upload className="h-4 w-4" /> JSON 가져오기
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            aria-label="백업 파일 선택"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void upload(file)
              e.target.value = ''
            }}
          />
        </div>
        {importMessage && (
          <p role={importMessage.tone === 'error' ? 'alert' : 'status'} className={`mt-3 text-sm ${importMessage.tone === 'error' ? 'text-danger' : 'text-success'}`}>
            {importMessage.text}
          </p>
        )}
        {!window.cornoteDesktop && <p className="mt-4 flex flex-wrap items-center gap-2 text-sm text-muted">
          <HardDrive className="h-4 w-4" />
          영구 저장소:{' '}
          {persisted === null ? '브라우저 미지원' : persisted ? '허용됨' : '허용되지 않음 (저장 공간 부족 시 브라우저가 삭제할 수 있음)'}
          {persisted === false && (
            <Button size="sm" variant="ghost" onClick={async () => setPersisted(await requestPersistentStorage())}>
              다시 요청
            </Button>
          )}
        </p>}
      </Section>

      <Section title="동기화 충돌" description="여러 기기에서 동시에 수정된 항목입니다. 선택하기 전까지 두 버전 모두 보존됩니다.">
        <ConflictList />
      </Section>

      <Section title="이 기기 데이터 삭제" description="이 기기에 저장된 모든 노트를 지웁니다. 클라우드에 동기화된 데이터는 남아 있습니다.">
        <Button variant="danger" onClick={() => setWipeOpen(true)}>
          이 기기 데이터 모두 삭제
        </Button>
      </Section>

      <ConfirmDialog
        open={logoutOpen}
        onOpenChange={setLogoutOpen}
        title="로그아웃"
        description={
          sync.pendingCount > 0
            ? `아직 서버로 보내지 않은 변경 ${sync.pendingCount}건이 있습니다. 로그아웃해도 이 기기에는 남아 있고, 다시 로그인하면 동기화됩니다.`
            : '로그아웃해도 이 기기의 노트는 유지됩니다. 공용 기기라면 로그아웃 후 “이 기기 데이터 모두 삭제”를 사용하세요.'
        }
        confirmLabel="로그아웃"
        onConfirm={auth.signOut}
      />
      <ConfirmDialog
        open={wipeOpen}
        onOpenChange={setWipeOpen}
        title="이 기기 데이터를 모두 삭제할까요?"
        description="되돌릴 수 없습니다. 동기화되지 않은 변경과 로컬 전용 노트는 영구히 사라집니다. 먼저 JSON 내보내기를 권장합니다."
        confirmLabel="모두 삭제"
        destructive
        onConfirm={clearLocalData}
      />
    </div>
  )
}
