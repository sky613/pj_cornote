import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { ReviewSession } from '@/components/review/ReviewSession'
import { getNote } from '@/features/notes/repository'
import { getDueQuestions, getNoteReviewQuestions } from '@/features/review/repository'
import type { Question } from '@/types/models'

export function ReviewPage() {
  const [params] = useSearchParams()
  const noteId = params.get('note')
  const [questions, setQuestions] = useState<Question[] | null>(null)
  const [noteTitle, setNoteTitle] = useState<string | null>(null)

  // 세션 시작 시점의 문항을 고정한다 (복습 도중 목록이 바뀌지 않도록).
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const list = noteId ? await getNoteReviewQuestions(noteId) : await getDueQuestions()
      const title = noteId ? ((await getNote(noteId))?.title ?? null) : null
      if (!cancelled) {
        setQuestions(list)
        setNoteTitle(title)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [noteId])

  if (!questions) return null
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <h1 className="mb-6 text-2xl font-bold">
        복습{noteId ? <span className="ml-2 text-base font-normal text-muted">{noteTitle || '제목 없음'}</span> : null}
      </h1>
      <ReviewSession questions={questions} exitLabel="노트 목록으로" />
    </div>
  )
}
