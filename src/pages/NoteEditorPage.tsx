import * as Tabs from '@radix-ui/react-tabs'
import type { JSONContent } from '@tiptap/react'
import { liveQuery } from 'dexie'
import { ArrowLeft, GraduationCap, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ConflictBanner } from '@/components/cornell/ConflictBanner'
import { CuePanel } from '@/components/cornell/CuePanel'
import { SaveStatus } from '@/components/cornell/SaveStatus'
import { SummaryPanel } from '@/components/cornell/SummaryPanel'
import { RichTextEditor } from '@/components/editor/RichTextEditor'
import { ReviewSession } from '@/components/review/ReviewSession'
import { Button, buttonClass } from '@/components/ui/Button'
import { db } from '@/db/local/db'
import { GenerateQuestionsDialog } from '@/features/ai/GenerateQuestionsDialog'
import { type NotePatch, updateNote } from '@/features/notes/repository'
import { draftKey, isPatchApplied, takeDraft } from '@/features/notes/draftJournal'
import { useAutoSave } from '@/features/notes/useAutoSave'
import { getNoteReviewQuestions } from '@/features/review/repository'
import { useMediaQuery } from '@/lib/hooks'
import { tiptapToText } from '@/lib/tiptapText'
import type { Note, Question } from '@/types/models'

