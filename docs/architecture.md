# 아키텍처

## 1. 전체 구조

```text
┌──────────────────────── 브라우저 (PWA) ────────────────────────┐
│ pages / components (React)                                     │
│   │                                                            │
│ features/*  ── repository ──► Dexie (IndexedDB)  ◄── 원본 데이터 │
│   │              │ emitLocalChange                              │
│   │              ▼                                              │
│   │        SyncProvider ── engine.runSync ── RemoteApi ─────────┼──► Supabase Postgres (RLS)
│   │                                                            │
│   └── ai/client ── (로그인) fetch /functions/v1/* ─────────────┼──► Edge Function ──► OpenAI Responses API
│                └─ (그 외) Mock Provider (브라우저 내)            │         └─ Mock Provider
│ Service Worker: 앱 셸 precache → 오프라인 실행                  │
└────────────────────────────────────────────────────────────────┘
```

- 서버는 Supabase 하나만 사용합니다(별도 백엔드·마이크로서비스 없음).
- AI 계약(`supabase/functions/_shared/ai/schemas.ts`)은 브라우저와 Edge Function이 같은 파일을 import합니다. Deno에서는 함수별 `deno.json` import map이 `zod`를 `npm:zod`로 연결합니다.
- 확장 경계: `Scheduler`(복습 알고리즘), `AiProvider`(AI 공급자), `RemoteApi`(원격 저장소). 각각 인터페이스만 지키면 교체할 수 있습니다.

## 2. 로컬 저장 흐름

1. 편집기 입력 → `useAutoSave`가 변경을 병합하고, 마지막 입력 후 600ms 동안 입력이 없으면 `updateNote()`를 호출합니다.
2. `updateNote()`는 Dexie 트랜잭션에서 레코드를 갱신하고 `syncStatus = 'pending'`, `localUpdatedAt = now`로 표시한 뒤 `emitLocalChange()`를 발생시킵니다.
3. 페이지 숨김·이탈·언마운트 시에는 즉시 저장합니다. 탭을 닫는 순간 비동기 IndexedDB 쓰기가 중단될 수 있으므로, 미저장분은 **동기식 localStorage 저널**(`draftJournal.ts`)에도 기록합니다. 다음 실행 때 저널을 재생하며, 이때도 버전 가드를 거칩니다.
4. 삭제는 소프트 삭제입니다(`deletedAt`). 다른 기기에도 삭제를 전파하기 위해 노트·키워드·질문에 tombstone을 남깁니다.
5. 앱 시작 시 `navigator.storage.persist()`를 요청해 브라우저가 저장 공간 부족을 이유로 데이터를 지우지 않도록 합니다.
6. JSON 백업은 `backupSchema`(Zod)로 검증합니다. 가져오기는 병합 방식이며, 로컬 쪽이 더 최신이면 건너뜁니다. 가져온 레코드는 pending으로 표시되어 서버와 버전 비교를 거칩니다.

### 편집 중 원격 변경

편집기는 마지막으로 반영한 `localUpdatedAt`을 기억합니다. 자신의 push가 완료되어도 `localUpdatedAt`은 바뀌지 않고, 원격 변경(pull·충돌 처리)이 들어오면 바뀝니다.
- 편집 중인 내용이 없으면 새 버전으로 화면을 갱신합니다.
- 미저장 입력이 있으면 저장 시점에 `updateNote(..., expectedLocalUpdatedAt)`가 불일치를 감지해 **이번 편집을 충돌 사본으로 보존**하고, 화면은 최신 버전으로 바꿉니다.

## 3. 클라우드 동기화 흐름

동기화는 Supabase가 설정되고 로그인한 상태에서만 동작합니다. 실행 시점은 로그인 직후, 온라인 복귀, 로컬 변경 3초 후, 60초 주기, 탭 활성화입니다. 동시에 한 번만 실행됩니다.

```text
runSync(remote, userId)
 1. adopt   userId 가 없는 로컬 노트·복습 기록을 현재 계정에 귀속
 2. push    notes → cues → questions → reviewLogs 순서로 pending 레코드 전송
            - 신규(serverUpdatedAt = null): insert (version 1)
            - 기존: UPDATE … WHERE id = ? AND version = <기준 버전>  (version + 1 저장)
            - 0행 갱신 또는 40001 → 서버 레코드 조회 → 충돌 처리
            - 응답만 유실된 재시도(서버 version = 기준+1, updated_at 동일)는 성공으로 처리
 3. pull    server_updated_at >= (커서 - 10초) 인 행을 페이지 단위로 받아 반영 (멱등)
            - 로컬 synced 이고 서버 version 이 더 크면 교체
            - 로컬 pending 인데 서버 version 이 더 크면 충돌 처리
```

**충돌 처리**: 현재 로컬 레코드를 `conflicts` 테이블에 사본으로 저장하고, 기준 레코드는 서버 버전으로 맞춥니다. 사용자는 노트 화면의 배너나 설정에서 두 버전을 비교한 뒤 “내 버전으로 복원”(새 pending 편집으로 적용) 또는 “현재 버전 유지”를 선택합니다. 어떤 경우에도 데이터를 조용히 덮어쓰지 않습니다.

