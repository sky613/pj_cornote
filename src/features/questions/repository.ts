import { db } from '@/db/local/db'
import { emitLocalChange } from '@/lib/localChanges'
import { newId, nowIso } from '@/lib/time'
import type { Cue, Difficulty, Question } from '@/types/models'

const syncDefaults = (t: string) => ({
  createdAt: t,
  updatedAt: t,
  deletedAt: null,
  syncStatus: 'pending' as const,
  localUpdatedAt: t,
  serverUpdatedAt: null,
  version: 0,
})

const editStamp = () => {
  const t = nowIso()
  return { updatedAt: t, localUpdatedAt: t, syncStatus: 'pending' as const }
}

// ── 핵심 키워드 (cue) ─────────────────────────────────────

export async function listCues(noteId: string): Promise<Cue[]> {
  const cues = await db.cues.where('noteId').equals(noteId).toArray()
  return cues.filter((c) => !c.deletedAt).sort((a, b) => a.sortOrder - b.sortOrder)
}

async function nextCueOrder(noteId: string): Promise<number> {
  const cues = await db.cues.where('noteId').equals(noteId).toArray()
  return cues.reduce((max, c) => Math.max(max, c.sortOrder), 0) + 1
}

export async function addCues(noteId: string, texts: string[]): Promise<Cue[]> {
  const t = nowIso()
  const created = await db.transaction('rw', db.cues, async () => {
    let order = await nextCueOrder(noteId)
    const cues: Cue[] = texts.map((text) => ({ id: newId(), noteId, text, sortOrder: order++, ...syncDefaults(t) }))
    await db.cues.bulkAdd(cues)
    return cues
  })
  emitLocalChange()
  return created
}

export async function updateCue(id: string, text: string): Promise<void> {
  await db.cues.update(id, { text, ...editStamp() })
  emitLocalChange()
}

export async function deleteCue(id: string): Promise<void> {
  const stamp = editStamp()
  await db.cues.update(id, { ...stamp, deletedAt: stamp.updatedAt })
  emitLocalChange()
}

// ── 질문 ─────────────────────────────────────────────────

export interface QuestionDraft {
  question: string
  referenceAnswer: string
  sourceExcerpt: string
  difficulty: Difficulty
  origin: Question['origin']
}

export async function listQuestions(noteId: string): Promise<Question[]> {
  const questions = await db.questions.where('noteId').equals(noteId).toArray()
  return questions.filter((q) => !q.deletedAt).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

function buildQuestion(noteId: string, draft: QuestionDraft, t: string): Question {
  return {
    id: newId(),
    noteId,
    ...draft,
    // 새 질문은 바로 복습 대상이 된다.
    nextReviewAt: t,
    intervalDays: 0,
    reviewCount: 0,
    lastRating: null,
    lastReviewedAt: null,
    ...syncDefaults(t),
  }
}

export async function addQuestions(noteId: string, drafts: QuestionDraft[]): Promise<Question[]> {
  const t = nowIso()
  const questions = drafts.map((d) => buildQuestion(noteId, d, t))
  await db.questions.bulkAdd(questions)
  emitLocalChange()
  return questions
}

export type QuestionPatch = Partial<Pick<Question, 'question' | 'referenceAnswer' | 'sourceExcerpt' | 'difficulty'>>

export async function updateQuestion(id: string, patch: QuestionPatch): Promise<void> {
  await db.questions.update(id, { ...patch, ...editStamp() })
  emitLocalChange()
}

export async function deleteQuestion(id: string): Promise<void> {
  const stamp = editStamp()
  await db.questions.update(id, { ...stamp, deletedAt: stamp.updatedAt })
  emitLocalChange()
}

/** AI 생성 결과 중 사용자가 선택한 항목만 기존 내용 뒤에 추가한다 (기존 항목은 건드리지 않음). */
export async function acceptGenerated(
  noteId: string,
  keywords: string[],
  questions: Omit<QuestionDraft, 'origin'>[],
): Promise<void> {
  await db.transaction('rw', db.cues, db.questions, async () => {
    if (keywords.length) await addCues(noteId, keywords)
    if (questions.length) await addQuestions(noteId, questions.map((q) => ({ ...q, origin: 'ai' as const })))
  })
}
