# 감상기록 페이지 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "내 목록"을 "애니"/"감상기록" 두 개의 하위 페이지로 나누고, 감상기록 페이지에서 시리즈 리뷰(코멘트/별점)와 회차 리뷰를 한데 모아 필터·정렬해 보여준다.

**Architecture:** 백엔드는 기존 `/api/me/episode-reviews`에 `commentOnly` 파라미터를 추가해 코멘트 없는(점수만 있는) 회차 평가도 반환할 수 있게 하고 limit 상한을 올린다. 프론트엔드는 `watchlist/anime`(기존 내 목록 로직 이동) + `watchlist/reviews`(신규, `/api/watch` + `/api/me/episode-reviews`를 합성) + 공통 탭 레이아웃으로 구성한다.

**Tech Stack:** Spring Boot 3 (Java 21) + JPA, Next.js 14 App Router + TypeScript + Tailwind

---

### Task 1: 백엔드 — `commentOnly` 파라미터 + limit 상한 확장

**Files:**
- Modify: `backend/src/main/java/com/animesquad/episode/EpisodeRatingRepository.java`
- Modify: `backend/src/main/java/com/animesquad/episode/MyEpisodeReviewController.java`
- Test: `backend/src/test/java/com/animesquad/episode/MyEpisodeReviewControllerIT.java`

- [ ] **Step 1: 실패하는 통합 테스트 작성**

`backend/src/test/java/com/animesquad/episode/MyEpisodeReviewControllerIT.java` 파일을 새로 만든다:

