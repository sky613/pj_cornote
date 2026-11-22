# Cornote — AI 기반 개인용 코넬 학습 노트

코넬식으로 필기하고, AI가 만든 회상 질문에 **먼저 스스로 답한 뒤** 피드백을 받고, 간격 반복으로 복습하는 개인 학습용 PWA입니다.

```
필기 작성 → AI 키워드·질문 생성(검토 후 선택) → 내 말로 요약 → 원문을 가리고 답변
→ AI가 저장된 원문 기준으로 평가 → 다시/어려움/보통/쉬움 선택 → 다음 복습일 저장
```

- **Local-first**: 모든 입력은 IndexedDB에 먼저 저장됩니다. 클라우드·AI 설정이 없어도 전체 기능이 동작합니다(local-only + Mock AI).
- **답변 먼저**: 복습 화면은 답변을 제출하기 전에는 기준 답안·근거·피드백을 DOM에 렌더링하지 않습니다.
- **덮어쓰지 않음**: AI 결과는 기존 내용 뒤에 *추가*만 되며, AI 요약은 사용자 요약과 분리 저장됩니다. 동기화 충돌 시 로컬 사본을 보존합니다.

## 주요 기능

| 영역 | 내용 |
| --- | --- |
| 노트 | 목록(최근 수정순), 생성·수정·삭제(확인 대화상자), 제목 검색, 빈 상태 안내, 복습 예정 문항 수 |
| 코넬 편집기 | PC·태블릿: 왼쪽 30% 키워드·질문 / 오른쪽 70% 본문 / 아래 요약. 모바일: 필기·질문·요약·복습 탭 |
| 본문 | Tiptap(제목, 문단, 목록, 체크리스트, 인용, 코드 블록, 링크), JSON 저장, 600ms 디바운스 자동 저장, 저장 중/저장됨/오프라인 표시 |
| 질문 | 핵심 키워드·질문 직접 관리, AI 생성 결과 검토·수정·선택 후 저장, 근거 문장의 원문 존재 여부 표시 |
| 복습 | 질문만 표시 → 답변 → 기준 답안·원문 근거·AI 피드백 → 4단계 평가, 다음 복습일 계산, 복습 기록 저장 |
| 백업 | IndexedDB 전체 JSON 내보내기/가져오기(병합, 스키마 검증), `navigator.storage.persist()` 요청 |
| 클라우드 | Supabase 이메일 로그인(비밀번호·매직 링크), 백그라운드 동기화, 버전 기반 충돌 감지, RLS |
| AI | Edge Function 경유 OpenAI Responses API + Structured Outputs, Mock Provider, 입력 크기·일일 횟수 제한 |
| PWA | 설치, 오프라인 실행(서비스 워커 precache), 업데이트 알림 |

## 기술 스택

React 19 · TypeScript 5.9 · Vite 7 · React Router 7 · Tailwind CSS 4 · Radix UI(shadcn/ui 방식의 자체 컴포넌트) · Tiptap 3 · Dexie 4 · Zod 4 · vite-plugin-pwa · Supabase(Auth, Postgres, RLS, Edge Functions) · OpenAI Responses API · Vitest · React Testing Library · Playwright

## 빠른 시작 (local-only + Mock AI)

요구사항: Node.js 20 이상 (개발 환경: Node 24).

```bash
npm install
npm run dev          # http://localhost:5173
```

환경변수 없이 실행하면 데이터는 브라우저(IndexedDB)에만 저장되고, AI 기능은 브라우저 내 Mock AI가 처리합니다.

Docker로 개발 서버를 실행하려면:

```bash
docker compose up --build  # http://localhost:5173
```

코드 변경은 실행 중인 컨테이너에 바로 반영됩니다. Supabase를 연결하려면 `.env.example`을 `.env.local`로 복사해 값을 입력한 뒤 컨테이너를 다시 시작하세요.

## 환경변수

`.env.example`을 `.env.local`로 복사해 사용합니다. `.env*` 파일은 Git에서 제외됩니다(`.env.example` 제외).

### 프런트엔드 (브라우저에 노출됨)

