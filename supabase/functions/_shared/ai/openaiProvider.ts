// OpenAI Responses API + Structured Outputs(json_schema, strict).
// 서버(Edge Function)에서만 사용한다. API 키는 호출자가 환경변수에서 주입한다.
import type { z } from 'zod'
import { AiError, type AiCallOptions, type AiProvider } from './provider.ts'
import {
  buildGenerateUserPrompt,
  buildGradeUserPrompt,
  GENERATE_SYSTEM_PROMPT,
  GRADE_SYSTEM_PROMPT,
} from './prompts.ts'
import {
  generatedQuestionsJsonSchema,
  generatedQuestionsSchema,
  gradeResultJsonSchema,
  gradeResultSchema,
} from './schemas.ts'

export interface OpenAiProviderConfig {
  apiKey: string
  model?: string
  timeoutMs?: number
  baseUrl?: string
  fetchImpl?: typeof fetch
}

export const DEFAULT_OPENAI_MODEL = 'gpt-5-mini'

interface ResponsesContentPart {
  type: string
  text?: string
  refusal?: string
}

interface ResponsesOutputItem {
  type: string
  content?: ResponsesContentPart[]
}

/** Responses API 원시 응답에서 구조화 출력 텍스트를 꺼낸다. */
export function extractOutputText(body: unknown): string {
  if (!body || typeof body !== 'object') throw new AiError('invalid_output', 'empty response')
  const { output, status } = body as { output?: ResponsesOutputItem[]; status?: string }
  if (status === 'incomplete') throw new AiError('invalid_output', 'incomplete response')
  for (const item of output ?? []) {
    if (item.type !== 'message') continue
    for (const part of item.content ?? []) {
      if (part.type === 'refusal') throw new AiError('refused', 'model refused')
      if (part.type === 'output_text' && typeof part.text === 'string') return part.text
    }
  }
  throw new AiError('invalid_output', 'no output_text')
}

export function createOpenAiProvider(config: OpenAiProviderConfig): AiProvider {
  const fetchImpl = config.fetchImpl ?? fetch
  const model = config.model || DEFAULT_OPENAI_MODEL
  const timeoutMs = config.timeoutMs ?? 30_000
  const baseUrl = config.baseUrl ?? 'https://api.openai.com/v1'

  async function callStructured<T>(
    system: string,
    user: string,
    schemaName: string,
    jsonSchema: object,
    zodSchema: z.ZodType<T>,
    options?: AiCallOptions,
  ): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort('timeout'), timeoutMs)
    options?.signal?.addEventListener('abort', () => controller.abort(options.signal?.reason))

    let response: Response
    try {
      response = await fetchImpl(`${baseUrl}/responses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model,
          input: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          text: {
            format: { type: 'json_schema', name: schemaName, schema: jsonSchema, strict: true },
          },
          max_output_tokens: 6000,
          store: false,
        }),
        signal: controller.signal,
      })
    } catch (error) {
      if (controller.signal.aborted) throw new AiError('timeout', 'openai timeout')
      throw new AiError('upstream', error instanceof Error ? error.name : 'fetch failed')
    } finally {
      clearTimeout(timer)
    }

    if (response.status === 429) throw new AiError('rate_limited', 'openai rate limited')
    if (!response.ok) throw new AiError('upstream', `openai status ${response.status}`)

    let text: string
    try {
      text = extractOutputText(await response.json())
    } catch (error) {
      if (error instanceof AiError) throw error
      throw new AiError('invalid_output', 'response is not JSON')
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      throw new AiError('invalid_output', 'output_text is not JSON')
    }
    const result = zodSchema.safeParse(parsed)
    if (!result.success) throw new AiError('invalid_output', 'schema validation failed')
    return result.data
  }

  return {
    name: 'openai',
    generateQuestions: (input, options) =>
      callStructured(
        GENERATE_SYSTEM_PROMPT,
        buildGenerateUserPrompt(input),
        'generated_questions',
        generatedQuestionsJsonSchema,
        generatedQuestionsSchema,
        options,
      ),
    gradeAnswer: (input, options) =>
      callStructured(
        GRADE_SYSTEM_PROMPT,
        buildGradeUserPrompt(input),
        'grade_result',
        gradeResultJsonSchema,
        gradeResultSchema,
        options,
      ),
  }
}
