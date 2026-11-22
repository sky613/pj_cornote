import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronDown, Plus, Sparkles, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input, Label, Textarea } from '@/components/ui/Field'
import {
  addCues,
  addQuestions,
  deleteCue,
  deleteQuestion,
  listCues,
  listQuestions,
  type QuestionPatch,
  updateCue,
  updateQuestion,
} from '@/features/questions/repository'
import { AUTO_SAVE_DELAY_MS } from '@/features/notes/useAutoSave'
import { DIFFICULTY_LABEL } from '@/features/questions/labels'
import { formatDate } from '@/lib/time'
import type { Cue, Difficulty, Question } from '@/types/models'

/** 입력 필드 값을 디바운스해서 저장하고, 포커스를 잃으면 즉시 저장한다. */
function useDebouncedField(initial: string, save: (value: string) => void) {
  const [value, setValue] = useState(initial)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const latest = useRef({ value: initial, saved: initial, save })
  useEffect(() => {
    latest.current.save = save
  }, [save])
  const commit = () => {
    clearTimeout(timer.current)
    if (latest.current.value !== latest.current.saved) {
      latest.current.saved = latest.current.value
      latest.current.save(latest.current.value)
    }
  }
  useEffect(() => () => commit(), [])
  return {
    value,
    onChange(next: string) {
      setValue(next)
      latest.current.value = next
      clearTimeout(timer.current)
      timer.current = setTimeout(commit, AUTO_SAVE_DELAY_MS)
    },
    onBlur: commit,
  }
}

function CueItem({ cue }: { cue: Cue }) {
  const field = useDebouncedField(cue.text, (text) => void updateCue(cue.id, text))
  return (
    <li className="group flex items-center gap-1">
      <Input
        aria-label="핵심 키워드"
        value={field.value}
        onChange={(e) => field.onChange(e.target.value)}
        onBlur={field.onBlur}
        className="h-9 border-transparent bg-transparent font-medium hover:border-border focus:bg-surface"
        maxLength={500}
      />
      <Button variant="ghost" size="icon" aria-label={`키워드 "${cue.text}" 삭제`} onClick={() => deleteCue(cue.id)}>
        <Trash2 className="h-4 w-4 text-muted" />
      </Button>
    </li>
  )
}

