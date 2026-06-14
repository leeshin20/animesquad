# Plan 5 — Episode ratings (backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Authenticated users can rate (score + comment) individual episodes of an anime they have on their watch list, with `progress` auto-bumped when they rate past their current progress.

**Architecture:** A new `episode_rating` table keyed by `(user_id, anime_id, episode_number)`. `PUT /api/watch/{animeId}/episodes/{ep}` upserts the rating (PUT = full replace of score+comment) and, if the user's watch entry has `progress < ep`, bumps it. Implemented as a separate `episode` module that calls `WatchService.updateEntry` for the progress bump so the watch domain stays the single source of truth for progress.

**Tech Stack:** Spring Boot 3.3.5, Spring Data JPA, Flyway, Bean Validation, JUnit 5, Testcontainers Postgres.

---

## File Structure

**Backend — created**
- `backend/src/main/resources/db/migration/V5__episode_rating.sql`
- `backend/src/main/java/com/animesquad/episode/EpisodeRating.java`
- `backend/src/main/java/com/animesquad/episode/EpisodeRatingRepository.java`
- `backend/src/main/java/com/animesquad/episode/EpisodeRatingService.java`
- `backend/src/main/java/com/animesquad/episode/EpisodeRatingController.java`
- `backend/src/main/java/com/animesquad/episode/dto/RateEpisodeRequest.java`
- `backend/src/main/java/com/animesquad/episode/dto/EpisodeRatingResponse.java`

**Backend — modified**
- `backend/src/test/java/com/animesquad/support/AbstractIntegrationTest.java` — truncate `episode_rating`

**Backend — tests**
- `backend/src/test/java/com/animesquad/episode/EpisodeRatingServiceIT.java`
- `backend/src/test/java/com/animesquad/episode/EpisodeRatingControllerIT.java`

The controller lives at `/api/watch/{animeId}/episodes/**` even though it's in the `episode` package — the URL reflects the resource hierarchy in the spec, while package boundaries follow the data ownership (episode ratings are their own aggregate).

Frontend changes are deferred — see "Out of Scope" at the bottom.

---

## Task 1: Flyway V5 — `episode_rating` table

**Files:**
- Create: `backend/src/main/resources/db/migration/V5__episode_rating.sql`

`score` is `INT` (not `SMALLINT`) so Hibernate's schema-validation matches the `Integer` JPA type, the same fix applied in Plan 4 for `watch_entry`.

- [ ] **Step 1: Write the migration**

```sql
CREATE TABLE episode_rating (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT      NOT NULL REFERENCES users(id),
    anime_id        BIGINT      NOT NULL REFERENCES anime(id),
    episode_number  INT         NOT NULL,
    score           INT         NOT NULL,
    comment         TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, anime_id, episode_number),
    CHECK (episode_number > 0),
    CHECK (score BETWEEN 1 AND 10)
);

CREATE INDEX idx_episode_rating_user_anime ON episode_rating(user_id, anime_id);
```

- [ ] **Step 2: Verify Flyway applies cleanly**

```bash
cd backend && ./gradlew test --tests "*UserServiceIT*"
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/resources/db/migration/V5__episode_rating.sql
git commit -m "feat(db): add episode_rating table (V5)"
```

---

## Task 2: `EpisodeRating` entity + repository

**Files:**
- Create: `backend/src/main/java/com/animesquad/episode/EpisodeRating.java`
- Create: `backend/src/main/java/com/animesquad/episode/EpisodeRatingRepository.java`

- [ ] **Step 1: `EpisodeRating.java`**

