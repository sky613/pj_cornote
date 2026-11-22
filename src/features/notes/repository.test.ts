import { db } from '@/db/local/db'
import { CornoteDB } from '@/db/local/db'
import { addCues, addQuestions } from '@/features/questions/repository'
import { createNote, deleteNote, filterNotesByTitle, getNote, listNotes, updateNote } from './repository'

describe('notes repository', () => {
  it('creates a note stored in IndexedDB as pending', async () => {
    const note = await createNote({ title: '광합성' })
    const stored = await db.notes.get(note.id)
    expect(stored?.title).toBe('광합성')
    expect(stored?.syncStatus).toBe('pending')
    expect(stored?.version).toBe(0)
    expect(stored?.contentJson.type).toBe('doc')
  })

  it('updates title, content, summary and bumps updatedAt', async () => {
    const note = await createNote()
    await new Promise((r) => setTimeout(r, 5))
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '엽록체' }] }] }
    const result = await updateNote(note.id, { title: '새 제목', contentJson: doc, userSummary: '요약' })
    expect(result.status).toBe('saved')
    const stored = await getNote(note.id)
    expect(stored?.title).toBe('새 제목')
    expect(stored?.contentJson).toEqual(doc)
    expect(stored?.userSummary).toBe('요약')
    expect(stored!.updatedAt > note.updatedAt).toBe(true)
  })

  it('soft-deletes a note together with its cues and questions', async () => {
    const note = await createNote({ title: 'x' })
    await addCues(note.id, ['키워드'])
    await addQuestions(note.id, [
      { question: 'Q', referenceAnswer: 'A', sourceExcerpt: '', difficulty: 'easy', origin: 'manual' },
    ])
    await deleteNote(note.id)
    expect(await getNote(note.id)).toBeUndefined()
    expect(await listNotes()).toHaveLength(0)
    const cues = await db.cues.where('noteId').equals(note.id).toArray()
    const questions = await db.questions.where('noteId').equals(note.id).toArray()
    expect(cues.every((c) => c.deletedAt && c.syncStatus === 'pending')).toBe(true)
    expect(questions.every((q) => q.deletedAt && q.syncStatus === 'pending')).toBe(true)
  })

  it('lists notes by most recently updated and filters by title', async () => {
    const a = await createNote({ title: '세포 호흡' })
    await new Promise((r) => setTimeout(r, 5))
    await createNote({ title: '광합성 정리' })
    await new Promise((r) => setTimeout(r, 5))
    await updateNote(a.id, { userSummary: 'touch' })
    const notes = await listNotes()
    expect(notes.map((n) => n.title)).toEqual(['세포 호흡', '광합성 정리'])
    expect(filterNotesByTitle(notes, '광합')).toHaveLength(1)
    expect(filterNotesByTitle(notes, '  ')).toHaveLength(2)
  })

  it('does not treat its own sync acknowledgement as a conflict', async () => {
    const note = await createNote({ title: 'base' })
    await db.notes.update(note.id, { version: 1, serverUpdatedAt: '2026-01-01T00:00:00.000Z', syncStatus: 'synced' })
    const result = await updateNote(note.id, { title: 'next' }, note.localUpdatedAt)
    expect(result.status).toBe('saved')
  })

  it('preserves an edit as a conflict copy when a remote change arrived underneath', async () => {
    const note = await createNote({ title: 'base' })
    // 다른 기기 변경이 동기화로 들어온 상황
    await db.notes.update(note.id, { title: 'remote', version: 3, syncStatus: 'synced', localUpdatedAt: '2030-01-01T00:00:00.000Z' })
    const result = await updateNote(note.id, { title: 'mine' }, note.localUpdatedAt)
    expect(result.status).toBe('conflict')
    expect((await getNote(note.id))?.title).toBe('remote')
    const conflicts = await db.conflicts.toArray()
    expect(conflicts).toHaveLength(1)
    expect((conflicts[0].localCopy as { title: string }).title).toBe('mine')
  })

  it('restores data after reopening the database (IndexedDB persistence)', async () => {
    const note = await createNote({ title: '지속성' })
    db.close()
    const reopened = new CornoteDB()
    await reopened.open()
    expect((await reopened.notes.get(note.id))?.title).toBe('지속성')
    reopened.close()
    await db.open()
  })
})
