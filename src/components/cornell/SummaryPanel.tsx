import { Sparkles, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Field'

interface SummaryPanelProps {
  value: string
  onChange(value: string): void
  aiSummaryDraft: string | null
  onDiscardAiSummary(): void
}

/** 사용자 요약. AI 요약 초안은 별도로 접어 두고, 사용자 요약을 절대 덮어쓰지 않는다. */
export function SummaryPanel({ value, onChange, aiSummaryDraft, onDiscardAiSummary }: SummaryPanelProps) {
  const [showAi, setShowAi] = useState(false)
  return (
    <div className="space-y-3 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor="user-summary" className="text-xs font-semibold uppercase tracking-wide text-muted">
          내 요약
        </label>
        <span className="text-xs text-muted">원문을 보지 않고 자기 말로 정리해 보세요.</span>
      </div>
      <Textarea
        id="user-summary"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        placeholder="이 노트의 핵심을 3~5문장으로 요약합니다."
        className="bg-surface text-base"
      />
      {aiSummaryDraft && (
        <div className="rounded-lg border border-border bg-surface-2/60">
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-muted"
            aria-expanded={showAi}
            onClick={() => setShowAi((v) => !v)}
          >
            <Sparkles className="h-4 w-4 text-accent" />
            <span className="flex-1">AI 요약 초안 {showAi ? '숨기기' : '보기'} (참고용)</span>
          </button>
          {showAi && (
            <div className="border-t border-border px-3 py-3">
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{aiSummaryDraft}</p>
              <div className="mt-2 flex justify-end">
                <Button variant="ghost" size="sm" onClick={onDiscardAiSummary}>
                  <Trash2 className="h-4 w-4" /> 초안 삭제
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
