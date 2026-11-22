// Supabase 기반 인증 · 요청 횟수 제한 구현. Edge Function 에서만 사용한다.
import { createClient } from '@supabase/supabase-js'
import type { EnvGetter } from './ai/selectProvider.ts'

function clientFor(req: Request, getEnv: EnvGetter) {
  const url = getEnv('SUPABASE_URL')
  const anonKey = getEnv('SUPABASE_ANON_KEY')
  if (!url || !anonKey) throw new Error('SUPABASE_URL / SUPABASE_ANON_KEY missing')
  // 사용자 JWT 로 호출하므로 RLS 와 auth.uid() 가 그대로 적용된다. service role 키는 사용하지 않는다.
  return createClient(url, anonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export function createSupabaseAuth(getEnv: EnvGetter) {
  return async (req: Request): Promise<string | null> => {
    const header = req.headers.get('Authorization') ?? ''
    const token = header.replace(/^Bearer\s+/i, '')
    if (!token) return null
    const { data, error } = await clientFor(req, getEnv).auth.getUser(token)
    if (error || !data.user) return null
    return data.user.id
  }
}

export function createSupabaseQuota(getEnv: EnvGetter) {
  const limit = Number(getEnv('AI_DAILY_LIMIT')) || 100
  return async (req: Request): Promise<boolean> => {
    const { data, error } = await clientFor(req, getEnv).rpc('consume_ai_quota', { p_limit: limit })
    if (error) throw new Error('quota check failed')
    return data === true
  }
}
