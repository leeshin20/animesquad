# 코드베이스 검토 보고서 (2026-07-10)

## 범위와 방법

- 대상: `backend/src/main`, `backend/src/test`, `frontend/src`, 실행 설정 및 API/설계 문서
- 확인: Spring Boot 통합 테스트 구성, 프런트엔드 타입·린트·프로덕션 빌드, API 호출 및 권한 흐름의 정적 추적
- 제외: 실제 운영 데이터량·R2 권한 정책·배포 환경 변수는 접근하지 못했으므로, 해당 항목은 코드상 위험으로만 평가했다.

## 요약

즉시 조치가 필요한 항목은 네 가지다. 스쿼드 이미지가 권한 검사 전에 저장되고, 피드의 클라이언트 페이지네이션이 숨긴 이벤트 때문에 반복될 수 있으며, `searchKeywords` 기능이 백엔드까지만 구현되어 관리자 화면에서는 사용할 수 없다. AniList 호출에는 타임아웃도 없어 외부 장애가 API 요청을 점유할 수 있다.

그 밖에는 조회량 증가에 취약한 전체 조회/인메모리 집계, 비원자적 중복 방지, 테스트 공백, API 클라이언트 중복이 누적 유지보수 비용의 주요 원인이다.

| 우선순위 | 건수 | 의미 |
| --- | ---: | --- |
| P1 | 4 | 권한·기능·가용성에 직접 영향. 다음 배포 전에 수정 권장 |
| P2 | 7 | 사용자/데이터 규모가 늘면 장애 또는 비용으로 이어질 항목 |
| P3 | 3 | 유지보수성과 UX를 높이는 정리 항목 |

## P1 — 우선 수정

### 1. 스쿼드 이미지가 권한 확인 전에 저장된다

- 근거: [`SquadController.java`](../backend/src/main/java/com/animesquad/squad/SquadController.java) 62–80행은 `storage.store(file)`을 먼저 호출하고, 소유자 확인은 이후 `SquadService.updateAvatarUrl/updateBannerUrl()`에서 수행한다.
- 재현: 어떤 인증 사용자가 자신이 소유하지 않은 스쿼드의 `/avatar` 또는 `/banner`에 유효한 이미지로 요청하면 파일은 로컬 디스크 또는 R2에 저장되고, 이후에만 `403`이 반환된다.
- 영향: 권한 없는 사용자가 저장소를 소모하고 고아 객체를 만들 수 있다. R2에서는 지속적인 비용 및 운영 정리 부담으로 이어진다.
- 권고: `store` 전에 소유자 여부를 검사하는 서비스 메서드를 만들고, 권한 확인과 URL 갱신을 하나의 명시적 흐름으로 둔다. 저장 뒤 DB 갱신이 실패한 경우 방금 저장한 객체를 삭제하는 보상 처리도 추가한다.

### 2. 숨긴 피드 이벤트 때문에 “더 보기” 커서가 진행하지 않거나 항목이 중복된다

- 근거: [`frontend/src/app/squads/[id]/page.tsx`](../frontend/src/app/squads/[id]/page.tsx) 39–45행은 화면에 남긴 `items`의 마지막 id를 다음 커서로 사용하지만, 42–43행에서 `ANIME_ADDED`, `STATUS_CHANGED`를 제거한다.
- 재현: 한 페이지가 제거 대상 이벤트만 포함하면 `items`가 비어 다음 요청도 cursor 없이 첫 페이지를 다시 조회한다. 혼합 페이지라도 마지막 표시 이벤트가 서버 페이지의 마지막 이벤트보다 앞서면 다음 페이지가 겹친다.
- 영향: 사용자가 같은 활동을 반복해서 보거나 피드 끝까지 도달하지 못한다.
- 권고: 표시용 목록과 서버 페이지네이션 커서를 분리한다. 응답의 마지막 원본 row id를 별도 `nextCursor` 상태로 보관하거나, 서버가 `items`와 `nextCursor`를 함께 반환하도록 바꾼다. 숨기는 타입 자체가 제품 정책이라면 서버에서 필터링하는 편이 더 단순하다.

### 3. 검색 키워드 기능이 백엔드만 구현되어 관리자 화면에서 입력·수정할 수 없다

