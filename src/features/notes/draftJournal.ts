// 페이지가 닫히는 순간의 미저장 입력을 동기식 localStorage 에 보관하는 저널.
// IndexedDB 쓰기는 비동기라 탭 종료 직전(디바운스 대기 중)에 시작한 저장은 중단될 수 있기 때문이다.
// 다음에 노트를 열 때 저널을 재생하며, 버전 가드(expectedLocalUpdatedAt)를 거치므로 조용히 덮어쓰지 않는다.

export interface DraftEntry<P> {
  patch: P
  /** 저장 기준(편집기가 마지막으로 본 localUpdatedAt). */
  base: string | undefined
  writtenAt: string
}

const PREFIX = 'cornote:draft:'

export const draftKey = (noteId: string) => `${PREFIX}${noteId}`

export function writeDraft<P>(key: string, patch: P, base: string | undefined): void {
  try {
    const entry: DraftEntry<P> = { patch, base, writtenAt: new Date().toISOString() }
    localStorage.setItem(key, JSON.stringify(entry))
  } catch {
    // 저장 공간 부족·비활성화 시에는 IndexedDB 저장만 시도한다.
  }
}

export function clearDraft(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    /* noop */
  }
}

/** 저널을 읽고 즉시 제거한다 (한 번만 재생되도록). */
export function takeDraft<P>(key: string): DraftEntry<P> | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    localStorage.removeItem(key)
    const entry = JSON.parse(raw) as DraftEntry<P>
    return entry && typeof entry === 'object' && entry.patch ? entry : null
  } catch {
    return null
  }
}

/** 패치의 모든 필드가 이미 레코드에 반영돼 있는지 (저장은 끝났지만 저널 삭제 전에 종료된 경우). */
export function isPatchApplied(record: object, patch: object): boolean {
  return Object.entries(patch).every(
    ([key, value]) => JSON.stringify((record as Record<string, unknown>)[key]) === JSON.stringify(value),
  )
}

/** 앱 시작 시 남아 있는 모든 저널을 재생한다. 기준이 달라졌으면 updateNote 가 충돌 사본으로 보존한다. */
export async function replayPendingDrafts(
  getRecord: (noteId: string) => Promise<object | undefined>,
  applyPatch: (noteId: string, patch: object, base: string | undefined) => Promise<unknown>,
): Promise<number> {
  let keys: string[] = []
  try {
    keys = Object.keys(localStorage).filter((k) => k.startsWith(PREFIX))
  } catch {
    return 0
  }
  let replayed = 0
  for (const key of keys) {
    const entry = takeDraft<object>(key)
    const noteId = key.slice(PREFIX.length)
    const record = entry ? await getRecord(noteId) : undefined
    if (!entry || !record || isPatchApplied(record, entry.patch)) continue
    await applyPatch(noteId, entry.patch, entry.base)
    replayed++
  }
  return replayed
}
