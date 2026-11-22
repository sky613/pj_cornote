// IndexedDB 전체 JSON 내보내기 / 가져오기.
import { db } from '@/db/local/db'
import { emitLocalChange } from '@/lib/localChanges'
import { nowIso } from '@/lib/time'
import { cueSchema, noteSchema, questionSchema, reviewLogSchema } from '@/types/models'
import { z } from 'zod'

export const BACKUP_FORMAT = 'cornote-backup'
export const BACKUP_SCHEMA_VERSION = 1

export const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  schemaVersion: z.literal(BACKUP_SCHEMA_VERSION),
  exportedAt: z.string(),
  data: z.object({
    notes: z.array(noteSchema),
    cues: z.array(cueSchema),
    questions: z.array(questionSchema),
    reviewLogs: z.array(reviewLogSchema),
  }),
})
export type Backup = z.infer<typeof backupSchema>

export async function exportBackup(): Promise<Backup> {
  const [notes, cues, questions, reviewLogs] = await Promise.all([
    db.notes.toArray(),
    db.cues.toArray(),
    db.questions.toArray(),
    db.reviewLogs.toArray(),
  ])
  return {
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: nowIso(),
    data: { notes, cues, questions, reviewLogs },
  }
}

export function backupFileName(date = new Date()): string {
  return `cornote-backup-${date.toISOString().slice(0, 10)}.json`
}

export interface ImportReport {
  added: number
  updated: number
  skipped: number
}

export class BackupFormatError extends Error {}

export function parseBackup(text: string): Backup {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new BackupFormatError('JSON 파일이 아닙니다.')
  }
  const result = backupSchema.safeParse(raw)
  if (!result.success) {
    const issue = result.error.issues[0]
    throw new BackupFormatError(`백업 형식이 올바르지 않습니다: ${issue?.path.join('.') ?? ''} ${issue?.message ?? ''}`)
  }
  return result.data
}

/**
 * 병합 가져오기. 로컬에 없는 레코드는 추가하고, 같은 ID는 백업 쪽이 더 최근에 수정된 경우에만 교체한다.
 * 가져온 레코드는 pending 으로 표시해 다음 동기화 때 서버와 버전 비교를 거친다 (서버 데이터를 조용히 덮지 않음).
 */
export async function importBackup(backup: Backup): Promise<ImportReport> {
  const report: ImportReport = { added: 0, updated: 0, skipped: 0 }
  const t = nowIso()

  await db.transaction('rw', [db.notes, db.cues, db.questions, db.reviewLogs], async () => {
    const merge = async <R extends { id: string; updatedAt?: string; reviewedAt?: string }>(
      table: typeof db.notes | typeof db.cues | typeof db.questions | typeof db.reviewLogs,
      records: R[],
    ) => {
      for (const record of records) {
        const existing = (await table.get(record.id)) as R | undefined
        const stamp = (r: R) => r.updatedAt ?? r.reviewedAt ?? ''
        if (existing && stamp(existing) >= stamp(record)) {
          report.skipped++
          continue
        }
        const imported = { ...record, syncStatus: 'pending', localUpdatedAt: t }
        await (table as typeof db.notes).put(imported as never)
        if (existing) report.updated++
        else report.added++
      }
    }
    // 가져온 노트는 현재 로그인 계정이 동기화 시 소유하도록 userId 를 비운다.
    await merge(db.notes, backup.data.notes.map((n) => ({ ...n, userId: null })))
    await merge(db.cues, backup.data.cues)
    await merge(db.questions, backup.data.questions)
    await merge(db.reviewLogs, backup.data.reviewLogs.map((l) => ({ ...l, userId: null })))
  })

  emitLocalChange()
  return report
}
