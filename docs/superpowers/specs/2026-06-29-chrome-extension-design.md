# Chrome Extension — 스트리밍 사이트 애니 자동 감지 및 기록

## 개요

넷플릭스, 라프텔, 크런치롤에서 애니를 시청하다가 페이지를 벗어날 때 animesquad에 회차 기록을 남길 수 있도록 안내하는 Chrome 확장프로그램.

---

## 아키텍처

Manifest V3 기반. 구성 요소 3개:

### Content Script
- 대상 사이트: `netflix.com`, `laftel.net`, `crunchyroll.com`
- 탭 제목(`document.title`) 변화 감지 → 애니 이름과 화수 파싱
- 페이지 체류 시간 측정 (타이머)
- URL 변경 감지 (History API 후킹)
- 10분 이상 체류 후 URL 변경 시 → Service Worker에 메시지 전송

### Service Worker (백그라운드)
- Chrome Storage에 JWT 저장/조회
- Content Script 메시지 수신 → `/api/anime/search` 호출 → 애니 매칭
- Popup과 메시지 중계
- API 호출: 워치리스트 추가, 회차 기록

### Popup
- 로그인 전: Google OAuth 버튼
- 로그인 후: 기록 폼 (애니명, 화수, 평점, 한줄평)

---

## 사이트별 제목 파싱 규칙

| 사이트 | 탭 제목 예시 | 파싱 방법 |
|--------|-------------|-----------|
| 크런치롤 | `Frieren: Beyond Journey's End - Episode 11 - ...` | `- Episode (\d+)` 정규식 |
| 넷플릭스 | `Episode 11 \| Frieren: Beyond Journey's End \| Netflix` | `Episode (\d+)` 정규식, 사이트명 제거 |
| 라프텔 | `장송의 프리렌 11화 - 라프텔` | `(\d+)화` 정규식, ` - 라프텔` 제거 |

화수를 파싱하지 못할 경우 팝업에서 직접 입력.

---

## 애니 매칭

1. 파싱한 제목으로 `GET /api/anime/search?q={title}` 호출
2. 결과 첫 번째 항목 자동 선택
3. 결과가 없으면 팝업에서 검색창 표시 → 수동 선택

기존 검색 API가 `titleEnglish`, `titleRomaji`, `titleKorean`, `titleNative` 모두 지원하므로 별도 수정 불필요.

---

## 인증

확장프로그램 내 Google OAuth 로그인 (`chrome.identity.launchWebAuthFlow`).

**백엔드 신규 엔드포인트 필요:**
- `POST /api/auth/google` — Google ID 토큰을 받아 JWT 발급
- 현재 OAuth는 브라우저 리다이렉트 방식이라 확장프로그램에서 직접 사용 불가

발급된 JWT는 `chrome.storage.local`에 저장.

---

## 팝업 UI 흐름

### 로그인 전
```
[animesquad]
Google로 로그인하기
```

### 기록 팝업
```
[animesquad]
장송의 프리렌 11화를 기록할까요?

평점  ★ ★ ★ ★ ☆  (선택)
한줄평 [_______________]  (선택)

[기록하기]  [무시]
```

### 워치리스트에 없는 경우
```
⚠ 워치리스트에 없습니다. 함께 추가됩니다.
```
문구 추가 후 동일한 폼.

### 매칭 실패 시
```
검색 [_________] 🔍
화수  [  ]
```
수동 검색 후 선택.

### 완료
"기록 완료! ✓" 메시지 1초 표시 후 팝업 닫힘.

---

## API 호출 시퀀스 (기록하기 버튼)

1. 워치리스트 미등록 시: `POST /api/watch` (animeId)
2. 회차 기록: `PUT /api/watch/{animeId}/episodes/{ep}` (rating, comment)

---

## 스코프 외

- 전체 감상평 (`PATCH /api/watch/{animeId}`) — 초기 버전 제외
- 왓챠, 웨이브 등 추가 사이트 — 추후 확장
- 자동 다음화 감지 (넷플릭스 자동재생) — 추후 고려

---

## 파일 구조 (신규 패키지)

```
chrome-extension/
  manifest.json
  content/
    index.js          # Content Script (사이트별 파서 포함)
  background/
    service-worker.js # JWT 관리, API 호출
  popup/
    index.html
    popup.js
    popup.css
  icons/
```

백엔드:
```
backend/.../auth/
  GoogleTokenAuthController.java   # POST /api/auth/google
  GoogleTokenAuthService.java
```