**실패 처리**: 네트워크·권한 오류가 나도 레코드는 pending으로 남고 다음 주기에 다시 시도합니다. 로컬 데이터는 삭제되지 않습니다.

**커서 겹침**: `server_updated_at = now()`는 트랜잭션 시작 시각이라, 먼저 시작해 나중에 커밋된 행이 커서보다 과거 시각을 가질 수 있습니다. 그래서 10초를 겹쳐 다시 읽고, 적용은 멱등으로 처리합니다.

## 4. AI 요청 흐름

```text
[브라우저] Zod 입력 검증(크기 제한) ─► 로그인? ─ no ─► Mock Provider (로컬)
                                     └ yes ─► POST /functions/v1/<fn> (Bearer JWT)
[Edge] OPTIONS/POST 확인 → JWT 확인(auth.getUser) → 본문 64KB 제한 → JSON/Zod 검증
       → consume_ai_quota(RPC, 일일 한도) → Provider 호출(타임아웃) → { ok, provider, data }
[OpenAI] Responses API, text.format = json_schema(strict), store: false
         → output_text 추출 → JSON.parse → Zod 검증 (실패 시 invalid_output)
[브라우저] 응답 봉투를 다시 Zod로 검증 → 생성 결과: 근거 문장이 원문에 있는지 표시 → 사용자가 검토·선택 후 저장
```

- 프롬프트는 노트와 답변을 `<note>`, `<learner_answer>` 태그로 감싸 **데이터**로 전달하고, 그 안의 지시를 무시하도록 명시합니다(프롬프트 인젝션 완화).
- 채점은 일반 지식이 아니라 기준 답안과 원문 근거만을 기준으로 합니다.
- 오류는 코드(`timeout`, `rate_limited`, `invalid_output` 등)로만 전달하고, 내부 상세 정보는 응답에 넣지 않습니다. AI가 실패해도 복습 화면은 기준 답안을 보여 주고 수동 평가를 받습니다.
- 로그에는 작업 종류, provider, 소요시간, 입력 길이, 오류 코드만 남기고 사용자 입력 원문은 남기지 않습니다.

## 5. 데이터 모델

| 테이블 | 주요 컬럼 | 비고 |
| --- | --- | --- |
| `notes` | id, user_id, title, content_json(Tiptap JSON), user_summary, ai_summary_draft, version, created_at, updated_at, deleted_at, server_updated_at | user_id 불변(트리거) |
| `cues` | id, note_id, text, sort_order, version, created/updated/deleted_at, server_updated_at | 핵심 키워드 |
| `questions` | id, note_id, question, reference_answer, source_excerpt, difficulty, origin, next_review_at, interval_days, review_count, last_rating, last_reviewed_at, version, … | 스케줄 상태 포함 |
| `review_logs` | id, question_id, user_id, user_answer, ai_score, confidence, rating, feedback_json, reviewed_at, version, server_updated_at | 추가 전용(update 정책 없음) |
| `ai_usage` | user_id, usage_date, count | `consume_ai_quota()`로만 증가 |

로컬(Dexie) 레코드는 같은 필드를 camelCase로 가지며, 동기화 메타데이터로 `syncStatus`(`synced`/`pending`), `localUpdatedAt`, `serverUpdatedAt`, `version`을 추가로 가집니다. 로컬 전용 테이블은 `conflicts`(충돌 사본)와 `meta`(동기화 커서)입니다.

공통 트리거 `tg_sync_row`는 `server_updated_at = now()`를 강제하고, update 시 `version = old.version + 1`이 아니면 `40001` 오류를 냅니다.

## 6. 주요 보안 결정

| 결정 | 이유 |
| --- | --- |
| 모든 개인 데이터 테이블에 RLS 적용, anon 권한 회수 | 로그인 사용자는 자기 데이터만 접근 |
| cues/questions는 `owns_note()`, review_logs는 `owns_question()`으로 소유권 검증(security definer, `search_path = ''`) | 남의 노트에 질문·복습 기록을 붙이는 것을 차단 |
| `user_id` 기본값 `auth.uid()` + 변경 금지 트리거 | 소유자 위조·이전 방지 |
| 브라우저는 anon 키만 사용, service role 키 감지 시 클라우드 비활성화 | 비밀 키 노출 방지 |
| OpenAI 키는 Edge Function 환경변수에만 저장, Edge Function은 사용자 JWT로 DB 접근 | 브라우저에 AI 키 없음, 서버에서도 RLS 우회 없음 |
| 입력 크기 제한(본문 20,000자, 요청 64KB), 일일 요청 한도, 타임아웃 | 비용·남용 제어 |
| 모든 외부 응답(OpenAI, Edge Function, Supabase 행, 백업 파일) Zod 검증 | 형식 오류가 앱 상태를 오염시키지 않도록 |
| React 텍스트 렌더링만 사용(`dangerouslySetInnerHTML` 없음), Tiptap은 스키마 노드만 렌더링, 링크는 http/https/mailto만 허용 | XSS 방지 |
| 사용자 입력은 로그에 남기지 않음, OpenAI `store: false` | 개인정보 최소화 |
| 계정 삭제 시 `auth.users` → 모든 개인 데이터 연쇄 삭제, `delete_my_data()` RPC, JSON 내보내기 | 데이터 이동권·삭제권 |
