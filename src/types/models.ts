// 로컬(IndexedDB) 레코드 스키마. 백업 가져오기 시 이 스키마로 검증한다.
import { difficultySchema, gradeResultSchema, ratingSchema } from '@shared/ai/schemas.ts'
import type { JSONContent } from '@tiptap/react'
import { z } from 'zod'

export { difficultySchema, ratingSchema }
export type { Difficulty, GradeResult, Rating } from '@shared/ai/schemas.ts'

export const syncStatusSchema = z.enum(['synced', 'pending'])
export type SyncStatus = z.infer<typeof syncStatusSchema>

/** 동기화 메타데이터. version 은 "마지막으로 서버와 일치했던 버전"(미동기화 레코드는 0). */
const syncMeta = {
  syncStatus: syncStatusSchema,
  localUpdatedAt: z.string(),
  serverUpdatedAt: z.string().nullable(),
  version: z.number().int().min(0),
}

export const docSchema = z.custom<JSONContent>(
  (value) =>
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'doc' &&
    JSON.stringify(value).length <= 1_000_000,
  { message: 'Tiptap 문서 형식이 아닙니다.' },
)

export const noteSchema = z.object({
  id: z.string().min(1),
  userId: z.string().nullable(),
  title: z.string().max(500),
  contentJson: docSchema,
  userSummary: z.string(),
  aiSummaryDraft: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
  ...syncMeta,
})
export type Note = z.infer<typeof noteSchema>

export const cueSchema = z.object({
  id: z.string().min(1),
  noteId: z.string().min(1),
  text: z.string().max(500),
  sortOrder: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
  ...syncMeta,
})
export type Cue = z.infer<typeof cueSchema>

export const questionSchema = z.object({
  id: z.string().min(1),
  noteId: z.string().min(1),
  question: z.string().max(2000),
  referenceAnswer: z.string().max(8000),
  sourceExcerpt: z.string().max(4000),
  difficulty: difficultySchema,
  origin: z.enum(['ai', 'manual']),
  nextReviewAt: z.string().nullable(),
  intervalDays: z.number().int().min(0),
  reviewCount: z.number().int().min(0),
  lastRating: ratingSchema.nullable(),
  lastReviewedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
  ...syncMeta,
})
export type Question = z.infer<typeof questionSchema>

export const reviewLogSchema = z.object({
  id: z.string().min(1),
  questionId: z.string().min(1),
  noteId: z.string(),
  userId: z.string().nullable(),
  userAnswer: z.string().max(8000),
  aiScore: z.number().int().min(0).max(100).nullable(),
  /** 제출 시 사용자가 고른 확신도 1(모름)~3(확신). 선택 사항. */
  confidence: z.number().int().min(1).max(3).nullable(),
  rating: ratingSchema,
  feedbackJson: gradeResultSchema.nullable(),
  reviewedAt: z.string(),
  ...syncMeta,
})
export type ReviewLog = z.infer<typeof reviewLogSchema>

export const syncTableSchema = z.enum(['notes', 'cues', 'questions', 'reviewLogs'])
export type SyncTable = z.infer<typeof syncTableSchema>

/** 동기화 충돌 시 보존하는 로컬 사본. 사용자가 복원하거나 버릴 때까지 유지된다. */
export interface Conflict {
  id: string
  table: Exclude<SyncTable, 'reviewLogs'>
  recordId: string
  noteId: string | null
  localCopy: Note | Cue | Question
  serverCopy: Note | Cue | Question | null
  detectedAt: string
  resolvedAt: string | null
}

export interface MetaEntry {
  key: string
  value: unknown
}

export type SyncRecord = Note | Cue | Question | ReviewLog
