# 스쿼드별 애니 상세 페이지 (1차) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 애니 상세 페이지(`/anime/[id]`)를 만들어, 내 평가를 편집하면서 내가 속한 스쿼드 멤버들의 시리즈 단위 평가를 스쿼드별로 모아 본다.

**Architecture:** 데이터 모델 변경 없음. 백엔드에 읽기 엔드포인트 3개 추가(`GET /api/anime/{id}`, `GET /api/watch/{animeId}`, `GET /api/anime/{animeId}/squad-watch`). 내 평가 편집은 기존 `POST/PATCH /api/watch` 재사용. 프론트는 새 클라이언트 페이지 + 진입점 4곳 링크.

**Tech Stack:** Spring Boot(Java) + JPA + Postgres(Testcontainers IT), Next.js(App Router, TS) + Tailwind.

**스펙 대비 변경점:** 스펙 (b)의 "없으면 204"는 구현상 **404 + 프론트 `apiGetOrNull`(404→null)** 으로 확정한다(`apiGet`이 빈 본문 `.json()`에서 깨지므로).

---

## File Structure

**백엔드 (수정/생성):**
- Modify: `backend/src/main/java/com/animesquad/anime/AnimeController.java` — `GET /{id}` 추가
- Modify: `backend/src/main/java/com/animesquad/watch/WatchController.java` — `GET /{animeId}` 추가
- Modify: `backend/src/main/java/com/animesquad/watch/WatchService.java` — `findEntry` 추가
- Modify: `backend/src/main/java/com/animesquad/watch/WatchEntryRepository.java` — `findAllByAnimeIdAndUserIdIn` 추가
- Create: `backend/src/main/java/com/animesquad/anime/AnimeSquadWatchController.java` — squad-watch 그룹 엔드포인트
- Modify(test): `backend/src/test/java/com/animesquad/anime/AnimeControllerIT.java`
- Modify(test): `backend/src/test/java/com/animesquad/watch/WatchControllerIT.java`
- Create(test): `backend/src/test/java/com/animesquad/anime/AnimeSquadWatchControllerIT.java`

**프론트 (수정/생성):**
- Modify: `frontend/src/app/lib/api.ts` — `apiGetOrNull` + squad-watch 타입
- Create: `frontend/src/app/anime/[id]/page.tsx` — 상세 페이지
- Modify: `frontend/src/app/search/page.tsx` — 카드 → 상세 링크
- Modify: `frontend/src/app/watchlist/page.tsx` — row 제목 → 상세 링크
- Modify: `frontend/src/app/squads/[id]/page.tsx` — 최근 감상 카드 → 상세 링크
- Modify: `frontend/src/app/page.tsx` — 홈 카드 → 상세 링크

---

## Task 1: 백엔드 — `GET /api/anime/{id}`

**Files:**
- Modify: `backend/src/main/java/com/animesquad/anime/AnimeController.java`
- Test: `backend/src/test/java/com/animesquad/anime/AnimeControllerIT.java`

- [ ] **Step 1: 실패 테스트 작성** — `AnimeControllerIT.java`에 메서드 추가

