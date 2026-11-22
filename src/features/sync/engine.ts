// Local-first 동기화 엔진.
// 1) 소유자가 없는 로컬 레코드를 현재 계정에 귀속
// 2) push: pending 레코드를 버전 조건부로 서버에 반영 (notes → cues → questions → reviewLogs 순)
// 3) pull: 서버 커서 이후 변경분을 받아 로컬에 반영
// 충돌 시 서버 버전을 기준 레코드로 두고, 로컬 변경은 conflicts 테이블에 사본으로 보존한다.
import type { Table } from 'dexie'
import { db, getMeta, setMeta } from '@/db/local/db'
import { newId, nowIso } from '@/lib/time'
import type { Conflict, Cue, Note, Question, ReviewLog, SyncRecord, SyncTable } from '@/types/models'
import type { RemoteApi, SyncResult } from './types'

const ORDER: SyncTable[] = ['notes', 'cues', 'questions', 'reviewLogs']
export const PULL_PAGE_SIZE = 500
/** 동시 트랜잭션의 커밋 순서 역전으로 변경분을 놓치지 않도록 커서를 겹쳐 다시 읽는다 (적용은 멱등). */
export const CURSOR_OVERLAP_MS = 10_000

function tableOf(name: SyncTable): Table<SyncRecord, string> {
  return db[name] as unknown as Table<SyncRecord, string>
}

export const cursorKey = (userId: string, table: SyncTable) => `sync:cursor:${userId}:${table}`

export async function adoptUnownedRecords(userId: string): Promise<void> {
  await db.transaction('rw', db.notes, db.reviewLogs, async () => {
    await db.notes.filter((n) => n.userId === null).modify({ userId })
    await db.reviewLogs.filter((l) => l.userId === null).modify({ userId })
  })
}

async function markSynced(table: SyncTable, pushed: SyncRecord, server: SyncRecord): Promise<void> {
  const t = tableOf(table)
  await db.transaction('rw', t, async () => {
    const current = await t.get(pushed.id)
    if (!current) return
    const serverMeta = { version: server.version, serverUpdatedAt: server.serverUpdatedAt }
    // push 도중 사용자가 또 수정했다면 새 기준 버전만 반영하고 pending 을 유지한다.
    const unchanged = current.localUpdatedAt === pushed.localUpdatedAt
    await t.put({ ...current, ...serverMeta, ...(unchanged ? { syncStatus: 'synced' as const } : {}) })
  })
}

function conflictNoteId(table: Conflict['table'], record: SyncRecord): string | null {
  return table === 'notes' ? record.id : (record as Cue | Question).noteId
}

/** 로컬 변경을 충돌 사본으로 보존하고, 기준 레코드는 서버 버전으로 맞춘다. */
async function preserveConflict(table: Conflict['table'], server: SyncRecord): Promise<void> {
  const t = tableOf(table)
  await db.transaction('rw', t, db.conflicts, async () => {
    const current = await t.get(server.id)
    if (current) {
      await db.conflicts.add({
        id: newId(),
        table,
        recordId: server.id,
        noteId: conflictNoteId(table, current),
        localCopy: current as Note | Cue | Question,
        serverCopy: server as Note | Cue | Question,
        detectedAt: nowIso(),
        resolvedAt: null,
      })
    }
    await t.put({ ...server, syncStatus: 'synced', localUpdatedAt: (server as Note).updatedAt ?? nowIso() } as SyncRecord)
  })
}

