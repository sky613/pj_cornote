import { BrowserRouter, Route, Routes } from 'react-router'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { SyncProvider } from '@/features/sync/SyncProvider'
import { NoteEditorPage } from '@/pages/NoteEditorPage'
import { NotesPage } from '@/pages/NotesPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { ReviewPage } from '@/pages/ReviewPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { AppShell } from './AppShell'

export function App() {
  return (
    <AuthProvider>
      <SyncProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<NotesPage />} />
              <Route path="notes/:id" element={<NoteEditorPage />} />
              <Route path="review" element={<ReviewPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </SyncProvider>
    </AuthProvider>
  )
}