function QuestionEditor({ question }: { question: Question }) {
  const save = (patch: QuestionPatch) => void updateQuestion(question.id, patch)
  const q = useDebouncedField(question.question, (v) => save({ question: v }))
  const a = useDebouncedField(question.referenceAnswer, (v) => save({ referenceAnswer: v }))
  const s = useDebouncedField(question.sourceExcerpt, (v) => save({ sourceExcerpt: v }))
  const id = question.id
  return (
    <div className="space-y-3 pt-3">
      <div>
        <Label htmlFor={`q-${id}`}>질문</Label>
        <Textarea id={`q-${id}`} value={q.value} onChange={(e) => q.onChange(e.target.value)} onBlur={q.onBlur} rows={2} />
      </div>
      <div>
        <Label htmlFor={`a-${id}`}>기준 답안</Label>
        <Textarea id={`a-${id}`} value={a.value} onChange={(e) => a.onChange(e.target.value)} onBlur={a.onBlur} rows={3} />
      </div>
      <div>
        <Label htmlFor={`s-${id}`}>원문 근거</Label>
        <Textarea id={`s-${id}`} value={s.value} onChange={(e) => s.onChange(e.target.value)} onBlur={s.onBlur} rows={2} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-xs text-muted">
          난이도
          <select
            className="h-8 rounded-md border border-border bg-surface px-2 text-sm text-text"
            value={question.difficulty}
            onChange={(e) => save({ difficulty: e.target.value as Difficulty })}
          >
            {Object.entries(DIFFICULTY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <Button variant="ghost" size="sm" className="text-danger" onClick={() => deleteQuestion(question.id)}>
          <Trash2 className="h-4 w-4" /> 삭제
        </Button>
      </div>
    </div>
  )
}

function QuestionItem({ question }: { question: Question }) {
  const [open, setOpen] = useState(false)
  return (
    <li className="rounded-lg border border-border bg-surface p-3">
      <button
        type="button"
        className="flex w-full items-start gap-2 text-left"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="flex-1 text-sm font-medium leading-snug">{question.question || '(빈 질문)'}</span>
        <ChevronDown className={`mt-0.5 h-4 w-4 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {question.origin === 'ai' && (
          <Badge tone="accent">
            <Sparkles className="h-3 w-3" /> AI
          </Badge>
        )}
        <Badge>{DIFFICULTY_LABEL[question.difficulty]}</Badge>
        {question.nextReviewAt && <Badge tone="primary">다음 복습 {formatDate(question.nextReviewAt)}</Badge>}
        {question.reviewCount > 0 && <Badge>복습 {question.reviewCount}회</Badge>}
      </div>
      {open && <QuestionEditor question={question} />}
    </li>
  )
}

function AddQuestionForm({ noteId, onDone }: { noteId: string; onDone(): void }) {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [excerpt, setExcerpt] = useState('')
  return (
    <form
      className="space-y-3 rounded-lg border border-dashed border-border bg-surface p-3"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!question.trim()) return
        await addQuestions(noteId, [
          { question: question.trim(), referenceAnswer: answer.trim(), sourceExcerpt: excerpt.trim(), difficulty: 'medium', origin: 'manual' },
        ])
        onDone()
      }}
    >
      <div>
        <Label htmlFor="new-q">질문</Label>
        <Textarea id="new-q" value={question} onChange={(e) => setQuestion(e.target.value)} rows={2} required autoFocus />
      </div>
      <div>
        <Label htmlFor="new-a">기준 답안</Label>
        <Textarea id="new-a" value={answer} onChange={(e) => setAnswer(e.target.value)} rows={2} />
      </div>
      <div>
        <Label htmlFor="new-s">원문 근거 (선택)</Label>
        <Textarea id="new-s" value={excerpt} onChange={(e) => setExcerpt(e.target.value)} rows={2} />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onDone}>
          취소
        </Button>
        <Button type="submit" size="sm" disabled={!question.trim()}>
          질문 추가
        </Button>
      </div>
    </form>
  )
}

export function CuePanel({ noteId }: { noteId: string }) {
  const cues = useLiveQuery(() => listCues(noteId), [noteId])
  const questions = useLiveQuery(() => listQuestions(noteId), [noteId])
  const [newCue, setNewCue] = useState('')
  const [adding, setAdding] = useState(false)

  return (
    <div className="space-y-6 p-4">
      <section aria-labelledby="cues-heading">
        <h2 id="cues-heading" className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
          핵심 키워드
        </h2>
        {cues?.length === 0 && <p className="mb-2 text-sm text-muted">노트의 핵심 개념을 짧게 적어 두세요.</p>}
        <ul className="space-y-0.5">
          {cues?.map((cue) => <CueItem key={cue.id} cue={cue} />)}
        </ul>
        <form
          className="mt-2 flex gap-1"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!newCue.trim()) return
            await addCues(noteId, [newCue.trim()])
            setNewCue('')
          }}
        >
          <Input
            aria-label="새 핵심 키워드"
            placeholder="키워드 추가"
            value={newCue}
            onChange={(e) => setNewCue(e.target.value)}
            className="h-9"
            maxLength={500}
          />
          <Button type="submit" variant="secondary" size="icon" aria-label="키워드 추가" disabled={!newCue.trim()}>
            <Plus className="h-4 w-4" />
          </Button>
        </form>
      </section>

      <section aria-labelledby="questions-heading">
        <div className="mb-2 flex items-center justify-between">
          <h2 id="questions-heading" className="text-xs font-semibold uppercase tracking-wide text-muted">
            질문 {questions?.length ? `(${questions.length})` : ''}
          </h2>
          {!adding && (
            <Button variant="ghost" size="sm" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" /> 직접 추가
            </Button>
          )}
        </div>
        {adding && (
          <div className="mb-3">
            <AddQuestionForm noteId={noteId} onDone={() => setAdding(false)} />
          </div>
        )}
        {questions?.length === 0 && !adding && (
          <p className="text-sm text-muted">
            아직 질문이 없습니다. 직접 추가하거나 상단의 <strong>AI 질문 생성</strong>을 사용하세요.
          </p>
        )}
        <ul className="space-y-2">
          {questions?.map((q) => <QuestionItem key={q.id} question={q} />)}
        </ul>
      </section>
    </div>
  )
}
