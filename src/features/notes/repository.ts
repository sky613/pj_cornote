import { db } from '@/db/local/db'
import { emitLocalChange } from '@/lib/localChanges'
import { newId, nowIso } from '@/lib/time'
import type { JSONContent } from '@tiptap/react'
import type { Conflict, Note } from '@/types/models'

export const EMPTY_DOC: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] }

export type NotePatch = Partial<Pick<Note, 'title' | 'contentJson' | 'userSummary' | 'aiSummaryDraft'>>

export async function createNote(init: NotePatch = {}): Promise<Note> {
  const t = nowIso()
  const note: Note = {
    id: newId(),
    userId: null,
    title: '',
    contentJson: structuredClone(EMPTY_DOC),
    userSummary: '',
    aiSummaryDraft: null,
    createdAt: t,
    updatedAt: t,
    deletedAt: null,
    syncStatus: 'pending',
    localUpdatedAt: t,
    serverUpdatedAt: null,
    version: 0,
    ...init,
  }
  await db.notes.add(note)
  emitLocalChange()
  return note
}

export async function getNote(id: string): Promise<Note | undefined> {
  const note = await db.notes.get(id)
  return note && !note.deletedAt ? note : undefined
}

/** 삭제되지 않은 노트, 최근 수정 순. */
export async function listNotes(): Promise<Note[]> {
  const notes = await db.notes.orderBy('updatedAt').reverse().toArray()
  return notes.filter((n) => !n.deletedAt)
}

export function filterNotesByTitle(notes: Note[], query: string): Note[] {
  const q = query.trim().toLowerCase()
  if (!q) return notes
  return notes.filter((n) => (n.title || '제목 없음').toLowerCase().includes(q))
}

export type UpdateResult = { status: 'saved'; note: Note } | { status: 'conflict'; note: Note } | { status: 'missing' }

/**
 * 노트 수정. expectedLocalUpdatedAt 을 주면, 편집기가 마지막으로 본 이후 다른 기기의 변경이
 * 동기화로 들어온 경우(localUpdatedAt 이 바뀜) 덮어쓰지 않고 이번 편집을 충돌 사본으로 보존한다.
 * 자신의 push 완료 처리는 localUpdatedAt 을 바꾸지 않으므로 충돌로 오인되지 않는다.
 */
export async function updateNote(id: string, patch: NotePatch, expectedLocalUpdatedAt?: string): Promise<UpdateResult> {
  const result = await db.transaction('rw', db.notes, db.conflicts, async (): Promise<UpdateResult> => {
    const current = await db.notes.get(id)
    if (!current || current.deletedAt) return { status: 'missing' }
    const t = nowIso()
    const edited: Note = { ...current, ...patch, updatedAt: t, localUpdatedAt: t, syncStatus: 'pending' }

    if (expectedLocalUpdatedAt !== undefined && current.localUpdatedAt !== expectedLocalUpdatedAt) {
      const conflict: Conflict = {
        id: newId(),
        table: 'notes',
        recordId: id,
        noteId: id,
        localCopy: edited,
        serverCopy: current,
        detectedAt: t,
        resolvedAt: null,
      }
      await db.conflicts.add(conflict)
      return { status: 'conflict', note: current }
    }

    await db.notes.put(edited)
    return { status: 'saved', note: edited }
  })
  if (result.status === 'saved') emitLocalChange()
  return result
}

/** 소프트 삭제: 노트와 소속 키워드·질문에 tombstone 을 남겨 다른 기기에도 삭제가 전파되게 한다. */
export async function deleteNote(id: string): Promise<void> {
  const t = nowIso()
  const tombstone = { deletedAt: t, updatedAt: t, localUpdatedAt: t, syncStatus: 'pending' as const }
  await db.transaction('rw', db.notes, db.cues, db.questions, async () => {
    await db.notes.update(id, tombstone)
    await db.cues.where('noteId').equals(id).modify(tombstone)
    await db.questions.where('noteId').equals(id).modify(tombstone)
  })
  emitLocalChange()
}
