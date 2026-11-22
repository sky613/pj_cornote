# Cornote 데스크톱 앱 개발 기록

작성일: 2026-10-15

## 목표와 범위

기존 Cornote PWA의 노트 작성, Cornell 편집, 질문 생성, 복습, JSON 백업, Supabase 동기화, AI 기능을 Mac·Windows에서 실행하는 **별도 설치형 앱**으로 제공한다. React 화면과 저장소 코드를 재사용하고, 데스크톱 실행에 필요한 부분만 추가했다. 웹/PWA 빌드는 계속 지원한다.

## 진행 과정

1. **기존 구조 확인**: React/Vite, Dexie(IndexedDB), Supabase, PWA 구성을 확인했다. 저장과 복습 로직을 새로 구현할 필요가 없다고 판단했다.
2. **Electron 앱 추가**: `desktop/main.cjs`에서 창과 `cornote-app://local` 프로토콜을 등록했다. 설치 파일 안의 `dist/`를 이 프로토콜로 제공하고, React Router의 하위 경로도 `index.html`로 연결한다. Renderer는 `sandbox`와 `contextIsolation`을 사용하며, 외부 링크는 기본 브라우저로 연다.
3. **빌드 분리**: `vite build --mode desktop`에서는 PWA Service Worker를 끄고 앱 자산을 설치 파일에 포함한다. 일반 `npm run build`는 기존 PWA를 그대로 생성한다.
4. **백업 저장 수정**: 웹의 Blob 다운로드가 패키징된 Electron 창에서 시작되지 않아, `preload.cjs`의 제한된 IPC와 native 저장 대화상자로 JSON 내보내기를 처리했다. JSON 가져오기는 기존 파일 선택 기능을 재사용한다.
5. **로그인·AI 연결 준비**: 데스크톱 이메일 로그인 링크는 `cornote://auth/callback`으로 돌아오게 했다. Edge Function의 `ALLOWED_ORIGIN`은 웹 주소와 데스크톱 Origin을 쉼표로 함께 지정할 수 있게 수정했다.
6. **설치 파일 제작과 검증**: Mac arm64/x64 DMG, Windows x64 NSIS 설치 파일을 생성했다. Mac arm64 패키지에서 실행, 노트 저장·새로고침 후 유지, JSON 내보내기를 확인했다.

## 핵심 파일

| 파일 | 역할 |
| --- | --- |
| [`package.json`](../package.json) | Electron 의존성, `desktop:*` 명령, 설치 파일 대상·아이콘 설정 |
| [`vite.config.ts`](../vite.config.ts) | 데스크톱 빌드에서 PWA Service Worker 비활성화 |
| [`desktop/main.cjs`](../desktop/main.cjs) | 앱 창, 내부 프로토콜, 이동 제한, 이메일 링크, 백업 저장 IPC |
| [`desktop/preload.cjs`](../desktop/preload.cjs) | Renderer에 `saveBackup`만 노출 |
| [`src/pages/SettingsPage.tsx`](../src/pages/SettingsPage.tsx) | 데스크톱은 native 저장, 웹은 Blob 다운로드 사용 |
| [`src/features/auth/AuthProvider.tsx`](../src/features/auth/AuthProvider.tsx) | 데스크톱 이메일 링크 Redirect URL 설정 |
| [`supabase/functions/_shared/aiHandler.ts`](../supabase/functions/_shared/aiHandler.ts) | 복수 CORS Origin 허용 |
| [`scripts/desktop-smoke.mjs`](../scripts/desktop-smoke.mjs) | 패키징 앱의 실행·저장·백업 확인 |

## 데이터와 외부 설정

- 데스크톱 앱의 IndexedDB Origin은 `cornote-app://local`이다. 기존 웹/PWA 로컬 데이터는 자동으로 옮겨지지 않는다. 웹의 **설정 → JSON 내보내기** 후 데스크톱 앱에서 **설정 → JSON 가져오기**를 사용한다.
- Supabase 계정으로 동기화된 데이터는 같은 계정으로 로그인하면 내려받는다. 빌드 전에 `.env.local`에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`를 설정해야 한다.
- 이메일 링크 로그인을 사용하려면 Supabase Auth Redirect URL에 `cornote://auth/callback`을 추가한다.
- Edge Function에서 실제 AI를 사용하려면 `ALLOWED_ORIGIN`에 `cornote-app://local`을 포함한다. 예: `https://your.app,cornote-app://local`.

## 실행과 빌드

```bash
npm install
npm run dev -- --mode desktop  # 첫 번째 터미널
npm run desktop:dev           # 두 번째 터미널
npm run desktop:mac           # Mac arm64/x64 DMG
npm run desktop:win           # Windows x64 설치 파일
```

생성물은 `desktop-release/`에 있다.

| 대상 | 파일 |
| --- | --- |
| Mac Apple Silicon | `Cornote-0.1.0-arm64.dmg` |
| Mac Intel | `Cornote-0.1.0.dmg` |
| Windows x64 | `Cornote Setup 0.1.0.exe` |

## 검증 결과와 남은 작업

- `npm test`: 14개 파일, 61개 테스트 통과.
- `npm run lint`, `npm run desktop:build`, `npm run build`: 통과. 일반 PWA 빌드에서 Service Worker 생성 확인.
- `npm run desktop:smoke -- desktop-release/mac-arm64/Cornote.app/Contents/MacOS/Cornote`: 실행, 노트 저장·새로고침 후 유지, JSON 파일 저장 통과.
- 생성된 실행 파일 형식 확인: Mac arm64/x86_64, Windows x86-64. Production dependency 기준 `npm audit --omit=dev` 결과 취약점 0건.
- **추가 검증 필요**: Windows 실기기 실행, Supabase 계정·실제 AI 연결, 이메일 링크 Redirect. 현재 설치 파일은 배포용 코드 서명과 Mac notarization이 적용되지 않았다.
