import { db } from '@/db/local/db'
import { createNote, deleteNote } from '@/features/notes/repository'
import { addQuestions } from '@/features/questions/repository'
import { countDueByNote, getDueQuestions, recordReview } from './repository'

const draft = { question: 'Q', referenceAnswer: 'A', sourceExcerpt: 'A', difficulty: 'easy' as const, origin: 'manual' as const }

describe('review repository', () => {
  it('new questions are immediately due; reviewing schedules the next date and writes a log', async () => {
    const note = await createNote()
    const [q] = await addQuestions(note.id, [draft])
    expect(await getDueQuestions()).toHaveLength(1)

    const now = new Date()
    const { question } = await recordReview({
      question: q, userAnswer: '내 답', rating: 'good', grade: null, confidence: 2, userId: null, now,
    })
    expect(question.intervalDays).toBe(7)
    expect(question.reviewCount).toBe(1)
    expect(new Date(question.nextReviewAt!).getTime()).toBeGreaterThan(now.getTime())
    expect((await db.questions.get(q.id))?.nextReviewAt).toBe(question.nextReviewAt)

    const logs = await db.reviewLogs.toArray()
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ userAnswer: '내 답', rating: 'good', confidence: 2, noteId: note.id })
    expect(await getDueQuestions()).toHaveLength(0)
  })

  it('excludes questions of deleted notes from due counts', async () => {
    const a = await createNote()
    const b = await createNote()
    await addQuestions(a.id, [draft, draft])
    await addQuestions(b.id, [draft])
    expect((await countDueByNote()).get(a.id)).toBe(2)
    await deleteNote(b.id)
    expect(await getDueQuestions()).toHaveLength(2)
  })
})
