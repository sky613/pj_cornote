import { mockGenerateQuestions, mockGradeAnswer } from './mockProvider.ts'
import { isExcerptGrounded } from './text.ts'

const content = `광합성은 식물이 빛 에너지를 화학 에너지로 바꾸는 과정이다.
광합성은 엽록체에서 일어난다.
명반응에서는 물이 분해되어 산소가 발생한다.
암반응(캘빈 회로)에서는 이산화탄소가 고정되어 포도당이 만들어진다.`

describe('mock AI provider', () => {
  it('generates grounded questions whose excerpts exist in the note', () => {
    const result = mockGenerateQuestions({ title: '광합성', content, userSummary: '', questionCount: 3 })
    expect(result.questions).toHaveLength(3)
    expect(result.keywords.length).toBeGreaterThan(0)
    for (const q of result.questions) {
      expect(isExcerptGrounded(content, q.sourceExcerpt)).toBe(true)
    }
    expect(result.keywords[0].text).toBe('광합성')
  })

  it('grades by overlap with the reference answer', () => {
    const reference = '광합성은 엽록체에서 일어난다.'
    const good = mockGradeAnswer({ question: 'Q', referenceAnswer: reference, sourceExcerpt: reference, userAnswer: '엽록체에서 광합성이 일어남' })
    const bad = mockGradeAnswer({ question: 'Q', referenceAnswer: reference, sourceExcerpt: reference, userAnswer: '미토콘드리아' })
    const empty = mockGradeAnswer({ question: 'Q', referenceAnswer: reference, sourceExcerpt: reference, userAnswer: '  ' })
    expect(good.score).toBeGreaterThan(bad.score)
    expect(bad.recommendedRating).toBe('again')
    expect(empty).toMatchObject({ score: 0, recommendedRating: 'again' })
  })
})

describe('isExcerptGrounded', () => {
  it('ignores whitespace differences but rejects invented text', () => {
    expect(isExcerptGrounded('A  quick\nbrown fox', 'quick brown')).toBe(true)
    expect(isExcerptGrounded('A quick brown fox', 'slow fox')).toBe(false)
    expect(isExcerptGrounded('anything', '  ')).toBe(false)
  })
})