```java
package com.animesquad.episode;

import com.animesquad.anime.AniListClient;
import com.animesquad.anime.AniListMedia;
import com.animesquad.anime.Anime;
import com.animesquad.anime.AnimeService;
import com.animesquad.auth.JwtAuthenticationFilter;
import com.animesquad.auth.JwtService;
import com.animesquad.support.AbstractIntegrationTest;
import com.animesquad.user.User;
import com.animesquad.user.UserService;
import com.animesquad.watch.WatchService;
import com.animesquad.watch.WatchStatus;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.*;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class MyEpisodeReviewControllerIT extends AbstractIntegrationTest {

    @Autowired UserService userService;
    @Autowired AnimeService animeService;
    @Autowired WatchService watchService;
    @Autowired JwtService jwtService;
    @Autowired TestRestTemplate rest;
    @LocalServerPort int port;

    @MockBean AniListClient aniList;

    private HttpHeaders cookieFor(Long userId) {
        HttpHeaders h = new HttpHeaders();
        h.add(HttpHeaders.COOKIE,
            JwtAuthenticationFilter.COOKIE_NAME + "=" + jwtService.issue(userId));
        h.setContentType(MediaType.APPLICATION_JSON);
        return h;
    }

    private String url(String path) { return "http://localhost:" + port + path; }

    @Test
    void byDefault_onlyReturnsRatingsWithComment() {
        User u = userService.upsertFromGoogle("g-mer1", "mer1@x.y", "MER1", null);
        Anime a = animeService.upsertFromAniList(new AniListMedia(
            5001, "R", "N", "E", "img", 24, "FINISHED", "TV", 2024, null, null));
        watchService.addToList(u.getId(), 5001, WatchStatus.WATCHING);

        rest.exchange(url("/api/watch/" + a.getId() + "/episodes/1"), HttpMethod.PUT,
            new HttpEntity<>(Map.of("score", 5, "comment", "재밌다"), cookieFor(u.getId())), Map.class);
        rest.exchange(url("/api/watch/" + a.getId() + "/episodes/2"), HttpMethod.PUT,
            new HttpEntity<>(Map.of("score", 3), cookieFor(u.getId())), Map.class);

        ResponseEntity<Map[]> res = rest.exchange(
            url("/api/me/episode-reviews"), HttpMethod.GET,
            new HttpEntity<>(cookieFor(u.getId())), Map[].class);

        assertThat(res.getBody()).hasSize(1);
        assertThat(res.getBody()[0].get("episodeNumber")).isEqualTo(1);
    }

    @Test
    void commentOnlyFalse_returnsAllRatings() {
        User u = userService.upsertFromGoogle("g-mer2", "mer2@x.y", "MER2", null);
        Anime a = animeService.upsertFromAniList(new AniListMedia(
            5002, "R", "N", "E", "img", 24, "FINISHED", "TV", 2024, null, null));
        watchService.addToList(u.getId(), 5002, WatchStatus.WATCHING);

        rest.exchange(url("/api/watch/" + a.getId() + "/episodes/1"), HttpMethod.PUT,
            new HttpEntity<>(Map.of("score", 5, "comment", "재밌다"), cookieFor(u.getId())), Map.class);
        rest.exchange(url("/api/watch/" + a.getId() + "/episodes/2"), HttpMethod.PUT,
            new HttpEntity<>(Map.of("score", 3), cookieFor(u.getId())), Map.class);

        ResponseEntity<Map[]> res = rest.exchange(
            url("/api/me/episode-reviews?commentOnly=false"), HttpMethod.GET,
            new HttpEntity<>(cookieFor(u.getId())), Map[].class);

        assertThat(res.getBody()).hasSize(2);
    }

    @Test
    void limit_isRespected_whenBelowMax() {
        User u = userService.upsertFromGoogle("g-mer3", "mer3@x.y", "MER3", null);
        Anime a = animeService.upsertFromAniList(new AniListMedia(
            5003, "R", "N", "E", "img", 999, "FINISHED", "TV", 2024, null, null));
        watchService.addToList(u.getId(), 5003, WatchStatus.WATCHING);
        for (int ep = 1; ep <= 3; ep++) {
            rest.exchange(url("/api/watch/" + a.getId() + "/episodes/" + ep), HttpMethod.PUT,
                new HttpEntity<>(Map.of("score", 4, "comment", "c" + ep), cookieFor(u.getId())), Map.class);
        }

        ResponseEntity<Map[]> uncapped = rest.exchange(
            url("/api/me/episode-reviews?limit=999&commentOnly=false"), HttpMethod.GET,
            new HttpEntity<>(cookieFor(u.getId())), Map[].class);
        assertThat(uncapped.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(uncapped.getBody()).hasSize(3);

        ResponseEntity<Map[]> capped = rest.exchange(
            url("/api/me/episode-reviews?limit=1&commentOnly=false"), HttpMethod.GET,
            new HttpEntity<>(cookieFor(u.getId())), Map[].class);
        assertThat(capped.getBody()).hasSize(1);
    }
}
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd backend && ./gradlew test --tests "com.animesquad.episode.MyEpisodeReviewControllerIT"`
Expected: `commentOnlyFalse_returnsAllRatings`가 FAIL (2개가 아니라 1개만 반환됨 — `commentOnly` 파라미터가 아직 없어서 무시되고 기존 동작인 코멘트-only 필터가 적용됨)

- [ ] **Step 3: 리포지토리에 전체 조회 메서드 추가**

`backend/src/main/java/com/animesquad/episode/EpisodeRatingRepository.java`에서 기존 메서드 바로 아래에 추가:

```java
    List<EpisodeRating> findAllByUserIdAndCommentIsNotNullOrderByUpdatedAtDesc(
        Long userId, Limit limit);

    List<EpisodeRating> findAllByUserIdOrderByUpdatedAtDesc(
        Long userId, Limit limit);
```

- [ ] **Step 4: 컨트롤러에 `commentOnly` 파라미터 추가 + limit 상한 500으로 확장**

`backend/src/main/java/com/animesquad/episode/MyEpisodeReviewController.java`의 기존 `recent` 메서드:

```java
    @GetMapping
    @Transactional(readOnly = true)
    public List<MyEpisodeReview> recent(
        @AuthenticationPrincipal CurrentUser me,
        @RequestParam(defaultValue = "10") int limit
    ) {
        int bounded = Math.max(1, Math.min(limit, 50));
        List<EpisodeRating> rows =
            ratings.findAllByUserIdAndCommentIsNotNullOrderByUpdatedAtDesc(me.userId(), Limit.of(bounded));
        if (rows.isEmpty()) return List.of();

        Map<Long, Anime> animeById = animes.findAllById(
            rows.stream().map(EpisodeRating::getAnimeId).distinct().toList()
        ).stream().collect(Collectors.toMap(Anime::getId, a -> a));

        return rows.stream().map(r -> {
            Anime a = animeById.get(r.getAnimeId());
            return new MyEpisodeReview(
                r.getId(),
                a == null ? null : AnimeRef.from(a),
                r.getEpisodeNumber(),
                r.getScore(),
                r.getComment(),
                r.getUpdatedAt()
            );
        }).toList();
    }
```

교체:

```java
    @GetMapping
    @Transactional(readOnly = true)
    public List<MyEpisodeReview> recent(
        @AuthenticationPrincipal CurrentUser me,
        @RequestParam(defaultValue = "10") int limit,
        @RequestParam(defaultValue = "true") boolean commentOnly
    ) {
        int bounded = Math.max(1, Math.min(limit, 500));
        List<EpisodeRating> rows = commentOnly
            ? ratings.findAllByUserIdAndCommentIsNotNullOrderByUpdatedAtDesc(me.userId(), Limit.of(bounded))
            : ratings.findAllByUserIdOrderByUpdatedAtDesc(me.userId(), Limit.of(bounded));
        if (rows.isEmpty()) return List.of();

        Map<Long, Anime> animeById = animes.findAllById(
            rows.stream().map(EpisodeRating::getAnimeId).distinct().toList()
        ).stream().collect(Collectors.toMap(Anime::getId, a -> a));

        return rows.stream().map(r -> {
            Anime a = animeById.get(r.getAnimeId());
            return new MyEpisodeReview(
                r.getId(),
                a == null ? null : AnimeRef.from(a),
                r.getEpisodeNumber(),
                r.getScore(),
                r.getComment(),
                r.getUpdatedAt()
            );
        }).toList();
    }
```

- [ ] **Step 5: 테스트 실행해서 통과 확인**

Run: `cd backend && ./gradlew test --tests "com.animesquad.episode.MyEpisodeReviewControllerIT"`
Expected: PASS (3 tests)

- [ ] **Step 6: 커밋**

```bash
git add backend/src/main/java/com/animesquad/episode/EpisodeRatingRepository.java \
        backend/src/main/java/com/animesquad/episode/MyEpisodeReviewController.java \
        backend/src/test/java/com/animesquad/episode/MyEpisodeReviewControllerIT.java
git commit -m "feat(episode-reviews): commentOnly 파라미터와 limit 상한 확장 추가"
```

---

### Task 2: 프론트엔드 — `MyEpisodeReview` 타입에 `id`/`comment` nullable 반영 확인 + API 헬퍼 확인

이 태스크는 코드 변경 없이 기존 타입이 이미 요구사항을 충족하는지 확인만 한다 (실제 변경 없음 — Task 3에서 바로 사용).

`frontend/src/app/lib/api.ts`의 기존 타입을 확인한다 (177–192행 부근):

```ts
export type MyEpisodeReview = {
  id: number;
  anime: { id: number; titleRomaji: string; titleKorean: string | null; coverImageUrl: string | null } | null;
  episodeNumber: number;
  score: number;
  comment: string;
  updatedAt: string;
};
```

`comment: string`으로 되어 있지만 백엔드는 `commentOnly=false`일 때 `comment`가 `null`일 수 있다. 타입을 고쳐야 한다.

- [ ] **Step 1: `MyEpisodeReview.comment` 타입을 nullable로 수정**

`frontend/src/app/lib/api.ts`에서:

```ts
export type MyEpisodeReview = {
  id: number;
  anime: { id: number; titleRomaji: string; titleKorean: string | null; coverImageUrl: string | null } | null;
  episodeNumber: number;
  score: number;
  comment: string | null;
  updatedAt: string;
};
```

- [ ] **Step 2: 타입체크로 영향받는 기존 코드 확인**

Run: `cd frontend && npx tsc --noEmit -p .`
Expected: `frontend/src/app/profile/page.tsx`의 `RecentComment` 생성부(97~107행 부근, `r.comment`를 `comment: string`에 대입하는 곳)에서 에러 발생 — `comment: string | null`을 `string`에 대입할 수 없음.