먼저 기존 IT 상단의 필드/헬퍼(`rest`, `port`, `url(...)`, `animeService`/`AnimeService` autowire, `media(int)` 헬퍼)가 있는지 확인하고, 없으면 `WatchServiceIT`/`SquadControllerIT` 패턴대로 추가한다. `media(int id)`:
```java
private com.animesquad.anime.AniListMedia media(int id) {
    return new com.animesquad.anime.AniListMedia(id, "Romaji" + id, "Native", "Eng", "img", 12, "FINISHED", "TV", 2024);
}
```
테스트:
```java
@Test
void getById_returnsAnime_and404WhenMissing() {
    com.animesquad.anime.Anime a = animeService.upsertFromAniList(media(101));

    ResponseEntity<Map> ok = rest.exchange(
        url("/api/anime/" + a.getId()), HttpMethod.GET,
        new HttpEntity<>(new HttpHeaders()), Map.class);
    assertThat(ok.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat((Integer) ok.getBody().get("anilistId")).isEqualTo(101);

    ResponseEntity<String> missing = rest.exchange(
        url("/api/anime/999999"), HttpMethod.GET,
        new HttpEntity<>(new HttpHeaders()), String.class);
    assertThat(missing.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
}
```
필요 import: `org.springframework.http.*`, `java.util.Map`, `static org.assertj.core.api.Assertions.assertThat`, `org.springframework.boot.test.web.client.TestRestTemplate`, `org.springframework.boot.test.web.server.LocalServerPort`, autowire `AnimeService animeService`, `TestRestTemplate rest`, `@LocalServerPort int port`. (`/api/anime/**`는 인증 불필요 — `GET /api/anime/search`와 동일 경로 규칙이므로 헤더 없이 호출.)

- [ ] **Step 2: 실패 확인**

Run: `cd backend && ./gradlew test --tests 'com.animesquad.anime.AnimeControllerIT'`
Expected: FAIL (404 대신 다른 상태 또는 컴파일된 핸들러 없음 → get-by-id 미존재로 실패/404 매핑 없음)

- [ ] **Step 3: 구현** — `AnimeController.java` 전체를 아래로 교체