```java
package com.animesquad.episode;

import jakarta.persistence.*;
import java.time.OffsetDateTime;

@Entity
@Table(name = "episode_rating")
public class EpisodeRating {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "anime_id", nullable = false)
    private Long animeId;

    @Column(name = "episode_number", nullable = false)
    private int episodeNumber;

    @Column(nullable = false)
    private int score;

    @Column(columnDefinition = "TEXT")
    private String comment;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt = OffsetDateTime.now();

    protected EpisodeRating() {}

    public EpisodeRating(Long userId, Long animeId, int episodeNumber, int score, String comment) {
        this.userId = userId;
        this.animeId = animeId;
        this.episodeNumber = episodeNumber;
        this.score = score;
        this.comment = comment;
    }

    public void replace(int score, String comment) {
        this.score = score;
        this.comment = comment;
        this.updatedAt = OffsetDateTime.now();
    }

    public Long getId() { return id; }
    public Long getUserId() { return userId; }
    public Long getAnimeId() { return animeId; }
    public int getEpisodeNumber() { return episodeNumber; }
    public int getScore() { return score; }
    public String getComment() { return comment; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
}
```

- [ ] **Step 2: `EpisodeRatingRepository.java`**

```java
package com.animesquad.episode;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface EpisodeRatingRepository extends JpaRepository<EpisodeRating, Long> {
    Optional<EpisodeRating> findByUserIdAndAnimeIdAndEpisodeNumber(
        Long userId, Long animeId, int episodeNumber);

    List<EpisodeRating> findAllByUserIdAndAnimeIdOrderByEpisodeNumberAsc(
        Long userId, Long animeId);
}
```

- [ ] **Step 3: Compile**

```bash
./gradlew compileJava
```
Expected: BUILD SUCCESSFUL.

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/com/animesquad/episode/
git commit -m "feat(episode): add EpisodeRating entity + repo"
```

---

## Task 3: DTOs

**Files:**
- Create: `backend/src/main/java/com/animesquad/episode/dto/RateEpisodeRequest.java`
- Create: `backend/src/main/java/com/animesquad/episode/dto/EpisodeRatingResponse.java`

- [ ] **Step 1: `RateEpisodeRequest.java`**

```java
package com.animesquad.episode.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record RateEpisodeRequest(
    @NotNull @Min(1) @Max(10) Integer score,
    @Size(max = 280) String comment
) {}
```

- [ ] **Step 2: `EpisodeRatingResponse.java`**

```java
package com.animesquad.episode.dto;

import com.animesquad.episode.EpisodeRating;

import java.time.OffsetDateTime;

public record EpisodeRatingResponse(
    Long id,
    Long animeId,
    int episodeNumber,
    int score,
    String comment,
    OffsetDateTime createdAt,
    OffsetDateTime updatedAt
) {
    public static EpisodeRatingResponse from(EpisodeRating r) {
        return new EpisodeRatingResponse(
            r.getId(), r.getAnimeId(), r.getEpisodeNumber(),
            r.getScore(), r.getComment(),
            r.getCreatedAt(), r.getUpdatedAt());
    }
}
```

- [ ] **Step 3: Compile**

```bash
./gradlew compileJava
```
Expected: BUILD SUCCESSFUL.

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/com/animesquad/episode/dto/
git commit -m "feat(episode): add request/response DTOs"
```

---

## Task 4: `EpisodeRatingService` (TDD)

**Files:**
- Create: `backend/src/main/java/com/animesquad/episode/EpisodeRatingService.java`
- Test: `backend/src/test/java/com/animesquad/episode/EpisodeRatingServiceIT.java`
- Modify: `backend/src/test/java/com/animesquad/support/AbstractIntegrationTest.java`

