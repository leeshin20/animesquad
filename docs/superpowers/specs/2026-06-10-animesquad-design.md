# AnimeSquad — 설계 문서

- **작성일**: 2026-06-10
- **상태**: 초안 (브레인스토밍 산출물)
- **다음 단계**: 사용자 리뷰 → 구현 플랜 작성 (writing-plans)

---

## 1. 한 줄 요약

소규모 친구 그룹("스쿼드") 안에서 각자의 애니메이션 시청 현황(상태·회차 진도·평점)을 공유하는 웹 서비스. 트래커가 메인, "같이보기"는 v2 보조 기능.

## 2. 범위

### MVP에 포함

1. Google OAuth 로그인
2. 스쿼드 생성 & 초대 코드로 참여
3. AniList에서 작품 검색 후 내 리스트에 추가
4. 작품별 상태(보는 중 / 완료 / 보류 / 드롭 / 보고싶음) + 회차 진도 기록
5. 작품별 평점(1~10) + 한줄평
6. **회차별 평점 + 한줄평 (옵션 사용)**
7. 스쿼드 피드 — 스쿼드원들의 최근 활동 타임라인
8. 스쿼드원 프로필 — 그 사람의 작품 리스트와 통계

### v2 (MVP 이후)

- 같이보기 (이번 주 작품 지정 + 진도 동기화 뷰)
- 스포일러 방지 (앞선 회차 코멘트 가림)
- 피드 댓글/리액션

## 3. 기술 스택

| 영역 | 선택 | 이유 |
|---|---|---|
| 백엔드 | **Spring Boot 3 + Java 21** | 본인이 가장 익숙 |
| DB | **PostgreSQL** (JPA / Hibernate) | 관계형 + JSONB 필요 |
| 인증 | **Spring Security OAuth2 Client (Google)** | 비밀번호 관리 불필요 |
| 프론트 | **Next.js (App Router) + TypeScript** | SSR/SEO, 큰 생태계 |
| 외부 API | **AniList GraphQL** | 무료, 풍부한 메타데이터 |
| 작품 데이터 전략 | **Cache-on-write** | 추가 시 1회 fetch → DB 캐시 |

## 4. 아키텍처

```
[Next.js (브라우저)]
       │ HTTPS, JSON, JWT in HttpOnly cookie
       ▼
[Spring Boot REST API]
       │
       ├── PostgreSQL
       └── AniList GraphQL (작품 추가 시 1회 fetch)
```

### 백엔드 모듈

- **auth** — Google OAuth2 로그인, JWT 발급, 인증 필터
- **user** — 프로필, 내 정보
- **squad** — 스쿼드 CRUD, 초대 코드, 멤버십
- **anime** — AniList 검색 프록시, 작품 캐싱
- **watch** — 시청 기록 (상태/진도/평점/한줄평) CRUD
- **episode-rating** — 회차별 평점/한줄평 CRUD
- **feed** — 스쿼드 활동 타임라인 조회
- **activity** — 도메인 이벤트 리스닝 → Activity row 생성

### 프론트엔드 페이지

`/login` · `/squads` · `/squads/[id]` (피드) · `/squads/[id]/members/[userId]` (프로필) · `/anime/search` · `/my/list`

### Activity 테이블이 왜 따로 있나

피드는 자주 조회되는 화면이고, 활동 종류(작품 추가/상태 변경/진도/평점/스쿼드 가입 등)가 여러 개. 매번 UNION으로 합치고 정렬하는 대신, **이벤트 발생 시점에 미리 Activity row를 써놓고 피드 조회는 단일 테이블 스캔**으로 처리.

watch 모듈은 `ApplicationEventPublisher`로 도메인 이벤트만 발행하고, activity 모듈의 리스너가 받아서 Activity row를 생성한다. 같은 트랜잭션에서 처리하므로 watch가 롤백되면 Activity도 롤백.

## 5. 데이터 모델

