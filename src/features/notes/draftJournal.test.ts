import { db } from '@/db/local/db'
import { draftKey, replayPendingDrafts, writeDraft } from './draftJournal'
import { createNote, getNote, updateNote } from './repository'

const replay = () => replayPendingDrafts(getNote, (id, patch, base) => updateNote(id, patch, base))

describe('draft journal (unsaved input at page close)', () => {
  beforeEach(() => localStorage.clear())

  it('replays an unsaved patch recorded when the page was closed', async () => {
    const note = await createNote({ title: 't' })
    writeDraft(draftKey(note.id), { userSummary: '닫기 직전 요약' }, note.localUpdatedAt)
    expect(await replay()).toBe(1)
    expect((await getNote(note.id))?.userSummary).toBe('닫기 직전 요약')
    expect(localStorage.getItem(draftKey(note.id))).toBeNull()
  })

  it('discards a draft that was already saved', async () => {
    const note = await createNote()
    const saved = await updateNote(note.id, { title: 'saved' })
    writeDraft(draftKey(note.id), { title: 'saved' }, note.localUpdatedAt)
    expect(await replay()).toBe(0)
    expect(await db.conflicts.count()).toBe(0)
    expect(saved.status).toBe('saved')
  })

  it('keeps a stale draft as a conflict copy instead of overwriting newer data', async () => {
    const note = await createNote()
    writeDraft(draftKey(note.id), { title: 'old draft' }, 'some-older-base')
    await replay()
    expect((await getNote(note.id))?.title).toBe('')
    expect(await db.conflicts.count()).toBe(1)
  })
})
