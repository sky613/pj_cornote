// 복습 일정 계산. Scheduler 인터페이스만 지키면 FSRS 등 다른 알고리즘으로 교체할 수 있다.
import type { Rating } from '@/types/models'

export interface SchedulingState {
  reviewCount: number
  intervalDays: number
  lastRating: Rating | null
  lastReviewedAt: string | null
}

export interface ScheduleResult {
  nextReviewAt: Date
  intervalDays: number
}

export interface Scheduler {
  readonly id: string
  schedule(state: SchedulingState, rating: Rating, now: Date): ScheduleResult
}

export const RATING_LABELS: Record<Rating, string> = {
  again: '다시',
  hard: '어려움',
  good: '보통',
  easy: '쉬움',
}

export const RATINGS: Rating[] = ['again', 'hard', 'good', 'easy']

export const FIXED_INTERVALS: Record<Rating, number> = { again: 1, hard: 3, good: 7, easy: 14 }

/** now 로부터 days 일 뒤 날짜의 로컬 자정. 같은 날 안에서는 언제 복습해도 동일한 날에 도래한다. */
export function addDaysAtLocalMidnight(now: Date, days: number): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days)
  return d
}

/** 초기 규칙: 다시 1일, 어려움 3일, 보통 7일, 쉬움 14일. */
export const fixedIntervalScheduler: Scheduler = {
  id: 'fixed-v1',
  schedule(_state, rating, now) {
    const intervalDays = FIXED_INTERVALS[rating]
    return { intervalDays, nextReviewAt: addDaysAtLocalMidnight(now, intervalDays) }
  },
}

export const defaultScheduler: Scheduler = fixedIntervalScheduler
