# 서비스 전체 개선점 리뷰 — 2026-07-23

`main == origin/main == 6924def` 기준으로 코드베이스 전체를 훑어보고 정리한 개선점 목록.
각 항목은 우선순위 순이며, 처리 상태를 함께 기록한다.

## 진행 순서 권장

1. CI 추가 (진행 중 — 이 문서와 함께 작업)
2. CORS 확장 프로그램 ID 제한
3. prod JWT 시크릿 필수화
4. 프론트 `api.ts` 에러 처리 개선

## 보안

### 1. CORS `chrome-extension://*` 와일드카드 허용 — 미처리

- 위치: `backend/src/main/java/com/animesquad/auth/SecurityConfig.java:57`
- `setAllowedOriginPatterns(List.of("chrome-extension://*"))`가 `allowCredentials(true)`와
  함께 설정되어 있어, 사용자가 설치한 임의의 크롬 확장이 쿠키를 실어 API를 호출할 수 있다.
- 개선: 배포된 확장의 실제 ID(`chrome-extension://<확장ID>`)로 제한.

### 2. JWT 시크릿 dev 기본값 fallback — 미처리

- 위치: `backend/src/main/resources/application.yml` (`app.jwt.secret`)
- `JWT_SECRET` 환경변수가 없으면 `dev-secret-change-me-please...` 기본값으로 조용히 동작한다.
  prod에서 환경변수가 누락되면 공개된 시크릿으로 토큰 위조가 가능해진다.
- 개선: prod 프로파일에서는 기본값 없이 필수로 만들어 미설정 시 부팅이 실패하게 한다.

### 3. CSRF 비활성 + 쿠키 인증 조합 — 인지만 해둘 것

- CSRF가 비활성화되어 있고 인증은 HttpOnly 쿠키 JWT. 현재는 `SameSite=Lax` 기본값이
  cross-site POST를 막아주지만, `COOKIE_SAME_SITE=None`으로 바꾸는 순간 CSRF에 무방비가 된다.
- 설정 의존적인 방어라는 점을 기억할 것. SameSite를 바꿀 일이 생기면 그때 CSRF 토큰 도입.

### 4. JWT TTL 30일 + 무효화 수단 없음 — 보류

- `app.jwt.ttl-minutes: 43200` (30일). 발급된 토큰을 회수할 방법이 없어 계정 탈취 시
  대응 수단이 없다. 초대제 소규모 서비스라 당장 급하지 않음.

## 인프라·프로세스

### 5. CI 부재 — 진행 중

- `.github/workflows`가 없어 테스트 260개(백엔드 229 + 프론트 31)가 전부 로컬 수동
  실행에 의존한다. main push 시 Render/Vercel이 즉시 자동 배포되므로, 테스트를 건너뛴
  커밋이 곧장 프로덕션에 나간다.
- 개선: push/PR 시 백엔드·프론트 테스트를 돌리는 GitHub Actions 워크플로 추가.
- 참고: 백엔드 테스트는 Testcontainers PostgreSQL을 사용하므로 Docker가 있는
  `ubuntu-latest` 러너에서 그대로 동작한다.

### 6. 에러 모니터링 부재 — 미처리

- Sentry 등 에러 트래킹 도구가 없어 프로덕션 장애를 사용자 제보로만 알 수 있다.
- 개선: 백엔드·프론트에 Sentry(무료 티어) 연동 검토.

### 7. 크롬 확장 테스트 8개 파일 로컬 삭제 상태 — 결정 필요

- `chrome-extension/test/*.test.js` 8개 파일이 git에 `D`(삭제) 상태로 남아 있고
  커밋되지 않았다. 삭제를 커밋할지 복원할지 결정이 안 된 상태.
- CI에는 일단 크롬 확장 테스트를 포함하지 않는다 (상태가 정리되면 추가).

## 코드 품질·UX

### 8. 프론트 에러 처리 패턴 — 미처리

- 위치: `frontend/src/app/lib/api.ts`
- 모든 에러를 `new Error("API 409")` 형태로 던져 서버 `ApiErrorResponse`의 메시지를
  버린다. 그래서 각 페이지가 상태코드 문자열을 매칭해 한글 메시지를 다시 만드는 코드가
  흩어져 있다.
- 개선: `api.ts`에서 응답 body를 파싱해 상태코드 + 서버 메시지를 가진 에러 타입으로
  던지고, 페이지별 매핑 중복을 제거.

### 9. 감상 목록 페이지네이션 부재 — 보류

- `WatchService.list()`가 사용자의 감상 기록 전체를 한 번에 반환한다. 기록이 수백 개
  쌓이면 목록 페이지가 느려질 첫 번째 지점. 소규모 운영 중에는 문제 없음.

### 10. NavBar React Hook dependency 경고 — 미처리

- `frontend/src/app/components/NavBar.tsx`에 기존 경고 1개가 방치되어 있다.
  lint는 경고로만 처리되어 CI를 막지는 않지만 정리 대상.

## 프론트 테스트 실행 방법 (기록)

테스트 러너가 두 종류로 나뉘어 있다 (총 31개):

```bash
cd frontend
pnpm exec tsx --test "src/**/*.test.ts" "src/**/*.test.tsx"  # 13개 (React/TS)
node --test "src/**/*.test.mjs"                              # 18개 (순수 JS)
```

CI 편의를 위해 `package.json`에 `test` 스크립트로 통합해둔다.
