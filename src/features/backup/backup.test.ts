import { clearLocalData, db } from '@/db/local/db'
import { createNote, updateNote } from '@/features/notes/repository'
import { addCues, addQuestions } from '@/features/questions/repository'
import { recordReview } from '@/features/review/repository'
import { BackupFormatError, exportBackup, importBackup, parseBackup } from './backup'

describe('JSON backup', () => {
  it('round-trips all local data through export and import', async () => {
    const note = await createNote({ title: '백업 테스트', userSummary: '요약' })
    await addCues(note.id, ['키워드'])
    const [q] = await addQuestions(note.id, [
      { question: 'Q', referenceAnswer: 'A', sourceExcerpt: 'A', difficulty: 'medium', origin: 'ai' },
    ])
    await recordReview({ question: q, userAnswer: 'a', rating: 'easy', grade: null, confidence: null, userId: null })

    const text = JSON.stringify(await exportBackup())
    await clearLocalData()
    expect(await db.notes.count()).toBe(0)

    const report = await importBackup(parseBackup(text))
    expect(report).toEqual({ added: 4, updated: 0, skipped: 0 })
    expect((await db.notes.get(note.id))?.title).toBe('백업 테스트')
    expect(await db.cues.count()).toBe(1)
    expect((await db.questions.get(q.id))?.lastRating).toBe('easy')
    expect(await db.reviewLogs.count()).toBe(1)
  })

  it('does not overwrite records that are newer locally', async () => {
    const note = await createNote({ title: 'old' })
    const backup = await exportBackup()
    await new Promise((r) => setTimeout(r, 5))
    await updateNote(note.id, { title: 'newer local' })
    const report = await importBackup(backup)
    expect(report.skipped).toBe(1)
    expect((await db.notes.get(note.id))?.title).toBe('newer local')
  })

  it('rejects malformed files', () => {
    expect(() => parseBackup('not json')).toThrow(BackupFormatError)
    expect(() => parseBackup(JSON.stringify({ format: 'other' }))).toThrow(BackupFormatError)
    expect(() =>
      parseBackup(
        JSON.stringify({
          format: 'cornote-backup',
          schemaVersion: 1,
          exportedAt: '',
          data: { notes: [{ id: 'x', title: 1 }], cues: [], questions: [], reviewLogs: [] },
        }),
      ),
    ).toThrow(BackupFormatError)
  })
})
