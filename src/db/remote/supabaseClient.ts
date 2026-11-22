import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { cloudConfig } from '@/lib/env'

/** Supabase 미설정 시 null — 앱은 local-only 모드로 동작한다. */
export const supabase: SupabaseClient | null = cloudConfig
  ? createClient(cloudConfig.url, cloudConfig.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null
