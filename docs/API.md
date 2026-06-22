# AnimeSquad API

기준 시각: 2026-06-19. 이 문서는 백엔드 컨트롤러를 직접 읽어 만든 명세입니다.

## 공통

- **Base URL**: `http://localhost:8080`
- **인증**: 쿠키 기반 JWT. `/api/**`는 모두 인증 필요. 미인증이면 `401 Unauthorized`. (예외: `/oauth2/authorization/google` 같은 OAuth 진입은 공개)
- **로그인**: 브라우저를 `GET /oauth2/authorization/google`로 보내면 Google OAuth → 성공 시 `ASQ_SESSION` 쿠키 발급 후 `${OAUTH_SUCCESS_REDIRECT}` (기본 `http://localhost:3000/profile`)로 리다이렉트.
- **Content-Type**: 요청·응답 모두 `application/json` (별도 명시 제외).
- **에러 응답 형식**:
  ```json
  { "code": "BAD_REQUEST", "message": "...", "fields": { ... } }
  ```
  - 400: `IllegalArgumentException`, `@Valid` 위반 (`VALIDATION_FAILED`)
  - 403/404 등: `ResponseStatusException` 그대로 전달
  - 500: `INTERNAL_ERROR`

---

## Auth

### `GET /api/me`
현재 로그인한 사용자.

**응답 200**
```json
{
  "id": 1,
  "email": "user@example.com",
  "displayName": "User",
  "avatarUrl": "https://...",
  "isAdmin": false
}
```
`isAdmin`은 `app.admin.emails` 화이트리스트와 비교한 결과.

---

## Anime (탐색)

### `GET /api/anime/search?q={query}`
**캐시 DB**에서 부분 일치 검색 (AniList 직접 호출 아님). 매칭 컬럼: `title_romaji`, `title_english`, `title_korean` (case-insensitive), `title_native` (그대로). 최대 20건, id 내림차순.

**Query**
- `q` (필수): 검색어. 공백이면 400.

**참고:** 검색 결과는 캐시된 작품만 보입니다. 새 작품을 노출하려면 관리자가 `POST /api/admin/anime/bulk-cache-season` 등으로 먼저 캐싱해야 합니다.

**응답 200** — `AnimeResponse[]` (Watch 섹션의 `WatchEntryResponse.anime` 동일 형식)

---

## Watchlist

### `POST /api/watch`
내 워치리스트에 작품 추가 (이미 있으면 기존 행 반환, 이벤트 미발행).

**요청**
```json
{ "anilistId": 154587, "status": "WATCHING" }
```
- `status`: `WATCHING | COMPLETED | ON_HOLD | DROPPED | PLAN_TO_WATCH`

캐시에 없는 작품이면 AniList에서 가져와 자동 upsert.

**응답 201** — `WatchEntryResponse` (아래 참고)

### `GET /api/watch`
내 워치리스트 전체. `updatedAt` 내림차순.

**응답 200** — `WatchEntryResponse[]`

### `PATCH /api/watch/{animeId}`
워치 엔트리 수정. 변경된 필드만 보내면 됨.

**요청** (모두 선택)
```json
{
  "status": "WATCHING",
  "progress": 5,
  "score": 4,
  "comment": "재밌음"
}
```
- `progress`: ≥ 0
- `score`: 1~5
- `comment`: 최대 280자

**응답 200** — `WatchEntryResponse`

**`WatchEntryResponse`**
```json
{
  "id": 1,
  "anime": { "id": 1, "anilistId": 154587, "titleRomaji": "...", "titleNative": "...",
             "titleEnglish": "...", "titleKorean": "장송의 프리렌",
             "coverImageUrl": "...", "episodes": 28, "status": "FINISHED",
             "format": "TV", "seasonYear": 2023 },
  "status": "WATCHING",
  "progress": 5,
  "score": null,
  "comment": null,
  "createdAt": "2026-06-19T10:00:00Z",
  "updatedAt": "2026-06-19T10:00:00Z"
}
```

---

## Episode Ratings

### `PUT /api/watch/{animeId}/episodes/{ep}`
화별 평점 upsert (있으면 덮어씀). `progress`가 `ep`보다 작으면 자동으로 `ep`까지 올림.

**경로**
- `animeId`: anime 캐시의 DB id (anilistId 아님)
- `ep`: 1 이상의 화번호

**요청**
```json
{ "score": 5, "comment": "베스트" }
```
- `score`: 1~5 필수
- `comment`: 선택, 최대 280자