```java
package com.animesquad.anime;

import com.animesquad.anime.dto.AnimeResponse;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@RestController
@RequestMapping("/api/anime")
public class AnimeController {

    private final AnimeSearchService searchService;
    private final AnimeRepository animes;

    public AnimeController(AnimeSearchService searchService, AnimeRepository animes) {
        this.searchService = searchService;
        this.animes = animes;
    }

    @GetMapping("/search")
    public List<AnimeResponse> search(@RequestParam("q") String q) {
        return searchService.search(q).stream().map(AnimeResponse::from).toList();
    }

    @GetMapping("/{id}")
    public AnimeResponse getById(@PathVariable Long id) {
        return animes.findById(id).map(AnimeResponse::from)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "anime not found"));
    }
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd backend && ./gradlew test --tests 'com.animesquad.anime.AnimeControllerIT'`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add backend/src/main/java/com/animesquad/anime/AnimeController.java backend/src/test/java/com/animesquad/anime/AnimeControllerIT.java
git commit -m "feat(anime): GET /api/anime/{id} returns anime by id"
```

---

## Task 2: 백엔드 — `GET /api/watch/{animeId}` (내 평가 1건)

**Files:**
- Modify: `backend/src/main/java/com/animesquad/watch/WatchService.java`
- Modify: `backend/src/main/java/com/animesquad/watch/WatchController.java`
- Test: `backend/src/test/java/com/animesquad/watch/WatchControllerIT.java`

- [ ] **Step 1: 실패 테스트 작성** — `WatchControllerIT.java`에 추가 (기존 헤더/헬퍼 `cookieFor`, `url`, `rest`, `userService`, `animeService` 재사용; 없으면 `SquadControllerIT`/`WatchServiceIT` 패턴대로 추가)

```java
@Test
void getMine_returnsEntry_and404WhenAbsent() {
    User me = userService.upsertFromGoogle("g-gm1", "gm1@x.y", "GM", null);
    animeService.upsertFromAniList(media(210));
    WatchEntry added = watchService.addToList(me.getId(), 210, WatchStatus.WATCHING);

    ResponseEntity<Map> ok = rest.exchange(
        url("/api/watch/" + added.getAnimeId()), HttpMethod.GET,
        new HttpEntity<>(cookieFor(me.getId())), Map.class);
    assertThat(ok.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat((String) ok.getBody().get("status")).isEqualTo("WATCHING");

    ResponseEntity<String> absent = rest.exchange(
        url("/api/watch/999999"), HttpMethod.GET,
        new HttpEntity<>(cookieFor(me.getId())), String.class);
    assertThat(absent.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
}
```
필요 autowire: `WatchService watchService`, `AnimeService animeService`. `media(int)` 헬퍼는 Task 1과 동일 형태로 이 클래스에도 둔다(클래스 간 공유 안 함 — DRY는 클래스 내 한정).

- [ ] **Step 2: 실패 확인**

Run: `cd backend && ./gradlew test --tests 'com.animesquad.watch.WatchControllerIT'`
Expected: FAIL (핸들러 없음 → 405/404 불일치)

- [ ] **Step 3: 구현 (a) — `WatchService.java`에 메서드 추가**

클래스 내부, 기존 `updateEntry`/`listMine` 근처에 추가:
```java
@org.springframework.transaction.annotation.Transactional(readOnly = true)
public java.util.Optional<WatchEntry> findEntry(Long userId, Long animeId) {
    return entries.findByUserIdAndAnimeId(userId, animeId);
}
```
(주의: 리포지토리 필드명이 `entries`가 아니면 해당 클래스의 실제 필드명으로 맞춘다 — `WatchService` 상단 생성자에서 확인.)

- [ ] **Step 3b: 구현 (b) — `WatchController.java`에 핸들러 추가**

`update(...)` 위 또는 아래에 추가:
```java
@GetMapping("/{animeId}")
public WatchEntryResponse getMine(
    @AuthenticationPrincipal CurrentUser me,
    @PathVariable Long animeId
) {
    WatchEntry e = watchService.findEntry(me.userId(), animeId)
        .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(
            HttpStatus.NOT_FOUND, "not in list"));
    Anime a = animes.findById(e.getAnimeId()).orElseThrow();
    return WatchEntryResponse.from(e, a);
}
```
(`HttpStatus`는 이미 import 되어 있음.)

- [ ] **Step 4: 통과 확인**

Run: `cd backend && ./gradlew test --tests 'com.animesquad.watch.WatchControllerIT'`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add backend/src/main/java/com/animesquad/watch/WatchService.java backend/src/main/java/com/animesquad/watch/WatchController.java backend/src/test/java/com/animesquad/watch/WatchControllerIT.java
git commit -m "feat(watch): GET /api/watch/{animeId} returns my entry or 404"
```

---

## Task 3: 백엔드 — squad-watch 그룹 엔드포인트

**Files:**
- Modify: `backend/src/main/java/com/animesquad/watch/WatchEntryRepository.java`
- Create: `backend/src/main/java/com/animesquad/anime/AnimeSquadWatchController.java`
- Test: `backend/src/test/java/com/animesquad/anime/AnimeSquadWatchControllerIT.java`

- [ ] **Step 1: 실패 테스트 작성** — 새 파일 `AnimeSquadWatchControllerIT.java`

```java
package com.animesquad.anime;

import com.animesquad.auth.JwtAuthenticationFilter;
import com.animesquad.auth.JwtService;
import com.animesquad.squad.Squad;
import com.animesquad.squad.SquadService;
import com.animesquad.support.AbstractIntegrationTest;
import com.animesquad.user.User;
import com.animesquad.user.UserService;
import com.animesquad.watch.WatchEntry;
import com.animesquad.watch.WatchService;
import com.animesquad.watch.WatchStatus;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.*;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AnimeSquadWatchControllerIT extends AbstractIntegrationTest {

    @Autowired UserService userService;
    @Autowired SquadService squadService;
    @Autowired WatchService watchService;
    @Autowired AnimeService animeService;
    @Autowired JwtService jwtService;
    @Autowired TestRestTemplate rest;
    @LocalServerPort int port;

    private HttpHeaders cookieFor(Long userId) {
        HttpHeaders h = new HttpHeaders();
        h.add(HttpHeaders.COOKIE, JwtAuthenticationFilter.COOKIE_NAME + "=" + jwtService.issue(userId));
        h.setContentType(MediaType.APPLICATION_JSON);
        return h;
    }
    private String url(String p) { return "http://localhost:" + port + p; }
    private AniListMedia media(int id) {
        return new AniListMedia(id, "Romaji" + id, "Native", "Eng", "img", 12, "FINISHED", "TV", 2024);
    }

    @Test
    void groupsCoMembersBySquad_excludesSelf_andNonCoMembers() {
        User me = userService.upsertFromGoogle("g-sw-me", "me@x.y", "Me", null);
        User mate = userService.upsertFromGoogle("g-sw-mate", "mate@x.y", "Mate", null);
        User stranger = userService.upsertFromGoogle("g-sw-str", "str@x.y", "Str", null);

        Squad squad = squadService.createSquad(me.getId(), "Crew");
        squadService.joinByInviteCode(mate.getId(), squad.getInviteCode());
        // stranger는 가입하지 않음 (비공유 멤버)

        AniListMedia m = media(301);
        animeService.upsertFromAniList(m);
        WatchEntry mineEntry = watchService.addToList(me.getId(), 301, WatchStatus.WATCHING);
        Long animeId = mineEntry.getAnimeId();
        watchService.addToList(mate.getId(), 301, WatchStatus.COMPLETED);
        watchService.updateEntry(mate.getId(), animeId, null, 12, 5, "최고");
        watchService.addToList(stranger.getId(), 301, WatchStatus.WATCHING);

        ResponseEntity<List<Map<String, Object>>> res = rest.exchange(
            url("/api/anime/" + animeId + "/squad-watch"), HttpMethod.GET,
            new HttpEntity<>(cookieFor(me.getId())),
            new ParameterizedTypeReference<List<Map<String, Object>>>() {});

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        List<Map<String, Object>> groups = res.getBody();
        assertThat(groups).hasSize(1);
        assertThat(groups.get(0).get("squadName")).isEqualTo("Crew");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> members = (List<Map<String, Object>>) groups.get(0).get("members");
        // mate 만 (me 제외, stranger 제외)
        assertThat(members).hasSize(1);
        @SuppressWarnings("unchecked")
        Map<String, Object> actor = (Map<String, Object>) members.get(0).get("actor");
        assertThat(actor.get("displayName")).isEqualTo("Mate");
        assertThat(members.get(0).get("score")).isEqualTo(5);
        assertThat(members.get(0).get("comment")).isEqualTo("최고");
    }

    @Test
    void omitsSquadsWithNoEvaluations() {
        User me = userService.upsertFromGoogle("g-sw2-me", "me2@x.y", "Me", null);
        User mate = userService.upsertFromGoogle("g-sw2-mate", "mate2@x.y", "Mate", null);
        Squad squad = squadService.createSquad(me.getId(), "Empty");
        squadService.joinByInviteCode(mate.getId(), squad.getInviteCode());

        AniListMedia m = media(302);
        animeService.upsertFromAniList(m);
        WatchEntry mineEntry = watchService.addToList(me.getId(), 302, WatchStatus.WATCHING);
        // mate 는 이 애니에 기록 없음 → 그룹 비어 생략

        ResponseEntity<List<Map<String, Object>>> res = rest.exchange(
            url("/api/anime/" + mineEntry.getAnimeId() + "/squad-watch"), HttpMethod.GET,
            new HttpEntity<>(cookieFor(me.getId())),
            new ParameterizedTypeReference<List<Map<String, Object>>>() {});

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(res.getBody()).isEmpty();
    }
}
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && ./gradlew test --tests 'com.animesquad.anime.AnimeSquadWatchControllerIT'`
Expected: FAIL (엔드포인트/리포 메서드 없음 → 컴파일 또는 404)

- [ ] **Step 3a: 리포 메서드 추가** — `WatchEntryRepository.java`

`import java.util.Collection;`는 이미 있음. 인터페이스 본문에 추가:
```java
List<WatchEntry> findAllByAnimeIdAndUserIdIn(Long animeId, Collection<Long> userIds);
```

- [ ] **Step 3b: 컨트롤러 생성** — `AnimeSquadWatchController.java`

```java
package com.animesquad.anime;

import com.animesquad.activity.dto.ActorRef;
import com.animesquad.auth.CurrentUser;
import com.animesquad.squad.Membership;
import com.animesquad.squad.MembershipRepository;
import com.animesquad.squad.Squad;
import com.animesquad.squad.SquadRepository;
import com.animesquad.user.User;
import com.animesquad.user.UserRepository;
import com.animesquad.watch.WatchEntry;
import com.animesquad.watch.WatchEntryRepository;
import com.animesquad.watch.WatchStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/anime/{animeId}/squad-watch")
public class AnimeSquadWatchController {

    public record MemberWatch(
        ActorRef actor, WatchStatus status, int progress,
        Integer score, String comment, OffsetDateTime updatedAt
    ) {}
    public record SquadGroup(Long squadId, String squadName, List<MemberWatch> members) {}

    private final MembershipRepository memberships;
    private final SquadRepository squads;
    private final WatchEntryRepository entries;
    private final UserRepository users;

    public AnimeSquadWatchController(
        MembershipRepository memberships, SquadRepository squads,
        WatchEntryRepository entries, UserRepository users
    ) {
        this.memberships = memberships;
        this.squads = squads;
        this.entries = entries;
        this.users = users;
    }

    @GetMapping
    @Transactional(readOnly = true)
    public List<SquadGroup> squadWatch(
        @AuthenticationPrincipal CurrentUser me,
        @PathVariable Long animeId
    ) {
        List<Membership> mine = memberships.findAllByUserId(me.userId());
        List<SquadGroup> out = new ArrayList<>();
        for (Membership m : mine) {
            Long squadId = m.getSquadId();
            List<Long> memberIds = memberships.findAllBySquadId(squadId).stream()
                .map(Membership::getUserId)
                .filter(uid -> !uid.equals(me.userId()))
                .toList();
            if (memberIds.isEmpty()) continue;

            List<WatchEntry> rows = entries.findAllByAnimeIdAndUserIdIn(animeId, memberIds);
            if (rows.isEmpty()) continue;

            Map<Long, User> userById = users.findAllById(
                rows.stream().map(WatchEntry::getUserId).distinct().toList()
            ).stream().collect(Collectors.toMap(User::getId, u -> u));

            Squad squad = squads.findById(squadId).orElse(null);
            if (squad == null) continue;

            List<MemberWatch> members = rows.stream().map(e -> {
                User u = userById.get(e.getUserId());
                return new MemberWatch(
                    u == null ? null : ActorRef.from(u),
                    e.getStatus(), e.getProgress(), e.getScore(),
                    e.getComment(), e.getUpdatedAt());
            }).toList();

            out.add(new SquadGroup(squadId, squad.getName(), members));
        }
        return out;
    }
}
```
(주의: `Membership.getSquadId()` 메서드명이 다르면 실제 게터로 맞춘다 — `Membership.java` 확인.)

- [ ] **Step 4: 통과 확인**

Run: `cd backend && ./gradlew test --tests 'com.animesquad.anime.AnimeSquadWatchControllerIT'`
Expected: PASS (두 테스트 모두)

- [ ] **Step 5: 전체 백엔드 테스트 + 커밋**

Run: `cd backend && ./gradlew test`
Expected: BUILD SUCCESSFUL
```bash
git add backend/src/main/java/com/animesquad/watch/WatchEntryRepository.java backend/src/main/java/com/animesquad/anime/AnimeSquadWatchController.java backend/src/test/java/com/animesquad/anime/AnimeSquadWatchControllerIT.java
git commit -m "feat(anime): GET /api/anime/{id}/squad-watch groups co-member ratings by squad"
```

---

## Task 4: 프론트 — api.ts 헬퍼/타입

**Files:**
- Modify: `frontend/src/app/lib/api.ts`

- [ ] **Step 1: `apiGetOrNull` 추가** — `apiGet` 바로 아래에 삽입

```ts
/** Like apiGet but returns null on 404 (e.g. "anime not in my list"). */
export async function apiGetOrNull<T>(path: string): Promise<T | null> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}
```

- [ ] **Step 2: squad-watch 타입 추가** — 파일 끝에 추가

```ts
export type SquadWatchMember = {
  actor: { id: number; displayName: string; avatarUrl: string | null } | null;
  status: WatchStatus;
  progress: number;
  score: number | null;
  comment: string | null;
  updatedAt: string;
};

export type SquadWatchGroup = {
  squadId: number;
  squadName: string;
  members: SquadWatchMember[];
};
```

- [ ] **Step 3: 커밋**

```bash
git add frontend/src/app/lib/api.ts
git commit -m "feat(api): apiGetOrNull helper + squad-watch types"
```

---

## Task 5: 프론트 — 애니 상세 페이지

**Files:**
- Create: `frontend/src/app/anime/[id]/page.tsx`

- [ ] **Step 1: 페이지 생성** — 아래 전체 내용으로 새 파일 작성

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  apiGet, apiGetOrNull, apiPost, apiPatch,
  type AnimeView, type WatchEntry, type WatchStatus, type SquadWatchGroup,
} from "@/app/lib/api";
import { aniFormat, displayTitle } from "@/app/lib/anilist-labels";
import { Stars, StarsInput } from "@/app/components/Stars";
import { Avatar } from "@/app/components/Timeline";

