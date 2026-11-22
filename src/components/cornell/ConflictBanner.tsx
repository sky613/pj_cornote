import { useLiveQuery } from 'dexie-react-hooks'
import { AlertTriangle } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { discardConflict, listOpenConflicts, restoreLocalCopy } from '@/features/sync/conflicts'
import { formatRelative } from '@/lib/time'
import { describeRecord } from '@/features/sync/describe'
import type { Conflict } from '@/types/models'

const TABLE_LABEL: Record<Conflict['table'], string> = { notes: '노트', cues: '핵심 키워드', questions: '질문' }

export function ConflictList({ noteId }: { noteId?: string }) {
  const conflicts = useLiveQuery(() => listOpenConflicts(noteId), [noteId]) ?? []
  if (!conflicts.length) return <p className="text-sm text-muted">보존된 충돌 사본이 없습니다.</p>
  return (
    <ul className="space-y-4">
      {conflicts.map((c) => (
        <li key={c.id} className="rounded-lg border border-border p-3">
          <p className="mb-2 text-xs text-muted">
            {TABLE_LABEL[c.table]} · {formatRelative(c.detectedAt)} 감지
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-semibold">내 버전 (보존된 사본)</p>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-surface-2 p-2 text-xs">
                {describeRecord(c, 'localCopy')}
              </pre>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold">현재 적용된 버전 (다른 기기)</p>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-surface-2 p-2 text-xs">
                {describeRecord(c, 'serverCopy')}
              </pre>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={() => discardConflict(c.id)}>
              현재 버전 유지
            </Button>
            <Button size="sm" onClick={() => restoreLocalCopy(c.id)}>
              내 버전으로 복원
            </Button>
          </div>
        </li>
      ))}
    </ul>
  )
}

export function ConflictBanner({ noteId, onResolved }: { noteId: string; onResolved?(): void }) {
  const count = useLiveQuery(async () => (await listOpenConflicts(noteId)).length, [noteId]) ?? 0
  const [open, setOpen] = useState(false)
  if (!count) return null
  return (
    <>
      <div role="alert" className="flex flex-wrap items-center gap-3 border-b border-warning/30 bg-warning-soft px-4 py-2 text-sm text-warning">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="flex-1">
          다른 기기의 변경과 충돌한 편집 {count}건을 사본으로 보존했습니다. 화면에는 최신 버전이 표시됩니다.
        </span>
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          비교하기
        </Button>
      </div>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) onResolved?.()
        }}
        title="충돌 사본"
        description="어느 버전을 사용할지 선택하세요. 선택하기 전까지 두 버전 모두 보존됩니다."
        size="lg"
      >
        <ConflictList noteId={noteId} />
      </Dialog>
    </>
  )
}