`upsertRating` is the heart of this plan. Three observable behaviors:
1. New rating → inserted; existing rating → score+comment replaced.
2. Watch entry's `progress < ep` → bumped to `ep`. Higher progress → untouched.
3. No watch entry for `(user, anime)` → `IllegalArgumentException` (you can't rate an episode of something not on your list).

The service uses `WatchService.updateEntry` for the progress bump so watch business logic stays in one place.

- [ ] **Step 1: Add `episode_rating` to the truncate list**

In `AbstractIntegrationTest.java`, change `cleanDatabase` to:
```java
    @BeforeEach
    void cleanDatabase() {
        jdbc.execute("TRUNCATE TABLE episode_rating, watch_entry, membership, squad, anime, users RESTART IDENTITY CASCADE");
    }
```

- [ ] **Step 2: Write `EpisodeRatingServiceIT.java`**

```java
package com.animesquad.episode;

import com.animesquad.anime.AniListClient;
import com.animesquad.anime.AniListMedia;
import com.animesquad.anime.Anime;
import com.animesquad.anime.AnimeService;
import com.animesquad.support.AbstractIntegrationTest;
import com.animesquad.user.User;
import com.animesquad.user.UserService;
import com.animesquad.watch.WatchEntry;
import com.animesquad.watch.WatchEntryRepository;
import com.animesquad.watch.WatchService;
import com.animesquad.watch.WatchStatus;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.mock.mockito.MockBean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class EpisodeRatingServiceIT extends AbstractIntegrationTest {

    @Autowired EpisodeRatingService service;
    @Autowired EpisodeRatingRepository ratings;
    @Autowired AnimeService animeService;
    @Autowired WatchService watchService;
    @Autowired WatchEntryRepository watches;
    @Autowired UserService userService;
    @MockBean AniListClient aniList;

    private record Seeded(User user, Anime anime, WatchEntry entry) {}

    private Seeded seed(String suffix, int anilistId) {
        User u = userService.upsertFromGoogle("g-" + suffix, suffix + "@x.y", suffix.toUpperCase(), null);
        Anime a = animeService.upsertFromAniList(new AniListMedia(
            anilistId, "Romaji", "Native", "Eng", "img", 24, "FINISHED", "TV", 2024));
        WatchEntry e = watchService.addToList(u.getId(), anilistId, WatchStatus.WATCHING);
        return new Seeded(u, a, e);
    }

    @Test
    void upsert_insertsNewRating() {
        Seeded s = seed("e1", 1001);

        EpisodeRating r = service.upsertRating(s.user().getId(), s.anime().getId(), 3, 8, "good");

        assertThat(r.getId()).isNotNull();
        assertThat(r.getScore()).isEqualTo(8);
        assertThat(r.getComment()).isEqualTo("good");
        assertThat(ratings.findByUserIdAndAnimeIdAndEpisodeNumber(
            s.user().getId(), s.anime().getId(), 3)).isPresent();
    }

    @Test
    void upsert_replacesExisting() {
        Seeded s = seed("e2", 1002);
        service.upsertRating(s.user().getId(), s.anime().getId(), 5, 6, "ok");

        EpisodeRating updated = service.upsertRating(
            s.user().getId(), s.anime().getId(), 5, 9, null);

        assertThat(updated.getScore()).isEqualTo(9);
        assertThat(updated.getComment()).isNull();
        assertThat(ratings.count()).isEqualTo(1);
    }

    @Test
    void upsert_bumpsProgress_whenRatingPastCurrent() {
        Seeded s = seed("e3", 1003);
        // current progress = 0 (just added)

        service.upsertRating(s.user().getId(), s.anime().getId(), 4, 7, null);

        WatchEntry refreshed = watches.findById(s.entry().getId()).orElseThrow();
        assertThat(refreshed.getProgress()).isEqualTo(4);
    }

    @Test
    void upsert_keepsProgress_whenRatingBehindCurrent() {
        Seeded s = seed("e4", 1004);
        watchService.updateEntry(
            s.user().getId(), s.anime().getId(), null, 10, null, null);

        service.upsertRating(s.user().getId(), s.anime().getId(), 3, 7, null);

        WatchEntry refreshed = watches.findById(s.entry().getId()).orElseThrow();
        assertThat(refreshed.getProgress()).isEqualTo(10);
    }

    @Test
    void upsert_throws_whenUserHasNoWatchEntry() {
        User stranger = userService.upsertFromGoogle("g-stranger", "s@x.y", "S", null);
        Anime a = animeService.upsertFromAniList(new AniListMedia(
            1005, "R", "N", "E", "img", 12, "FINISHED", "TV", 2024));

        assertThatThrownBy(() -> service.upsertRating(stranger.getId(), a.getId(), 1, 5, null))
            .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void listForUserAnime_returnsRatings_inEpisodeOrder() {
        Seeded s = seed("e6", 1006);
        service.upsertRating(s.user().getId(), s.anime().getId(), 2, 7, null);
        service.upsertRating(s.user().getId(), s.anime().getId(), 1, 8, null);

        var all = service.listForUserAnime(s.user().getId(), s.anime().getId());

        assertThat(all).extracting(EpisodeRating::getEpisodeNumber).containsExactly(1, 2);
    }
}
```

- [ ] **Step 3: Run tests, expect failure**

```bash
./gradlew test --tests EpisodeRatingServiceIT
```
Expected: compile FAIL (`EpisodeRatingService` does not exist).

- [ ] **Step 4: Implement `EpisodeRatingService.java`**

```java
package com.animesquad.episode;

import com.animesquad.watch.WatchEntry;
import com.animesquad.watch.WatchEntryRepository;
import com.animesquad.watch.WatchService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class EpisodeRatingService {

    private final EpisodeRatingRepository ratings;
    private final WatchEntryRepository watches;
    private final WatchService watchService;

    public EpisodeRatingService(EpisodeRatingRepository ratings,
                                WatchEntryRepository watches,
                                WatchService watchService) {
        this.ratings = ratings;
        this.watches = watches;
        this.watchService = watchService;
    }

    @Transactional
    public EpisodeRating upsertRating(Long userId, Long animeId,
                                      int episodeNumber, int score, String comment) {
        WatchEntry entry = watches.findByUserIdAndAnimeId(userId, animeId)
            .orElseThrow(() -> new IllegalArgumentException(
                "watch entry not found — add the anime to your list first"));

        EpisodeRating rating = ratings.findByUserIdAndAnimeIdAndEpisodeNumber(
                userId, animeId, episodeNumber)
            .map(existing -> { existing.replace(score, comment); return existing; })
            .orElseGet(() -> ratings.save(
                new EpisodeRating(userId, animeId, episodeNumber, score, comment)));

        if (entry.getProgress() < episodeNumber) {
            watchService.updateEntry(userId, animeId, null, episodeNumber, null, null);
        }

        return rating;
    }

    @Transactional(readOnly = true)
    public List<EpisodeRating> listForUserAnime(Long userId, Long animeId) {
        return ratings.findAllByUserIdAndAnimeIdOrderByEpisodeNumberAsc(userId, animeId);
    }
}
```

- [ ] **Step 5: Run tests, expect pass**

```bash
./gradlew test --tests EpisodeRatingServiceIT
```
Expected: PASS (all six tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/animesquad/episode/EpisodeRatingService.java \
        backend/src/test/java/com/animesquad/episode/EpisodeRatingServiceIT.java \
        backend/src/test/java/com/animesquad/support/AbstractIntegrationTest.java
git commit -m "feat(episode): EpisodeRatingService — upsert + auto progress bump"
```

---

## Task 5: `EpisodeRatingController` (TDD)

**Files:**
- Create: `backend/src/main/java/com/animesquad/episode/EpisodeRatingController.java`
- Test: `backend/src/test/java/com/animesquad/episode/EpisodeRatingControllerIT.java`

Endpoints:
- `PUT  /api/watch/{animeId}/episodes/{ep}` body `{score, comment?}` → 200 `EpisodeRatingResponse`
- `GET  /api/watch/{animeId}/episodes` → `EpisodeRatingResponse[]`

The `TestRestTemplate` PATCH fix from Plan 4 doesn't apply here (PUT is supported by the default factory) — no extra setup needed.

- [ ] **Step 1: Write the failing IT**

`EpisodeRatingControllerIT.java`:
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
class EpisodeRatingControllerIT extends AbstractIntegrationTest {

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

    private record Setup(Long userId, Long animeId) {}

    private Setup seed(String suffix, int anilistId) {
        User u = userService.upsertFromGoogle("g-" + suffix, suffix + "@x.y", suffix.toUpperCase(), null);
        Anime a = animeService.upsertFromAniList(new AniListMedia(
            anilistId, "Romaji", "Native", "Eng", "img", 24, "FINISHED", "TV", 2024));
        watchService.addToList(u.getId(), anilistId, WatchStatus.WATCHING);
        return new Setup(u.getId(), a.getId());
    }

    @Test
    void put_createsRating_andGetReturnsIt() {
        Setup s = seed("ec1", 2001);

        ResponseEntity<Map> put = rest.exchange(
            url("/api/watch/" + s.animeId() + "/episodes/3"), HttpMethod.PUT,
            new HttpEntity<>(Map.of("score", 8, "comment", "굿"), cookieFor(s.userId())),
            Map.class);

        assertThat(put.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(put.getBody().get("episodeNumber")).isEqualTo(3);
        assertThat(put.getBody().get("score")).isEqualTo(8);

        ResponseEntity<Map[]> list = rest.exchange(
            url("/api/watch/" + s.animeId() + "/episodes"), HttpMethod.GET,
            new HttpEntity<>(cookieFor(s.userId())), Map[].class);

        assertThat(list.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(list.getBody()).hasSize(1);
        assertThat(list.getBody()[0].get("episodeNumber")).isEqualTo(3);
    }

    @Test
    void put_returns400_whenScoreOutOfRange() {
        Setup s = seed("ec2", 2002);

        ResponseEntity<String> res = rest.exchange(
            url("/api/watch/" + s.animeId() + "/episodes/1"), HttpMethod.PUT,
            new HttpEntity<>(Map.of("score", 11), cookieFor(s.userId())), String.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void put_returns400_whenUserHasNoWatchEntry() {
        User stranger = userService.upsertFromGoogle("g-ec3", "ec3@x.y", "EC3", null);
        Anime a = animeService.upsertFromAniList(new AniListMedia(
            2003, "R", "N", "E", "img", 12, "FINISHED", "TV", 2024));

        ResponseEntity<String> res = rest.exchange(
            url("/api/watch/" + a.getId() + "/episodes/1"), HttpMethod.PUT,
            new HttpEntity<>(Map.of("score", 7), cookieFor(stranger.getId())), String.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void put_returns401_whenUnauthenticated() {
        ResponseEntity<String> res = rest.exchange(
            url("/api/watch/1/episodes/1"), HttpMethod.PUT,
            new HttpEntity<>("{\"score\":5}", jsonHeaders()), String.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    private HttpHeaders jsonHeaders() {
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_JSON);
        return h;
    }
}
```

- [ ] **Step 2: Run test, expect failure**

```bash
./gradlew test --tests EpisodeRatingControllerIT
```
Expected: FAIL — controller missing.

- [ ] **Step 3: Implement `EpisodeRatingController.java`**

```java
package com.animesquad.episode;

import com.animesquad.auth.CurrentUser;
import com.animesquad.episode.dto.EpisodeRatingResponse;
import com.animesquad.episode.dto.RateEpisodeRequest;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/watch/{animeId}/episodes")
public class EpisodeRatingController {

    private final EpisodeRatingService service;

    public EpisodeRatingController(EpisodeRatingService service) {
        this.service = service;
    }

    @PutMapping("/{ep}")
    public EpisodeRatingResponse rate(
        @AuthenticationPrincipal CurrentUser me,
        @PathVariable Long animeId,
        @PathVariable("ep") int episodeNumber,
        @Valid @RequestBody RateEpisodeRequest req
    ) {
        EpisodeRating r = service.upsertRating(
            me.userId(), animeId, episodeNumber, req.score(), req.comment());
        return EpisodeRatingResponse.from(r);
    }

    @GetMapping
    public List<EpisodeRatingResponse> list(
        @AuthenticationPrincipal CurrentUser me,
        @PathVariable Long animeId
    ) {
        return service.listForUserAnime(me.userId(), animeId).stream()
            .map(EpisodeRatingResponse::from).toList();
    }
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
./gradlew test --tests EpisodeRatingControllerIT
```
Expected: PASS (all four tests).

- [ ] **Step 5: Run full backend suite**

```bash
./gradlew test
```
Expected: ALL PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/animesquad/episode/EpisodeRatingController.java \
        backend/src/test/java/com/animesquad/episode/EpisodeRatingControllerIT.java
git commit -m "feat(episode): PUT/GET /api/watch/{animeId}/episodes endpoints"
```

---

## Task 6: Manual smoke test

**No code — verification only.**

Confirms the auto progress bump works against a real DB.

- [ ] **Step 1: Start backend + Postgres**

```bash
cd backend
set -a; source .env.local; set +a
docker compose up -d
./gradlew bootRun
```

- [ ] **Step 2: Capture session cookie**

In the browser: log in at `http://localhost:3000`, then open devtools → Application → Cookies → copy `ASQ_SESSION`.

- [ ] **Step 3: Add an anime to your list**

If you don't already have an entry on `/my/list`, add one via `/anime/search` (Plan 4 flow) — pick anything in `WATCHING`. Find its internal `anime.id`:

```bash
COOKIE='ASQ_SESSION=<paste value>'
curl -sS -H "Cookie: $COOKIE" http://localhost:8080/api/watch | jq '.[0] | {animeId: .anime.id, progress, title: .anime.titleRomaji}'
```

Note the `animeId` and current `progress` (likely `0`).

- [ ] **Step 4: Rate episode 5**

```bash
curl -sS -X PUT -H "Cookie: $COOKIE" -H "content-type: application/json" \
  -d '{"score": 9, "comment": "최고였어요"}' \
  http://localhost:8080/api/watch/<animeId>/episodes/5 | jq
```
Expected: 200 with `{episodeNumber: 5, score: 9, comment: "최고였어요", ...}`.

- [ ] **Step 5: Confirm progress bumped + rating shows up in list**

```bash
curl -sS -H "Cookie: $COOKIE" http://localhost:8080/api/watch | jq '.[0] | {progress}'
curl -sS -H "Cookie: $COOKIE" http://localhost:8080/api/watch/<animeId>/episodes | jq
```
Expected: progress is `5`; the list has one rating for episode 5.

- [ ] **Step 6: Replace the rating (PUT semantics)**

```bash
curl -sS -X PUT -H "Cookie: $COOKIE" -H "content-type: application/json" \
  -d '{"score": 7}' \
  http://localhost:8080/api/watch/<animeId>/episodes/5 | jq
```
Expected: `score: 7`, `comment: null` (PUT replaces).

- [ ] **Step 7: Reject out-of-range score**

```bash
curl -sS -o /dev/null -w "%{http_code}\n" -X PUT \
  -H "Cookie: $COOKIE" -H "content-type: application/json" \
  -d '{"score": 99}' \
  http://localhost:8080/api/watch/<animeId>/episodes/5
```
Expected: `400`.

- [ ] **Step 8: Update changelog**

```bash
cat >> CHANGELOG.md <<'EOF'

## Plan 5 — 2026-06-12
- `episode_rating` table (V5)
- `PUT /api/watch/{animeId}/episodes/{ep}` (upsert, replace semantics)
- `GET /api/watch/{animeId}/episodes`
- Auto progress bump: rating episode N when current progress < N moves progress to N
EOF
git add CHANGELOG.md
git commit -m "docs: changelog for plan 5"
```

---

## Verification Checklist (Definition of Done)

- [ ] `cd backend && ./gradlew test` — green (Plans 1–4 tests + `EpisodeRatingServiceIT`, `EpisodeRatingControllerIT`)
- [ ] Manual smoke test (Task 6) executed
- [ ] CHANGELOG.md has a Plan 5 section

## Out of Scope for Plan 5 (covered later)

- Frontend UI for rating episodes (Plan 7 polish — likely as an inline expander on `/my/list` rows)
- `ActivityEvent`s for `EPISODE_RATED` and the `PROGRESS_UPDATED` bump (Plan 6 — activity module)
- Squad-wide visibility of another member's episode ratings (later plan, with the member profile page)
- Episode rating delete endpoint
- Bulk rating endpoint (rate episodes 1..N in one call)
