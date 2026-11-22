import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input, Label } from '@/components/ui/Field'
import { useAuth } from './AuthProvider'

export function LoginForm() {
  const auth = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'error' | 'info'; text: string } | null>(null)

  const run = async (action: () => Promise<string | null>, success: string) => {
    setBusy(true)
    setMessage(null)
    const error = await action()
    setBusy(false)
    setMessage(error ? { tone: 'error', text: error } : { tone: 'info', text: success })
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        void run(() => auth.signInWithPassword(email, password), '로그인했습니다.')
      }}
    >
      <div>
        <Label htmlFor="login-email">이메일</Label>
        <Input id="login-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="login-password">비밀번호</Label>
        <Input
          id="login-password"
          type="password"
          autoComplete="current-password"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy || !email || password.length < 8}>
          로그인
        </Button>
        <Button
          variant="secondary"
          disabled={busy || !email || password.length < 8}
          onClick={() => void run(() => auth.signUp(email, password), '가입 확인 메일을 보냈습니다(설정에 따라 바로 로그인됩니다).')}
        >
          회원가입
        </Button>
        <Button
          variant="ghost"
          disabled={busy || !email}
          onClick={() => void run(() => auth.sendMagicLink(email), '로그인 링크를 이메일로 보냈습니다.')}
        >
          비밀번호 없이 이메일 링크로 로그인
        </Button>
      </div>
      {message && (
        <p role={message.tone === 'error' ? 'alert' : 'status'} className={message.tone === 'error' ? 'text-sm text-danger' : 'text-sm text-success'}>
          {message.text}
        </p>
      )}
    </form>
  )
}
