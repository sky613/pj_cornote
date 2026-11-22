import type { Session } from '@supabase/supabase-js'
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/db/remote/supabaseClient'

interface AuthContextValue {
  enabled: boolean
  loading: boolean
  session: Session | null
  userId: string | null
  email: string | null
  signInWithPassword(email: string, password: string): Promise<string | null>
  signUp(email: string, password: string): Promise<string | null>
  sendMagicLink(email: string): Promise<string | null>
  signOut(): Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const message = (error: { message: string } | null) => (error ? error.message : null)
const authRedirectUrl = () => import.meta.env.MODE === 'desktop' ? 'cornote://auth/callback' : window.location.origin

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(Boolean(supabase))

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => data.subscription.unsubscribe()
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      enabled: Boolean(supabase),
      loading,
      session,
      userId: session?.user.id ?? null,
      email: session?.user.email ?? null,
      async signInWithPassword(email, password) {
        if (!supabase) return '클라우드가 설정되지 않았습니다.'
        return message((await supabase.auth.signInWithPassword({ email, password })).error)
      },
      async signUp(email, password) {
        if (!supabase) return '클라우드가 설정되지 않았습니다.'
        return message(
          (await supabase.auth.signUp({ email, password, options: { emailRedirectTo: authRedirectUrl() } })).error,
        )
      },
      async sendMagicLink(email) {
        if (!supabase) return '클라우드가 설정되지 않았습니다.'
        return message(
          (await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: authRedirectUrl() } })).error,
        )
      },
      async signOut() {
        await supabase?.auth.signOut()
      },
    }),
    [loading, session],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