- [ ] **Step 3: `profile/page.tsx`에서 comment 대입부에 non-null assertion 추가**

`frontend/src/app/profile/page.tsx`의 기존 코드 (97~107행 부근) — `.filter((r) => r.anime && r.comment)`로 이미 걸러졌지만 TypeScript가 이를 좁혀주지 못해 `comment: r.comment`가 `string | null`을 `string`에 대입하는 에러가 난다:

```ts
          ...episodeReviews
            .filter((r) => r.anime && r.comment)
            .map((r) => ({
              key: `e${r.id}`,
              animeId: r.anime!.id,
              title: displayTitle(r.anime!),
              episodeNumber: r.episodeNumber as number | null,
              score: r.score as number | null,
              comment: r.comment,
              updatedAt: r.updatedAt,
            })),
```

`comment: r.comment,`를 `comment: r.comment!,`로 교체:

```ts
          ...episodeReviews
            .filter((r) => r.anime && r.comment)
            .map((r) => ({
              key: `e${r.id}`,
              animeId: r.anime!.id,
              title: displayTitle(r.anime!),
              episodeNumber: r.episodeNumber as number | null,
              score: r.score as number | null,
              comment: r.comment!,
              updatedAt: r.updatedAt,
            })),
```

- [ ] **Step 4: 타입체크 재실행**

Run: `cd frontend && npx tsc --noEmit -p .`
Expected: 에러 없음 (PASS, 출력 없음)

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/app/lib/api.ts frontend/src/app/profile/page.tsx
git commit -m "fix(api): MyEpisodeReview.comment를 nullable로 수정"
```

---

### Task 3: 프론트엔드 — `watchlist/anime`로 기존 페이지 이동 + 탭 레이아웃 생성

**Files:**
- Create: `frontend/src/app/watchlist/anime/page.tsx` (기존 `watchlist/page.tsx` 내용 이동)
- Create: `frontend/src/app/watchlist/layout.tsx`
- Modify: `frontend/src/app/watchlist/page.tsx` (리다이렉트로 교체)

- [ ] **Step 1: 기존 `watchlist/page.tsx`를 `watchlist/anime/page.tsx`로 복사**

```bash
mkdir -p /Users/yubeen/animesquad/frontend/src/app/watchlist/anime
cp /Users/yubeen/animesquad/frontend/src/app/watchlist/page.tsx \
   /Users/yubeen/animesquad/frontend/src/app/watchlist/anime/page.tsx