- 근거: 백엔드는 [`AdminAnimeController.java`](../backend/src/main/java/com/animesquad/admin/AdminAnimeController.java) 27, 102–114행에서 `searchKeywords`를 받고 저장하며, 검색 쿼리도 이를 사용한다. 반면 [`admin/anime/page.tsx`](../frontend/src/app/admin/anime/page.tsx) 239–250행은 `titleKorean`만 상태와 PATCH 본문에 넣는다. `AnimeView`에도 `searchKeywords` 필드가 없다.
- 설계 불일치: [`2026-07-10-search-keywords-design.md`](superpowers/specs/2026-07-10-search-keywords-design.md) 32–36행은 두 프런트엔드 변경을 명시한다.
- 영향: 별칭 검색을 위한 컬럼과 API는 배포되어도 운영자가 값을 관리할 수 없어 기능이 사실상 비활성화된다. 현재 PATCH 요청은 생략 필드를 `null`로 정규화하므로, 다른 클라이언트가 키워드를 설정했더라도 관리자 화면에서 제목만 저장하면 지워질 수 있다.
- 권고: `AnimeView`에 nullable `searchKeywords`를 추가하고, 행에 별도 입력 상태·dirty 비교·PATCH 값을 추가한다. 제목만 바꾸는 PATCH가 기존 키워드를 지우지 않도록 서버 요청 DTO를 부분 업데이트로 분리하거나, 프런트가 항상 현재 키워드를 함께 보낸다. 이 흐름을 API 테스트와 프런트엔드 테스트로 고정한다.

### 4. AniList HTTP 호출에 연결/응답 시간 제한과 실패 경계가 없다

- 근거: [`AniListClientImpl.java`](../backend/src/main/java/com/animesquad/anime/AniListClientImpl.java) 69–70행의 `RestClient`는 타임아웃 없는 기본 설정이고, 120–124행에서 그대로 동기 호출한다. 작품 추가와 관리자 시즌 캐싱이 이 경로를 호출한다.
- 영향: AniList 지연 또는 네트워크 정체가 요청 스레드를 오래 점유한다. 시즌 캐싱은 최대 다섯 번 연속 호출하므로 관리 화면과 서버 가용성에 더 큰 영향을 준다.
- 권고: 연결·응답 타임아웃(설계 문서의 3초 기준 등)을 명시하고, 외부 호출 실패를 일관된 502/503 오류로 변환한다. 429에는 제한된 재시도와 백오프를 두고, 캐싱 작업은 요청 타임아웃과 별도 실행 전략을 검토한다.

## P2 — 규모와 안정성

### 5. 제목 검색은 긴 입력과 선행 와일드카드 전체 스캔에 열려 있다

- 근거: [`AnimeSearchService.java`](../backend/src/main/java/com/animesquad/anime/AnimeSearchService.java) 21–31행은 길이 제한 없이 `%검색어%`를 만들고, [`AnimeRepository.java`](../backend/src/main/java/com/animesquad/anime/AnimeRepository.java) 15–28행은 여러 `LOWER`, `REPLACE`, `LIKE` 조건을 OR로 실행한다.
- 영향: `LIMIT 20`은 반환량만 제한하며 후보 행 스캔 비용은 제한하지 않는다. 캐시가 커지거나 자동완성 요청이 겹치면 DB 부하가 급격히 늘 수 있다.
- 권고: query 길이 상한과 최소 검색 길이를 둔다. PostgreSQL `pg_trgm` + GIN 인덱스를 사용하거나, 검색 정규화 컬럼을 별도로 두어 함수 적용을 인덱스 친화적으로 만든다. 실제 데이터로 실행 계획을 확인한 뒤 선택한다.

### 6. 공개 리뷰·통계 API가 모든 행을 읽어 애플리케이션에서 필터·집계한다

- 근거: [`AnimeReviewsController.java`](../backend/src/main/java/com/animesquad/anime/AnimeReviewsController.java) 48–62, 67–81, 84–91행은 리뷰/회차 리뷰/워치 엔트리 전체를 가져온 뒤 메모리에서 처리한다.
- 영향: 인기 작품의 리뷰가 많아지면 응답 크기·JVM 메모리·DB 전송량이 모두 증가한다. 상세 페이지는 세 API를 병렬 호출하므로 문제가 증폭된다.
- 권고: 댓글 존재 조건과 페이지네이션을 repository 쿼리로 내리고, 통계는 `COUNT`, `AVG` 집계 쿼리로 계산한다. API에 cursor 또는 page/size와 최대치를 문서화한다.

### 7. 목록과 대시보드에 N+1/스쿼드 수 선형 요청이 있다