**응답 200** — `EpisodeRatingResponse`
```json
{
  "id": 12,
  "animeId": 1,
  "episodeNumber": 5,
  "score": 5,
  "comment": "베스트",
  "createdAt": "2026-06-19T10:00:00Z",
  "updatedAt": "2026-06-19T10:00:00Z"
}
```

### `GET /api/watch/{animeId}/episodes`
해당 작품의 내 화별 평점 전체.

**응답 200** — `EpisodeRatingResponse[]`

---

## Squads

### `POST /api/squad`
스쿼드 생성. 생성자는 자동 멤버. 8자 invite code 발급.

**요청**
```json
{ "name": "내 친구들" }
```
- `name`: 1~80자

**응답 201** — `SquadResponse`
```json
{
  "id": 1,
  "name": "내 친구들",
  "ownerId": 1,
  "inviteCode": "ABCDEFGH",
  "createdAt": "2026-06-19T10:00:00Z"
}
```

### `GET /api/squad`
내가 멤버인 스쿼드 전체.

**응답 200** — `SquadResponse[]`

### `GET /api/squad/{id}`
스쿼드 상세. **멤버여야 함** (아니면 400 — 존재 비공개).

**응답 200** — `SquadResponse`

### `POST /api/squad/join`
초대코드로 참여. 이미 멤버면 멱등(같은 스쿼드 반환). 알 수 없는 코드면 400.

**요청**
```json
{ "inviteCode": "ABCDEFGH" }
```

**응답 200** — `SquadResponse`

---

## Squad Feed

### `GET /api/squad/{squadId}/feed?cursor={lastId}&limit={n}`
스쿼드 활동 피드. id 내림차순. **멤버여야 함**.

**Query**
- `cursor` (선택): 마지막으로 본 활동의 `id`. 다음 페이지는 그보다 작은 id만 반환.
- `limit` (선택, 기본 30, 최대 100)

**응답 200** — `FeedItemResponse[]`
```json
[
  {
    "id": 42,
    "type": "PROGRESS_UPDATED",
    "actor": { "id": 1, "displayName": "User", "avatarUrl": null },
    "anime": { "id": 1, "titleRomaji": "...", "titleKorean": "장송의 프리렌",
               "coverImageUrl": "..." },
    "payload": { "progress": 5 },
    "createdAt": "2026-06-19T10:00:00Z"
  }
]
```

**`type` 별 payload**
| type | payload | 의미 |
|---|---|---|
| `ANIME_ADDED` | `{ "status": "WATCHING" }` | 작품 추가 |
| `STATUS_CHANGED` | `{ "from": "WATCHING", "to": "COMPLETED" }` | 상태 변경 |
| `PROGRESS_UPDATED` | `{ "progress": 5 }` | 진도 변경 |
| `RATED` | `{ "score": 4 }` | 작품 평점 (1~5) |
| `EPISODE_RATED` | `{ "episode": 5, "score": 5 }` | 화별 평점 (1~5) |
| `JOINED_SQUAD` | `{}` | 스쿼드 가입 (anime=null) |

---

## Admin

전체 엔드포인트 **관리자 전용** (`app.admin.emails` 화이트리스트). 그 외엔 403.

### `GET /api/admin/anime`
캐시된 모든 작품 (id 내림차순).

**응답 200** — `AnimeResponse[]`

### `POST /api/admin/anime/bulk-cache-season`
AniList의 특정 시즌 작품을 인기순으로 가져와 upsert. 최대 5페이지 × 50 = 250개. 기존 `titleKorean`은 보존.

**요청**
```json
{ "year": 2024, "season": "FALL" }
```
- `year`: 1960~2100
- `season`: `WINTER | SPRING | SUMMER | FALL` (대소문자 무관)

**응답 200**
```json
{ "cached": 137 }
```

### `PATCH /api/admin/anime/{id}`
한국어 제목만 수정. 빈 문자열·공백·null이면 미설정으로 초기화.

**요청**
```json
{ "titleKorean": "장송의 프리렌" }
```

**응답 200** — `AnimeResponse`

---

## 참고

- AniList rate limit 약 90 req/min. `bulk-cache-season` 한 번에 ≤ 5 호출.
- `WatchEntryResponse.anime` 안의 enum들 (`status`, `format`)은 AniList 원본 그대로 보냅니다. 한글화는 프론트의 `aniStatus()` / `aniFormat()` 매핑에서 처리.
- 활동 피드의 작가/작품 정보는 viewer가 보는 시점에 hydrate되며, 행이 삭제된 경우 `actor`나 `anime`가 `null`일 수 있습니다.
