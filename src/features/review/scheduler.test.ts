import { addDaysAtLocalMidnight, fixedIntervalScheduler } from './scheduler'

const state = { reviewCount: 0, intervalDays: 0, lastRating: null, lastReviewedAt: null }

describe('fixedIntervalScheduler', () => {
  const now = new Date(2026, 8, 24, 15, 30) // 2026-09-24 15:30 local

  it.each([
    ['again', 1, new Date(2026, 8, 25)],
    ['hard', 3, new Date(2026, 8, 27)],
    ['good', 7, new Date(2026, 9, 1)],
    ['easy', 14, new Date(2026, 9, 8)],
  ] as const)('%s → %i일 후', (rating, days, expected) => {
    const result = fixedIntervalScheduler.schedule(state, rating, now)
    expect(result.intervalDays).toBe(days)
    expect(result.nextReviewAt.getTime()).toBe(expected.getTime())
  })

  it('handles month/year boundaries', () => {
    expect(addDaysAtLocalMidnight(new Date(2026, 11, 31, 23, 59), 1).getTime()).toBe(new Date(2027, 0, 1).getTime())
  })
})