async function push(remote: RemoteApi, userId: string, result: SyncResult): Promise<void> {
  const notes = await db.notes.toArray()
  const ownedNotes = new Set(notes.filter((n) => n.userId === userId).map((n) => n.id))
  result.skippedForeign = notes.filter((n) => n.userId !== null && n.userId !== userId && !n.deletedAt).length

  const isOwned = (table: SyncTable, r: SyncRecord) => {
    if (table === 'notes') return (r as Note).userId === userId
    if (table === 'reviewLogs') return (r as ReviewLog).userId === userId && ownedNotes.has((r as ReviewLog).noteId)
    return ownedNotes.has((r as Cue | Question).noteId)
  }

  for (const table of ORDER) {
    const pending = await tableOf(table).where('syncStatus').equals('pending').toArray()
    for (const local of pending) {
      if (!isOwned(table, local)) continue
      const base = local.serverUpdatedAt === null ? null : local.version

      // 복습 기록은 추가 전용: 이미 서버에 있는 기록은 다시 보내지 않는다.
      if (table === 'reviewLogs' && base !== null) {
        await markSynced(table, local, local)
        continue
      }

      const outcome = await remote.push(table, local, base)
      if (outcome.status === 'ok') {
        await markSynced(table, local, outcome.record)
        result.pushed++
        continue
      }
      if (outcome.status === 'error') {
        result.errors++
        continue
      }

      const server = outcome.server
      const expectedVersion = base === null ? 1 : base + 1
      const sameEdit =
        server !== null &&
        server.version === expectedVersion &&
        ('updatedAt' in server ? server.updatedAt === (local as Note).updatedAt : true)

      if (sameEdit || (table === 'reviewLogs' && server)) {
        // 이전 push 의 응답만 유실된 경우: 이미 반영돼 있으므로 동기화 완료로 처리
        await markSynced(table, local, server!)
        result.pushed++
      } else if (!server) {
        if (base === null) {
          result.errors++ // 같은 ID 가 다른 계정에 존재 (RLS 로 보이지 않음)
        } else {
          // 서버에서 행이 사라짐 → 다음 push 에서 새로 insert
          await tableOf(table).update(local.id, { serverUpdatedAt: null, version: 0 })
        }
      } else if (table !== 'reviewLogs') {
        await preserveConflict(table, server)
        result.conflicts++
      }
    }
  }
}

async function applyPulled(table: SyncTable, remote: SyncRecord): Promise<'pulled' | 'conflict' | null> {
  const t = tableOf(table)
  const current = await t.get(remote.id)

  if (table === 'reviewLogs') {
    if (current) return null
    const question = await db.questions.get((remote as ReviewLog).questionId)
    await t.put({ ...(remote as ReviewLog), noteId: question?.noteId ?? '' })
    return 'pulled'
  }

  if (!current) {
    await t.put(remote)
    return 'pulled'
  }
  if (current.syncStatus === 'synced') {
    if (remote.version > current.version) {
      await t.put(remote)
      return 'pulled'
    }
    return null
  }
  // 로컬 미전송 변경이 있는데 서버가 더 앞서 있음 → 충돌
  if (remote.version > current.version) {
    await preserveConflict(table, remote)
    return 'conflict'
  }
  return null
}

async function pull(remote: RemoteApi, userId: string, result: SyncResult): Promise<void> {
  for (const table of ORDER) {
    const key = cursorKey(userId, table)
    const cursor = await getMeta<string>(key)
    const since = cursor ? new Date(new Date(cursor).getTime() - CURSOR_OVERLAP_MS).toISOString() : null
    let maxSeen = cursor ?? null

    for (let offset = 0; ; offset += PULL_PAGE_SIZE) {
      const rows = await remote.pull(table, since, offset, PULL_PAGE_SIZE)
      for (const row of rows) {
        const applied = await applyPulled(table, row)
        if (applied === 'pulled') result.pulled++
        else if (applied === 'conflict') result.conflicts++
        if (row.serverUpdatedAt && (!maxSeen || row.serverUpdatedAt > maxSeen)) maxSeen = row.serverUpdatedAt
      }
      if (rows.length < PULL_PAGE_SIZE) break
    }
    if (maxSeen) await setMeta(key, maxSeen)
  }
}

export async function runSync(remote: RemoteApi, userId: string): Promise<SyncResult> {
  const result: SyncResult = { pushed: 0, pulled: 0, conflicts: 0, errors: 0, skippedForeign: 0 }
  await adoptUnownedRecords(userId)
  await push(remote, userId, result)
  await pull(remote, userId, result)
  return result
}
