// AI 요청/응답 계약. 브라우저(Mock 모드)와 Edge Function(Deno)이 함께 사용한다.
// Deno에서는 각 함수의 deno.json import map이 'zod'를 npm:zod 로 매핑한다.
import { z } from 'zod'

/** AI 요청당 입력 크기 제한 (문자 수). */
export const AI_LIMITS = {
  titleMax: 200,
  contentMax: 20_000,
  summaryMax: 4_000,
  questionMax: 1_000,
  referenceAnswerMax: 4_000,
  excerptMax: 2_000,
  userAnswerMax: 4_000,
  questionCountMax: 10,
  /** 요청 본문 전체의 최대 바이트 수 (JSON 파싱 전에 검사). */
  requestBodyMaxBytes: 64 * 1024,
} as const

export const difficultySchema = z.enum(['easy', 'medium', 'hard'])
export type Difficulty = z.infer<typeof difficultySchema>

export const ratingSchema = z.enum(['again', 'hard', 'good', 'easy'])
export type Rating = z.infer<typeof ratingSchema>

// ── 질문 생성 ──────────────────────────────────────────────

export const generateQuestionsInputSchema = z.object({
  title: z.string().max(AI_LIMITS.titleMax),
  content: z.string().trim().min(1, '본문이 비어 있습니다.').max(AI_LIMITS.contentMax),
  userSummary: z.string().max(AI_LIMITS.summaryMax).default(''),
  questionCount: z.number().int().min(1).max(AI_LIMITS.questionCountMax).default(5),
})
export type GenerateQuestionsInput = z.input<typeof generateQuestionsInputSchema>
export type GenerateQuestionsRequest = z.output<typeof generateQuestionsInputSchema>

export const generatedQuestionSchema = z.object({
  question: z.string().trim().min(1).max(AI_LIMITS.questionMax),
  referenceAnswer: z.string().trim().min(1).max(AI_LIMITS.referenceAnswerMax),
  sourceExcerpt: z.string().max(AI_LIMITS.excerptMax),
  difficulty: difficultySchema,
})
export type GeneratedQuestion = z.infer<typeof generatedQuestionSchema>

export const generatedQuestionsSchema = z.object({
  keywords: z
    .array(
      z.object({
        text: z.string().trim().min(1).max(100),
        reason: z.string().max(500),
      }),
    )
    .max(20),
  questions: z.array(generatedQuestionSchema).max(AI_LIMITS.questionCountMax),
  summaryDraft: z.string().max(AI_LIMITS.summaryMax),
})
export type GeneratedQuestions = z.infer<typeof generatedQuestionsSchema>

// ── 답변 평가 ──────────────────────────────────────────────

export const gradeAnswerInputSchema = z.object({
  question: z.string().trim().min(1).max(AI_LIMITS.questionMax),
  referenceAnswer: z.string().trim().min(1).max(AI_LIMITS.referenceAnswerMax),
  sourceExcerpt: z.string().max(AI_LIMITS.excerptMax).default(''),
  userAnswer: z.string().max(AI_LIMITS.userAnswerMax),
})
export type GradeAnswerInput = z.input<typeof gradeAnswerInputSchema>
export type GradeAnswerRequest = z.output<typeof gradeAnswerInputSchema>

export const gradeResultSchema = z.object({
  score: z.number().int().min(0).max(100),
  correctPoints: z.array(z.string().max(500)).max(10),
  missingPoints: z.array(z.string().max(500)).max(10),
  misconception: z.string().max(1000).nullable(),
  feedback: z.string().max(2000),
  recommendedRating: ratingSchema,
})
export type GradeResult = z.infer<typeof gradeResultSchema>

// ── 응답 봉투 (Edge Function ↔ 브라우저) ─────────────────────

export const aiErrorCodeSchema = z.enum([
  'invalid_input',
  'payload_too_large',
  'unauthorized',
  'rate_limited',
  'timeout',
  'upstream',
  'invalid_output',
  'refused',
  'network',
  'internal',
])
export type AiErrorCode = z.infer<typeof aiErrorCodeSchema>

export const providerNameSchema = z.enum(['openai', 'mock'])
export type ProviderName = z.infer<typeof providerNameSchema>

export function aiEnvelopeSchema<T extends z.ZodType>(data: T) {
  return z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), provider: providerNameSchema, data }),
    z.object({
      ok: z.literal(false),
      error: z.object({ code: aiErrorCodeSchema, message: z.string() }),
    }),
  ])
}

// ── OpenAI Structured Outputs 용 JSON Schema ────────────────
// strict 모드 요구사항: 모든 필드 required, additionalProperties: false.
// Zod 스키마와의 키 일치는 schemas.test.ts 에서 검증한다.

export const generatedQuestionsJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['keywords', 'questions', 'summaryDraft'],
  properties: {
    keywords: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'reason'],
        properties: {
          text: { type: 'string', description: '노트에 등장하는 핵심 키워드' },
          reason: { type: 'string', description: '선정 이유 (한 문장)' },
        },
      },
    },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['question', 'referenceAnswer', 'sourceExcerpt', 'difficulty'],
        properties: {
          question: { type: 'string' },
          referenceAnswer: { type: 'string', description: '노트 내용만으로 작성한 기준 답안' },
          sourceExcerpt: { type: 'string', description: '노트 본문에서 그대로 복사한 근거 문장' },
          difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
        },
      },
    },
    summaryDraft: { type: 'string', description: '노트 내용만으로 작성한 요약 초안' },
  },
} as const

export const gradeResultJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['score', 'correctPoints', 'missingPoints', 'misconception', 'feedback', 'recommendedRating'],
  properties: {
    score: { type: 'integer', description: '0~100' },
    correctPoints: { type: 'array', items: { type: 'string' } },
    missingPoints: { type: 'array', items: { type: 'string' } },
    misconception: { type: ['string', 'null'] },
    feedback: { type: 'string' },
    recommendedRating: { type: 'string', enum: ['again', 'hard', 'good', 'easy'] },
  },
} as const
