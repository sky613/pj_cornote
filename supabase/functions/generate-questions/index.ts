// Supabase Edge Function: generate-questions
// 배포: supabase functions deploy generate-questions
import { selectProvider } from '../_shared/ai/selectProvider.ts'
import { createAiHandler } from '../_shared/aiHandler.ts'
import { createSupabaseAuth, createSupabaseQuota } from '../_shared/supabaseDeps.ts'

const getEnv = (key: string) => Deno.env.get(key)

const handler = createAiHandler('generate-questions', {
  provider: selectProvider(getEnv),
  authenticate: createSupabaseAuth(getEnv),
  consumeQuota: createSupabaseQuota(getEnv),
  allowedOrigin: getEnv('ALLOWED_ORIGIN') || '*',
  timeoutMs: Number(getEnv('AI_TIMEOUT_MS')) || 45_000,
  // 사용자 입력 원문은 기록하지 않는다 (길이·소요시간·오류 코드만).
  log: (event) => console.log(JSON.stringify(event)),
})

Deno.serve(handler)
