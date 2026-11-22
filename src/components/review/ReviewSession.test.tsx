import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { db } from '@/db/local/db'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { createNote } from '@/features/notes/repository'
import { addQuestions } from '@/features/questions/repository'
import type { Question } from '@/types/models'
import { ReviewSession } from './ReviewSession'

const REFERENCE = '엽록체의 틸라코이드 막에서 명반응이 일어난다'
const EXCERPT = '명반응은 틸라코이드 막에서 일어난다.'

async function setup() {
  const note = await createNote({ title: '광합성' })
  const questions = await addQuestions(note.id, [
    { question: '명반응은 어디에서 일어나나요?', referenceAnswer: REFERENCE, sourceExcerpt: EXCERPT, difficulty: 'medium', origin: 'manual' },
  ])
  render(
    <AuthProvider>
      <MemoryRouter>
        <ReviewSession questions={questions as Question[]} />
      </MemoryRouter>
    </AuthProvider>,
  )
  return { note, question: questions[0] }
}

describe('ReviewSession', () => {
  it('does not reveal the reference answer or excerpt before the user answers', async () => {
    await setup()
    expect(screen.getByRole('heading', { name: '명반응은 어디에서 일어나나요?' })).toBeInTheDocument()
    expect(document.body.textContent).not.toContain(REFERENCE)
    expect(document.body.textContent).not.toContain(EXCERPT)
    expect(screen.queryByRole('group', { name: '난이도 평가' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /답변 제출/ })).toBeDisabled()
  })

  it('shows answer, excerpt and AI feedback after submitting, then schedules by rating', async () => {
    const user = userEvent.setup()
    const { question } = await setup()

    await user.type(screen.getByLabelText('내 답변'), '틸라코이드 막')
    await user.click(screen.getByRole('button', { name: /답변 제출/ }))

    expect(await screen.findByTestId('reference-answer')).toHaveTextContent(REFERENCE)
    expect(screen.getByText(EXCERPT)).toBeInTheDocument()
    expect(screen.getByLabelText('AI 피드백')).toHaveTextContent(/점/)

    await user.click(screen.getByRole('button', { name: /^어려움/ }))
    expect(await screen.findByText(/복습 완료/)).toBeInTheDocument()

    await waitFor(async () => {
      const stored = await db.questions.get(question.id)
      expect(stored?.intervalDays).toBe(3)
      expect(stored?.lastRating).toBe('hard')
    })
    const [log] = await db.reviewLogs.toArray()
    expect(log).toMatchObject({ userAnswer: '틸라코이드 막', rating: 'hard' })
    expect(log.aiScore).not.toBeNull()
  })

  it('still allows manual review without AI', async () => {
    const user = userEvent.setup()
    await setup()
    await user.click(screen.getByRole('button', { name: /모르겠음 · 정답 보기/ }))
    expect(await screen.findByTestId('reference-answer')).toBeInTheDocument()
    expect(screen.queryByLabelText('AI 피드백')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^다시/ }))
    expect(await screen.findByText(/복습 완료/)).toBeInTheDocument()
    expect((await db.reviewLogs.toArray())[0]).toMatchObject({ rating: 'again', aiScore: null })
  })
})
