import { expect, test } from '@playwright/test'
import { createNote } from './helpers'

test('mobile: tabs for notes, questions, summary and review', async ({ page }) => {
  await createNote(page, '모바일 노트', 'DNA는 이중 나선 구조이다.')

  const tabs = page.getByRole('tablist', { name: '코넬 노트 영역' })
  await expect(tabs.getByRole('tab')).toHaveText(['필기', '질문', '요약', '복습'])

  await tabs.getByRole('tab', { name: '질문' }).click()
  await page.getByLabel('새 핵심 키워드').fill('이중 나선')
  await page.getByRole('button', { name: '키워드 추가' }).click()
  await page.getByRole('button', { name: '직접 추가' }).click()
  await page.getByRole('textbox', { name: '질문', exact: true }).fill('DNA의 구조는?')
  await page.getByRole('textbox', { name: '기준 답안', exact: true }).fill('이중 나선')
  await page.getByRole('button', { name: '질문 추가' }).click()

  await tabs.getByRole('tab', { name: '요약' }).click()
  await page.getByLabel('내 요약').fill('DNA는 두 가닥이 꼬인 모양')

  await tabs.getByRole('tab', { name: '필기' }).click()
  await expect(page.getByRole('textbox', { name: '본문 필기' })).toContainText('이중 나선 구조')

  await tabs.getByRole('tab', { name: '복습' }).click()
  await page.getByRole('button', { name: '이 노트 복습 시작' }).click()
  await expect(page.getByRole('heading', { name: 'DNA의 구조는?' })).toBeVisible()
  await expect(page.getByTestId('reference-answer')).toHaveCount(0)
  await page.getByLabel('내 답변').fill('이중 나선')
  await page.getByRole('button', { name: /답변 제출/ }).click()
  await expect(page.getByTestId('reference-answer')).toHaveText('이중 나선')
  await page.getByRole('button', { name: /^쉬움/ }).click()
  await expect(page.getByText(/복습 완료/)).toBeVisible()

  // 페이지 가로 스크롤 없음
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)

  await page.reload()
  await tabs.getByRole('tab', { name: '요약' }).click()
  await expect(page.getByLabel('내 요약')).toHaveValue('DNA는 두 가닥이 꼬인 모양')
})