export function NoteEditorPage() {
  const { id = '' } = useParams()
  const [note, setNote] = useState<Note | null | undefined>(undefined)
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [aiSummaryDraft, setAiSummaryDraft] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const [generateOpen, setGenerateOpen] = useState(false)
  const contentRef = useRef<JSONContent | null>(null)
  /** 편집기가 마지막으로 반영한 레코드의 localUpdatedAt. 달라지면 원격 변경이 들어온 것. */
  const knownLocalUpdatedAt = useRef<string | undefined>(undefined)
  const isDesktop = useMediaQuery('(min-width: 768px)')

  const apply = useCallback((n: Note) => {
    setNote(n)
    setTitle(n.title)
    setSummary(n.userSummary)
    setAiSummaryDraft(n.aiSummaryDraft)
    contentRef.current = n.contentJson
    knownLocalUpdatedAt.current = n.localUpdatedAt
  }, [])

  const save = useCallback(
    async (patch: NotePatch) => {
      const result = await updateNote(id, patch, knownLocalUpdatedAt.current)
      if (result.status === 'saved') knownLocalUpdatedAt.current = result.note.localUpdatedAt
      if (result.status === 'conflict') {
        apply(result.note)
        setRevision((r) => r + 1)
      }
      return result.status
    },
    [id, apply],
  )
  const journal = useMemo(() => ({ key: draftKey(id), base: () => knownLocalUpdatedAt.current }), [id])
  const { status, schedule, flush, hasPending } = useAutoSave<NotePatch>(save, undefined, journal)

  // 최초 로드 + 동기화로 다른 기기의 변경이 들어오면(편집 중인 내용이 없을 때) 화면을 갱신한다.
  useEffect(() => {
    knownLocalUpdatedAt.current = undefined
    const subscription = liveQuery(() => db.notes.get(id)).subscribe({
      next: (live) => {
        if (!live || live.deletedAt) {
          setNote(null)
          return
        }
        if (knownLocalUpdatedAt.current === undefined) {
          // 지난번 탭 종료 직전에 저장되지 못한 입력이 있으면 재생한다 (결과는 이 구독으로 다시 들어온다).
          const draft = takeDraft<NotePatch>(draftKey(id))
          if (draft && !isPatchApplied(live, draft.patch)) void updateNote(id, draft.patch, draft.base)
          apply(live)
        } else if (live.localUpdatedAt !== knownLocalUpdatedAt.current && !hasPending()) {
          apply(live)
          setRevision((r) => r + 1)
        }
      },
    })
    return () => subscription.unsubscribe()
  }, [id, apply, hasPending])

  const getAiInput = useCallback(async () => {
    await flush()
    return { title, content: tiptapToText(contentRef.current), userSummary: summary }
  }, [flush, title, summary])

  if (note === undefined) return null
  if (note === null) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="font-semibold">노트를 찾을 수 없습니다.</p>
        <p className="mt-1 text-sm text-muted">삭제되었거나 이 기기에 없는 노트입니다.</p>
        <Link to="/" className={buttonClass('secondary', 'md', 'mt-6')}>
          노트 목록으로
        </Link>
      </div>
    )
  }

  const editor = (
    <RichTextEditor
      key={`${id}:${revision}`}
      initialContent={note.contentJson}
      onChange={(json) => {
        contentRef.current = json
        schedule({ contentJson: json })
      }}
    />
  )
  const cues = <CuePanel noteId={id} />
  const summaryPanel = (
    <SummaryPanel
      value={summary}
      onChange={(value) => {
        setSummary(value)
        schedule({ userSummary: value })
      }}
      aiSummaryDraft={aiSummaryDraft}
      onDiscardAiSummary={() => {
        setAiSummaryDraft(null)
        schedule({ aiSummaryDraft: null })
      }}
    />
  )

  return (
    <div className="flex flex-col">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-2 px-3 py-2 sm:px-4">
          <Link to="/" className={buttonClass('ghost', 'icon')} aria-label="노트 목록으로">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <input
            aria-label="노트 제목"
            value={title}
            placeholder="제목 없음"
            maxLength={500}
            onChange={(e) => {
              setTitle(e.target.value)
              schedule({ title: e.target.value })
            }}
            className="min-w-0 flex-1 rounded-md bg-transparent px-2 py-1 text-lg font-bold outline-none placeholder:text-muted/60 focus-visible:bg-surface-2 sm:text-xl"
          />
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <span className="mr-auto sm:mr-2">
              <SaveStatus status={status} />
            </span>
            <Button variant="secondary" size="sm" onClick={() => setGenerateOpen(true)}>
              <Sparkles className="h-4 w-4 text-accent" /> AI 질문 생성
            </Button>
            <Link to={`/review?note=${id}`} className={buttonClass('primary', 'sm')}>
              <GraduationCap className="h-4 w-4" /> 복습 시작
            </Link>
          </div>
        </div>
      </header>

      <ConflictBanner noteId={id} />

      {isDesktop ? (
        <div className="mx-auto grid w-full max-w-7xl grid-cols-[minmax(240px,3fr)_7fr] border-x border-border">
          <aside aria-label="핵심 키워드와 질문" className="border-r border-border bg-cue">
            {cues}
          </aside>
          <section aria-label="본문 필기" className="min-h-[60dvh] bg-surface">
            {editor}
          </section>
          <section aria-label="요약" className="col-span-2 border-t-2 border-border bg-surface-2/50">
            {summaryPanel}
          </section>
        </div>
      ) : (
        <Tabs.Root defaultValue="notes" className="flex flex-col">
          <Tabs.List
            aria-label="코넬 노트 영역"
            className="sticky top-14 z-20 grid grid-cols-4 border-b border-border bg-surface"
          >
            {[
              ['notes', '필기'],
              ['cues', '질문'],
              ['summary', '요약'],
              ['review', '복습'],
            ].map(([value, label]) => (
              <Tabs.Trigger
                key={value}
                value={value}
                className="h-11 border-b-2 border-transparent text-sm font-medium text-muted data-[state=active]:border-primary data-[state=active]:text-primary"
              >
                {label}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          <Tabs.Content value="notes" forceMount className="bg-surface data-[state=inactive]:hidden">
            {editor}
          </Tabs.Content>
          <Tabs.Content value="cues" className="bg-cue">
            {cues}
          </Tabs.Content>
          <Tabs.Content value="summary">{summaryPanel}</Tabs.Content>
          <Tabs.Content value="review" className="px-4 py-6">
            <NoteReviewTab noteId={id} />
          </Tabs.Content>
        </Tabs.Root>
      )}

      <GenerateQuestionsDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        noteId={id}
        getInput={getAiInput}
        onSummaryDraft={async (draft) => {
          setAiSummaryDraft(draft)
          schedule({ aiSummaryDraft: draft })
          await flush()
        }}
      />
    </div>
  )
}

function NoteReviewTab({ noteId }: { noteId: string }) {
  const [questions, setQuestions] = useState<Question[] | null>(null)
  if (!questions) {
    return (
      <div className="py-8 text-center">
        <p className="mb-4 text-sm text-muted">이 노트의 질문으로 복습합니다. 답을 먼저 쓰고 나서 정답을 확인합니다.</p>
        <Button onClick={async () => setQuestions(await getNoteReviewQuestions(noteId))}>
          <GraduationCap className="h-4 w-4" /> 이 노트 복습 시작
        </Button>
      </div>
    )
  }
  return <ReviewSession questions={questions} onExit={() => setQuestions(null)} exitLabel="돌아가기" />
}