const STATUSES: WatchStatus[] = ["WATCHING", "COMPLETED", "ON_HOLD", "DROPPED", "PLAN_TO_WATCH"];
const STATUS_LABEL: Record<WatchStatus, string> = {
  WATCHING: "보는 중", COMPLETED: "완료", ON_HOLD: "보류",
  DROPPED: "중단", PLAN_TO_WATCH: "볼 예정",
};

export default function AnimeDetailPage({ params }: { params: { id: string } }) {
  const animeId = params.id;
  const [anime, setAnime] = useState<AnimeView | null>(null);
  const [mine, setMine] = useState<WatchEntry | null>(null);
  const [groups, setGroups] = useState<SquadWatchGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const didInit = useRef(false);

  async function loadAll() {
    try {
      const [a, m, g] = await Promise.all([
        apiGet<AnimeView>(`/api/anime/${animeId}`),
        apiGetOrNull<WatchEntry>(`/api/watch/${animeId}`),
        apiGet<SquadWatchGroup[]>(`/api/anime/${animeId}/squad-watch`),
      ]);
      setAnime(a); setMine(m); setGroups(g);
    } catch (e) { setError(String(e)); }
  }

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    loadAll();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  return (
    <div className="space-y-6">
      <Link href="/watchlist" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← 뒤로
      </Link>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      {anime && (
        <header className="flex gap-5">
          {anime.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={anime.coverImageUrl} alt="" className="h-44 w-30 flex-none rounded-lg object-cover" />
          ) : (
            <div className="h-44 w-30 flex-none rounded-lg bg-neutral-100" />
          )}
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{displayTitle(anime)}</h1>
            {anime.titleKorean && <p className="text-sm text-neutral-500">{anime.titleRomaji}</p>}
            <p className="mt-1 text-xs text-neutral-500">
              {aniFormat(anime.format)} · {anime.episodes ?? "?"}화
            </p>
          </div>
        </header>
      )}

      {anime && (
        <MyEvalPanel anime={anime} mine={mine} onSaved={loadAll} onError={setError} />
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-neutral-700">스쿼드별 평가</h2>
        <SquadGroups groups={groups} />
      </section>
    </div>
  );
}

function MyEvalPanel({
  anime, mine, onSaved, onError,
}: {
  anime: AnimeView;
  mine: WatchEntry | null;
  onSaved: () => void;
  onError: (s: string) => void;
}) {
  const [status, setStatus] = useState<WatchStatus>(mine?.status ?? "WATCHING");
  const [progress, setProgress] = useState<string>(String(mine?.progress ?? 0));
  const [score, setScore] = useState<number | null>(mine?.score ?? null);
  const [comment, setComment] = useState<string>(mine?.comment ?? "");
  const [saving, setSaving] = useState(false);

  const inputCls =
    "rounded-md border border-neutral-300 px-2 py-1 text-sm focus:border-neutral-900 focus:outline-none";

  if (!mine) {
    return (
      <div className="rounded-xl border border-neutral-200 p-4">
        <p className="mb-2 text-sm font-medium text-neutral-700">내 평가</p>
        <select
          defaultValue=""
          onChange={async (e) => {
            const s = e.target.value as WatchStatus;
            if (!s) return;
            try { await apiPost("/api/watch", { anilistId: anime.anilistId, status: s }); onSaved(); }
            catch (err) { onError(String(err)); }
          }}
          className={inputCls}
        >
          <option value="">내 목록에 추가…</option>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
      </div>
    );
  }

  async function save() {
    setSaving(true);
    try {
      await apiPatch(`/api/watch/${anime.id}`, {
        status,
        progress: progress === "" ? null : Number(progress),
        score,
        comment: comment === "" ? null : comment,
      });
      onSaved();
    } catch (err) { onError(String(err)); }
    finally { setSaving(false); }
  }

  return (
    <div className="rounded-xl border border-neutral-200 p-4">
      <p className="mb-2 text-sm font-medium text-neutral-700">내 평가</p>
      <div className="flex flex-wrap items-center gap-2">
        <select value={status} onChange={(e) => setStatus(e.target.value as WatchStatus)} className={inputCls}>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <input
          type="number" min={0} value={progress}
          onChange={(e) => setProgress(e.target.value)}
          placeholder="진도"
          className={`no-spinner w-16 text-center ${inputCls}`}
        />
        <StarsInput value={score} onChange={setScore} size="sm" />
        <input
          value={comment} onChange={(e) => setComment(e.target.value)}
          placeholder="한줄평 (최대 280자)" maxLength={280}
          className={`${inputCls} min-w-[200px] flex-1`}
        />
        <button
          onClick={save} disabled={saving}
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          {saving ? "저장 중…" : "저장"}
        </button>
      </div>
    </div>
  );
}

function SquadGroups({ groups }: { groups: SquadWatchGroup[] | null }) {
  if (groups === null) {
    return <div className="h-20 animate-pulse rounded-xl bg-neutral-100" />;
  }
  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-500">
        스쿼드 멤버들의 평가가 아직 없어요.
      </div>
    );
  }
  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <div key={g.squadId}>
          <p className="mb-2 text-xs font-semibold text-neutral-500">{g.squadName}</p>
          <ul className="space-y-2">
            {g.members.map((m, i) => (
              <li key={i} className="flex items-start gap-3 rounded-lg border border-neutral-200 p-3">
                <Avatar name={m.actor?.displayName ?? "?"} url={m.actor?.avatarUrl ?? null} size={8} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium">{m.actor?.displayName ?? "알 수 없음"}</span>
                    <span className="text-xs text-neutral-500">
                      {STATUS_LABEL[m.status]} · {m.progress}화
                    </span>
                    {m.score != null && <Stars value={m.score} size="sm" />}
                  </div>
                  {m.comment && <p className="mt-1 text-sm text-neutral-600">{m.comment}</p>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
```
(주의: `Stars`/`StarsInput` 의 export 이름·시그니처는 `frontend/src/app/components/Stars.tsx`에서 확인 후 맞춘다. watchlist에서 `StarsInput value/onChange/size`, `Stars value/size`로 쓰이는 패턴 그대로 사용.)

- [ ] **Step 2: 빌드 확인**

Run: `cd frontend && npm run build`
Expected: 성공, 라우트 목록에 `/anime/[id]` 표시

- [ ] **Step 3: 커밋**

```bash
git add frontend/src/app/anime
git commit -m "feat(anime): squad-scoped anime detail page with my-eval editor"
```

---

## Task 6: 프론트 — 진입점 4곳 연결

**Files:**
- Modify: `frontend/src/app/search/page.tsx`
- Modify: `frontend/src/app/watchlist/page.tsx`
- Modify: `frontend/src/app/squads/[id]/page.tsx`
- Modify: `frontend/src/app/page.tsx`

- [ ] **Step 1: 검색 결과 카드 링크** — `search/page.tsx`

상단 import에 `Link` 추가:
```tsx
import Link from "next/link";
```
표지 `<img>`/placeholder와 제목 `<div className="font-medium">{displayTitle(m)}</div>`을 각각 `<Link href={`/anime/${m.id}`}>`로 감싼다(표지 1곳, 제목 1곳). 제목 예시:
```tsx
<Link href={`/anime/${m.id}`} className="font-medium hover:underline">{displayTitle(m)}</Link>
```

- [ ] **Step 2: 내 목록 row 제목 링크** — `watchlist/page.tsx`

`Row` 내부 `<div className="font-medium">{displayTitle(entry.anime)}</div>`를 다음으로 교체:
```tsx
<Link href={`/anime/${entry.anime.id}`} className="font-medium hover:underline">
  {displayTitle(entry.anime)}
</Link>
```
(`Link`는 이미 import 되어 있음.)

- [ ] **Step 3: 스쿼드 최근 감상 카드 링크** — `squads/[id]/page.tsx`

`SquadRecentCard`의 `<Link href="/watchlist" ...>`를 `<Link href={`/anime/${anime.id}`} ...>`로 변경(표지+아바타를 감싸는 그 Link). 클래스는 그대로 유지.

- [ ] **Step 4: 홈 대시보드 카드 링크** — `page.tsx`

`MyRecentCard`의 `<Link href="/watchlist" className="block transition hover:opacity-80">`를 `<Link href={`/anime/${entry.anime.id}`} className="block transition hover:opacity-80">`로 변경.

- [ ] **Step 5: 빌드 확인**

Run: `cd frontend && npm run build`
Expected: 성공

- [ ] **Step 6: 커밋**

```bash
git add frontend/src/app/search/page.tsx frontend/src/app/watchlist/page.tsx "frontend/src/app/squads/[id]/page.tsx" frontend/src/app/page.tsx
git commit -m "feat(anime): link cover/title to anime detail from search, watchlist, squad, home"
```

---

## Task 7: 문서 & 마무리

**Files:**
- Modify: `docs/API.md`

- [ ] **Step 1: API 문서 추가** — `docs/API.md`에 세 엔드포인트 항목 추가

기존 문서 형식에 맞춰 추가:
- `GET /api/anime/{id}` — 애니 단건 (404 if absent)
- `GET /api/watch/{animeId}` — 내 평가 1건 (404 if not in list)
- `GET /api/anime/{animeId}/squad-watch` — 스쿼드별 멤버 평가 그룹 `[{squadId, squadName, members:[{actor,status,progress,score,comment,updatedAt}]}]` (나 제외, 빈 스쿼드 생략)

- [ ] **Step 2: 전체 검증**

Run: `cd backend && ./gradlew test` → BUILD SUCCESSFUL
Run: `cd frontend && npm run build` → 성공

- [ ] **Step 3: 커밋**

```bash
git add docs/API.md
git commit -m "docs: document anime detail + squad-watch endpoints"
```

---

## Self-Review 메모
- 스펙 (a)(b)(c) 모두 Task 1/2/3에 매핑. (b)는 404 시맨틱으로 확정(문서화됨).
- 진입점 4곳 모두 Task 6에 포함.
- 회차별 평가는 의도적으로 범위 외(다음 단계).
- 검증 대상 가정: `Membership.getSquadId()`, `Stars`/`StarsInput` export, `WatchService`의 리포 필드명 — 각 Task 내 주의 문구로 표기.
