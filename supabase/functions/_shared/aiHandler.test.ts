import { createMockProvider } from './ai/mockProvider.ts'
import { AiError, type AiProvider } from './ai/provider.ts'
import { createAiHandler, type AiHandlerDeps } from './aiHandler.ts'

const request = (body: unknown, init: RequestInit = {}) =>
  new Request('http://localhost/fn', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), ...init })

function deps(overrides: Partial<AiHandlerDeps> = {}): AiHandlerDeps {
  return {
    provider: createMockProvider(),
    authenticate: async () => 'user-1',
    consumeQuota: async () => true,
    ...overrides,
  }
}

const note = { title: '광합성', content: '광합성은 엽록체에서 일어난다. 명반응에서 산소가 발생한다.', questionCount: 2 }

describe('AI edge handler', () => {
  it('returns a validated envelope', async () => {
    const res = await createAiHandler('generate-questions', deps())(request(note))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({ ok: true, provider: 'mock' })
    expect(json.data.questions.length).toBeGreaterThan(0)
  })

  it('rejects unauthenticated requests before doing any work', async () => {
    const consumeQuota = vi.fn(async () => true)
    const res = await createAiHandler('generate-questions', deps({ authenticate: async () => null, consumeQuota }))(request(note))
    expect(res.status).toBe(401)
    expect(consumeQuota).not.toHaveBeenCalled()
  })

  it('enforces input size limits and schema', async () => {
    const handler = createAiHandler('generate-questions', deps())
    expect((await handler(request({ ...note, content: 'x'.repeat(20_001) }))).status).toBe(413)
    expect((await handler(request('x'.repeat(70_000)))).status).toBe(413)
    expect((await handler(request('{broken'))).status).toBe(400)
    expect((await handler(request({ title: 1 }))).status).toBe(400)
  })

  it('applies the per-user quota', async () => {
    const res = await createAiHandler('grade-answer', deps({ consumeQuota: async () => false }))(
      request({ question: 'Q', referenceAnswer: 'A', userAnswer: 'a' }),
    )
    expect(res.status).toBe(429)
    expect((await res.json()).error.code).toBe('rate_limited')
  })

  it('maps provider failures without leaking details and never logs user input', async () => {
    const log = vi.fn()
    const failing: AiProvider = {
      name: 'openai',
      generateQuestions: async () => {
        throw new AiError('invalid_output', 'secret internal detail')
      },
      gradeAnswer: async () => {
        throw new Error('boom')
      },
    }
    const res = await createAiHandler('generate-questions', deps({ provider: failing, log }))(request(note))
    expect(res.status).toBe(502)
    const body = await res.text()
    expect(body).not.toContain('secret internal detail')
    expect(JSON.stringify(log.mock.calls)).not.toContain('엽록체')

    const res2 = await createAiHandler('grade-answer', deps({ provider: failing }))(
      request({ question: 'Q', referenceAnswer: 'A', userAnswer: 'a' }),
    )
    expect(res2.status).toBe(500)
  })

  it('answers CORS preflight', async () => {
    const res = await createAiHandler('grade-answer', deps())(new Request('http://localhost/fn', { method: 'OPTIONS' }))
    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')

    const handler = createAiHandler('grade-answer', deps({ allowedOrigin: 'https://cornote.example, cornote-app://local' }))
    const desktop = await handler(new Request('http://localhost/fn', { method: 'OPTIONS', headers: { Origin: 'cornote-app://local' } }))
    expect(desktop.headers.get('Access-Control-Allow-Origin')).toBe('cornote-app://local')
    const other = await handler(new Request('http://localhost/fn', { method: 'OPTIONS', headers: { Origin: 'https://other.example' } }))
    expect(other.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })
})
