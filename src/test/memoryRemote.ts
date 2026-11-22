// 테스트용 인메모리 원격 저장소. 서버의 버전 조건부 갱신과 RLS(사용자 격리)를 흉내 낸다.
import type { RemoteApi } from '@/features/sync/types'
import type { Cue, Note, Question, ReviewLog, SyncRecord, SyncTable } from '@/types/models'

export class MemoryServer {
  tables: Record<SyncTable, Map<string, SyncRecord>> = {
    notes: new Map(),
    cues: new Map(),
    questions: new Map(),
    reviewLogs: new Map(),
  }
  private clock = Date.parse('2026-01-01T00:00:00Z')

  tick(): string {
    this.clock += 1000
    return new Date(this.clock).toISOString()
  }

  private noteOwner(noteId: string): string | undefined {
    return (this.tables.notes.get(noteId) as Note | undefined)?.userId ?? undefined
  }

  visible(table: SyncTable, r: SyncRecord, userId: string): boolean {
    if (table === 'notes') return (r as Note).userId === userId
    if (table === 'reviewLogs') return (r as ReviewLog).userId === userId
    return this.noteOwner((r as Cue | Question).noteId) === userId
  }

  /** 다른 기기에서의 편집을 흉내 낸다. */
  remoteEdit<T extends SyncRecord>(table: SyncTable, id: string, patch: Partial<T>): void {
    const current = this.tables[table].get(id)!
    this.tables[table].set(id, {
      ...current,
      ...patch,
      version: current.version + 1,
      serverUpdatedAt: this.tick(),
    } as SyncRecord)
  }

  api(userId: string): RemoteApi {
    const strip = (r: SyncRecord): SyncRecord => ({ ...r, syncStatus: 'synced' })
    return {
      push: async (table, record, baseVersion) => {
        const map = this.tables[table]
        const existing = map.get(record.id)
        if (!this.visible(table, record, userId)) return { status: 'error', message: '42501' }
        if (baseVersion === null) {
          if (existing) {
            return { status: 'conflict', server: this.visible(table, existing, userId) ? strip(existing) : null }
          }
          const saved = { ...record, version: 1, serverUpdatedAt: this.tick(), syncStatus: 'synced' } as SyncRecord
          map.set(record.id, saved)
          return { status: 'ok', record: strip(saved) }
        }
        if (!existing || !this.visible(table, existing, userId)) return { status: 'conflict', server: null }
        if (existing.version !== baseVersion) return { status: 'conflict', server: strip(existing) }
        const saved = { ...record, version: baseVersion + 1, serverUpdatedAt: this.tick(), syncStatus: 'synced' } as SyncRecord
        map.set(record.id, saved)
        return { status: 'ok', record: strip(saved) }
      },
      pull: async (table, since, offset, limit) => {
        return [...this.tables[table].values()]
          .filter((r) => this.visible(table, r, userId))
          .filter((r) => !since || (r.serverUpdatedAt ?? '') >= since)
          .sort((a, b) => (a.serverUpdatedAt ?? '').localeCompare(b.serverUpdatedAt ?? ''))
          .slice(offset, offset + limit)
          .map((r) => (table === 'reviewLogs' ? { ...strip(r), noteId: '' } : strip(r)))
      },
    }
  }
}
