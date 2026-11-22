import { AlertTriangle, CheckCircle2, CircleSlash, Loader2, PartyPopper, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Badge } from '@/components/ui/Badge'
import { Button, buttonClass } from '@/components/ui/Button'
import { Label, Textarea } from '@/components/ui/Field'
import { aiErrorMessage, gradeAnswer } from '@/features/ai/client'
import { useAuth } from '@/features/auth/AuthProvider'
import { recordReview } from '@/features/review/repository'
import { defaultScheduler, FIXED_INTERVALS, RATING_LABELS, RATINGS } from '@/features/review/scheduler'
import { cn } from '@/lib/cn'
import type { GradeResult, Question, Rating } from '@/types/models'

const CONFIDENCE = [
  { value: 1, label: '모르겠음' },
  { value: 2, label: '애매함' },
  { value: 3, label: '확실함' },
]

const RATING_STYLE: Record<Rating, string> = {
  again: 'border-danger/40 hover:bg-danger-soft',
  hard: 'border-warning/40 hover:bg-warning-soft',
  good: 'border-primary/40 hover:bg-cue',
  easy: 'border-success/40 hover:bg-success-soft',
}

type Phase = 'answer' | 'grading' | 'revealed'

interface CardProps {
  question: Question
  position: string
  onRated(rating: Rating): void
}

/**
 * 한 문항 복습. 답변 제출 전에는 질문만 렌더링한다.
 * 기준 답안·근거·피드백은 phase === 'revealed' 일 때만 DOM 에 들어간다.
 */
export function ReviewCard({ question, position, onRated }: CardProps) {
  const { session, userId } = useAuth()
  const [phase, setPhase] = useState<Phase>('answer')
  const [answer, setAnswer] = useState('')
  const [confidence, setConfidence] = useState<number | null>(null)
  const [grade, setGrade] = useState<GradeResult | null>(null)
  const [gradeError, setGradeError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const answerRef = useRef<HTMLTextAreaElement>(null)
  const revealRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    answerRef.current?.focus()
  }, [])

  useEffect(() => {
    if (phase === 'revealed') revealRef.current?.focus()
  }, [phase])

  const submit = async (useAi: boolean) => {
    if (phase !== 'answer') return
    if (!useAi) {
      setPhase('revealed')
      return
    }
    setPhase('grading')
    try {
      const { data } = await gradeAnswer(
        {
          question: question.question,
          referenceAnswer: question.referenceAnswer || '(기준 답안 없음)',
          sourceExcerpt: question.sourceExcerpt,
          userAnswer: answer,
        },
        { accessToken: session?.access_token ?? null },
      )
      setGrade(data)
    } catch (e) {
      // AI 실패해도 수동 복습은 계속 가능
      setGradeError(aiErrorMessage(e))
    }
    setPhase('revealed')
  }

  const rate = async (rating: Rating) => {
    if (saving) return
    setSaving(true)
    try {
      await recordReview({ question, userAnswer: answer, rating, grade, confidence, userId, scheduler: defaultScheduler })
      onRated(rating)
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (phase !== 'revealed') return
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return
      const index = ['1', '2', '3', '4'].indexOf(e.key)
      if (index >= 0) void rate(RATINGS[index])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <article className="mx-auto w-full max-w-2xl space-y-5" aria-label="복습 카드">
      <div className="flex items-center justify-between text-xs text-muted">
        <span>{position}</span>
        <Link to={`/notes/${question.noteId}`} className="underline-offset-2 hover:underline">
          노트 열기
        </Link>
      </div>

      <h2 className="text-xl font-semibold leading-snug sm:text-2xl">{question.question}</h2>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          void submit(true)
        }}
        className="space-y-3"
      >
        <div>
          <Label htmlFor="review-answer">내 답변</Label>
          <Textarea
            id="review-answer"
            ref={answerRef}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            readOnly={phase !== 'answer'}
            rows={5}
            placeholder="원문을 보지 말고 기억나는 대로 적어 보세요."
            className="text-base"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                void submit(true)
              }
            }}
          />
        </div>
        {phase === 'answer' && (
          <>
            <fieldset className="flex flex-wrap items-center gap-2">
              <legend className="sr-only">확신도</legend>
              <span className="text-xs text-muted" aria-hidden>
                확신도
              </span>
              {CONFIDENCE.map((c) => (
                <label key={c.value} className="cursor-pointer">
                  <input
                    type="radio"
                    name="confidence"
                    className="peer sr-only"
                    checked={confidence === c.value}
                    onChange={() => setConfidence(c.value)}
                  />
                  <span className="inline-flex h-8 items-center rounded-full border border-border px-3 text-xs peer-checked:border-primary peer-checked:bg-cue peer-checked:text-primary peer-focus-visible:outline-2 peer-focus-visible:outline-ring">
                    {c.label}
                  </span>
                </label>
              ))}
            </fieldset>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={!answer.trim()}>
                <Sparkles className="h-4 w-4" /> 답변 제출 · AI 피드백
              </Button>
              <Button variant="secondary" onClick={() => void submit(false)}>
                {answer.trim() ? 'AI 없이 정답 보기' : '모르겠음 · 정답 보기'}
              </Button>
            </div>
            <p className="text-xs text-muted">Ctrl/⌘ + Enter 로 제출</p>
          </>
        )}
      </form>

      {phase === 'grading' && (
        <p role="status" className="flex items-center gap-2 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> 답변을 평가하는 중…
        </p>
      )}

      {phase === 'revealed' && (
        <section className="space-y-4" aria-labelledby="reveal-heading">
          <h3 id="reveal-heading" ref={revealRef} tabIndex={-1} className="sr-only">
            정답과 피드백
          </h3>

          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="mb-1 text-xs font-semibold text-muted">기준 답안</p>
            <p className="whitespace-pre-wrap leading-relaxed" data-testid="reference-answer">
              {question.referenceAnswer || '(기준 답안이 없습니다)'}
            </p>
            {question.sourceExcerpt && (
              <>
                <p className="mb-1 mt-4 text-xs font-semibold text-muted">원문 근거</p>
                <blockquote className="border-l-3 border-accent pl-3 text-sm leading-relaxed text-muted">
                  {question.sourceExcerpt}
                </blockquote>
              </>
            )}
          </div>

          {grade && <Feedback grade={grade} />}
          {gradeError && (
            <p role="alert" className="flex items-center gap-2 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
              <AlertTriangle className="h-4 w-4 shrink-0" /> {gradeError} 기준 답안과 비교해 직접 평가해 주세요.
            </p>
          )}

          <div>
            <p className="mb-2 text-sm font-medium">얼마나 잘 기억했나요?</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="난이도 평가">
              {RATINGS.map((rating, i) => {
                const recommended = grade?.recommendedRating === rating
                return (
                  <button
                    key={rating}
                    type="button"
                    disabled={saving}
                    onClick={() => void rate(rating)}
                    className={cn(
                      'flex flex-col items-center rounded-xl border-2 bg-surface px-3 py-3 transition-colors disabled:opacity-50',
                      RATING_STYLE[rating],
                      recommended && 'ring-2 ring-ring ring-offset-2 ring-offset-bg',
                    )}
                  >
                    <span className="font-semibold">{RATING_LABELS[rating]}</span>
                    <span className="text-xs text-muted">
                      {FIXED_INTERVALS[rating]}일 후 · {i + 1}
                    </span>
                    {recommended && <span className="mt-1 text-[11px] text-primary">AI 추천</span>}
                  </button>
                )
              })}
            </div>
          </div>
        </section>
      )}
    </article>
  )
}

