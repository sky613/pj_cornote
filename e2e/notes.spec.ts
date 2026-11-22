import { expect, test } from '@playwright/test'
import { createNote } from './helpers'

test('create, autosave, persist after reload, search and delete a note', async ({ page }) => {
  await createNote(page, '세포 호흡', '미토콘드리아에서 ATP가 만들어진다.')
  await page.reload()
  await expect(page.getByLabel('노트 제목')).toHaveValue('세포 호흡')
  await expect(page.getByRole('textbox', { name: '본문 필기' })).toContainText('미토콘드리아에서 ATP가 만들어진다.')

  await page.getByRole('link', { name: '노트 목록으로' }).click()
  await expect(page.getByRole('link', { name: /세포 호흡/ })).toBeVisible()
  await page.getByLabel('제목 검색').fill('광합성')
  await expect(page.getByText('일치하는 노트가 없습니다')).toBeVisible()
  await page.getByLabel('제목 검색').fill('세포')

  await page.getByRole('button', { name: '"세포 호흡" 삭제' }).click()
  await expect(page.getByRole('dialog')).toContainText('노트를 삭제할까요?')
  await page.getByRole('dialog').getByRole('button', { name: '삭제' }).click()
  await expect(page.getByText('아직 노트가 없습니다')).toBeVisible()
})

test('Cornell layout on desktop: cue column, note body and summary', async ({ page }) => {
  await createNote(page, '레이아웃', '본문')
  const cue = page.getByRole('complementary', { name: '핵심 키워드와 질문' })
  const body = page.getByRole('region', { name: '본문 필기' })
  const summary = page.getByRole('region', { name: '요약' })
  const [c, b, s] = await Promise.all([cue.boundingBox(), body.boundingBox(), summary.boundingBox()])
  expect(c!.x).toBeLessThan(b!.x)
  expect(c!.width / (c!.width + b!.width)).toBeGreaterThan(0.25)
  expect(c!.width / (c!.width + b!.width)).toBeLessThan(0.35)
  expect(s!.y).toBeGreaterThan(b!.y)
  expect(s!.width).toBeGreaterThan(b!.width)
})

test('AI question generation (mock), review with answer-first flow', async ({ page }) => {
  await createNote(
    page,
    '광합성',
    '광합성은 엽록체에서 일어난다. 명반응에서는 물이 분해되어 산소가 발생한다. 캘빈 회로에서는 이산화탄소가 고정된다.',
  )
  await page.getByLabel('내 요약').fill('빛으로 포도당을 만드는 과정')

  await page.getByRole('button', { name: 'AI 질문 생성' }).click()
  const dialog = page.getByRole('dialog', { name: 'AI 질문 생성' })
  await dialog.getByText('3개').click()
  await dialog.getByRole('button', { name: '생성하기' }).click()
  await expect(dialog.getByText('원문에서 근거 확인').first()).toBeVisible()
  await dialog.getByRole('button', { name: /선택 항목 추가/ }).click()
  await expect(dialog).toBeHidden()

  // 사용자 요약은 그대로
  await expect(page.getByLabel('내 요약')).toHaveValue('빛으로 포도당을 만드는 과정')
  await expect(page.getByRole('complementary').getByRole('listitem').filter({ hasText: 'AI' }).first()).toBeVisible()

  await page.getByRole('link', { name: '복습 시작' }).click()
  await expect(page).toHaveURL(/\/review\?note=/)
  const card = page.getByRole('article', { name: '복습 카드' })
  await expect(page.getByTestId('reference-answer')).toHaveCount(0)
  await expect(card.getByText('원문 근거')).toHaveCount(0)

  for (let i = 0; i < 3; i++) {
    await page.getByLabel('내 답변').fill('엽록체')
    await page.getByRole('button', { name: /답변 제출/ }).click()
    await expect(page.getByTestId('reference-answer')).toBeVisible()
    await expect(page.getByLabel('AI 피드백')).toBeVisible()
    await page.getByRole('button', { name: /^보통/ }).click()
  }
  await expect(page.getByText('복습 완료! 3문항')).toBeVisible()

  await page.goto('/')
  await expect(page.getByTestId('due-count')).toHaveText('0문항')
})

test('manually add a question and export a JSON backup', async ({ page }) => {
  await createNote(page, '수동 질문', '내용')
  await page.getByRole('button', { name: '직접 추가' }).click()
  await page.getByRole('textbox', { name: '질문', exact: true }).fill('수동 질문?')
  await page.getByRole('textbox', { name: '기준 답안', exact: true }).fill('수동 답')
  await page.getByRole('button', { name: '질문 추가' }).click()
  await expect(page.getByRole('button', { name: '수동 질문?' })).toBeVisible()

  await page.goto('/settings')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'JSON 내보내기' }).click()
  const file = await download
  expect(file.suggestedFilename()).toMatch(/^cornote-backup-.*\.json$/)
  const content = JSON.parse(await (await file.createReadStream()).toArray().then((c) => Buffer.concat(c).toString()))
  expect(content.format).toBe('cornote-backup')
  expect(content.data.questions[0].question).toBe('수동 질문?')
})
