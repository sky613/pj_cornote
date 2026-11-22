import { expect, test } from '@playwright/test'
import { createNote } from './helpers'

test('works offline after the service worker is installed; data survives reload', async ({ page, context }) => {
  await page.goto('/')
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await page.reload() // 서비스 워커가 페이지를 제어하도록
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)

  await context.setOffline(true)
  await createNote(page, '오프라인 노트', '비행기 안에서 작성')
  await expect(page.getByText('오프라인 · 기기에 저장됨')).toBeVisible()

  await page.reload()
  await expect(page.getByLabel('노트 제목')).toHaveValue('오프라인 노트')
  await expect(page.getByRole('textbox', { name: '본문 필기' })).toContainText('비행기 안에서 작성')
  await context.setOffline(false)
})
