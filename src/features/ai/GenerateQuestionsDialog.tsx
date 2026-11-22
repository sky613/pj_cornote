import { isExcerptGrounded } from '@shared/ai/text.ts'
import type { GeneratedQuestions } from '@shared/ai/schemas.ts'
import { AlertTriangle, CheckCircle2, Loader2, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Label, Textarea } from '@/components/ui/Field'
import { useAuth } from '@/features/auth/AuthProvider'
import { DIFFICULTY_LABEL } from '@/features/questions/labels'
import { acceptGenerated } from '@/features/questions/repository'
import { aiErrorMessage, aiModeLabel, generateQuestions } from './client'

interface Props {
  open: boolean
  onOpenChange(open: boolean): void
  noteId: string
  /** 최신 편집 내용을 저장한 뒤 AI 입력을 돌려준다. */
  getInput(): Promise<{ title: string; content: string; userSummary: string }>
  onSummaryDraft(draft: string): Promise<void>
}

type EditableQuestion = GeneratedQuestions['questions'][number] & { selected: boolean; grounded: boolean }

export function GenerateQuestionsDialog({ open, onOpenChange, noteId, getInput, onSummaryDraft }: Props) {
  const { session } = useAuth()
  const ctx = { accessToken: session?.access_token ?? null }
  const [count, setCount] = useState(5)
  const [phase, setPhase] = useState<'setup' | 'loading' | 'review'>('setup')
  const [error, setError] = useState<string | null>(null)
  const [keywords, setKeywords] = useState<{ text: string; reason: string; selected: boolean }[]>([])
  const [questions, setQuestions] = useState<EditableQuestion[]>([])
  const [summary, setSummary] = useState('')
  const [keepSummary, setKeepSummary] = useState(false)
  const [saving, setSaving] = useState(false)

  const reset = () => {
    setPhase('setup')
    setError(null)
    setKeywords([])
    setQuestions([])
    setSummary('')
  }

  const run = async () => {
    setPhase('loading')
    setError(null)
    try {
      const input = await getInput()
      const { data } = await generateQuestions({ ...input, questionCount: count }, ctx)
      setKeywords(data.keywords.map((k) => ({ ...k, selected: true })))
      setQuestions(
        data.questions.map((q) => {
          const grounded = isExcerptGrounded(input.content, q.sourceExcerpt)
          return { ...q, grounded, selected: grounded }
        }),
      )
      setSummary(data.summaryDraft)
      setKeepSummary(Boolean(data.summaryDraft))
      setPhase('review')
    } catch (e) {
      setError(aiErrorMessage(e))
      setPhase('setup')
    }
  }

  const accept = async () => {
    setSaving(true)
    try {
      await acceptGenerated(
        noteId,
        keywords.filter((k) => k.selected).map((k) => k.text),
        questions
          .filter((q) => q.selected && q.question.trim())
          .map(({ question, referenceAnswer, sourceExcerpt, difficulty }) => ({ question, referenceAnswer, sourceExcerpt, difficulty })),
      )
      if (keepSummary && summary.trim()) await onSummaryDraft(summary.trim())
      onOpenChange(false)
      reset()
    } finally {
      setSaving(false)
    }
  }

  const selectedCount = keywords.filter((k) => k.selected).length + questions.filter((q) => q.selected).length
  const patchQuestion = (i: number, patch: Partial<EditableQuestion>) =>
    setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : q)))

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) reset()
      }}
      title="AI 질문 생성"
      description={`노트 내용만을 근거로 회상 질문을 만듭니다. 저장 전에 검토하고 고를 수 있습니다. · ${aiModeLabel(ctx)}`}
      size="lg"
      footer={
        phase === 'review' ? (
          <>
            <Button key="regenerate" variant="secondary" onClick={reset}>
              다시 생성
            </Button>
            <Button key="accept" onClick={accept} disabled={saving || (selectedCount === 0 && !keepSummary)}>
              선택 항목 추가 ({selectedCount})
            </Button>
          </>
        ) : (
          <Button key="run" onClick={run} disabled={phase === 'loading'}>
            {phase === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {phase === 'loading' ? '생성 중…' : '생성하기'}
          </Button>
        )
      }
    >
      {phase !== 'review' && (
        <div className="space-y-4">
          <fieldset>
            <legend className="mb-2 text-sm font-medium">질문 개수</legend>
            <div className="flex gap-2">
              {[3, 5, 7, 10].map((n) => (
                <label key={n} className="cursor-pointer">
                  <input type="radio" name="count" value={n} checked={count === n} onChange={() => setCount(n)} className="peer sr-only" />
                  <span className="inline-flex h-9 min-w-12 items-center justify-center rounded-lg border border-border px-3 text-sm peer-checked:border-primary peer-checked:bg-cue peer-checked:text-primary peer-focus-visible:outline-2 peer-focus-visible:outline-ring">
                    {n}개
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <p className="text-sm text-muted">
            생성된 질문과 키워드는 기존 내용 뒤에 <strong>추가</strong>만 되며, 작성한 노트나 요약을 바꾸지 않습니다.
          </p>
          {error && (
            <p role="alert" className="flex items-center gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              <AlertTriangle className="h-4 w-4 shrink-0" /> {error} 질문은 직접 추가할 수도 있습니다.
            </p>
          )}
        </div>
      )}

      {phase === 'review' && (
        <div className="space-y-6">
          <section>
            <h3 className="mb-2 text-sm font-semibold">핵심 키워드</h3>
            {keywords.length === 0 && <p className="text-sm text-muted">제안된 키워드가 없습니다.</p>}
            <div className="flex flex-wrap gap-2">
              {keywords.map((k, i) => (
                <label key={`${k.text}-${i}`} title={k.reason} className="cursor-pointer">
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={k.selected}
                    onChange={(e) => setKeywords((ks) => ks.map((x, j) => (j === i ? { ...x, selected: e.target.checked } : x)))}
                  />
                  <span className="inline-flex items-center rounded-full border border-border px-3 py-1 text-sm peer-checked:border-primary peer-checked:bg-cue peer-checked:text-primary peer-focus-visible:outline-2 peer-focus-visible:outline-ring">
                    {k.text}
                  </span>
                </label>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold">질문</h3>
            {questions.length === 0 && <p className="text-sm text-muted">노트에서 만들 수 있는 질문이 없습니다. 본문을 더 작성해 보세요.</p>}
            <ol className="space-y-3">
              {questions.map((q, i) => (
                <li key={i} className={`rounded-lg border p-3 ${q.selected ? 'border-primary/50' : 'border-border opacity-70'}`}>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <input type="checkbox" checked={q.selected} onChange={(e) => patchQuestion(i, { selected: e.target.checked })} className="h-4 w-4" />
                      질문 {i + 1} 선택
                    </label>
                    <Badge>{DIFFICULTY_LABEL[q.difficulty]}</Badge>
                    {q.grounded ? (
                      <Badge tone="success">
                        <CheckCircle2 className="h-3 w-3" /> 원문에서 근거 확인
                      </Badge>
                    ) : (
                      <Badge tone="warning">
                        <AlertTriangle className="h-3 w-3" /> 근거를 원문에서 찾지 못함 — 확인 필요
                      </Badge>
                    )}
                  </div>
                  <div className="grid gap-2">
                    <div>
                      <Label htmlFor={`gq-${i}`}>질문</Label>
                      <Textarea id={`gq-${i}`} rows={2} value={q.question} onChange={(e) => patchQuestion(i, { question: e.target.value })} />
                    </div>
                    <div>
                      <Label htmlFor={`ga-${i}`}>기준 답안</Label>
                      <Textarea id={`ga-${i}`} rows={2} value={q.referenceAnswer} onChange={(e) => patchQuestion(i, { referenceAnswer: e.target.value })} />
                    </div>
                    <p className="rounded bg-surface-2 px-2 py-1.5 text-xs text-muted">
                      <span className="font-semibold">근거:</span> {q.sourceExcerpt || '(없음)'}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {summary && (
            <section>
              <label className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" checked={keepSummary} onChange={(e) => setKeepSummary(e.target.checked)} className="h-4 w-4" />
                AI 요약 초안 저장 (참고용 · 내 요약은 바뀌지 않음)
              </label>
              <p className="whitespace-pre-wrap rounded-lg bg-surface-2 p-3 text-sm">{summary}</p>
            </section>
          )}
        </div>
      )}
    </Dialog>
  )
}
