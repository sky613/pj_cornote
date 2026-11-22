# 구현 계획 — AI 기반 개인용 코넬 학습 노트 (Cornote) MVP

## 0. 저장소 분석 결과

| 항목 | 결과 |
| --- | --- |
| 기존 파일 | 없음 (빈 디렉터리, Git 미초기화) |
| Node / npm / pnpm | v24.16 / 11.13 / 10.32 |
| Supabase CLI, Deno | 미설치 → Edge Function·RLS 테스트는 코드와 SQL만 작성, 로컬 실행 검증은 불가 |
| 결론 | 요구 기술 스택으로 새 프로젝트를 구성한다. 패키지 매니저는 npm 사용 |

### 버전 선택

npm 레지스트리의 최신 버전(TypeScript 7, Vite 8+, Vitest 5 등)은 API 변경 위험이 있어,
안정적으로 검증된 메이저 버전으로 고정했다.

- React 19, React Router 7, Vite 7, TypeScript 5.9, Tailwind CSS 4
- Tiptap 3, Dexie 4, Zod 4, supabase-js 2, vite-plugin-pwa 1
- Vitest 3, React Testing Library 16, Playwright, fake-indexeddb

UI 컴포넌트는 shadcn/ui의 생성 CLI 대신 동등한 방식(Radix 프리미티브 + Tailwind로 작성한 소수의 컴포넌트)을 직접 둔다.
CLI 의존·네트워크 상호작용 없이 재현 가능하게 하기 위함이다.

## 1. 아키텍처 요약

- **Local-first**: 모든 쓰기는 Dexie(IndexedDB)에 먼저 반영하고, 레코드에 `syncStatus`(`synced | pending | conflict`)를 기록한다.
- **Sync 엔진**: Supabase가 설정되고 로그인 상태일 때만 동작. push(pending → 서버, `version` 기반 낙관적 잠금) 후 pull(`server_updated_at > 마지막 커서`).
  충돌 시 로컬 사본을 `conflicts` 테이블에 보존하고 UI에 표시한다. 조용히 덮어쓰지 않는다.
- **AI**: 브라우저 → `AiClient` 인터페이스. Supabase 설정 시 Edge Function 호출, 미설정 시 브라우저 내 Mock Provider.
  Edge Function 내부에서도 `OPENAI_API_KEY` 유무로 OpenAI / Mock Provider를 전환한다. 모든 응답은 Zod로 검증한다.
- **복습 스케줄러**: `Scheduler` 인터페이스로 분리(`fixedIntervalScheduler`: 다시 1 / 어려움 3 / 보통 7 / 쉬움 14일). 추후 FSRS로 교체 가능.

## 2. 단계별 계획

1. **기반**: Vite + React + TS + Tailwind + Router 구성, 린트·테스트 설정, 라우팅(`/`, `/notes/:id`, `/review`, `/settings`).
2. **노트**: Dexie 스키마, 노트 CRUD 리포지토리, 코넬 편집기(Tiptap), 500~800ms 디바운스 자동 저장, 저장 상태 표시, JSON 백업/복구, 반응형(모바일 탭).
3. **질문·복습**: 큐(키워드)·질문 관리, 복습 화면(답변 제출 전 정답 비노출), 스케줄러, review_logs 기록.
4. **클라우드**: Supabase Auth(이메일 매직링크/비밀번호), 마이그레이션 SQL + RLS, 동기화 엔진, 충돌 처리.
5. **AI**: Provider 인터페이스, Mock, OpenAI Responses API(Structured Outputs) Edge Function, 입력 크기 제한·요청 횟수 제한·타임아웃, 생성 결과 검토 UI.
6. **마감**: PWA(manifest, Service Worker), 오프라인 표시, 접근성, 테스트(Vitest/RTL/Playwright), README·architecture 문서.

각 단계 후 `npm run typecheck && npm run lint && npm test` 실행.

## 3. 요구사항 대비 제약·대안

| 요구 | 상황 | 대안 |
| --- | --- | --- |
| RLS 테스트 | Supabase CLI 미설치로 로컬 Postgres 실행 불가 | pgTAP 기반 SQL 테스트(`supabase/tests/database/rls.test.sql`) 작성. `supabase test db`로 실행 가능하도록 문서화 |
| Edge Function 검증 | Deno 미설치 | 공유 로직(스키마, 프롬프트, 레이트리밋)을 순수 TS로 작성해 Vitest에서 테스트 |
| shadcn/ui | CLI 생성 방식 | 동일 철학(Radix + Tailwind, 코드 소유)으로 필요한 컴포넌트만 직접 작성 |

## 4. 진행 결과 (2026-09-24)

1~6단계를 모두 구현했습니다. 단계마다 `typecheck`, `lint`, `test`를 실행했습니다.

구현 중 발견해 수정한 문제:

- **탭 종료 직전 입력 유실**: 디바운스 대기 중에 탭을 닫으면, `pagehide`에서 시작한 비동기 IndexedDB 쓰기가 중단될 수 있음을 E2E(모바일)로 확인했습니다. 동기식 localStorage 저널을 추가하고, 앱 시작·노트 열기 때 버전 가드를 거쳐 재생하도록 했습니다.
- **자기 push를 충돌로 오인**: 편집기 충돌 가드를 `version`에서 `localUpdatedAt` 기준으로 변경했습니다. push 완료 시 version이 올라가도 오탐하지 않습니다.
- **PWA 알림이 복습 버튼을 가림**: "오프라인 준비 완료" 알림을 자동으로 닫고, 본문 하단 여백을 확보했습니다.

검증하지 못한 항목: Supabase CLI와 Deno가 없는 환경이라 **pgTAP RLS 테스트와 Edge Function 실제 배포·실행은 실행하지 못했습니다.** Edge Function의 요청 처리 로직은 Deno 의존성을 주입받는 구조로 분리해 Vitest로 검증했습니다.

### 추가 검증 (2026-11-14, Docker 사용)

- Edge Function: `denoland/deno:2.1.4` 컨테이너에서 함수별 `deno.json`으로 `deno check` 실행 → `generate-questions`, `grade-answer` 통과.
- RLS: `supabase/postgres:15.8.1.060` 컨테이너에 마이그레이션 적용 후 `rls.test.sql` 실행 → pgTAP 18/18 통과.
  단독 이미지의 `auth.uid()`는 `request.jwt.claim.sub`만 읽으므로, 실제 Supabase(GoTrue)와 같게 `request.jwt.claims->>'sub'`도 읽도록 컨테이너 안에서만 교체했습니다. 프로젝트 코드 변경은 없습니다.
- 여전히 미검증: 실제 Supabase 프로젝트 배포, OpenAI 실호출, 이메일 링크 Redirect.
