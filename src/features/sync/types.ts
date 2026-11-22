import type { SyncRecord, SyncTable } from '@/types/models'

export type PushOutcome =
  | { status: 'ok'; record: SyncRecord }
  /** 버전 불일치 또는 ID 중복. server 는 현재 서버 레코드(보이지 않거나 없으면 null). */
  | { status: 'conflict'; server: SyncRecord | null }
  | { status: 'error'; message: string }

/** 원격 저장소 경계. Supabase 구현과 테스트용 인메모리 구현이 있다. */
export interface RemoteApi {
  /** baseVersion 이 null 이면 insert, 아니면 `version = baseVersion` 조건부 update (version+1 로 저장). */
  push(table: SyncTable, record: SyncRecord, baseVersion: number | null): Promise<PushOutcome>
  /** server_updated_at >= since 인 레코드 (오름차순). 반환값은 로컬 레코드 형태이며 syncStatus 는 'synced'. */
  pull(table: SyncTable, since: string | null, offset: number, limit: number): Promise<SyncRecord[]>
}

export interface SyncResult {
  pushed: number
  pulled: number
  conflicts: number
  errors: number
  /** 다른 계정 소유라 동기화에서 제외된 로컬 노트 수. */
  skippedForeign: number
}
