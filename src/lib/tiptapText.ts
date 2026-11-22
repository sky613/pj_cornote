import type { JSONContent } from '@tiptap/react'

const BLOCK_TYPES = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'codeBlock',
  'listItem',
  'taskItem',
  'bulletList',
  'orderedList',
  'taskList',
  'horizontalRule',
])

/** Tiptap JSON → 평문. 블록 사이에는 줄바꿈을 넣는다 (AI 입력, 근거 문장 검증에 사용). */
export function tiptapToText(doc: JSONContent | null | undefined): string {
  const out: string[] = []
  const walk = (node: JSONContent) => {
    if (node.type === 'text') {
      out.push(node.text ?? '')
      return
    }
    if (node.type === 'hardBreak') {
      out.push('\n')
      return
    }
    node.content?.forEach(walk)
    if (node.type && BLOCK_TYPES.has(node.type)) out.push('\n')
  }
  if (doc) walk(doc)
  return out
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
