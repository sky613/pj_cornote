import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron, expect } from '@playwright/test'

const executablePath = process.argv[2]
if (!executablePath) throw new Error('Usage: node scripts/desktop-smoke.mjs <app executable>')

const profile = await mkdtemp(join(tmpdir(), 'cornote-desktop-'))
let electron
try {
  electron = await _electron.launch({ executablePath, args: [`--user-data-dir=${profile}`] })
  const page = await electron.firstWindow()
  await expect(page.getByRole('heading', { name: '내 노트' })).toBeVisible()
  await page.getByRole('button', { name: '새 노트' }).click()
  await page.getByLabel('노트 제목').fill('데스크톱 저장 확인')
  await expect(page.getByRole('status').filter({ hasText: /저장됨|기기에 저장됨/ })).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('노트 제목')).toHaveValue('데스크톱 저장 확인')
  await page.getByRole('link', { name: '설정' }).click()
  const backupPath = join(profile, 'backup.json')
  await electron.evaluate(({ dialog }, filePath) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath })
  }, backupPath)
  await page.getByRole('button', { name: 'JSON 내보내기' }).click()
  await expect.poll(async () => {
    const saved = await readFile(backupPath, 'utf8').catch(() => null)
    return saved ? JSON.parse(saved).data.notes.length : 0
  }).toBe(1)
  console.log('Desktop smoke passed')
} finally {
  await electron?.close()
  await rm(profile, { recursive: true, force: true })
}
