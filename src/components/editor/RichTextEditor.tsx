import { TaskItem, TaskList } from '@tiptap/extension-list'
import { Placeholder } from '@tiptap/extensions'
import { EditorContent, type JSONContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { EditorToolbar } from './EditorToolbar'

export const SAFE_LINK_PROTOCOL = /^(https?:|mailto:)/i

interface RichTextEditorProps {
  initialContent: JSONContent
  onChange(json: JSONContent): void
  label?: string
}

/** 본문 필기. 콘텐츠는 Tiptap JSON 으로 저장되며, ProseMirror 스키마가 허용한 노드만 렌더링된다(원시 HTML 없음). */
export function RichTextEditor({ initialContent, onChange, label = '본문 필기' }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: 'https',
          protocols: ['http', 'https', 'mailto'],
          isAllowedUri: (url, ctx) => SAFE_LINK_PROTOCOL.test(url) && ctx.defaultValidate(url),
          HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
        },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: '수업·독서 내용을 자유롭게 적어 보세요. 제목, 목록, 체크리스트, 인용, 코드를 쓸 수 있습니다.' }),
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        'aria-label': label,
        'aria-multiline': 'true',
        role: 'textbox',
        class: 'tiptap px-4 py-4 sm:px-6',
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.getJSON()),
  })

  return (
    <div className="flex h-full flex-col">
      <EditorToolbar editor={editor} />
      <EditorContent editor={editor} className="flex-1" />
    </div>
  )
}
