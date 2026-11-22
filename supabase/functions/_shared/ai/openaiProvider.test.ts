import { AiError } from './provider.ts'
import { createOpenAiProvider } from './openaiProvider.ts'

const gradeInput = { question: 'Q', referenceAnswer: 'A', sourceExcerpt: 'A', userAnswer: 'a' }

function fakeFetch(body: unknown, status = 200): typeof fetch {
  return (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch
}

const message = (text: string) => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text }] }] })

describe('OpenAI provider', () => {
  it('parses a structured output and sends a strict json_schema request', async () => {
    let sent: Record<string, unknown> = {}
    const grade = { score: 80, correctPoints: ['x'], missingPoints: [], misconception: null, feedback: 'ok', recommendedRating: 'good' }
    const provider = createOpenAiProvider({
      apiKey: 'sk-test',
      fetchImpl: (async (_url: string, init: RequestInit) => {
        sent = JSON.parse(String(init.body))
        return new Response(JSON.stringify(message(JSON.stringify(grade))))
      }) as unknown as typeof fetch,
    })
    await expect(provider.gradeAnswer(gradeInput)).resolves.toEqual(grade)
    expect(sent.text).toMatchObject({ format: { type: 'json_schema', strict: true, name: 'grade_result' } })
    expect(sent.store).toBe(false)
  })

  it.each([
    ['non-JSON output text', message('not json'), 'invalid_output'],
    ['schema mismatch', message(JSON.stringify({ score: 500 })), 'invalid_output'],
    ['no message item', { output: [] }, 'invalid_output'],
    ['refusal', { output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'no' }] }] }, 'refused'],
    ['incomplete', { status: 'incomplete', output: [] }, 'invalid_output'],
  ])('maps %s to an AiError', async (_label, body, code) => {
    const provider = createOpenAiProvider({ apiKey: 'k', fetchImpl: fakeFetch(body) })
    await expect(provider.gradeAnswer(gradeInput)).rejects.toMatchObject({ code })
  })

  it('maps HTTP errors and timeouts', async () => {
    await expect(
      createOpenAiProvider({ apiKey: 'k', fetchImpl: fakeFetch({}, 429) }).gradeAnswer(gradeInput),
    ).rejects.toMatchObject({ code: 'rate_limited' })
    await expect(
      createOpenAiProvider({ apiKey: 'k', fetchImpl: fakeFetch({}, 500) }).gradeAnswer(gradeInput),
    ).rejects.toMatchObject({ code: 'upstream' })

    const hanging = ((_u: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      })) as unknown as typeof fetch
    const error = await createOpenAiProvider({ apiKey: 'k', fetchImpl: hanging, timeoutMs: 10 })
      .gradeAnswer(gradeInput)
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AiError)
    expect((error as AiError).code).toBe('timeout')
  })
})
