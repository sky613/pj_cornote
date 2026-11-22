import { useLiveQuery } from 'dexie-react-hooks'
import { BookOpenCheck, CloudUpload, FilePlus2, NotebookPen, Search, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Badge } from '@/components/ui/Badge'
import { Button, buttonClass } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Field'
import { createNote, deleteNote, filterNotesByTitle, listNotes } from '@/features/notes/repository'
import { countDueByNote } from '@/features/review/repository'
import { tiptapToText } from '@/lib/tiptapText'
import { formatRelative } from '@/lib/time'
import type { Note } from '@/types/models'

export function NotesPage() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [toDelete, setToDelete] = useState<Note | null>(null)
  const notes = useLiveQuery(listNotes)
  const dueByNote = useLiveQuery(() => countDueByNote(), []) ?? new Map<string, number>()
  const totalDue = [...dueByNote.values()].reduce((a, b) => a + b, 0)

  const create = async () => {
    const note = await createNote()
    navigate(`/notes/${note.id}`)
  }

  if (!notes) return null
  const visible = filterNotesByTitle(notes, query)

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-2xl font-bold">내 노트</h1>
        <Button onClick={create}>
          <FilePlus2 className="h-4 w-4" /> 새 노트
        </Button>
      </div>

      <section
        aria-label="복습 현황"
        className="mb-6 flex flex-wrap items-center gap-4 rounded-xl border border-border bg-surface p-4 sm:p-5"
      >
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-cue text-primary">
          <BookOpenCheck className="h-5 w-5" />
        </div>
        <div className="mr-auto">
          <p className="text-sm text-muted">오늘 복습 예정</p>
          <p className="text-xl font-semibold" data-testid="due-count">
            {totalDue}문항
          </p>
        </div>
        {totalDue > 0 ? (
          <Link to="/review" className={buttonClass('accent')}>
            복습 시작
          </Link>
        ) : (
          <span className="text-sm text-muted">모든 복습을 마쳤습니다.</span>
        )}
      </section>

      {notes.length > 0 && (
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            type="search"
            aria-label="제목 검색"
            placeholder="제목으로 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      {notes.length === 0 ? (
        <EmptyState onCreate={create} />
      ) : visible.length === 0 ? (
        <p className="py-12 text-center text-muted">“{query}”와 일치하는 노트가 없습니다.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((note) => (
            <li key={note.id} className="group relative">
              <Link
                to={`/notes/${note.id}`}
                className="flex h-full flex-col rounded-xl border border-border bg-surface p-4 transition-colors hover:border-primary/50"
              >
                <span className="line-clamp-1 pr-8 font-semibold">{note.title || '제목 없음'}</span>
                <span className="mt-1 line-clamp-2 min-h-10 text-sm text-muted">
                  {tiptapToText(note.contentJson).slice(0, 160) || '내용 없음'}
                </span>
                <span className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span>{formatRelative(note.updatedAt)}</span>
                  {(dueByNote.get(note.id) ?? 0) > 0 && <Badge tone="accent">복습 {dueByNote.get(note.id)}</Badge>}
                  {note.syncStatus === 'pending' && note.userId && (
                    <span className="inline-flex items-center gap-1" title="동기화 대기 중">
                      <CloudUpload className="h-3.5 w-3.5" />
                      <span className="sr-only">동기화 대기 중</span>
                    </span>
                  )}
                </span>
              </Link>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`"${note.title || '제목 없음'}" 삭제`}
                className="absolute right-2 top-2 opacity-100 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100"
                onClick={() => setToDelete(note)}
              >
                <Trash2 className="h-4 w-4 text-muted" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
        title="노트를 삭제할까요?"
        description={`“${toDelete?.title || '제목 없음'}” 노트와 질문, 복습 일정이 삭제됩니다. 삭제 전에 설정에서 JSON 백업을 받아 둘 수 있습니다.`}
        confirmLabel="삭제"
        destructive
        onConfirm={async () => {
          if (toDelete) await deleteNote(toDelete.id)
        }}
      />
    </div>
  )
}

function EmptyState({ onCreate }: { onCreate(): void }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-12 text-center">
      <NotebookPen className="mx-auto mb-3 h-10 w-10 text-primary" />
      <p className="text-lg font-semibold">아직 노트가 없습니다</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
        오른쪽에 필기하고, 왼쪽에 핵심 키워드와 질문을, 아래에 내 말로 요약을 적습니다. 그다음 원문을 가리고 질문에 먼저
        답하며 복습합니다.
      </p>
      <Button className="mt-6" onClick={onCreate}>
        <FilePlus2 className="h-4 w-4" /> 첫 노트 만들기
      </Button>
    </div>
  )
}
