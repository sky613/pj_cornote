import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'
import { clearLocalData } from '@/db/local/db'

beforeEach(async () => {
  await clearLocalData()
})

afterEach(() => {
  cleanup()
})