```

- [ ] **Step 2: `watchlist/anime/page.tsx`에서 `<header>`의 `<h1>` 제거**

새 파일의 `MyListPage` 함수 내부 (80~84행 부근):

```tsx
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">내 목록</h1>
      </header>

      {status && (
```

다음으로 교체 (제목은 공통 레이아웃에서 표시하므로 제거):

```tsx
  return (
    <div className="space-y-6">
      {status && (
```

- [ ] **Step 3: 공통 탭 레이아웃 작성**

`frontend/src/app/watchlist/layout.tsx` 신규 생성:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/watchlist/anime", label: "애니" },
  { href: "/watchlist/reviews", label: "감상기록" },
];

export default function WatchlistLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">내 목록</h1>
        <nav className="mt-4 flex gap-1 border-b border-neutral-200">
          {TABS.map((t) => {
            const active = pathname === t.href || pathname.startsWith(t.href + "/");
            return (
              <Link
                key={t.href}
                href={t.href}
                className={
                  "border-b-2 px-3 py-2 text-sm font-medium transition " +
                  (active
                    ? "border-neutral-900 text-neutral-900"
                    : "border-transparent text-neutral-500 hover:text-neutral-900")
                }
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </header>
      {children}
    </div>
  );
}
```

- [ ] **Step 4: `watchlist/page.tsx`를 리다이렉트로 교체**

`frontend/src/app/watchlist/page.tsx` 전체를 교체:

```tsx
import { redirect } from "next/navigation";

export default function WatchlistIndexPage() {
  redirect("/watchlist/anime");
}
```

- [ ] **Step 5: 개발 서버로 라우팅 확인**

Run: `cd frontend && npm run dev` (백그라운드 실행 후) 브라우저에서 `http://localhost:3000/watchlist` 접속
Expected: `/watchlist/anime`로 리다이렉트되고, 기존 "내 목록" 콘텐츠가 탭 아래에 그대로 보임. "감상기록" 탭 클릭 시 404 (Task 4에서 생성 예정) — 정상.

- [ ] **Step 6: 타입체크**

Run: `cd frontend && npx tsc --noEmit -p .`
Expected: 에러 없음

- [ ] **Step 7: 커밋**

```bash
git add frontend/src/app/watchlist/anime/page.tsx frontend/src/app/watchlist/layout.tsx frontend/src/app/watchlist/page.tsx
git commit -m "refactor(watchlist): 내 목록을 /watchlist/anime로 이동, 탭 레이아웃 추가"
```

---

### Task 4: 프론트엔드 — 데이터 병합 유틸 작성

병합 로직(시리즈 기록 + 회차 기록 → 하나의 리스트)을 별도 파일로 분리해 감상기록 페이지 컴포넌트를 가볍게 유지한다.

**Files:**
- Create: `frontend/src/app/watchlist/reviews/merge-records.ts`
- Test: 별도 테스트 러너가 프로젝트에 없으므로(프론트 전체에 유닛테스트 파일 없음 — `find frontend/src -iname "*.test.ts*"`로 확인됨) 이 파일은 순수 함수로 작성하고 Task 5에서 페이지에 연결한 뒤 브라우저로 검증한다.

- [ ] **Step 1: 병합 유틸 작성**

`frontend/src/app/watchlist/reviews/merge-records.ts` 신규 생성:

```ts
import type { WatchEntry, MyEpisodeReview, WatchStatus } from "@/app/lib/api";
import { displayTitle } from "@/app/lib/anilist-labels";

export type ReviewRecord = {
  key: string;
  animeId: number;
  title: string;
  status: WatchStatus | null;
  episodeNumber: number | null;
  score: number | null;
  comment: string | null;
  updatedAt: string;
};

export function mergeRecords(
  entries: WatchEntry[],
  episodeReviews: MyEpisodeReview[]
): ReviewRecord[] {
  const statusByAnimeId = new Map<number, WatchStatus>(
    entries.map((e) => [e.anime.id, e.status])
  );

  const seriesRecords: ReviewRecord[] = entries
    .filter((e) => e.score != null || e.comment != null)
    .map((e) => ({
      key: `s${e.id}`,
      animeId: e.anime.id,
      title: displayTitle(e.anime),
      status: e.status,
      episodeNumber: null,
      score: e.score,
      comment: e.comment,
      updatedAt: e.updatedAt,
    }));

  const episodeRecords: ReviewRecord[] = episodeReviews
    .filter((r) => r.anime != null)
    .map((r) => ({
      key: `e${r.id}`,
      animeId: r.anime!.id,
      title: displayTitle(r.anime!),
      status: statusByAnimeId.get(r.anime!.id) ?? null,
      episodeNumber: r.episodeNumber,
      score: r.score,
      comment: r.comment,
      updatedAt: r.updatedAt,
    }));

  return [...seriesRecords, ...episodeRecords];
}
```

- [ ] **Step 2: 타입체크**

Run: `cd frontend && npx tsc --noEmit -p .`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add frontend/src/app/watchlist/reviews/merge-records.ts
git commit -m "feat(watchlist): 시리즈/회차 리뷰 병합 유틸 추가"
```

---

### Task 5: 프론트엔드 — 감상기록 페이지 (`/watchlist/reviews`)

**Files:**
- Create: `frontend/src/app/watchlist/reviews/page.tsx`

- [ ] **Step 1: 페이지 작성**

`frontend/src/app/watchlist/reviews/page.tsx` 신규 생성:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, type WatchEntry, type MyEpisodeReview, type WatchStatus } from "@/app/lib/api";
import { Stars, StarIcon } from "@/app/components/Stars";
import { relativeTime } from "@/app/components/Timeline";
import { STATUS_LABEL } from "@/app/lib/watch-status";
import { mergeRecords, type ReviewRecord } from "./merge-records";

type StatusFilter = WatchStatus | "ALL";
type ScoreFilter = "ALL" | 1 | 2 | 3 | 4 | 5 | "NONE";
type SortKey = "UPDATED" | "TITLE";
type SortDir = "ASC" | "DESC";

const SORT_LABEL: Record<SortKey, string> = {
  UPDATED: "날짜순",
  TITLE: "이름순",
};

function compareRecords(a: ReviewRecord, b: ReviewRecord, key: SortKey): number {
  switch (key) {
    case "UPDATED":
      return a.updatedAt < b.updatedAt ? -1 : a.updatedAt > b.updatedAt ? 1 : 0;
    case "TITLE":
      return a.title.localeCompare(b.title, "ko");
  }
}

function sortRecords(records: ReviewRecord[], key: SortKey, dir: SortDir): ReviewRecord[] {
  const sign = dir === "ASC" ? 1 : -1;
  return [...records].sort((a, b) => sign * compareRecords(a, b, key));
}

export default function ReviewsPage() {
  const [entries, setEntries] = useState<WatchEntry[] | null>(null);
  const [episodeReviews, setEpisodeReviews] = useState<MyEpisodeReview[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>("ALL");
  const [sort, setSort] = useState<SortKey>("UPDATED");
  const [sortDir, setSortDir] = useState<SortDir>("DESC");

  useEffect(() => {
    apiGet<WatchEntry[]>("/api/watch").then(setEntries).catch((e) => setError(String(e)));
    apiGet<MyEpisodeReview[]>("/api/me/episode-reviews?limit=500&commentOnly=false")
      .then(setEpisodeReviews)
      .catch((e) => setError(String(e)));
  }, []);

  const loading = entries === null || episodeReviews === null;
  const records = loading ? [] : mergeRecords(entries, episodeReviews);

  const statusCounts: Record<StatusFilter, number> = {
    ALL: records.length,
    WATCHING: 0, COMPLETED: 0, ON_HOLD: 0, DROPPED: 0, PLAN_TO_WATCH: 0,
  };
  records.forEach((r) => { if (r.status) statusCounts[r.status]++; });

  const afterStatus = statusFilter === "ALL"
    ? records
    : records.filter((r) => r.status === statusFilter);

  const scoreCounts: Record<ScoreFilter, number> = {
    ALL: afterStatus.length, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, NONE: 0,
  };
  afterStatus.forEach((r) => {
    if (r.score == null) scoreCounts.NONE++;
    else scoreCounts[r.score as 1 | 2 | 3 | 4 | 5]++;
  });

  const afterScore = afterStatus.filter((r) => {
    if (scoreFilter === "ALL") return true;
    if (scoreFilter === "NONE") return r.score == null;
    return r.score === scoreFilter;
  });

  const filtered = sortRecords(afterScore, sort, sortDir);

  if (error) {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
        {error}
      </div>
    );
  }

  if (loading) {
    return (
      <ul className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <li key={i} className="h-20 animate-pulse rounded-xl border border-neutral-200 bg-neutral-100" />
        ))}
      </ul>
    );
  }

  if (records.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 px-6 py-10 text-center text-sm text-neutral-500">
        아직 작성한 감상평이 없어요.
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <StatusFilterBar current={statusFilter} counts={statusCounts} onChange={setStatusFilter} />
        <label className="flex items-center gap-2 text-sm text-neutral-500">
          정렬
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-md border border-neutral-300 px-2 py-1 text-sm focus:border-neutral-900 focus:outline-none"
          >
            {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
              <option key={k} value={k}>{SORT_LABEL[k]}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setSortDir((d) => (d === "ASC" ? "DESC" : "ASC"))}
            className="inline-flex items-center gap-1 rounded-md border border-neutral-300 px-2 py-1 text-sm text-neutral-600 hover:bg-neutral-100"
            title={
              sort === "UPDATED"
                ? sortDir === "DESC" ? "최신순" : "오래된순"
                : sortDir === "DESC" ? "Z~A" : "A~Z"
            }
          >
            {sort === "UPDATED"
              ? sortDir === "DESC" ? "↓ 최신순" : "↑ 오래된순"
              : sortDir === "DESC" ? "↓ Z~A" : "↑ A~Z"}
          </button>
        </label>
      </div>

      <ScoreFilterBar current={scoreFilter} counts={scoreCounts} onChange={setScoreFilter} />

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-500">
          조건에 맞는 기록이 없어요.
        </p>
      ) : (
        <ul className="space-y-3">
          {filtered.map((r) => (
            <RecordRow key={r.key} record={r} />
          ))}
        </ul>
      )}
    </>
  );
}

function StatusFilterBar({
  current, counts, onChange,
}: {
  current: StatusFilter;
  counts: Record<StatusFilter, number>;
  onChange: (f: StatusFilter) => void;
}) {
  const tabs: { value: StatusFilter; label: string }[] = [
    { value: "ALL", label: "전체" },
    { value: "WATCHING", label: STATUS_LABEL.WATCHING },
    { value: "COMPLETED", label: STATUS_LABEL.COMPLETED },
    { value: "ON_HOLD", label: STATUS_LABEL.ON_HOLD },
    { value: "DROPPED", label: STATUS_LABEL.DROPPED },
    { value: "PLAN_TO_WATCH", label: STATUS_LABEL.PLAN_TO_WATCH },
  ];
  return <Pills tabs={tabs} current={current} counts={counts} onChange={onChange} />;
}

function ScoreFilterBar({
  current, counts, onChange,
}: {
  current: ScoreFilter;
  counts: Record<ScoreFilter, number>;
  onChange: (f: ScoreFilter) => void;
}) {
  const starLabel = (n: number) => (
    <span className="inline-flex items-center gap-0.5">
      <span>{n}</span>
      <StarIcon size="sm" />
    </span>
  );
  const tabs: { value: ScoreFilter; label: React.ReactNode }[] = [
    { value: "ALL", label: "평점 전체" },
    { value: 5, label: starLabel(5) },
    { value: 4, label: starLabel(4) },
    { value: 3, label: starLabel(3) },
    { value: 2, label: starLabel(2) },
    { value: 1, label: starLabel(1) },
    { value: "NONE", label: "미평가" },
  ];
  return <Pills tabs={tabs} current={current} counts={counts} onChange={onChange} />;
}

function Pills<T extends string | number>({
  tabs, current, counts, onChange,
}: {
  tabs: { value: T; label: React.ReactNode }[];
  current: T;
  counts: Record<T, number>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {tabs.map((t) => {
        const active = current === t.value;
        return (
          <button
            key={String(t.value)}
            onClick={() => onChange(t.value)}
            className={
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm transition " +
              (active
                ? "bg-neutral-900 text-white"
                : "border border-neutral-200 text-neutral-600 hover:bg-neutral-100")
            }
          >
            {t.label}
            <span className={"text-xs " + (active ? "text-neutral-300" : "text-neutral-400")}>
              {counts[t.value]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function RecordRow({ record }: { record: ReviewRecord }) {
  return (
    <li>
      <Link
        href={`/anime/${record.animeId}`}
        className="block rounded-xl border border-neutral-200 p-4 transition hover:bg-neutral-50"
      >
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 truncate text-sm font-medium text-neutral-800">
            {record.title}
            {record.episodeNumber != null && (
              <span className="ml-1.5 text-xs font-normal text-neutral-500">
                {record.episodeNumber}화
              </span>
            )}
          </p>
          <span className="shrink-0 text-xs text-neutral-400">{relativeTime(record.updatedAt)}</span>
        </div>
        <div className="mt-1.5">
          {record.score != null ? (
            <Stars value={record.score} size="sm" />
          ) : (
            <span className="text-sm text-neutral-500">별점 없음</span>
          )}
        </div>
        {record.comment && (
          <p className="mt-1.5 line-clamp-2 whitespace-pre-wrap break-words text-sm text-neutral-600">
            {record.comment}
          </p>
        )}
      </Link>
    </li>
  );
}
```

- [ ] **Step 2: `Timeline.tsx`에서 `relativeTime`이 export되어 있는지 확인**

Run: `grep -n "export function relativeTime" /Users/yubeen/animesquad/frontend/src/app/components/Timeline.tsx`
Expected: `export function relativeTime(iso: string): string {` 출력됨 (이미 export되어 있음 — 별도 작업 불필요)

- [ ] **Step 3: 타입체크**

Run: `cd frontend && npx tsc --noEmit -p .`
Expected: 에러 없음

- [ ] **Step 4: 브라우저로 확인**

`http://localhost:3000/watchlist/reviews` 접속. 확인 사항:
- 시리즈 코멘트/별점과 회차 코멘트/별점이 날짜순으로 섞여서 나오는지
- 상태 필터, 별점 필터, 정렬이 애니 탭과 동일하게 동작하는지
- 코멘트 없이 별점만 있는 항목은 "별점 없음" 대신 별점만 보이고, 별점 없이 코멘트만 있는 항목은 "별점 없음" + 코멘트가 보이는지
- 카드 클릭 시 해당 애니 상세 페이지로 이동하는지

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/app/watchlist/reviews/page.tsx
git commit -m "feat(watchlist): 감상기록 페이지 추가"
```

---

### Task 6: 프론트엔드 — 내부 링크를 `/watchlist/anime`로 직접 연결

**Files:**
- Modify: `frontend/src/app/components/NavBar.tsx:11`
- Modify: `frontend/src/app/page.tsx:104`
- Modify: `frontend/src/app/anime/[id]/page.tsx:52`

- [ ] **Step 1: NavBar 링크 수정**

`frontend/src/app/components/NavBar.tsx` 11행:

```ts
  { href: "/watchlist", label: "내 목록" },
```

교체:

```ts
  { href: "/watchlist/anime", label: "내 목록" },
```

- [ ] **Step 2: 홈페이지 링크 수정**

`frontend/src/app/page.tsx` 104행:

```tsx
          <SectionHeader title="내가 최근 기록한 애니" linkHref="/watchlist" linkLabel="내 목록 전체" />
```

교체:

```tsx
          <SectionHeader title="내가 최근 기록한 애니" linkHref="/watchlist/anime" linkLabel="내 목록 전체" />
```

- [ ] **Step 3: 애니 상세 페이지 "뒤로" 링크 수정**

`frontend/src/app/anime/[id]/page.tsx` 52행:

```tsx
      <Link href="/watchlist" className="text-sm text-neutral-500 hover:text-neutral-900">
```

교체:

```tsx
      <Link href="/watchlist/anime" className="text-sm text-neutral-500 hover:text-neutral-900">
```

- [ ] **Step 4: 타입체크**

Run: `cd frontend && npx tsc --noEmit -p .`
Expected: 에러 없음

- [ ] **Step 5: 브라우저로 확인**

홈페이지에서 "내 목록 전체" 클릭 → `/watchlist/anime`로 바로 이동(리다이렉트 경유 안 함) 확인. NavBar의 "내 목록" 탭도 `/watchlist/anime`가 active 상태로 표시되는지 확인.

- [ ] **Step 6: 커밋**

```bash
git add frontend/src/app/components/NavBar.tsx frontend/src/app/page.tsx frontend/src/app/anime/\[id\]/page.tsx
git commit -m "refactor: 내 목록 내부 링크를 /watchlist/anime로 직접 연결"
```

---

### Task 7: 백엔드 전체 테스트 스위트 실행 (회귀 확인)

**Files:** 없음 (검증 전용)

- [ ] **Step 1: 백엔드 전체 테스트 실행**

Run: `cd backend && ./gradlew test`
Expected: BUILD SUCCESSFUL, 모든 테스트 통과 (Task 1에서 추가한 3개 포함)

- [ ] **Step 2: 프론트엔드 전체 타입체크 + lint**

Run: `cd frontend && npx tsc --noEmit -p . && npx eslint src`
Expected: 둘 다 에러 없음
