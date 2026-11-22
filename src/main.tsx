import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { replayPendingDrafts } from './features/notes/draftJournal'
import { getNote, updateNote } from './features/notes/repository'
import { requestPersistentStorage } from './lib/storage'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

void requestPersistentStorage()
// 지난 세션 종료 직전에 IndexedDB 에 쓰지 못한 입력 복구
void replayPendingDrafts(getNote, (id, patch, base) => updateNote(id, patch, base))
