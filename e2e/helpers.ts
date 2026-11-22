import { expect, type Page } from '@playwright/test'

export async function createNote(page: Page, title: string, body: string) {
  await page.goto('/')
  await page.getByRole('button', { name: /새 노트|첫 노트 만들기/ }).first().click()
  await expect(page).toHaveURL(/\/notes\//)
  await page.getByLabel('노트 제목').fill(title)
  const editor = page.getByRole('textbox', { name: '본문 필기' })
  await editor.click()
  await editor.pressSequentially(body)
  await expect(page.getByRole('status').filter({ hasText: /저장됨|기기에 저장됨/ })).toBeVisible()
}
