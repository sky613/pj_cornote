import { db } from '@/db/local/db'
import { emitLocalChange } from '@/lib/localChanges'
import { newId, nowIso } from '@/lib/time'
import type { GradeResult, Question, Rating, ReviewLog } from '@/types/models'
import { defaultScheduler, type Scheduler } from './scheduler'

function isDue(q: Question, now: Date): boolean {
  return !q.deletedAt && q.nextReviewAt !== null && new Date(q.nextReviewAt).getTime() <= now.getTime()
}

async function liveNoteIds(): Promise<Set<string>> {
  const notes = await db.notes.toArray()
  return new Set(notes.filter((n) => !n.deletedAt).map((n) => n.id))
}

/** 복습 예정 문항 (가장 오래 밀린 것부터). */
export async function getDueQuestions(now = new Date()): Promise<Question[]> {
  const [questions, noteIds] = await Promise.all([
    db.questions.where('nextReviewAt').belowOrEqual(now.toISOString()).toArray(),
    liveNoteIds(),
  ])
  return questions
    .filter((q) => isDue(q, now) && noteIds.has(q.noteId))
    .sort((a, b) => (a.nextReviewAt ?? '').localeCompare(b.nextReviewAt ?? ''))
}

export async function countDueByNote(now = new Date()): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  for (const q of await getDueQuestions(now)) counts.set(q.noteId, (counts.get(q.noteId) ?? 0) + 1)
  return counts
}

/** 노트 단위 복습: 도래한 문항이 있으면 그것만, 없으면 노트의 전체 문항. */
export async function getNoteReviewQuestions(noteId: string, now = new Date()): Promise<Question[]> {
  const all = (await db.questions.where('noteId').equals(noteId).toArray()).filter((q) => !q.deletedAt)
  const due = all.filter((q) => isDue(q, now))
  const list = due.length ? due : all
  return list.sort((a, b) => (a.nextReviewAt ?? '').localeCompare(b.nextReviewAt ?? ''))
}

export interface RecordReviewInput {
  question: Question
  userAnswer: string
  rating: Rating
  grade: GradeResult | null
  confidence: number | null
  userId: string | null
  now?: Date
  scheduler?: Scheduler
}

/** 복습 결과를 기록하고 다음 복습일을 계산해 저장한다. */
export async function recordReview(input: RecordReviewInput): Promise<{ log: ReviewLog; question: Question }> {
  const now = input.now ?? new Date()
  const scheduler = input.scheduler ?? defaultScheduler
  const t = nowIso()
  const { nextReviewAt, intervalDays } = scheduler.schedule(input.question, input.rating, now)

  const log: ReviewLog = {
    id: newId(),
    questionId: input.question.id,
    noteId: input.question.noteId,
    userId: input.userId,
    userAnswer: input.userAnswer,
    aiScore: input.grade?.score ?? null,
    confidence: input.confidence,
    rating: input.rating,
    feedbackJson: input.grade,
    reviewedAt: now.toISOString(),
    syncStatus: 'pending',
    localUpdatedAt: t,
    serverUpdatedAt: null,
    version: 0,
  }

  const updated = await db.transaction('rw', db.questions, db.reviewLogs, async () => {
    const current = (await db.questions.get(input.question.id)) ?? input.question
    const next: Question = {
      ...current,
      nextReviewAt: nextReviewAt.toISOString(),
      intervalDays,
      reviewCount: current.reviewCount + 1,
      lastRating: input.rating,
      lastReviewedAt: now.toISOString(),
      updatedAt: t,
      localUpdatedAt: t,
      syncStatus: 'pending',
    }
    await db.questions.put(next)
    await db.reviewLogs.add(log)
    return next
  })
  emitLocalChange()
  return { log, question: updated }
}

export async function listReviewLogs(questionId: string): Promise<ReviewLog[]> {
  const logs = await db.reviewLogs.where('questionId').equals(questionId).toArray()
  return logs.sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt))
}