```
user
├── id              BIGSERIAL PK
├── google_sub      VARCHAR UNIQUE
├── email           VARCHAR UNIQUE
├── display_name    VARCHAR
├── avatar_url      VARCHAR
└── created_at      TIMESTAMP

squad
├── id              BIGSERIAL PK
├── name            VARCHAR
├── owner_id        FK → user
├── invite_code     VARCHAR(10) UNIQUE
└── created_at      TIMESTAMP

membership
├── id              BIGSERIAL PK
├── user_id         FK → user
├── squad_id        FK → squad
├── role            ENUM (OWNER, MEMBER)
├── joined_at       TIMESTAMP
└── UNIQUE(user_id, squad_id)

anime                                     -- AniList 캐시
├── id              BIGSERIAL PK
├── anilist_id      INT UNIQUE NULL       -- 자체 DB 전환 대비 nullable
├── title_romaji    VARCHAR
├── title_native    VARCHAR
├── title_english   VARCHAR NULL
├── cover_image_url VARCHAR
├── episodes        INT NULL
├── status          ENUM (FINISHED, RELEASING, NOT_YET_RELEASED)
├── format          ENUM (TV, MOVIE, OVA, ...)
├── season_year     INT NULL
└── cached_at       TIMESTAMP

watch_entry                               -- 내 시청 기록
├── id              BIGSERIAL PK
├── user_id         FK → user
├── anime_id        FK → anime
├── status          ENUM (WATCHING, COMPLETED, ON_HOLD, DROPPED, PLAN_TO_WATCH)
├── progress        INT DEFAULT 0
├── score           SMALLINT NULL         -- 작품 전체 평점 1~10
├── comment         TEXT NULL             -- 한줄평 280자
├── created_at      TIMESTAMP
├── updated_at      TIMESTAMP
└── UNIQUE(user_id, anime_id)

episode_rating                            -- 회차별 평점
├── id              BIGSERIAL PK
├── user_id         FK → user
├── anime_id        FK → anime
├── episode_number  INT
├── score           SMALLINT              -- 1~10
├── comment         TEXT NULL             -- 280자
├── created_at      TIMESTAMP
├── updated_at      TIMESTAMP
└── UNIQUE(user_id, anime_id, episode_number)

activity
├── id              BIGSERIAL PK
├── squad_id        FK → squad
├── actor_id        FK → user
├── type            ENUM (ANIME_ADDED, STATUS_CHANGED,
│                          PROGRESS_UPDATED, RATED,
│                          EPISODE_RATED, JOINED_SQUAD)
├── anime_id        FK → anime NULL
├── payload         JSONB
├── created_at      TIMESTAMP
└── INDEX(squad_id, id DESC)
```

### 설계 메모

- **user 삭제**: hard delete 안 함. 탈퇴해도 row 유지, UI는 "탈퇴한 사용자".
- **anime 캐시 갱신**: `cached_at > 7일` & `status = RELEASING`이면 사용자가 해당 작품 조회할 때 lazy refresh. 스케줄러 없음 (YAGNI).
- **comment**: 280자 (트위터 기준). MVP는 수정 후 기존 activity 갱신 안 함 → activity는 "사건의 스냅샷".
- **invite_code**: 8자 alphanumeric, 충돌 시 재시도.
- **payload (JSONB)**: type별로 다른 모양 저장.
  - `PROGRESS_UPDATED` → `{"from": 7, "to": 12}`
  - `STATUS_CHANGED` → `{"from": "WATCHING", "to": "COMPLETED"}`
  - `RATED` → `{"score": 9, "comment": "..."}`
  - `EPISODE_RATED` → `{"episode": 7, "score": 9}`

## 6. 주요 플로우

### 6.1 로그인
```
브라우저 → /login → Google OAuth → Spring Boot 콜백
  → user upsert (google_sub 기준) → JWT 발급
  → HttpOnly Secure SameSite cookie → 메인으로 리다이렉트
```

### 6.2 스쿼드 생성 & 참여
```
POST /api/squads { name }
  → squad row + membership(OWNER) + invite_code 생성

POST /api/squads/join { code }
  → invite_code 조회 → membership(MEMBER) insert
  → ActivityEvent: JOINED_SQUAD
```

### 6.3 작품 검색 & 추가
```
GET /api/anime/search?q=...
  → 백엔드가 AniList GraphQL 호출 (키 노출 X)
  → 결과 그대로 반환 (DB 저장 X)

POST /api/watch { anilistId, status }
  → Anime 테이블 upsert (최초 캐싱)
  → WatchEntry insert
  → ActivityEvent: ANIME_ADDED
```

