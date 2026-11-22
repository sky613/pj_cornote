import { createMockProvider } from './mockProvider.ts'
import { createOpenAiProvider } from './openaiProvider.ts'
import type { AiProvider } from './provider.ts'

export type EnvGetter = (key: string) => string | undefined

/**
 * AI_PROVIDER=openai|mock 으로 명시 선택. 미지정 시 OPENAI_API_KEY 유무로 결정한다.
 * openai 를 요청했는데 키가 없으면 Mock 으로 대체한다 (배포 설정 실수로 기능이 막히지 않도록).
 */
export function selectProvider(getEnv: EnvGetter): AiProvider {
  const preference = getEnv('AI_PROVIDER')?.trim().toLowerCase()
  const apiKey = getEnv('OPENAI_API_KEY')?.trim()

  if (preference === 'mock' || !apiKey) return createMockProvider()
  return createOpenAiProvider({
    apiKey,
    model: getEnv('OPENAI_MODEL')?.trim() || undefined,
    timeoutMs: Number(getEnv('AI_TIMEOUT_MS')) || undefined,
  })
}