| 변수 | 설명 |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase 프로젝트 URL. 비우면 local-only 모드 |
| `VITE_SUPABASE_ANON_KEY` | Supabase **anon(public)** 키. service role 키를 넣으면 앱이 감지해 클라우드 기능을 끕니다 |

### Edge Function (서버 전용 — `supabase secrets set` 또는 `supabase/functions/.env`)

| 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `OPENAI_API_KEY` | — | 없으면 Mock AI 사용 |
| `AI_PROVIDER` | 자동 | `openai` 또는 `mock`. `mock`이면 키가 있어도 Mock 사용 |
| `OPENAI_MODEL` | `gpt-5-mini` | Structured Outputs를 지원하는 모델 |
| `AI_DAILY_LIMIT` | `100` | 사용자별 하루 AI 요청 수 |
| `AI_TIMEOUT_MS` | `45000` | AI 호출 타임아웃 |
| `ALLOWED_ORIGIN` | `*` | CORS 허용 오리진. 웹·데스크톱을 함께 쓰면 쉼표로 구분 (`https://your.app,cornote-app://local`) |

`SUPABASE_URL`, `SUPABASE_ANON_KEY`는 Supabase가 Edge Function에 자동으로 주입합니다. service role 키는 사용하지 않습니다.

## Supabase 설정