- 근거: `SquadService.toResponse()`는 매 스쿼드마다 `countBySquadId()`를 호출한다([`SquadService.java`](../backend/src/main/java/com/animesquad/squad/SquadService.java) 91–92행). 홈 대시보드는 가입 스쿼드마다 피드 요청을 한 번씩 보낸다([`page.tsx`](../frontend/src/app/page.tsx) 67–77행).
- 영향: 사용자가 많은 스쿼드에 가입할수록 목록 조회는 DB 쿼리 수, 홈은 HTTP 요청 수가 선형 증가한다. 일부 피드 요청만 실패해도 홈 전체가 오류가 된다.
- 권고: 스쿼드 목록용으로 멤버 수를 한 번에 집계하는 projection을 사용한다. 홈은 전용 통합 피드 endpoint를 만들거나, 호출 수/동시성을 상한으로 제한하고 부분 실패를 개별 처리한다.

### 8. 이미지 검증은 클라이언트 제공 `Content-Type`만 신뢰하며, 교체 파일을 정리하지 않는다

- 근거: [`AvatarStorage.java`](../backend/src/main/java/com/animesquad/user/AvatarStorage.java) 17–27행은 MIME 헤더와 크기만 검사하고, [`LocalAvatarStorage.java`](../backend/src/main/java/com/animesquad/user/LocalAvatarStorage.java) 31–42행은 그대로 저장한다. 프로필/스쿼드 URL 갱신은 이전 파일을 삭제하지 않는다.
- 영향: 이미지가 아닌 바이트열도 `image/png` 등으로 선언하면 저장된다(현재 통합 테스트도 임의 바이트를 PNG 헤더로 보내는 방식). 파일 교체가 반복되면 로컬/R2에 고아 객체가 누적된다. 이는 XSS가 확인되었다는 뜻은 아니며, 업로드 신뢰 경계가 부족하다는 의미다.
- 권고: 서버에서 이미지 디코드로 실제 형식을 검증하고, 가능하면 재인코딩·픽셀 수 상한을 적용한다. 저장 키를 DB 트랜잭션과 연결하고 이전 파일 삭제 및 실패 시 보상 삭제 정책을 정한다.

### 9. 중복 방지의 사전 조회가 동시 요청에서 DB 제약 오류(500)로 드러날 수 있다

- 근거: `WatchService.addToList()`는 조회 뒤 저장한다([`WatchService.java`](../backend/src/main/java/com/animesquad/watch/WatchService.java) 31–34행). `SquadService.joinByInviteCode()`도 `exists` 뒤 저장한다([`SquadService.java`](../backend/src/main/java/com/animesquad/squad/SquadService.java) 37–42행). 두 테이블 모두 DB unique 제약으로 최종 보호된다.
- 영향: 같은 사용자의 빠른 더블 클릭/재시도 또는 동시 탭 요청은 unique 위반을 일반 500으로 만들 수 있다. 정상적인 멱등 API 경험이 깨진다.
- 권고: PostgreSQL `INSERT ... ON CONFLICT` 기반의 원자적 upsert/insert를 쓰거나, `DataIntegrityViolationException`을 재조회 후 기존 결과 반환(추가는) 또는 의미 있는 409/멱등 성공(참여)은 정책에 맞게 변환한다. 동시성 테스트를 추가한다.

### 10. 주요 요구사항·API 문서·구현의 시간축이 어긋나 있다

- 근거: 초기 설계는 작품 추가 시 `ANIME_ADDED` 이벤트와 AniList 검색 프록시를 명시한다([`2026-06-10-animesquad-design.md`](superpowers/specs/2026-06-10-animesquad-design.md) 182–191행). 실제 `WatchService.addToList()`는 이벤트를 발행하지 않고, 검색은 로컬 캐시만 조회한다. 현재 [`API.md`](API.md) 3, 65–71, 116–117행도 기준일이 2026-06-19이고 이벤트 미발행을 기록해 초기 설계와 충돌한다.
- 영향: 새 기능을 추가할 때 어떤 동작이 의도인지 판단하기 어렵고, 피드 UI가 `ANIME_ADDED`를 숨기는 이유도 불명확해진다.
- 권고: 현재 제품 결정을 먼저 확정한다. 이벤트 미발행과 캐시 검색이 의도라면 초기 설계·테스트 계획을 갱신하고 `ANIME_ADDED` 타입/필터 필요성을 재검토한다. 의도가 초기 설계라면 이벤트 발행과 외부 검색 전략을 복원하고 통합 테스트를 추가한다.

