import Dexie, { type Table } from 'dexie'
import type { Conflict, Cue, MetaEntry, Note, Question, ReviewLog } from '@/types/models'

export class CornoteDB extends Dexie {
  notes!: Table<Note, string>
  cues!: Table<Cue, string>
  questions!: Table<Question, string>
  reviewLogs!: Table<ReviewLog, string>
  conflicts!: Table<Conflict, string>
  meta!: Table<MetaEntry, string>

  constructor(name = 'cornote') {
    super(name)
    this.version(1).stores({
      notes: 'id, updatedAt, syncStatus',
      cues: 'id, noteId, syncStatus',
      questions: 'id, noteId, nextReviewAt, syncStatus',
      reviewLogs: 'id, questionId, noteId, reviewedAt, syncStatus',
      conflicts: 'id, recordId, noteId, detectedAt',
      meta: 'key',
    })
  }
}

export const db = new CornoteDB()

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value })
}

/** 모든 로컬 데이터 삭제 (로그아웃 시 선택, 테스트 초기화). */
export async function clearLocalData(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((table) => table.clear()))
  })
}
