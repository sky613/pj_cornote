// Edge Function 공통 요청 처리. Deno 전역에 의존하지 않도록 의존성을 주입받아 Vitest 로도 검증한다.
import { AI_ERROR_MESSAGES, AiError, type AiProvider } from './ai/provider.ts'
import {
  AI_LIMITS,
  type AiErrorCode,
  generateQuestionsInputSchema,
  gradeAnswerInputSchema,
} from './ai/schemas.ts'

export type AiTask = 'generate-questions' | 'grade-answer'

export interface AiHandlerDeps {
  provider: AiProvider
  /** 인증된 사용자 ID. 인증 실패 시 null. */
  authenticate(req: Request): Promise<string | null>
  /** 사용자별 요청 횟수 제한. 허용되면 true. */
  consumeQuota(req: Request): Promise<boolean>
  allowedOrigin?: string
  timeoutMs?: number
  /** 구조화 로그. 사용자 입력 원문은 절대 전달하지 않는다. */
  log?(event: Record<string, unknown>): void
}

const STATUS: Record<AiErrorCode, number> = {
  invalid_input: 400,
  payload_too_large: 413,
  unauthorized: 401,
  rate_limited: 429,
  timeout: 504,
  upstream: 502,
  invalid_output: 502,
  refused: 422,
  network: 502,
  internal: 500,
}

export function createAiHandler(task: AiTask, deps: AiHandlerDeps) {
  const allowedOrigins = (deps.allowedOrigin ?? '*').split(',').map((origin) => origin.trim())

  return async function handle(req: Request): Promise<Response> {
    const origin = req.headers.get('Origin')
    const cors = {
      ...(allowedOrigins.includes('*')
        ? { 'Access-Control-Allow-Origin': '*' }
        : !origin
          ? { 'Access-Control-Allow-Origin': allowedOrigins[0] }
        : allowedOrigins.includes(origin)
          ? { 'Access-Control-Allow-Origin': origin }
          : {}),
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      Vary: 'Origin',
    }
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
    const fail = (code: AiErrorCode) =>
      json(STATUS[code], { ok: false, error: { code, message: AI_ERROR_MESSAGES[code] } })
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    if (req.method !== 'POST') return json(405, { ok: false, error: { code: 'invalid_input', message: 'POST only' } })

    const started = Date.now()
    let inputChars = 0
    try {
      const userId = await deps.authenticate(req)
      if (!userId) return fail('unauthorized')

      const declared = Number(req.headers.get('content-length') ?? 0)
      if (declared > AI_LIMITS.requestBodyMaxBytes) return fail('payload_too_large')
      const raw = await req.text()
      if (new TextEncoder().encode(raw).byteLength > AI_LIMITS.requestBodyMaxBytes) return fail('payload_too_large')
      inputChars = raw.length

      let body: unknown
      try {
        body = JSON.parse(raw)
      } catch {
        return fail('invalid_input')
      }

      const schema = task === 'generate-questions' ? generateQuestionsInputSchema : gradeAnswerInputSchema
      const parsed = schema.safeParse(body)
      if (!parsed.success) {
        const tooBig = parsed.error.issues.some((i) => i.code === 'too_big')
        return fail(tooBig ? 'payload_too_large' : 'invalid_input')
      }

      if (!(await deps.consumeQuota(req))) return fail('rate_limited')

      const signal = AbortSignal.timeout(deps.timeoutMs ?? 45_000)
      const data =
        task === 'generate-questions'
          ? await deps.provider.generateQuestions(parsed.data as never, { signal })
          : await deps.provider.gradeAnswer(parsed.data as never, { signal })

      deps.log?.({ task, provider: deps.provider.name, ok: true, ms: Date.now() - started, inputChars })
      return json(200, { ok: true, provider: deps.provider.name, data })
    } catch (error) {
      const code: AiErrorCode = error instanceof AiError ? error.code : 'internal'
      deps.log?.({ task, provider: deps.provider.name, ok: false, code, ms: Date.now() - started, inputChars })
      return fail(code)
    }
  }
}
