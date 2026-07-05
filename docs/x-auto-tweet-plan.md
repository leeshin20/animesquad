# X(트위터) 감상평 자동 트윗 — 보류된 기능 계획

> **상태: 보류** (2026-07-05 결정)
> 보류 사유: 유저의 X API 자격증명(만료 없는 장기 토큰)을 서버에 보관해야 하는데,
> 현재 인증 체계 정비 전(리프레시 토큰 없는 30일 JWT)이라 리스크가 큼.
> **선행 조건을 먼저 해결한 뒤 진행할 것.**

## 목표

감상평(종합/회차) 작성 시 유저의 X 계정으로 자동 트윗:

```
[장송의 프리렌] [3화] [★5] 감상평 내용...
```

- 종합 감상평은 회차 없이 `[제목] [★5] 내용` 형식
- 별점 없는 감상평(comment-only)은 별점 생략
- 280자 초과 시 감상평 뒷부분 잘라냄 (`…` 붙임)

## 검토했던 옵션

| 옵션 | 설명 | 결론 |
|------|------|------|
| 서비스 공용 X API | 운영자가 API 발급, OAuth로 유저 연동 | 유료 티어 월 $100+, 무료 티어는 앱 단위 제한이 빡빡해서 기각 |
| **BYOK (채택 예정)** | 유저 개인이 X 개발자 앱 만들어 키 4개 등록 | 무료 티어(개인당 월 수백 건)로 충분. 단, 키 보관 보안 필요 |
| Web Intent 공유 버튼 | 미리 채워진 트윗창 열기, 비밀 보관 없음 | 자동은 아님. 임시 대안으로 유효 |

## 선행 조건 (이거 먼저)

1. **리프레시 토큰 도입** — 30일 단일 JWT 제거, 짧은 액세스 토큰 + 리프레시 토큰 회전
2. **암호화 키 관리 방안 확정** — 앱 레벨 AES-GCM 키를 Render 환경변수에 둘 경우 서버 침해 시 같이 노출됨. 최소한 DB 유출 단독으로는 안전하도록 설계
3. (권장) 어드민/CORS 등 기존 보안 설정 점검

## BYOK 설계 (진행 시 이대로)

### 유저 플로우
1. 유저가 [X Developer Portal](https://developer.twitter.com)에서 무료 앱 생성
2. Keys and tokens 페이지에서 4개 값 복사:
   - API Key (Consumer Key) / API Key Secret
   - Access Token / Access Token Secret (본인 계정용 — OAuth 로그인 플로우 불필요)
   - ⚠️ 앱 권한을 **Read and Write**로 설정해야 트윗 가능 (기본값 Read-only)
3. animesquad 프로필 설정 → "X 연동"에 키 등록
4. 이후 감상평 저장 시 자동 트윗

### DB

```sql
CREATE TABLE user_twitter_credential (
    user_id BIGINT PRIMARY KEY REFERENCES app_user(id),
    api_key TEXT NOT NULL,              -- AES-GCM 암호화
    api_key_secret TEXT NOT NULL,       -- AES-GCM 암호화
    access_token TEXT NOT NULL,         -- AES-GCM 암호화
    access_token_secret TEXT NOT NULL,  -- AES-GCM 암호화
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 백엔드

- **암호화**: AES-GCM, 키는 환경변수 `TWITTER_CRED_ENC_KEY` (32바이트 base64). 컬럼별 랜덤 IV
- **API**:
  - `PUT /api/me/twitter` — 키 4개 등록/교체
  - `GET /api/me/twitter` — 연동 상태만 반환 (`{ linked: true, enabled: true }`) — **절대 키 원문 반환 금지**
  - `DELETE /api/me/twitter` — 연동 해제(행 삭제)
  - `POST /api/me/twitter/test` — 테스트 트윗으로 키 검증
- **트윗 서비스**: OAuth 1.0a 서명(HMAC-SHA1)으로 `POST https://api.twitter.com/2/tweets`
  - 서명 직접 구현 또는 scribejava 의존성 추가
- **이벤트 리스너**: 기존 `WatchRatedEvent` + 회차 감상 이벤트에 리스너 추가
  - `@Async` + try-catch — 트윗 실패가 감상평 저장에 절대 영향 없게
  - 실패 시 로그만 남기고 무시 (재시도 없음, 단순하게)
- 참고: 회차 감상(EpisodeRating)은 현재 도메인 이벤트를 발행하지 않음 → 이벤트 추가 필요

### 프론트엔드

- 프로필 페이지에 "X 연동" 섹션: 키 4개 입력 폼, 연동 상태 표시, 해제 버튼, 발급 방법 안내(포털 스크린샷 또는 링크)
- 등록된 키는 다시 보여주지 않음 (마스킹 `••••`)

### 보안 체크리스트

- [ ] 키 4개 모두 AES-GCM 암호화 저장 (평문 금지)
- [ ] GET 응답에 키 원문 절대 포함 금지
- [ ] 로그에 키 원문 남기지 않기 (요청 로깅 주의)
- [ ] 연동 해제 시 DB에서 완전 삭제
- [ ] 트윗 내용은 유저 본인 감상평만 (다른 유저 데이터 섞임 방지 — actorId 검증)

## 임시 대안 (원하면 먼저 구현 가능)

Web Intent 공유 버튼 — 비밀 보관 없음, 즉시 구현 가능:

```
https://twitter.com/intent/tweet?text=[인코딩된 텍스트]
```

감상평 저장 완료 후 "X에 공유" 버튼 → 새 창으로 미리 채워진 트윗 작성창.