### 6.4 진도/상태/평점 업데이트
```
PATCH /api/watch/{animeId} { progress?, status?, score?, comment? }
  → WatchEntry 갱신
  → 바뀐 필드별 ActivityEvent 발행
```

### 6.5 회차 평점
```
PUT /api/watch/{animeId}/episodes/{ep} { score, comment? }
  → episode_rating upsert
  → ActivityEvent: EPISODE_RATED
  → progress < ep이면 progress = ep 자동 + PROGRESS_UPDATED
```

### 6.6 피드
```
GET /api/squads/{id}/feed?cursor=<lastId>&limit=30
  → SELECT * FROM activity
    WHERE squad_id = ? AND id < ?
    ORDER BY id DESC LIMIT 30
  → 응답에 anime/user 정보 join해서 반환
  → 클라이언트에서 "같은 사용자·같은 작품·EPISODE_RATED·1시간 윈도우" 묶음 표시
```

### 6.7 멤버 프로필
```
GET /api/squads/{id}/members/{userId}
  → membership 검증 (같은 스쿼드만 조회 가능)
  → 해당 사용자 watch_entry 목록 + 상태별 통계
```

### 권한 규칙

모든 squad-scoped 엔드포인트는 "요청자가 해당 squad의 membership을 가졌는지" 먼저 검사. AOP 또는 메서드 시큐리티로 일괄 처리.

## 7. 에러 처리 & 외부 의존성

### 에러 응답 표준
```json
{
  "code": "SQUAD_NOT_FOUND",
  "message": "스쿼드를 찾을 수 없습니다",
  "details": { "squadId": 42 }
}
```

`@RestControllerAdvice`로 전역 핸들러. 도메인 예외 → 4xx code 매핑. 알 수 없는 예외 → 500 + generic message + 상세는 로그.

### 주요 케이스

| 상황 | HTTP | code |
|---|---|---|
| 인증 안 됨 | 401 | `UNAUTHORIZED` |
| 비멤버 피드 조회 | 403 | `NOT_SQUAD_MEMBER` |
| 잘못된 초대 코드 | 404 | `INVALID_INVITE_CODE` |
| 이미 가입된 스쿼드 | 409 | `ALREADY_JOINED` |
| AniList 검색 실패 | 502 | `EXTERNAL_API_ERROR` |
| progress > episodes | 400 | `INVALID_PROGRESS` |

### AniList 방어

1. **타임아웃 3초** (`WebClient` 명시)
2. **검색 결과 메모리 캐시** (Caffeine, 5분)
3. **Rate limit 대응** — 429 받으면 1초 백오프 후 1회 재시도
4. **작품 추가 시 재시도 3회** (지수 백오프)

### 자체 DB 전환을 위한 탈출구

지금은 AniList로 가지만, 나중에 갈아끼울 수 있도록:

1. `AnimeMetadataProvider` 인터페이스 뒤로 격리 → `AniListProvider implements AnimeMetadataProvider`
2. `anime.anilist_id`는 **UNIQUE NULLABLE** (자체 작품도 등록 가능)
3. 검색 API 응답은 AniList 스키마 그대로 흘리지 않고 **우리 DTO**로 감싸기 (프론트 종속성 차단)

### 트랜잭션 경계

- 모든 mutation은 `@Transactional` 서비스 메서드 단위
- `ApplicationEventPublisher` 기본 동기 + 같은 트랜잭션
- **AniList 호출은 트랜잭션 밖**에서 → 결과 받고 → 트랜잭션 시작 → DB 저장

### 로깅

요청별 traceId (Micrometer), 외부 API 호출 INFO(url·duration·status), 예외 stack trace + traceId.

## 8. 테스트 전략

### 백엔드

| 계층 | 도구 | 대상 |
|---|---|---|
| 단위 | JUnit 5 + Mockito | 도메인 로직 (WatchEntry 진도/상태 전이, ActivityListener 매핑) |
| 통합 | `@SpringBootTest` + Testcontainers | JPA·트랜잭션·이벤트 동기 발행, AniList는 mock |
| API | `MockMvc` / `@WebMvcTest` | 권한·입력 검증 |

