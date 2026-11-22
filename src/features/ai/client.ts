// 브라우저 측 AI 클라이언트.
// - Supabase 설정 + 로그인 상태: Edge Function 호출 (서버에서 OpenAI 또는 Mock 선택). API 키는 브라우저에 없다.
// - 그 외: 브라우저 내 Mock Provider (외부 호출 없음).
import { mockGenerateQuestions, mockGradeAnswer } from '@shared/ai/mockProvider.ts'
import { AI_ERROR_MESSAGES, AiError } from '@shared/ai/provider.ts'
import {
  aiEnvelopeSchema,
  type GeneratedQuestions,
  generatedQuestionsSchema,
  type GenerateQuestionsInput,
  generateQuestionsInputSchema,
  type GradeAnswerInput,
  gradeAnswerInputSchema,
  type GradeResult,
  gradeResultSchema,
  type ProviderName,
} from '@shared/ai/schemas.ts'
import type { z } from 'zod'
import { cloudConfig } from '@/lib/env'

export { AiError }

export interface AiContext {
  /** 로그인 세션의 access token. 없으면 브라우저 Mock 사용. */
  accessToken: string | null
}

export interface AiResult<T> {
  data: T
  provider: ProviderName | 'mock-local'
}

const CLIENT_TIMEOUT_MS = 60_000

export function aiModeLabel(ctx: AiContext): string {
  return cloudConfig && ctx.accessToken ? '서버 AI' : 'Mock AI (로컬)'
}

export function aiErrorMessage(error: unknown): string {
  if (error instanceof AiError) return AI_ERROR_MESSAGES[error.code]
  return AI_ERROR_MESSAGES.internal
}

async function callFunction<T>(
  name: 'generate-questions' | 'grade-answer',
  body: unknown,
  dataSchema: z.ZodType<T>,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AiResult<T>> {
  if (!cloudConfig) throw new AiError('internal', 'cloud not configured')
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new AiError('network', 'offline')

  let response: Response
  try {
    response = await fetchImpl(`${cloudConfig.url}/functions/v1/${name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        apikey: cloudConfig.anonKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') throw new AiError('timeout', 'client timeout')
    throw new AiError('network', 'fetch failed')
  }

  let json: unknown
  try {
    json = await response.json()
  } catch {
    throw new AiError(response.ok ? 'invalid_output' : 'upstream', `status ${response.status}`)
  }
  return parseEnvelope(json, dataSchema)
}

/** Edge Function 응답 봉투를 검증한다. 형식이 틀리면 invalid_output. */
export function parseEnvelope<T>(json: unknown, dataSchema: z.ZodType<T>): AiResult<T> {
  const parsed = aiEnvelopeSchema(dataSchema).safeParse(json)
  if (!parsed.success) throw new AiError('invalid_output', 'envelope validation failed')
  if (!parsed.data.ok) throw new AiError(parsed.data.error.code, parsed.data.error.message)
  return { data: parsed.data.data as T, provider: parsed.data.provider }
}

export async function generateQuestions(
  input: GenerateQuestionsInput,
  ctx: AiContext,
): Promise<AiResult<GeneratedQuestions>> {
  const parsed = generateQuestionsInputSchema.safeParse(input)
  if (!parsed.success) {
    const tooBig = parsed.error.issues.some((i) => i.code === 'too_big')
    throw new AiError(tooBig ? 'payload_too_large' : 'invalid_input', parsed.error.issues[0]?.message ?? '')
  }
  if (cloudConfig && ctx.accessToken) {
    return callFunction('generate-questions', parsed.data, generatedQuestionsSchema, ctx.accessToken)
  }
  return { data: mockGenerateQuestions(parsed.data), provider: 'mock-local' }
}

export async function gradeAnswer(input: GradeAnswerInput, ctx: AiContext): Promise<AiResult<GradeResult>> {
  const parsed = gradeAnswerInputSchema.safeParse(input)
  if (!parsed.success) throw new AiError('invalid_input', parsed.error.issues[0]?.message ?? '')
  if (cloudConfig && ctx.accessToken) {
    return callFunction('grade-answer', parsed.data, gradeResultSchema, ctx.accessToken)
  }
  return { data: mockGradeAnswer(parsed.data), provider: 'mock-local' }
}