### 11. 프런트엔드 자동 검증이 없어 기능 단절을 막지 못한다

- 근거: `frontend/`에 test/spec 파일과 test 스크립트가 없고, 현재 검증은 타입/린트/빌드뿐이다.
- 영향: 이번의 `searchKeywords`처럼 백엔드 계약은 바뀌었지만 화면이 따라오지 않는 문제가 컴파일을 통과한다. 피드 cursor, 권한별 UI, 실패 메시지도 회귀하기 쉽다.
- 권고: 먼저 API 클라이언트와 관리자 행 저장, 피드 커서, 검색 결과의 오래된 응답 무시를 대상으로 작은 단위 테스트를 둔다. 이후 Playwright 등으로 로그인 상태를 모킹한 핵심 E2E 시나리오를 2–3개 추가한다.

## P3 — 중복 제거와 UX 개선

### 12. API 클라이언트의 fetch/오류 처리가 반복되고 서버 오류 내용을 버린다

- 근거: [`frontend/src/app/lib/api.ts`](../frontend/src/app/lib/api.ts) 3–110행에서 GET/POST/PATCH/PUT/DELETE/upload가 거의 같은 옵션과 `API {status}` 오류 생성을 반복한다.
- 영향: 옵션을 바꾸거나 오류 형식을 개선할 때 여섯 경로를 함께 수정해야 한다. 서버가 보내는 한국어 오류 메시지와 validation details는 UI에서 사라지고 `Error: API 400`만 보인다.
- 권고: 내부 `request<T>` 하나로 credentials, cache, JSON body, multipart, 응답 파싱을 통합한다. 오류 응답의 `code/message/details`를 보존한 typed error를 만들어 화면에는 `message`를 보여 준다.

### 13. 검색 debounce는 이전 요청을 취소·무효화하지 않아 오래된 결과가 새 입력을 덮을 수 있다

- 근거: [`search/page.tsx`](../frontend/src/app/search/page.tsx) 40–53행과 [`NavBar.tsx`](../frontend/src/app/components/NavBar.tsx) 53–65행은 타이머만 취소한다. 이미 출발한 `fetch`의 응답 순서는 보장하지 않는다.
- 영향: 느린 이전 검색의 응답이 더 늦게 도착하면 현재 입력과 다른 결과가 표시된다.
- 권고: `AbortController`를 API helper에 전달하거나, 요청 sequence id를 두고 최신 요청일 때만 state를 갱신한다.

### 14. 클라이언트/서버 입력 한도와 임시 URL 정리가 일관되지 않다

- 근거: 스쿼드 편집 화면은 2MB로 제한하지만([`SquadEditModal.tsx`](../frontend/src/app/components/SquadEditModal.tsx) 20–35행) 서버는 5MB까지 허용한다. 프로필 편집은 `URL.createObjectURL`로 만든 미리보기를 해제하지 않는다([`profile/page.tsx`](../frontend/src/app/profile/page.tsx) 318–321행).
- 영향: 사용자는 서버가 허용하는 파일을 화면에서 거절당할 수 있고, 긴 편집 세션에서 브라우저 메모리가 불필요하게 남는다.
- 권고: 파일 한도를 공유 상수/서버 응답으로 정렬하고, 파일 변경·모달 해제 시 `URL.revokeObjectURL`을 호출한다.

## 권장 진행 순서

1. P1-1, P1-2, P1-3을 각각 회귀 테스트와 함께 수정한다.
2. P1-4에 타임아웃과 외부 오류 변환을 추가한 뒤, AniList 지연/429를 모킹한 테스트를 만든다.
3. P2-5~7은 운영 데이터 기준의 실행 계획과 간단한 부하 측정 후 인덱스·페이지네이션·집계 쿼리를 선택한다.
4. P2-8~11과 P3은 API 계약을 한 곳에서 검증하는 테스트를 먼저 마련하며 점진적으로 정리한다.

## 실행 확인

2026-07-10에 다음 명령이 성공했다.

```text
backend:  ./gradlew test        # BUILD SUCCESSFUL (모든 태스크 up-to-date)
frontend: pnpm lint            # ESLint warnings/errors 없음
frontend: pnpm exec tsc --noEmit
frontend: pnpm build           # Next.js production build 성공
```

정적 검증과 기존 테스트가 통과했다는 사실은 위 결함들이 없다는 뜻은 아니다. 특히 권한 순서, 동시성, 페이지네이션, 프런트엔드 계약 단절은 현재 자동 테스트가 다루지 않는 흐름이다.
