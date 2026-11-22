// 로컬(camelCase) ↔ Supabase 행(snake_case) 변환. 서버 응답은 Zod 로 검증한다.
import { gradeResultSchema } from '@shared/ai/schemas.ts'
import { z } from 'zod'
import { difficultySchema, ratingSchema, type SyncRecord, type SyncTable } from '@/types/models'

export const REMOTE_TABLE: Record<SyncTable, string> = {
  notes: 'notes',
  cues: 'cues',
  questions: 'questions',
  reviewLogs: 'review_logs',
}

const ts = z.string()
const tsNull = z.string().nullable()

const noteRow = z.object({
  id: z.string(),
  user_id: z.string(),
  title: z.string(),
  content_json: z.looseObject({ type: z.literal('doc') }),
  user_summary: z.string(),
  ai_summary_draft: z.string().nullable(),
  version: z.number().int(),
  created_at: ts,
  updated_at: ts,
  deleted_at: tsNull,
  server_updated_at: ts,
})

const cueRow = z.object({
  id: z.string(),
  note_id: z.string(),
  text: z.string(),
  sort_order: z.number(),
  version: z.number().int(),
  created_at: ts,
  updated_at: ts,
  deleted_at: tsNull,
  server_updated_at: ts,
})

const questionRow = z.object({
  id: z.string(),
  note_id: z.string(),
  question: z.string(),
  reference_answer: z.string(),
  source_excerpt: z.string(),
  difficulty: difficultySchema,
  origin: z.enum(['ai', 'manual']),
  next_review_at: tsNull,
  interval_days: z.number().int(),
  review_count: z.number().int(),
  last_rating: ratingSchema.nullable(),
  last_reviewed_at: tsNull,
  version: z.number().int(),
  created_at: ts,
  updated_at: ts,
  deleted_at: tsNull,
  server_updated_at: ts,
})

const reviewLogRow = z.object({
  id: z.string(),
  question_id: z.string(),
  user_id: z.string(),
  user_answer: z.string(),
  ai_score: z.number().int().nullable(),
  confidence: z.number().int().nullable(),
  rating: ratingSchema,
  feedback_json: gradeResultSchema.nullable().catch(null),
  reviewed_at: ts,
  version: z.number().int(),
  server_updated_at: ts,
})

/** Postgres timestamptz 문자열을 ISO(UTC) 로 정규화 — 문자열 비교를 일관되게 하기 위함. */
const iso = (value: string): string => new Date(value).toISOString()
const isoOrNull = (value: string | null): string | null => (value === null ? null : iso(value))

type AnyRecord = Record<string, unknown>

export function toRemote(table: SyncTable, record: SyncRecord, version: number): AnyRecord {
  const r = record as unknown as AnyRecord
  switch (table) {
    case 'notes':
      return {
        id: r.id,
        user_id: r.userId,
        title: r.title,
        content_json: r.contentJson,
        user_summary: r.userSummary,
        ai_summary_draft: r.aiSummaryDraft,
        created_at: r.createdAt,
        updated_at: r.updatedAt,
        deleted_at: r.deletedAt,
        version,
      }
    case 'cues':
      return {
        id: r.id,
        note_id: r.noteId,
        text: r.text,
        sort_order: r.sortOrder,
        created_at: r.createdAt,
        updated_at: r.updatedAt,
        deleted_at: r.deletedAt,
        version,
      }
    case 'questions':
      return {
        id: r.id,
        note_id: r.noteId,
        question: r.question,
        reference_answer: r.referenceAnswer,
        source_excerpt: r.sourceExcerpt,
        difficulty: r.difficulty,
        origin: r.origin,
        next_review_at: r.nextReviewAt,
        interval_days: r.intervalDays,
        review_count: r.reviewCount,
        last_rating: r.lastRating,
        last_reviewed_at: r.lastReviewedAt,
        created_at: r.createdAt,
        updated_at: r.updatedAt,
        deleted_at: r.deletedAt,
        version,
      }
    case 'reviewLogs':
      return {
        id: r.id,
        question_id: r.questionId,
        user_id: r.userId,
        user_answer: r.userAnswer,
        ai_score: r.aiScore,
        confidence: r.confidence,
        rating: r.rating,
        feedback_json: r.feedbackJson,
        reviewed_at: r.reviewedAt,
        version,
      }
  }
}

export function fromRemote(table: SyncTable, row: unknown): SyncRecord {
  const synced = (serverUpdatedAt: string, version: number, localUpdatedAt: string) => ({
    syncStatus: 'synced' as const,
    serverUpdatedAt: iso(serverUpdatedAt),
    version,
    localUpdatedAt: iso(localUpdatedAt),
  })
  switch (table) {
    case 'notes': {
      const r = noteRow.parse(row)
      return {
        id: r.id,
        userId: r.user_id,
        title: r.title,
        contentJson: r.content_json,
        userSummary: r.user_summary,
        aiSummaryDraft: r.ai_summary_draft,
        createdAt: iso(r.created_at),
        updatedAt: iso(r.updated_at),
        deletedAt: isoOrNull(r.deleted_at),
        ...synced(r.server_updated_at, r.version, r.updated_at),
      }
    }
    case 'cues': {
      const r = cueRow.parse(row)
      return {
        id: r.id,
        noteId: r.note_id,
        text: r.text,
        sortOrder: r.sort_order,
        createdAt: iso(r.created_at),
        updatedAt: iso(r.updated_at),
        deletedAt: isoOrNull(r.deleted_at),
        ...synced(r.server_updated_at, r.version, r.updated_at),
      }
    }
    case 'questions': {
      const r = questionRow.parse(row)
      return {
        id: r.id,
        noteId: r.note_id,
        question: r.question,
        referenceAnswer: r.reference_answer,
        sourceExcerpt: r.source_excerpt,
        difficulty: r.difficulty,
        origin: r.origin,
        nextReviewAt: isoOrNull(r.next_review_at),
        intervalDays: r.interval_days,
        reviewCount: r.review_count,
        lastRating: r.last_rating,
        lastReviewedAt: isoOrNull(r.last_reviewed_at),
        createdAt: iso(r.created_at),
        updatedAt: iso(r.updated_at),
        deletedAt: isoOrNull(r.deleted_at),
        ...synced(r.server_updated_at, r.version, r.updated_at),
      }
    }
    case 'reviewLogs': {
      const r = reviewLogRow.parse(row)
      return {
        id: r.id,
        questionId: r.question_id,
        noteId: '',
        userId: r.user_id,
        userAnswer: r.user_answer,
        aiScore: r.ai_score,
        confidence: r.confidence,
        rating: r.rating,
        feedbackJson: r.feedback_json,
        reviewedAt: iso(r.reviewed_at),
        ...synced(r.server_updated_at, r.version, r.reviewed_at),
      }
    }
  }
}
