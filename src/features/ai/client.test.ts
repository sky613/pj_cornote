import { generatedQuestionsSchema, gradeResultSchema } from '@shared/ai/schemas.ts'
import { AiError, aiErrorMessage, generateQuestions, gradeAnswer, parseEnvelope } from './client'

describe('AI client', () => {
  it('uses the local mock provider when cloud is not configured', async () => {
    const result = await generateQuestions(
      { title: 't', content: '세포막은 물질 출입을 조절한다. 핵에는 DNA가 있다.', questionCount: 2 },
      { accessToken: null },
    )
    expect(result.provider).toBe('mock-local')
    expect(generatedQuestionsSchema.safeParse(result.data).success).toBe(true)

    const grade = await gradeAnswer({ question: 'Q', referenceAnswer: '핵에는 DNA가 있다', userAnswer: 'DNA' }, { accessToken: null })
    expect(gradeResultSchema.safeParse(grade.data).success).toBe(true)
  })

  it('rejects empty or oversized input before calling AI', async () => {
    await expect(generateQuestions({ title: '', content: ' ' }, { accessToken: null })).rejects.toMatchObject({ code: 'invalid_input' })
    await expect(generateQuestions({ title: '', content: 'x'.repeat(20_001) }, { accessToken: null })).rejects.toMatchObject({
      code: 'payload_too_large',
    })
  })

  it('validates the server envelope and surfaces malformed responses as errors', () => {
    expect(() => parseEnvelope({ ok: true, provider: 'openai', data: { score: 'high' } }, gradeResultSchema)).toThrow(AiError)
    expect(() => parseEnvelope({ random: 1 }, gradeResultSchema)).toThrow(AiError)
    try {
      parseEnvelope({ ok: false, error: { code: 'rate_limited', message: 'x' } }, gradeResultSchema)
    } catch (e) {
      expect((e as AiError).code).toBe('rate_limited')
      expect(aiErrorMessage(e)).toContain('횟수')
    }
  })
})
