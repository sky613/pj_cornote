import {
  generatedQuestionsJsonSchema,
  generatedQuestionsSchema,
  generateQuestionsInputSchema,
  gradeResultJsonSchema,
  gradeResultSchema,
} from './schemas.ts'

const valid = {
  keywords: [{ text: '엽록체', reason: '핵심 기관' }],
  questions: [{ question: 'Q?', referenceAnswer: 'A', sourceExcerpt: 'A', difficulty: 'easy' }],
  summaryDraft: 's',
}

describe('AI schemas', () => {
  it('accepts a valid generation result', () => {
    expect(generatedQuestionsSchema.safeParse(valid).success).toBe(true)
  })

  it.each([
    ['missing field', { ...valid, summaryDraft: undefined }],
    ['wrong difficulty', { ...valid, questions: [{ ...valid.questions[0], difficulty: 'extreme' }] }],
    ['empty question', { ...valid, questions: [{ ...valid.questions[0], question: ' ' }] }],
    ['too many questions', { ...valid, questions: Array(11).fill(valid.questions[0]) }],
  ])('rejects malformed generation result: %s', (_label, value) => {
    expect(generatedQuestionsSchema.safeParse(value).success).toBe(false)
  })

  it('enforces score range 0..100 and rating enum', () => {
    const base = { score: 50, correctPoints: [], missingPoints: [], misconception: null, feedback: '', recommendedRating: 'hard' }
    expect(gradeResultSchema.safeParse(base).success).toBe(true)
    expect(gradeResultSchema.safeParse({ ...base, score: 101 }).success).toBe(false)
    expect(gradeResultSchema.safeParse({ ...base, score: -1 }).success).toBe(false)
    expect(gradeResultSchema.safeParse({ ...base, recommendedRating: 'meh' }).success).toBe(false)
  })

  it('limits input size', () => {
    expect(generateQuestionsInputSchema.safeParse({ title: '', content: 'x'.repeat(20_001) }).success).toBe(false)
    expect(generateQuestionsInputSchema.safeParse({ title: '', content: '   ' }).success).toBe(false)
    expect(generateQuestionsInputSchema.parse({ title: 't', content: 'c' }).questionCount).toBe(5)
  })

  it('JSON schemas mirror the Zod object keys (strict structured outputs)', () => {
    expect([...generatedQuestionsJsonSchema.required].sort()).toEqual(Object.keys(generatedQuestionsSchema.shape).sort())
    expect([...gradeResultJsonSchema.required].sort()).toEqual(Object.keys(gradeResultSchema.shape).sort())
    expect([...generatedQuestionsJsonSchema.properties.questions.items.required].sort()).toEqual(
      Object.keys(generatedQuestionsSchema.shape.questions.element.shape).sort(),
    )
  })
})
