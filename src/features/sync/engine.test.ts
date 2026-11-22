import { clearLocalData, db } from '@/db/local/db'
import { createNote, getNote, updateNote } from '@/features/notes/repository'
import { addQuestions } from '@/features/questions/repository'
import { recordReview } from '@/features/review/repository'
import { MemoryServer } from '@/test/memoryRemote'
import type { Note } from '@/types/models'
import { listOpenConflicts, restoreLocalCopy } from './conflicts'
import { runSync } from './engine'

const ALICE = 'alice'
const BOB = 'bob'
const draft = { question: 'Q', referenceAnswer: 'A', sourceExcerpt: 'A', difficulty: 'easy' as const, origin: 'manual' as const }

describe('sync engine', () => {
  it('adopts local-only data and pushes notes, questions and review logs', async () => {
    const server = new MemoryServer()
    const note = await createNote({ title: '오프라인에서 작성' })
    const [q] = await addQuestions(note.id, [draft])
    await recordReview({ question: q, userAnswer: 'x', rating: 'hard', grade: null, confidence: null, userId: null })

    const result = await runSync(server.api(ALICE), ALICE)
    expect(result.errors).toBe(0)
    expect(result.pushed).toBe(3)
    expect((server.tables.notes.get(note.id) as Note).userId).toBe(ALICE)
    expect(server.tables.questions.get(q.id)?.version).toBe(1)
    const local = await db.notes.get(note.id)
    expect(local).toMatchObject({ syncStatus: 'synced', userId: ALICE })
    expect(await db.reviewLogs.where('syncStatus').equals('pending').count()).toBe(0)
  })

  it('keeps offline edits pending and syncs them after reconnecting', async () => {
    const server = new MemoryServer()
    const note = await createNote({ title: 'v1' })
    await runSync(server.api(ALICE), ALICE)

    const offline = { ...server.api(ALICE), push: async () => ({ status: 'error' as const, message: 'network' }) }
    await updateNote(note.id, { title: 'offline edit' })
    const failed = await runSync(offline, ALICE)
    expect(failed.errors).toBe(1)
    expect(await db.notes.get(note.id)).toMatchObject({ title: 'offline edit', syncStatus: 'pending' })

    await runSync(server.api(ALICE), ALICE)
    expect((server.tables.notes.get(note.id) as Note).title).toBe('offline edit')
    expect(server.tables.notes.get(note.id)?.version).toBe(2)
    expect((await db.notes.get(note.id))?.syncStatus).toBe('synced')
  })

  it('pulls changes made on another device', async () => {
    const server = new MemoryServer()
    const note = await createNote({ title: 'shared' })
    await runSync(server.api(ALICE), ALICE)
    server.remoteEdit<Note>('notes', note.id, { title: 'edited elsewhere' })

    const result = await runSync(server.api(ALICE), ALICE)
    expect(result.pulled).toBe(1)
    expect(await db.notes.get(note.id)).toMatchObject({ title: 'edited elsewhere', version: 2, syncStatus: 'synced' })
  })

  it('never silently overwrites: concurrent edits produce a conflict copy', async () => {
    const server = new MemoryServer()
    const note = await createNote({ title: 'base' })
    await runSync(server.api(ALICE), ALICE)

    server.remoteEdit<Note>('notes', note.id, { title: 'from tablet' })
    await updateNote(note.id, { title: 'from phone' })
    const result = await runSync(server.api(ALICE), ALICE)

    expect(result.conflicts).toBe(1)
    expect((server.tables.notes.get(note.id) as Note).title).toBe('from tablet')
    expect((await getNote(note.id))?.title).toBe('from tablet')
    const [conflict] = await listOpenConflicts(note.id)
    expect((conflict.localCopy as Note).title).toBe('from phone')

    // 사용자가 내 버전을 복원하면 다음 동기화에서 서버에 반영된다
    await restoreLocalCopy(conflict.id)
    await runSync(server.api(ALICE), ALICE)
    expect((server.tables.notes.get(note.id) as Note).title).toBe('from phone')
    expect(await listOpenConflicts(note.id)).toHaveLength(0)
  })

  it('isolates users: another account never receives or pushes foreign data', async () => {
    const server = new MemoryServer()
    const aliceNote = await createNote({ title: 'alice secret' })
    await runSync(server.api(ALICE), ALICE)

    // 같은 기기에서 Bob 이 로그인
    const bobResult = await runSync(server.api(BOB), BOB)
    expect(bobResult.skippedForeign).toBe(1)
    expect(bobResult.pulled).toBe(0)
    expect((server.tables.notes.get(aliceNote.id) as Note).userId).toBe(ALICE)

    // 새 기기의 Bob 은 Alice 데이터를 받지 못한다
    await clearLocalData()
    await runSync(server.api(BOB), BOB)
    expect(await db.notes.count()).toBe(0)
  })

  it('restores data onto a fresh device from the server', async () => {
    const server = new MemoryServer()
    const note = await createNote({ title: '기기 A' })
    await addQuestions(note.id, [draft])
    await runSync(server.api(ALICE), ALICE)

    await clearLocalData()
    const result = await runSync(server.api(ALICE), ALICE)
    expect(result.pulled).toBe(2)
    expect((await getNote(note.id))?.title).toBe('기기 A')
    expect(await db.questions.where('noteId').equals(note.id).count()).toBe(1)
  })
})
