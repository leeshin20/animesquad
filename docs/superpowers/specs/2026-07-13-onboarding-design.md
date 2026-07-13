# Onboarding Flow Design

## Goal

신규 가입자가 Google 로그인 직후 온보딩 페이지로 이동해 닉네임·프로필 사진 설정과 약관 동의를 완료한 뒤 서비스에 입장한다.

---

## Architecture

Google OAuth 성공 시 백엔드가 `terms_agreed_at` 컬럼을 확인해 null이면 `/onboarding`으로 리다이렉트한다. 온보딩 완료 시 `terms_agreed_at`을 기록하고 `/`로 이동한다. 프론트엔드 NavBar도 `onboardingComplete`가 false면 강제 리다이렉트해 우회를 막는다.

---

## Data Model

### Migration (V{next}__onboarding.sql)

```sql
ALTER TABLE users ADD COLUMN terms_agreed_at TIMESTAMPTZ NULL;
```

---

## Backend Changes

### User.java
- `termsAgreedAt` 필드 추가 (`OffsetDateTime`, nullable)
- `agreeTerms()` 메서드: `this.termsAgreedAt = OffsetDateTime.now()`
- `getTermsAgreedAt()` getter 추가

### UserService.java
- `upsertFromGoogle()`: Google picture URL을 저장하지 않음 — `avatarUrl` 파라미터를 `null`로 고정
  - 기존 유저는 영향 없음 (findByGoogleSub으로 찾으면 저장 안 함)
- `agreeTerms(Long userId)` 메서드 추가: user 조회 → `user.agreeTerms()` 호출

### OAuth2LoginSuccessHandler.java
- `upsertFromGoogle(sub, email, name, null)` — picture 대신 null 전달
- 로그인 후 `user.getTermsAgreedAt() == null`이면 `/onboarding`으로 리다이렉트, 아니면 기존 `successRedirect`(`/`)로

### AuthController.java
- `MeResponse`에 `boolean onboardingComplete` 추가 (`termsAgreedAt != null`)
- `POST /api/me/agree-terms` 엔드포인트 추가: `userService.agreeTerms(current.userId())` → 204 반환

---

## Frontend Changes

### `/public/default-avatar.png`
- `avatarUrl`이 null일 때 앱 전체에서 사용하는 기본 프로필 이미지
- **파일은 직접 추가 필요** (구현 전 `/public/` 폴더에 넣어주세요)

### `NavBar.tsx`
- `Avatar` 컴포넌트: `url`이 null이면 이니셜 원 대신 `<img src="/default-avatar.png" />` 표시
- `me?.onboardingComplete === false`이면 `router.push('/onboarding')` 강제 리다이렉트

### `/onboarding/page.tsx` (신규)

온보딩 페이지 구성:
1. **닉네임 입력** — Google 이름 prefill, 필수
2. **프로필 사진 업로드** — 선택, 미리보기 포함. 업로드 안 하면 `/default-avatar.png` 사용
3. **약관 동의** — 이용약관 + 개인정보처리방침 각각 체크박스. 둘 다 체크해야 제출 가능
4. **제출 흐름**:
   - `PATCH /api/me` (닉네임이 Google 이름과 다를 경우)
   - `POST /api/me/avatar` (사진 업로드한 경우)
   - `POST /api/me/agree-terms`
   - 완료 → `router.push('/')`

로그인하지 않은 상태로 `/onboarding` 접근 시: `/api/me` 실패 → `/`로 리다이렉트.
이미 온보딩 완료한 유저가 `/onboarding` 접근 시: `onboardingComplete === true` → `/`로 리다이렉트.

---

## API Summary

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/me/agree-terms` | `terms_agreed_at = now()` 기록, 204 반환 |

기존 엔드포인트 (`PATCH /api/me`, `POST /api/me/avatar`) 그대로 재사용.

---

## Out of Scope

- 기존 가입자 대상 소급 약관 동의 (현재 미적용)
- 이메일 인증
- 약관 버전 관리
