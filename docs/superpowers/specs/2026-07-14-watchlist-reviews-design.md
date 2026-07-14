# 감상기록 페이지 설계

## 배경

"내 목록"(`/watchlist`)에서 애니 목록은 볼 수 있지만, 내가 작성한 감상평(코멘트/별점)만 모아 볼 방법이 없다는 피드백이 있었다. "내 목록"을 "애니" / "감상기록" 두 개의 하위 페이지로 나누고, "감상기록"에서 시리즈 리뷰와 회차 리뷰를 한데 모아 보여준다.

## 라우팅

- `frontend/src/app/watchlist/page.tsx`(기존 "내 목록" 전체 로직)를 `watchlist/anime/page.tsx`로 이동한다. 내용은 그대로, 페이지 제목만 없앤다 (탭 레이아웃에서 표시).
- `watchlist/reviews/page.tsx`를 신규 작성한다 ("감상기록").
- `watchlist/layout.tsx`를 신규 작성해 "애니" / "감상기록" 탭 네비게이션을 공통으로 둔다.
- `watchlist/page.tsx`는 `/watchlist/anime`로 서버 리다이렉트한다 (`next/navigation`의 `redirect()`).
- 다음 3곳의 내부 링크는 리다이렉트를 한 번 더 타지 않도록 `/watchlist/anime`로 직접 수정한다:
  - `frontend/src/app/components/NavBar.tsx` (`{ href: "/watchlist", ... }`)
  - `frontend/src/app/page.tsx` (`linkHref="/watchlist"`)
  - `frontend/src/app/anime/[id]/page.tsx` (뒤로가기 링크)

## 데이터 모델

감상기록에 포함되는 항목 = 다음 두 가지를 합친 것:

1. **시리즈 기록** — `WatchEntry` 중 `score != null || comment != null`인 것만 (둘 다 없는, 목록에 추가만 한 항목은 제외)
2. **회차 기록** — 모든 `EpisodeRating` (점수는 항상 필수라 전부 포함, 코멘트는 있을 수도 없을 수도 있음)

두 종류를 합쳐 하나의 리스트로 만들고 `updatedAt` 기준으로 정렬한다.

프론트엔드에서 다음 두 API 응답을 합성한다:
- `GET /api/watch` (이미 무제한 전체 목록 반환, 기존 애니 탭에서도 사용 중)
- `GET /api/me/episode-reviews?commentOnly=false&limit=500` (아래 백엔드 변경 참고)

## 백엔드 변경

`MyEpisodeReviewController` (`/api/me/episode-reviews`):

- 쿼리 파라미터 `commentOnly` 추가, 기본값 `true` (기존 호출부인 프로필 페이지의 동작을 그대로 유지하기 위함).
  - `true`: 기존과 동일하게 코멘트가 있는 회차 평가만 반환.
  - `false`: 코멘트 유무와 상관없이 모든 회차 평가를 반환.
- `limit` 파라미터의 상한을 50 → 500으로 올린다 (`commentOnly` 값과 무관하게 공통 적용).

`EpisodeRatingRepository`에 새 메서드 추가:
```java
List<EpisodeRating> findAllByUserIdOrderByUpdatedAtDesc(Long userId, Limit limit);
```

컨트롤러는 `commentOnly` 값에 따라 기존 `findAllByUserIdAndCommentIsNotNullOrderByUpdatedAtDesc` 또는 신규 메서드를 호출한다.

## 필터 / 정렬

"애니" 탭(`/watchlist/anime`)과 동일한 구성을 재사용한다:

- **상태 필터** (전체/보는중/완료/보류/중단/볼예정): 회차 기록은 해당 애니의 현재 `WatchEntry.status`로 판정한다 (프론트에서 `/api/watch` 응답으로 `animeId → status` 맵을 만들어 조인).
- **별점 필터** (5/4/3/2/1/미평가): 레코드 자신의 점수를 기준으로 한다 (시리즈 기록은 `null`일 수 있어 "미평가"에 해당, 회차 기록은 항상 점수가 있어 "미평가"에 해당 없음).
- **정렬**: 날짜순/이름순 + 오름차순/내림차순 토글. "애니" 탭의 `SortKey`/`SORT_LABEL`/정렬 버튼 로직을 그대로 재사용한다.

## 카드 레이아웃

텍스트 중심의 간결한 리스트 (프로필 페이지 "최근 소감" 카드 스타일 확장):

- 제목 (회차 기록이면 제목 옆에 "N화" 표시)
- 별점(★) 또는 별점이 없으면 "별점 없음" (회색)
- 코멘트가 있으면 텍스트 표시 (line-clamp), 없으면 별점 줄만 표시
- 날짜 (상대 시간)
- 카드 전체가 `/anime/{id}` 링크

## 프로필 페이지 영향

프로필 페이지(`profile/page.tsx`)의 "최근 소감" 로직은 그대로 둔다 (`commentOnly` 기본값 `true`로 기존 API 호출 그대로 동작).
