import { type Editor, useEditorState } from '@tiptap/react'
import {
  Bold,
  Code2,
  Heading1,
  Heading2,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Quote,
  Redo2,
  Undo2,
} from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Input, Label } from '@/components/ui/Field'
import { cn } from '@/lib/cn'
import { SAFE_LINK_PROTOCOL } from './RichTextEditor'

function ToolButton({ label, active, onClick, children }: { label: string; active?: boolean; onClick(): void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active ?? undefined}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-text',
        active && 'bg-cue text-primary',
      )}
    >
      {children}
    </button>
  )
}

export function EditorToolbar({ editor }: { editor: Editor | null }) {
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [linkError, setLinkError] = useState<string | null>(null)

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            h1: e.isActive('heading', { level: 1 }),
            h2: e.isActive('heading', { level: 2 }),
            bold: e.isActive('bold'),
            italic: e.isActive('italic'),
            bullet: e.isActive('bulletList'),
            ordered: e.isActive('orderedList'),
            task: e.isActive('taskList'),
            quote: e.isActive('blockquote'),
            code: e.isActive('codeBlock'),
            link: e.isActive('link'),
            canUndo: e.can().undo(),
            canRedo: e.can().redo(),
          }
        : null,
  })

  if (!editor || !state) return <div className="h-11 border-b border-border" />
  const chain = () => editor.chain().focus()

  const openLink = () => {
    setLinkUrl((editor.getAttributes('link').href as string | undefined) ?? '')
    setLinkError(null)
    setLinkOpen(true)
  }

  const applyLink = () => {
    const url = linkUrl.trim()
    if (!url) {
      chain().extendMarkRange('link').unsetLink().run()
      setLinkOpen(false)
      return
    }
    const normalized = /^[a-z]+:/i.test(url) ? url : `https://${url}`
    if (!SAFE_LINK_PROTOCOL.test(normalized)) {
      setLinkError('http, https, mailto 링크만 사용할 수 있습니다.')
      return
    }
    chain().extendMarkRange('link').setLink({ href: normalized }).run()
    setLinkOpen(false)
  }

  return (
    <>
      <div
        role="toolbar"
        aria-label="서식 도구"
        className="sticky top-0 z-10 flex items-center gap-0.5 overflow-x-auto border-b border-border bg-surface/95 px-2 py-1.5 backdrop-blur"
      >
        <ToolButton label="제목 1" active={state.h1} onClick={() => chain().toggleHeading({ level: 1 }).run()}>
          <Heading1 className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="제목 2" active={state.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()}>
          <Heading2 className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="굵게" active={state.bold} onClick={() => chain().toggleBold().run()}>
          <Bold className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="기울임" active={state.italic} onClick={() => chain().toggleItalic().run()}>
          <Italic className="h-4 w-4" />
        </ToolButton>
        <span className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden />
        <ToolButton label="글머리 목록" active={state.bullet} onClick={() => chain().toggleBulletList().run()}>
          <List className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="번호 목록" active={state.ordered} onClick={() => chain().toggleOrderedList().run()}>
          <ListOrdered className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="체크리스트" active={state.task} onClick={() => chain().toggleTaskList().run()}>
          <ListChecks className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="인용문" active={state.quote} onClick={() => chain().toggleBlockquote().run()}>
          <Quote className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="코드 블록" active={state.code} onClick={() => chain().toggleCodeBlock().run()}>
          <Code2 className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="링크" active={state.link} onClick={openLink}>
          <Link2 className="h-4 w-4" />
        </ToolButton>
        <span className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden />
        <ToolButton label="실행 취소" onClick={() => chain().undo().run()}>
          <Undo2 className={cn('h-4 w-4', !state.canUndo && 'opacity-40')} />
        </ToolButton>
        <ToolButton label="다시 실행" onClick={() => chain().redo().run()}>
          <Redo2 className={cn('h-4 w-4', !state.canRedo && 'opacity-40')} />
        </ToolButton>
      </div>

      <Dialog
        open={linkOpen}
        onOpenChange={setLinkOpen}
        title="링크"
        description="선택한 텍스트에 링크를 겁니다. 비워 두면 링크를 제거합니다."
        footer={
          <>
            <Button variant="secondary" onClick={() => setLinkOpen(false)}>
              취소
            </Button>
            <Button onClick={applyLink}>적용</Button>
          </>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            applyLink()
          }}
        >
          <Label htmlFor="link-url">URL</Label>
          <Input
            id="link-url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://example.com"
            aria-invalid={Boolean(linkError)}
            autoFocus
          />
          {linkError && (
            <p role="alert" className="mt-2 text-sm text-danger">
              {linkError}
            </p>
          )}
        </form>
      </Dialog>
    </>
  )
}
