// 프런트엔드 환경변수. 브라우저에 노출되므로 공개 가능한 값만 둔다.

function decodeJwtRole(key: string): string | null {
  try {
    const payload = key.split('.')[1]
    if (!payload) return null
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { role?: unknown }
    return typeof json.role === 'string' ? json.role : null
  } catch {
    return null
  }
}

/** service role / secret 키가 프런트엔드에 들어가는 실수를 막는다. */
export function isForbiddenBrowserKey(key: string): boolean {
  return key.startsWith('sb_secret_') || decodeJwtRole(key) === 'service_role'
}

function readCloudConfig() {
  const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim()
  const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()
  if (!url || !anonKey) return null
  if (isForbiddenBrowserKey(anonKey)) {
    console.error('[cornote] VITE_SUPABASE_ANON_KEY 에 service role 키가 설정되어 있습니다. 클라우드 기능을 비활성화합니다.')
    return null
  }
  return { url, anonKey }
}

export const cloudConfig = readCloudConfig()
export const isCloudConfigured = cloudConfig !== null