1. [Supabase CLI](https://supabase.com/docs/guides/cli) 설치 후 프로젝트 생성·연결
   ```bash
   supabase login
   supabase link --project-ref <project-ref>
   ```
2. **마이그레이션 적용** (`supabase/migrations/20260924000000_init.sql`)
   ```bash
   supabase db push              # 원격 프로젝트
   # 또는 로컬: supabase start && supabase db reset
   ```
3. **Auth**: Dashboard → Authentication → URL Configuration에 사이트 URL(예: `http://localhost:5173`, 배포 URL)을 등록합니다. 매직 링크 로그인에 필요합니다.
4. **프런트엔드 환경변수**: Dashboard → Project Settings → API의 URL과 anon key를 `.env.local`에 입력합니다.
5. **RLS 테스트** (pgTAP, 로컬 Supabase 필요)
   ```bash
   supabase start
   supabase test db              # supabase/tests/database/rls.test.sql
   ```

## Edge Function 배포

```bash
supabase secrets set OPENAI_API_KEY=sk-... AI_DAILY_LIMIT=100 ALLOWED_ORIGIN=https://your.app
supabase functions deploy generate-questions
supabase functions deploy grade-answer
```

로컬 실행: `supabase functions serve --env-file supabase/functions/.env`

두 함수는 JWT 검증을 요구합니다(`config.toml`의 `verify_jwt = true`). 로그인한 사용자만 호출할 수 있습니다.

## Mock AI

- **브라우저 Mock**: Supabase 미설정이거나 로그인하지 않은 상태에서 자동 사용. 네트워크 호출이 없습니다.
- **서버 Mock**: Edge Function에 `OPENAI_API_KEY`가 없거나 `AI_PROVIDER=mock`이면 사용.
- Mock은 노트 원문 문장만으로 질문(키워드 설명형·빈칸형)과 기준 답안을 만들고, 기준 답안과의 단어 겹침으로 채점합니다. 결과에는 `[Mock AI]` 표시가 붙습니다.

## 테스트

```bash
npm run typecheck    # tsc
npm run lint         # ESLint
npm test             # Vitest: 저장소·동기화·스케줄러·백업·AI 스키마/Provider/Edge 핸들러·복습 UI
npm run test:e2e     # Playwright: 프로덕션 빌드를 local-only 모드로 띄워 데스크톱·모바일·오프라인 흐름 검증
```

Playwright를 처음 실행할 때는 `npx playwright install chromium`이 필요합니다.
RLS 정책 테스트는 위의 `supabase test db`로 실행합니다(로컬 Supabase 필요).

## PWA 빌드

```bash
npm run build        # dist/ 에 서비스 워커(sw.js)·manifest 포함
npm run preview      # http://localhost:4173 에서 설치·오프라인 동작 확인
```

아이콘은 `node scripts/generate-icons.mjs`로 다시 생성할 수 있습니다.

## Mac·Windows 데스크톱 앱

기존 React 화면·노트 저장·복습·백업·동기화·AI 기능을 Electron 앱에서 그대로 사용합니다. 데스크톱 앱은 별도 저장 공간을 사용하므로, 웹/PWA에서 만든 로컬 노트는 **설정 → JSON 내보내기** 후 데스크톱 앱의 **설정 → JSON 가져오기**로 옮깁니다. 같은 Supabase 계정으로 로그인한 데이터는 동기화됩니다.

```bash
npm install
npm run dev -- --mode desktop  # 개발 서버 (첫 번째 터미널)
npm run desktop:dev           # 데스크톱 창 (두 번째 터미널)
npm run desktop:mac           # macOS arm64/x64 DMG
npm run desktop:win           # Windows x64 설치 파일
```

설치 파일은 `desktop-release/`에 생성됩니다. Mac 앱과 Windows 앱은 각각 해당 운영체제에서 최종 확인하세요. 공개 배포 전에는 운영체제별 코드 서명과 Mac notarization이 필요합니다.

구현 순서, 핵심 파일, 검증 결과는 [데스크톱 앱 개발 기록](docs/desktop-development.md)에 정리했습니다.

Supabase를 사용할 경우 빌드 전에 `.env.local`의 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`를 설정합니다. Supabase Auth의 허용 Redirect URL에 `cornote://auth/callback`을 추가하고, Edge Function의 `ALLOWED_ORIGIN`에 `cornote-app://local`을 포함해야 데스크톱의 이메일 링크 로그인과 AI 호출이 동작합니다. 예: `ALLOWED_ORIGIN=https://your.app,cornote-app://local`.

## 프로젝트 구조

```text
src/
  app/            라우팅, 앱 셸, PWA 업데이트 알림
  components/     cornell/ editor/ review/ ui/
  features/       notes/ questions/ review/ sync/ ai/ auth/ backup/
  db/local/       Dexie(IndexedDB) 스키마
  db/remote/      Supabase 클라이언트, 행 매퍼, RemoteApi 구현
  lib/            환경변수, 텍스트 변환, 훅 등
  pages/          노트 목록, 편집기, 복습, 설정
  types/          로컬 레코드 Zod 스키마
supabase/
  functions/_shared/   AI 계약(Zod·JSON Schema)·프롬프트·Provider·요청 핸들러 (브라우저와 공유)
  functions/generate-questions, grade-answer
  migrations/          스키마 + RLS
  tests/database/      pgTAP RLS 테스트
e2e/                   Playwright
docs/                  implementation-plan.md, architecture.md
```

## 현재 MVP 제한사항

- 동기화 충돌은 레코드 단위입니다. 필드·문단 단위 병합은 하지 않으며, 사용자가 충돌 사본과 현재 버전 중 하나를 선택합니다.
- 키워드·질문 입력칸은 편집 중에 다른 기기의 변경이 들어와도 화면을 즉시 갱신하지 않습니다(다시 열면 반영).
- 계정 삭제는 DB에 연쇄 삭제 구조와 `delete_my_data()` RPC만 있습니다. `auth.users` 삭제는 관리자 권한이 필요해 UI를 제공하지 않습니다.
- 한 기기에서 여러 계정을 번갈아 쓰면, 로그인하지 않은 상태에서 만든 노트는 다음에 로그인한 계정에 귀속됩니다. 다른 계정의 노트는 동기화에서 제외되고 설정 화면에 표시됩니다.
- Mock AI는 형태소 분석 없이 단순 규칙을 쓰므로 키워드 품질이 낮을 수 있습니다.
- 요청 한도는 일일 횟수만 제한합니다(토큰 사용량 기반 제한 없음).

## 이후 확장 후보

FSRS 스케줄러(`Scheduler` 인터페이스 교체) · 문단 단위 충돌 병합 · 노트 태그·폴더 · PDF·YouTube 등 자료 가져오기(`AiProvider` 입력 확장) · 음성 필기 · 학습 통계 대시보드 · 계정 삭제 Edge Function · 공유(현재 스키마는 소유자 단일 모델)
# pj_cornote
