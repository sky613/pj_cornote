// 결정적(deterministic) Mock AI. 외부 호출 없이 사용자 원문만으로 결과를 만든다.
// 모든 질문의 기준 답안과 근거는 원문 문장을 그대로 사용하므로 "없는 사실 추가"가 발생하지 않는다.
import type { AiProvider } from './provider.ts'
import {
  type Difficulty,
  type GeneratedQuestion,
  type GeneratedQuestions,
  type GenerateQuestionsRequest,
  type GradeAnswerRequest,
  type GradeResult,
  generatedQuestionsSchema,
  gradeResultSchema,
  type Rating,
} from './schemas.ts'
import { contentTokens, splitSentences } from './text.ts'

function difficultyOf(sentence: string): Difficulty {
  if (sentence.length < 40) return 'easy'
  if (sentence.length < 100) return 'medium'
  return 'hard'
}

function topKeywords(text: string, limit: number): string[] {
  const counts = new Map<string, { count: number; first: number }>()
  contentTokens(text).forEach((token, index) => {
    const entry = counts.get(token)
    if (entry) entry.count += 1
    else counts.set(token, { count: 1, first: index })
  })
  return [...counts.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[1].first - b[1].first)
    .slice(0, limit)
    .map(([token]) => token)
}

export function mockGenerateQuestions(input: GenerateQuestionsRequest): GeneratedQuestions {
  const sentences = splitSentences(input.content)
  const keywords = topKeywords(`${input.title}\n${input.content}`, 8)
  const used = new Set<number>()
  const questions: GeneratedQuestion[] = []

  for (const keyword of keywords) {
    if (questions.length >= input.questionCount) break
    const index = sentences.findIndex((s, i) => !used.has(i) && s.toLowerCase().includes(keyword))
    if (index < 0) continue
    used.add(index)
    const sentence = sentences[index]
    questions.push({
      question: `노트에서 '${keyword}'에 대해 무엇이라고 설명했나요?`,
      referenceAnswer: sentence,
      sourceExcerpt: sentence,
      difficulty: difficultyOf(sentence),
    })
  }

  // 키워드로 채우지 못한 만큼은 남은 문장의 빈칸 채우기 문제로 보충한다.
  for (let i = 0; i < sentences.length && questions.length < input.questionCount; i++) {
    if (used.has(i)) continue
    const sentence = sentences[i]
    const tokens = sentence.split(/\s+/).filter((t) => t.length >= 2)
    if (tokens.length < 3) continue
    const blank = tokens.reduce((a, b) => (b.length > a.length ? b : a))
    used.add(i)
    questions.push({
      question: `빈칸을 채우세요: ${sentence.replace(blank, '_____')}`,
      referenceAnswer: blank,
      sourceExcerpt: sentence,
      difficulty: difficultyOf(sentence),
    })
  }

  const summaryDraft = sentences.slice(0, 2).join(' ')

  return generatedQuestionsSchema.parse({
    keywords: keywords.slice(0, 5).map((text) => ({
      text,
      reason: '[Mock AI] 노트에서 자주 등장하는 단어입니다.',
    })),
    questions,
    summaryDraft: summaryDraft ? `[Mock AI 요약 초안] ${summaryDraft}` : '',
  })
}

function ratingFor(score: number): Rating {
  if (score >= 85) return 'easy'
  if (score >= 60) return 'good'
  if (score >= 30) return 'hard'
  return 'again'
}

export function mockGradeAnswer(input: GradeAnswerRequest): GradeResult {
  const expected = [...new Set(contentTokens(input.referenceAnswer))]
  const given = new Set(contentTokens(input.userAnswer))

  if (!input.userAnswer.trim() || expected.length === 0) {
    return gradeResultSchema.parse({
      score: 0,
      correctPoints: [],
      missingPoints: expected.slice(0, 5).map((t) => `'${t}' 관련 내용`),
      misconception: null,
      feedback: '[Mock AI] 답변이 비어 있습니다. 기준 답안과 원문 근거를 확인해 보세요.',
      recommendedRating: 'again',
    })
  }

  const matched = expected.filter((t) => given.has(t))
  const missing = expected.filter((t) => !given.has(t))
  const score = Math.round((matched.length / expected.length) * 100)

  const feedback =
    score >= 85
      ? '핵심 내용을 대부분 정확히 떠올렸습니다.'
      : score >= 60
        ? '큰 줄기는 맞지만 일부 요소가 빠졌습니다.'
        : score >= 30
          ? '일부만 기억하고 있습니다. 빠진 요소를 원문에서 다시 확인하세요.'
          : '핵심 내용을 거의 떠올리지 못했습니다. 원문 근거를 다시 읽어 보세요.'

  return gradeResultSchema.parse({
    score,
    correctPoints: matched.slice(0, 5).map((t) => `'${t}'을(를) 언급함`),
    missingPoints: missing.slice(0, 5).map((t) => `'${t}' 관련 내용이 없음`),
    misconception: null,
    feedback: `[Mock AI] ${feedback}`,
    recommendedRating: ratingFor(score),
  })
}

export function createMockProvider(): AiProvider {
  return {
    name: 'mock',
    generateQuestions: async (input) => mockGenerateQuestions(input),
    gradeAnswer: async (input) => mockGradeAnswer(input),
  }
}
