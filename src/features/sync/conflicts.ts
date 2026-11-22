import type { Table } from 'dexie'
import { db } from '@/db/local/db'
import { emitLocalChange } from '@/lib/localChanges'
import { nowIso } from '@/lib/time'
import type { Conflict, SyncRecord } from '@/types/models'

export async function listOpenConflicts(noteId?: string): Promise<Conflict[]> {
  const all = noteId ? await db.conflicts.where('noteId').equals(noteId).toArray() : await db.conflicts.toArray()
  return all.filter((c) => !c.resolvedAt).sort((a, b) => b.detectedAt.localeCompare(a.detectedAt))
}

/** 충돌 사본(내 버전)을 현재 레코드 위에 새 편집으로 적용한다. 서버 버전은 다음 동기화에서 덮이지만 버전 기록은 유지된다. */
export async function restoreLocalCopy(conflictId: string): Promise<void> {
  const conflict = await db.conflicts.get(conflictId)
  if (!conflict) return
  const table = db[conflict.table] as unknown as Table<SyncRecord, string>
  await db.transaction('rw', table, db.conflicts, async () => {
    const current = await table.get(conflict.recordId)
    const t = nowIso()
    await table.put({
      ...conflict.localCopy,
      version: current?.version ?? conflict.localCopy.version,
      serverUpdatedAt: current?.serverUpdatedAt ?? conflict.localCopy.serverUpdatedAt,
      updatedAt: t,
      localUpdatedAt: t,
      syncStatus: 'pending',
    } as SyncRecord)
    await db.conflicts.update(conflictId, { resolvedAt: t })
  })
  emitLocalChange()
}

export async function discardConflict(conflictId: string): Promise<void> {
  await db.conflicts.update(conflictId, { resolvedAt: nowIso() })
}
