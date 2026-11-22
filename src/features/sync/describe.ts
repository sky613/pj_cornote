import { tiptapToText } from '@/lib/tiptapText'
import type { Conflict, Cue, Note, Question } from '@/types/models'

/** 충돌 비교 화면용 평문 미리보기. */
export function describeRecord(conflict: Conflict, which: 'localCopy' | 'serverCopy'): string {
  const record = conflict[which]
  if (!record) return '(서버에 없음)'
  if (record.deletedAt) return '(삭제됨)'
  switch (conflict.table) {
    case 'notes': {
      const n = record as Note
      return `제목: ${n.title || '제목 없음'}\n\n${tiptapToText(n.contentJson).slice(0, 600)}\n\n요약: ${n.userSummary}`
    }
    case 'cues':
      return (record as Cue).text
    case 'questions': {
      const q = record as Question
      return `Q. ${q.question}\nA. ${q.referenceAnswer}`
    }
  }
}