function Feedback({ grade }: { grade: GradeResult }) {
  const tone = grade.score >= 85 ? 'success' : grade.score >= 60 ? 'primary' : grade.score >= 30 ? 'warning' : 'danger'
  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface p-4" aria-label="AI 피드백">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-accent" />
        <span className="text-sm font-semibold">AI 피드백</span>
        <Badge tone={tone}>{grade.score}점</Badge>
      </div>
      <p className="text-sm leading-relaxed">{grade.feedback}</p>
      {grade.correctPoints.length > 0 && (
        <ul className="space-y-1 text-sm">
          {grade.correctPoints.map((p, i) => (
            <li key={i} className="flex gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> {p}
            </li>
          ))}
        </ul>
      )}
      {grade.missingPoints.length > 0 && (
        <ul className="space-y-1 text-sm">
          {grade.missingPoints.map((p, i) => (
            <li key={i} className="flex gap-2">
              <CircleSlash className="mt-0.5 h-4 w-4 shrink-0 text-warning" /> {p}
            </li>
          ))}
        </ul>
      )}
      {grade.misconception && (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          <strong>오개념:</strong> {grade.misconception}
        </p>
      )}
    </div>
  )
}

interface SessionProps {
  questions: Question[]
  onExit?(): void
  exitLabel?: string
}

export function ReviewSession({ questions, onExit, exitLabel = '노트 목록으로' }: SessionProps) {
  const [index, setIndex] = useState(0)
  const [results, setResults] = useState<Rating[]>([])

  if (questions.length === 0) {
    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <PartyPopper className="mx-auto mb-3 h-10 w-10 text-accent" />
        <p className="font-semibold">지금 복습할 문항이 없습니다.</p>
        <p className="mt-1 text-sm text-muted">노트에서 질문을 추가하거나 AI로 생성해 보세요.</p>
      </div>
    )
  }

  if (index >= questions.length) {
    const tally = RATINGS.map((r) => ({ r, n: results.filter((x) => x === r).length }))
    return (
      <div className="mx-auto max-w-md py-12 text-center" role="status">
        <PartyPopper className="mx-auto mb-3 h-10 w-10 text-accent" />
        <p className="text-lg font-semibold">복습 완료! {results.length}문항</p>
        <p className="mt-2 text-sm text-muted">
          {tally.map(({ r, n }) => `${RATING_LABELS[r]} ${n}`).join(' · ')}
        </p>
        <p className="mt-1 text-sm text-muted">다음 복습일이 저장되었습니다.</p>
        {onExit ? (
          <Button className="mt-6" onClick={onExit}>
            {exitLabel}
          </Button>
        ) : (
          <Link to="/" className={buttonClass('primary', 'md', 'mt-6')}>
            {exitLabel}
          </Link>
        )}
      </div>
    )
  }

  const current = questions[index]
  return (
    <div>
      <div
        className="mx-auto mb-6 h-1.5 max-w-2xl overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-label="복습 진행률"
        aria-valuemin={0}
        aria-valuemax={questions.length}
        aria-valuenow={index}
      >
        <div className="h-full bg-primary transition-all" style={{ width: `${(index / questions.length) * 100}%` }} />
      </div>
      <ReviewCard
        key={current.id}
        question={current}
        position={`${index + 1} / ${questions.length}`}
        onRated={(rating) => {
          setResults((r) => [...r, rating])
          setIndex((i) => i + 1)
        }}
      />
    </div>
  )
}