핵심 통합 시나리오:
- 작품 추가 → Activity row가 같은 트랜잭션에서 생성
- 작품 추가 롤백 시 Activity도 롤백
- 진도 업데이트 시 소속 스쿼드 N개에 Activity N개 생성
- 회차 평점 시 진도 자동 동기화

**안 함 (MVP)**: AniList 실제 호출 테스트, E2E 브라우저 테스트.

### 프론트엔드

- 컴포넌트 단위 테스트 없음 (MVP)
- **타입 안전성**으로 커버: 백엔드 OpenAPI → `openapi-typescript`로 TS 타입 생성
- 수동 테스트: 머지 전 주요 플로우 1회

### TDD 적용 범위

도메인 로직(`WatchEntry`, `ActivityListener`, 권한 검사)은 테스트 먼저. CRUD wrapping/DTO 매핑은 일반 구현.

## 9. CI

### 워크플로 2개

**`.github/workflows/backend.yml`** — `backend/**` 변경 시
```
1. JDK 21 setup
2. Gradle 캐시 복원
3. ./gradlew test          # Testcontainers는 Actions Docker로 자동 동작
4. ./gradlew build
5. (main) Docker 이미지 빌드 & 레지스트리 push
```

**`.github/workflows/frontend.yml`** — `frontend/**` 변경 시
```
1. Node 20 setup
2. pnpm install --frozen-lockfile
3. pnpm typecheck && pnpm lint && pnpm build
```

PR은 test/build만, main 머지 시에만 배포 트리거.

## 10. 배포

### 추천 구성 (비용 0~$5/월)

| 컴포넌트 | 서비스 | 이유 |
|---|---|---|
| 프론트 | **Vercel** | Next.js 최적화, GitHub 자동 배포 |
| 백엔드 | **Fly.io** | Docker 그대로, 도쿄 리전 가까움 |
| DB | **Neon** | Postgres serverless, 무료 자동 sleep |
| Secret | 각 플랫폼 환경변수 | OAuth secret, JWT secret, DB URL |

### Dockerfile (백엔드)

```dockerfile
FROM eclipse-temurin:21-jre-alpine
COPY build/libs/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app.jar"]
```

CI에서 `./gradlew bootJar` 후 이미지에 복사.

### 환경 설정

`application.yml` + `application-{profile}.yml`:
- `local` — docker-compose Postgres, AniList 실제 호출 OK
- `prod` — Fly.io 환경변수에서 DB URL/시크릿

컨테이너에 `SPRING_PROFILES_ACTIVE=prod`.

### CORS

프론트(`*.vercel.app`) ↔ 백엔드(`*.fly.dev`) 다른 도메인:
- `CorsConfigurationSource`에 프론트 origin 허용, `allowCredentials=true`
- JWT 쿠키: `SameSite=None; Secure` (cross-site cookie 필수)

대안 — 같은 도메인 하위(`example.com`, `api.example.com`)로 두면 `SameSite=Lax`, 더 안전. 도메인 구매 후 적용.

### 처음 배포 순서

1. GitHub 리포 만들기
2. Neon에서 DB 생성, URL 복사
3. Google Cloud Console에서 OAuth client 생성, redirect URI 등록
4. Fly.io 백엔드 배포 (시크릿 주입)
5. Vercel 프론트 배포 (`NEXT_PUBLIC_API_URL` = Fly 도메인)
6. Google OAuth redirect URI에 Fly 도메인 추가
7. Spring CORS allowed origin에 Vercel 도메인 추가

MVP는 커스텀 도메인 없이 `*.vercel.app` / `*.fly.dev` 그대로.

## 11. 열린 질문

- 스쿼드 멤버 수 상한? (MVP에선 제한 없음, v2에서 검토)
- 작품 추가는 본인만? 다른 멤버가 "추천"하는 기능은 v2
- 모바일 반응형 우선순위? (디자인 단계에서 결정)

## 12. 다음 단계

이 문서가 승인되면 `superpowers:writing-plans` 스킬로 구현 플랜을 작성한다. 플랜은 모듈 단위로 쪼개 단계별 마일스톤(로그인 → 스쿼드 → 작품 추가 → 진도/평점 → 피드 → 회차 평점 → 배포)을 정의할 예정.
