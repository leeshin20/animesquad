# Plan 4 — Watch entries + search/list UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Authenticated users can add an anime to their personal list, see all their entries, and update progress / status / score / comment. Frontend gets `/anime/search` (with "Add to my list") and `/my/list` (with inline edits).

**Architecture:** `POST /api/watch {anilistId, status}` looks up the anime in our cache first, falling back to a per-ID AniList fetch (the search endpoint already covers the common case). `WatchService` owns the watch_entry table. `UPDATE`s come in as `PATCH /api/watch/{animeId}` with optional fields (PATCH semantics — only present fields change). The frontend pages use simple form state — no global store yet.

**Tech Stack:** Spring Boot 3.3.5, Spring Web (RestClient), Spring Data JPA, Flyway, Bean Validation, JUnit 5, Mockito, Next.js 14 (client components).

---

## File Structure

**Backend — created**
- `backend/src/main/resources/db/migration/V4__watch_entry.sql`
- `backend/src/main/java/com/animesquad/watch/WatchEntry.java`
- `backend/src/main/java/com/animesquad/watch/WatchStatus.java`
- `backend/src/main/java/com/animesquad/watch/WatchEntryRepository.java`
- `backend/src/main/java/com/animesquad/watch/WatchService.java`
- `backend/src/main/java/com/animesquad/watch/WatchController.java`
- `backend/src/main/java/com/animesquad/watch/dto/AddWatchRequest.java`
- `backend/src/main/java/com/animesquad/watch/dto/UpdateWatchRequest.java`
- `backend/src/main/java/com/animesquad/watch/dto/WatchEntryResponse.java`
- `backend/src/main/java/com/animesquad/anime/dto/AnimeResponse.java`

**Backend — modified**
- `backend/src/main/java/com/animesquad/anime/AniListClient.java` — add `fetchById`
- `backend/src/main/java/com/animesquad/anime/AniListClientImpl.java` — implement `fetchById`
- `backend/src/main/java/com/animesquad/anime/AnimeService.java` — add `findOrFetchByAnilistId`
- `backend/src/test/java/com/animesquad/anime/AnimeServiceIT.java` — cover fetch fallback
- `backend/src/test/java/com/animesquad/support/AbstractIntegrationTest.java` — truncate `watch_entry`

**Backend — tests**
- `backend/src/test/java/com/animesquad/watch/WatchServiceIT.java`
- `backend/src/test/java/com/animesquad/watch/WatchControllerIT.java`

**Frontend — modified**
- `frontend/src/app/lib/api.ts` — add `apiPatch`, watch/search types

**Frontend — created**
- `frontend/src/app/anime/search/page.tsx`
- `frontend/src/app/my/list/page.tsx`

`AnimeResponse` lives under `com.animesquad.anime.dto` because `WatchEntryResponse` embeds it — the anime package owns the shape, the watch package consumes it.

---

## Task 1: `AniListClient.fetchById` + `AnimeService.findOrFetchByAnilistId`

**Files:**
- Modify: `backend/src/main/java/com/animesquad/anime/AniListClient.java`
- Modify: `backend/src/main/java/com/animesquad/anime/AniListClientImpl.java`
- Modify: `backend/src/main/java/com/animesquad/anime/AnimeService.java`
- Modify: `backend/src/test/java/com/animesquad/anime/AnimeServiceIT.java`

The watch flow needs to resolve an `anilistId` even when the user adds an anime that isn't in cache yet (e.g. pasted from a friend's screen). `findOrFetchByAnilistId` checks cache first, falls back to a network fetch + cache write.

- [ ] **Step 1: Extend `AnimeServiceIT.java`** — wire a `@MockBean` and add two failing tests

Replace the file with:
```java
package com.animesquad.anime;

import com.animesquad.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.mock.mockito.MockBean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class AnimeServiceIT extends AbstractIntegrationTest {

    @Autowired AnimeService animeService;
    @Autowired AnimeRepository animes;
    @MockBean AniListClient aniList;

    private AniListMedia media(int id, String romaji) {
        return new AniListMedia(id, romaji, "ネイティブ", "Eng", "img", 12, "FINISHED", "TV", 2024);
    }

    @Test
    void upsert_inserts_whenNewAnilistId() {
        Anime saved = animeService.upsertFromAniList(media(101, "Frieren"));

        assertThat(saved.getId()).isNotNull();
        assertThat(saved.getAnilistId()).isEqualTo(101);
        assertThat(saved.getTitleRomaji()).isEqualTo("Frieren");
        assertThat(animes.findByAnilistId(101)).isPresent();
    }

    @Test
    void upsert_refreshes_whenExisting() {
        animeService.upsertFromAniList(media(202, "Old"));
        Anime updated = animeService.upsertFromAniList(media(202, "New"));

        assertThat(updated.getTitleRomaji()).isEqualTo("New");
        assertThat(animes.count()).isEqualTo(1);
    }

    @Test
    void findOrFetch_returnsCached_withoutHittingAniList() {
        animeService.upsertFromAniList(media(303, "Cached"));

        Anime result = animeService.findOrFetchByAnilistId(303);

        assertThat(result.getTitleRomaji()).isEqualTo("Cached");
        verifyNoInteractions(aniList);
    }

    @Test
    void findOrFetch_fetchesAndUpserts_whenMissing() {
        when(aniList.fetchById(eq(404))).thenReturn(media(404, "Remote"));

        Anime result = animeService.findOrFetchByAnilistId(404);

        assertThat(result.getId()).isNotNull();
        assertThat(result.getTitleRomaji()).isEqualTo("Remote");
        assertThat(animes.findByAnilistId(404)).isPresent();
        verify(aniList).fetchById(404);
    }

    @Test
    void findOrFetch_throws_whenAniListReturnsNothing() {
        when(aniList.fetchById(eq(999))).thenReturn(null);

        assertThatThrownBy(() -> animeService.findOrFetchByAnilistId(999))
            .isInstanceOf(IllegalArgumentException.class);
    }
}
```

- [ ] **Step 2: Run tests, expect failure**

```bash
cd backend && ./gradlew test --tests AnimeServiceIT
```
Expected: compile FAIL — `fetchById` and `findOrFetchByAnilistId` don't exist yet.

- [ ] **Step 3: Extend `AniListClient.java`**

Replace contents:
```java
package com.animesquad.anime;

import java.util.List;

public interface AniListClient {
    List<AniListMedia> search(String query);
    AniListMedia fetchById(int anilistId);
}
```

- [ ] **Step 4: Extend `AniListClientImpl.java`**

Add the new query constant near `QUERY`, the method, and a small refactor so `toMedia` is reused. Replace the whole file:
```java
package com.animesquad.anime;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.Map;

@Component
public class AniListClientImpl implements AniListClient {

    private static final String SEARCH_QUERY = """
        query ($q: String) {
          Page(perPage: 20) {
            media(search: $q, type: ANIME) {
              id
              title { romaji native english }
              coverImage { large }
              episodes
              status
              format
              seasonYear
            }
          }
        }
        """;

    private static final String BY_ID_QUERY = """
        query ($id: Int) {
          Media(id: $id, type: ANIME) {
            id
            title { romaji native english }
            coverImage { large }
            episodes
            status
            format
            seasonYear
          }
        }
        """;

    private final RestClient client;

    public AniListClientImpl(@Value("${app.anilist.url}") String url) {
        this.client = RestClient.builder().baseUrl(url).build();
    }

    @Override
    public List<AniListMedia> search(String query) {
        Map<?, ?> resp = post(SEARCH_QUERY, Map.of("q", query));
        if (resp == null) return List.of();
        Map<?, ?> data = (Map<?, ?>) resp.get("data");
        if (data == null) return List.of();
        Map<?, ?> page = (Map<?, ?>) data.get("Page");
        if (page == null) return List.of();
        List<?> media = (List<?>) page.get("media");
        if (media == null) return List.of();
        return media.stream().map(this::toMedia).toList();
    }

    @Override
    public AniListMedia fetchById(int anilistId) {
        Map<?, ?> resp = post(BY_ID_QUERY, Map.of("id", anilistId));
        if (resp == null) return null;
        Map<?, ?> data = (Map<?, ?>) resp.get("data");
        if (data == null) return null;
        Object media = data.get("Media");
        if (media == null) return null;
        return toMedia(media);
    }

    private Map<?, ?> post(String query, Map<String, Object> variables) {
        return client.post()
            .body(Map.of("query", query, "variables", variables))
            .retrieve()
            .body(Map.class);
    }

    @SuppressWarnings("unchecked")
    private AniListMedia toMedia(Object raw) {
        Map<String, Object> m = (Map<String, Object>) raw;
        Map<String, Object> title = (Map<String, Object>) m.get("title");
        Map<String, Object> cover = (Map<String, Object>) m.get("coverImage");
        return new AniListMedia(
            ((Number) m.get("id")).intValue(),
            (String) title.get("romaji"),
            (String) title.get("native"),
            (String) title.get("english"),
            cover != null ? (String) cover.get("large") : null,
            m.get("episodes") == null ? null : ((Number) m.get("episodes")).intValue(),
            (String) m.get("status"),
            (String) m.get("format"),
            m.get("seasonYear") == null ? null : ((Number) m.get("seasonYear")).intValue()
        );
    }
}
```

- [ ] **Step 5: Extend `AnimeService.java`**

Replace the whole file:
```java
package com.animesquad.anime;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AnimeService {

    private final AnimeRepository animes;
    private final AniListClient aniList;

    public AnimeService(AnimeRepository animes, AniListClient aniList) {
        this.animes = animes;
        this.aniList = aniList;
    }

    @Transactional
    public Anime upsertFromAniList(AniListMedia m) {
        return animes.findByAnilistId(m.anilistId())
            .map(existing -> {
                existing.refreshFrom(m.titleRomaji(), m.titleNative(), m.titleEnglish(),
                    m.coverImageUrl(), m.episodes(), m.status(), m.format(), m.seasonYear());
                return existing;
            })
            .orElseGet(() -> animes.save(new Anime(
                m.anilistId(), m.titleRomaji(), m.titleNative(), m.titleEnglish(),
                m.coverImageUrl(), m.episodes(), m.status(), m.format(), m.seasonYear())));
    }

    @Transactional
    public Anime findOrFetchByAnilistId(int anilistId) {
        return animes.findByAnilistId(anilistId).orElseGet(() -> {
            AniListMedia m = aniList.fetchById(anilistId);
            if (m == null) {
                throw new IllegalArgumentException("anime not found on AniList: " + anilistId);
            }
            return upsertFromAniList(m);
        });
    }
}
```

- [ ] **Step 6: Run tests, expect pass**

```bash
./gradlew test --tests AnimeServiceIT
```
Expected: PASS (all five tests).

- [ ] **Step 7: Run full suite**

```bash
./gradlew test
```
Expected: ALL PASS (the existing `AnimeControllerIT` already mocks `AniListClient` so it's unaffected).

- [ ] **Step 8: Commit**

```bash
git add backend/src/main/java/com/animesquad/anime/ \
        backend/src/test/java/com/animesquad/anime/AnimeServiceIT.java
git commit -m "feat(anime): AniList.fetchById + AnimeService.findOrFetchByAnilistId"
```

---

## Task 2: Flyway V4 — `watch_entry` table

**Files:**
- Create: `backend/src/main/resources/db/migration/V4__watch_entry.sql`

- [ ] **Step 1: Write the migration**

```sql
CREATE TABLE watch_entry (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT      NOT NULL REFERENCES users(id),
    anime_id    BIGINT      NOT NULL REFERENCES anime(id),
    status      VARCHAR(20) NOT NULL,
    progress    INT         NOT NULL DEFAULT 0,
    score       SMALLINT,
    comment     TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, anime_id),
    CHECK (progress >= 0),
    CHECK (score IS NULL OR (score BETWEEN 1 AND 10))
);

CREATE INDEX idx_watch_entry_user ON watch_entry(user_id);
```

- [ ] **Step 2: Verify Flyway applies cleanly**

```bash
cd backend && ./gradlew test --tests "*UserServiceIT*"
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/resources/db/migration/V4__watch_entry.sql
git commit -m "feat(db): add watch_entry table (V4)"
```

---

## Task 3: `WatchStatus` enum + `WatchEntry` entity + repository

**Files:**
- Create: `backend/src/main/java/com/animesquad/watch/WatchStatus.java`
- Create: `backend/src/main/java/com/animesquad/watch/WatchEntry.java`
- Create: `backend/src/main/java/com/animesquad/watch/WatchEntryRepository.java`

- [ ] **Step 1: `WatchStatus.java`**

```java
package com.animesquad.watch;

public enum WatchStatus {
    WATCHING, COMPLETED, ON_HOLD, DROPPED, PLAN_TO_WATCH
}
```

- [ ] **Step 2: `WatchEntry.java`**

```java
package com.animesquad.watch;

import jakarta.persistence.*;
import java.time.OffsetDateTime;

@Entity
@Table(name = "watch_entry")
public class WatchEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "anime_id", nullable = false)
    private Long animeId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private WatchStatus status;

    @Column(nullable = false)
    private int progress = 0;

    @Column
    private Integer score;

    @Column(columnDefinition = "TEXT")
    private String comment;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt = OffsetDateTime.now();

    protected WatchEntry() {}

    public WatchEntry(Long userId, Long animeId, WatchStatus status) {
        this.userId = userId;
        this.animeId = animeId;
        this.status = status;
    }

    public void apply(WatchStatus status, Integer progress, Integer score, String comment) {
        if (status != null) this.status = status;
        if (progress != null) this.progress = progress;
        if (score != null) this.score = score;
        if (comment != null) this.comment = comment;
        this.updatedAt = OffsetDateTime.now();
    }

    public Long getId() { return id; }
    public Long getUserId() { return userId; }
    public Long getAnimeId() { return animeId; }
    public WatchStatus getStatus() { return status; }
    public int getProgress() { return progress; }
    public Integer getScore() { return score; }
    public String getComment() { return comment; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
}
```

- [ ] **Step 3: `WatchEntryRepository.java`**

```java
package com.animesquad.watch;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface WatchEntryRepository extends JpaRepository<WatchEntry, Long> {
    List<WatchEntry> findAllByUserIdOrderByUpdatedAtDesc(Long userId);
    Optional<WatchEntry> findByUserIdAndAnimeId(Long userId, Long animeId);
}
```

- [ ] **Step 4: Compile**

```bash
./gradlew compileJava
```
Expected: BUILD SUCCESSFUL.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/animesquad/watch/
git commit -m "feat(watch): add WatchEntry entity + repo"
```

---

## Task 4: DTOs + `AnimeResponse`

**Files:**
- Create: `backend/src/main/java/com/animesquad/anime/dto/AnimeResponse.java`
- Create: `backend/src/main/java/com/animesquad/watch/dto/AddWatchRequest.java`
- Create: `backend/src/main/java/com/animesquad/watch/dto/UpdateWatchRequest.java`
- Create: `backend/src/main/java/com/animesquad/watch/dto/WatchEntryResponse.java`

- [ ] **Step 1: `AnimeResponse.java`**

```java
package com.animesquad.anime.dto;

import com.animesquad.anime.Anime;

public record AnimeResponse(
    Long id,
    Integer anilistId,
    String titleRomaji,
    String titleNative,
    String titleEnglish,
    String coverImageUrl,
    Integer episodes,
    String status,
    String format,
    Integer seasonYear
) {
    public static AnimeResponse from(Anime a) {
        return new AnimeResponse(
            a.getId(), a.getAnilistId(),
            a.getTitleRomaji(), a.getTitleNative(), a.getTitleEnglish(),
            a.getCoverImageUrl(), a.getEpisodes(),
            a.getStatus(), a.getFormat(), a.getSeasonYear()
        );
    }
}
```

- [ ] **Step 2: `AddWatchRequest.java`**

```java
package com.animesquad.watch.dto;

import com.animesquad.watch.WatchStatus;
import jakarta.validation.constraints.NotNull;

public record AddWatchRequest(
    @NotNull Integer anilistId,
    @NotNull WatchStatus status
) {}
```

- [ ] **Step 3: `UpdateWatchRequest.java`**

```java
package com.animesquad.watch.dto;

import com.animesquad.watch.WatchStatus;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

public record UpdateWatchRequest(
    WatchStatus status,
    @PositiveOrZero Integer progress,
    @Min(1) @Max(10) Integer score,
    @Size(max = 280) String comment
) {}
```

- [ ] **Step 4: `WatchEntryResponse.java`**

```java
package com.animesquad.watch.dto;

import com.animesquad.anime.Anime;
import com.animesquad.anime.dto.AnimeResponse;
import com.animesquad.watch.WatchEntry;
import com.animesquad.watch.WatchStatus;

import java.time.OffsetDateTime;

public record WatchEntryResponse(
    Long id,
    AnimeResponse anime,
    WatchStatus status,
    int progress,
    Integer score,
    String comment,
    OffsetDateTime createdAt,
    OffsetDateTime updatedAt
) {
    public static WatchEntryResponse from(WatchEntry e, Anime a) {
        return new WatchEntryResponse(
            e.getId(), AnimeResponse.from(a),
            e.getStatus(), e.getProgress(), e.getScore(), e.getComment(),
            e.getCreatedAt(), e.getUpdatedAt()
        );
    }
}
```

- [ ] **Step 5: Compile**

```bash
./gradlew compileJava
```
Expected: BUILD SUCCESSFUL.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/animesquad/anime/dto/ \
        backend/src/main/java/com/animesquad/watch/dto/
git commit -m "feat(watch): add DTOs (AddWatch, UpdateWatch, WatchEntryResponse, AnimeResponse)"
```

---

## Task 5: `WatchService` (TDD)

**Files:**
- Create: `backend/src/main/java/com/animesquad/watch/WatchService.java`
- Test: `backend/src/test/java/com/animesquad/watch/WatchServiceIT.java`
- Modify: `backend/src/test/java/com/animesquad/support/AbstractIntegrationTest.java`

`WatchService` has three jobs: `addToList` (resolves anime, idempotent on (user, anime)), `listMine`, `updateEntry` (PATCH semantics — null fields ignored).

- [ ] **Step 1: Add `watch_entry` to the truncate list**

In `AbstractIntegrationTest.java`, change `cleanDatabase` to:
```java
    @BeforeEach
    void cleanDatabase() {
        jdbc.execute("TRUNCATE TABLE watch_entry, membership, squad, anime, users RESTART IDENTITY CASCADE");
    }
```

- [ ] **Step 2: Write `WatchServiceIT.java`**

```java
package com.animesquad.watch;

import com.animesquad.anime.AniListClient;
import com.animesquad.anime.AniListMedia;
import com.animesquad.anime.AnimeService;
import com.animesquad.support.AbstractIntegrationTest;
import com.animesquad.user.User;
import com.animesquad.user.UserService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.mock.mockito.MockBean;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

class WatchServiceIT extends AbstractIntegrationTest {

    @Autowired WatchService watchService;
    @Autowired WatchEntryRepository watches;
    @Autowired AnimeService animeService;
    @Autowired UserService userService;
    @MockBean AniListClient aniList;

    private AniListMedia media(int id) {
        return new AniListMedia(id, "Romaji" + id, "Native", "Eng", "img", 12, "FINISHED", "TV", 2024);
    }

    @Test
    void addToList_resolvesAnimeFromCache_andCreatesEntry() {
        User me = userService.upsertFromGoogle("g-w1", "w1@x.y", "W1", null);
        animeService.upsertFromAniList(media(10));

        WatchEntry e = watchService.addToList(me.getId(), 10, WatchStatus.PLAN_TO_WATCH);

        assertThat(e.getId()).isNotNull();
        assertThat(e.getStatus()).isEqualTo(WatchStatus.PLAN_TO_WATCH);
        assertThat(e.getProgress()).isZero();
    }

    @Test
    void addToList_fetchesFromAniList_whenNotCached() {
        User me = userService.upsertFromGoogle("g-w2", "w2@x.y", "W2", null);
        when(aniList.fetchById(eq(20))).thenReturn(media(20));

        WatchEntry e = watchService.addToList(me.getId(), 20, WatchStatus.WATCHING);

        assertThat(e.getStatus()).isEqualTo(WatchStatus.WATCHING);
        assertThat(watches.findAllByUserIdOrderByUpdatedAtDesc(me.getId())).hasSize(1);
    }

    @Test
    void addToList_isIdempotent_perUserAnime() {
        User me = userService.upsertFromGoogle("g-w3", "w3@x.y", "W3", null);
        animeService.upsertFromAniList(media(30));

        WatchEntry first = watchService.addToList(me.getId(), 30, WatchStatus.WATCHING);
        WatchEntry second = watchService.addToList(me.getId(), 30, WatchStatus.PLAN_TO_WATCH);

        assertThat(second.getId()).isEqualTo(first.getId());
        // second add does NOT overwrite an existing status — explicit PATCH does that
        assertThat(second.getStatus()).isEqualTo(WatchStatus.WATCHING);
    }

    @Test
    void updateEntry_appliesOnlyProvidedFields() {
        User me = userService.upsertFromGoogle("g-w4", "w4@x.y", "W4", null);
        animeService.upsertFromAniList(media(40));
        WatchEntry created = watchService.addToList(me.getId(), 40, WatchStatus.WATCHING);

        WatchEntry updated = watchService.updateEntry(
            me.getId(), created.getAnimeId(),
            WatchStatus.COMPLETED, 12, 9, "재밌었어요");

        assertThat(updated.getStatus()).isEqualTo(WatchStatus.COMPLETED);
        assertThat(updated.getProgress()).isEqualTo(12);
        assertThat(updated.getScore()).isEqualTo(9);
        assertThat(updated.getComment()).isEqualTo("재밌었어요");
    }

    @Test
    void updateEntry_ignoresNullFields() {
        User me = userService.upsertFromGoogle("g-w5", "w5@x.y", "W5", null);
        animeService.upsertFromAniList(media(50));
        WatchEntry created = watchService.addToList(me.getId(), 50, WatchStatus.WATCHING);
        watchService.updateEntry(me.getId(), created.getAnimeId(), null, 5, null, null);

        WatchEntry after = watches.findByUserIdAndAnimeId(me.getId(), created.getAnimeId()).orElseThrow();
        assertThat(after.getStatus()).isEqualTo(WatchStatus.WATCHING); // unchanged
        assertThat(after.getProgress()).isEqualTo(5);
        assertThat(after.getScore()).isNull();
    }

    @Test
    void updateEntry_throws_whenEntryMissing() {
        User me = userService.upsertFromGoogle("g-w6", "w6@x.y", "W6", null);
        animeService.upsertFromAniList(media(60));

        assertThatThrownBy(() -> watchService.updateEntry(
            me.getId(), 999L, WatchStatus.COMPLETED, null, null, null))
            .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void listMine_returnsOnlyMyEntries() {
        User me = userService.upsertFromGoogle("g-w7", "w7@x.y", "W7", null);
        User other = userService.upsertFromGoogle("g-w7b", "w7b@x.y", "W7B", null);
        animeService.upsertFromAniList(media(70));
        animeService.upsertFromAniList(media(71));
        watchService.addToList(me.getId(), 70, WatchStatus.WATCHING);
        watchService.addToList(other.getId(), 71, WatchStatus.COMPLETED);

        List<WatchEntry> mine = watchService.listMine(me.getId());

        assertThat(mine).hasSize(1);
        assertThat(mine.get(0).getUserId()).isEqualTo(me.getId());
    }
}
```

- [ ] **Step 3: Run, expect failure**

```bash
./gradlew test --tests WatchServiceIT
```
Expected: compile FAIL (no `WatchService`).

- [ ] **Step 4: Implement `WatchService.java`**

```java
package com.animesquad.watch;

import com.animesquad.anime.Anime;
import com.animesquad.anime.AnimeService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class WatchService {

    private final WatchEntryRepository entries;
    private final AnimeService animeService;

    public WatchService(WatchEntryRepository entries, AnimeService animeService) {
        this.entries = entries;
        this.animeService = animeService;
    }

    @Transactional
    public WatchEntry addToList(Long userId, int anilistId, WatchStatus status) {
        Anime anime = animeService.findOrFetchByAnilistId(anilistId);
        return entries.findByUserIdAndAnimeId(userId, anime.getId())
            .orElseGet(() -> entries.save(new WatchEntry(userId, anime.getId(), status)));
    }

    @Transactional
    public WatchEntry updateEntry(Long userId, Long animeId,
                                  WatchStatus status, Integer progress,
                                  Integer score, String comment) {
        WatchEntry e = entries.findByUserIdAndAnimeId(userId, animeId)
            .orElseThrow(() -> new IllegalArgumentException("watch entry not found"));
        e.apply(status, progress, score, comment);
        return e;
    }

    @Transactional(readOnly = true)
    public List<WatchEntry> listMine(Long userId) {
        return entries.findAllByUserIdOrderByUpdatedAtDesc(userId);
    }
}
```

- [ ] **Step 5: Run tests, expect pass**

```bash
./gradlew test --tests WatchServiceIT
```
Expected: PASS (all seven tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/animesquad/watch/WatchService.java \
        backend/src/test/java/com/animesquad/watch/WatchServiceIT.java \
        backend/src/test/java/com/animesquad/support/AbstractIntegrationTest.java
git commit -m "feat(watch): WatchService — addToList / updateEntry / listMine"
```

---

## Task 6: `WatchController` (TDD)

**Files:**
- Create: `backend/src/main/java/com/animesquad/watch/WatchController.java`
- Test: `backend/src/test/java/com/animesquad/watch/WatchControllerIT.java`

Endpoints (all require auth via the JWT cookie):
- `POST /api/watch` — body `{anilistId, status}` → 201 `WatchEntryResponse`
- `GET /api/watch` → `WatchEntryResponse[]`
- `PATCH /api/watch/{animeId}` — body any of `{status, progress, score, comment}` → 200 `WatchEntryResponse`

`animeId` in the path is the internal `anime.id`, not `anilist_id`. The frontend gets it back in every `WatchEntryResponse`.

- [ ] **Step 1: Write the failing IT**

`WatchControllerIT.java`:
```java
package com.animesquad.watch;

import com.animesquad.anime.AniListClient;
import com.animesquad.anime.AniListMedia;
import com.animesquad.anime.AnimeService;
import com.animesquad.auth.JwtAuthenticationFilter;
import com.animesquad.auth.JwtService;
import com.animesquad.support.AbstractIntegrationTest;
import com.animesquad.user.User;
import com.animesquad.user.UserService;
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
class WatchControllerIT extends AbstractIntegrationTest {

    @Autowired UserService userService;
    @Autowired JwtService jwtService;
    @Autowired AnimeService animeService;
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

    private void seedAnime(int anilistId) {
        animeService.upsertFromAniList(new AniListMedia(
            anilistId, "Romaji" + anilistId, "Native", "Eng",
            "img", 12, "FINISHED", "TV", 2024));
    }

    @Test
    void postCreatesEntry_andGetReturnsIt() {
        User me = userService.upsertFromGoogle("g-wc1", "wc1@x.y", "WC1", null);
        seedAnime(100);

        ResponseEntity<Map> created = rest.exchange(
            url("/api/watch"), HttpMethod.POST,
            new HttpEntity<>(Map.of("anilistId", 100, "status", "WATCHING"), cookieFor(me.getId())),
            Map.class);

        assertThat(created.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat((String) created.getBody().get("status")).isEqualTo("WATCHING");
        assertThat(((Map<?, ?>) created.getBody().get("anime")).get("titleRomaji")).isEqualTo("Romaji100");
        Integer animeId = (Integer) ((Map<?, ?>) created.getBody().get("anime")).get("id");

        ResponseEntity<Map[]> list = rest.exchange(
            url("/api/watch"), HttpMethod.GET,
            new HttpEntity<>(cookieFor(me.getId())), Map[].class);
        assertThat(list.getBody()).hasSize(1);
        assertThat(((Map<?, ?>) list.getBody()[0].get("anime")).get("id")).isEqualTo(animeId);
    }

    @Test
    void patchUpdatesProgressAndScore() {
        User me = userService.upsertFromGoogle("g-wc2", "wc2@x.y", "WC2", null);
        seedAnime(200);
        ResponseEntity<Map> created = rest.exchange(
            url("/api/watch"), HttpMethod.POST,
            new HttpEntity<>(Map.of("anilistId", 200, "status", "WATCHING"), cookieFor(me.getId())),
            Map.class);
        Integer animeId = (Integer) ((Map<?, ?>) created.getBody().get("anime")).get("id");

        ResponseEntity<Map> patched = rest.exchange(
            url("/api/watch/" + animeId), HttpMethod.PATCH,
            new HttpEntity<>(Map.of("progress", 7, "score", 8), cookieFor(me.getId())),
            Map.class);

        assertThat(patched.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(patched.getBody().get("progress")).isEqualTo(7);
        assertThat(patched.getBody().get("score")).isEqualTo(8);
        assertThat(patched.getBody().get("status")).isEqualTo("WATCHING"); // unchanged
    }

    @Test
    void post_returns400_whenScoreOutOfRange_onPatch() {
        User me = userService.upsertFromGoogle("g-wc3", "wc3@x.y", "WC3", null);
        seedAnime(300);
        ResponseEntity<Map> created = rest.exchange(
            url("/api/watch"), HttpMethod.POST,
            new HttpEntity<>(Map.of("anilistId", 300, "status", "WATCHING"), cookieFor(me.getId())),
            Map.class);
        Integer animeId = (Integer) ((Map<?, ?>) created.getBody().get("anime")).get("id");

        ResponseEntity<String> bad = rest.exchange(
            url("/api/watch/" + animeId), HttpMethod.PATCH,
            new HttpEntity<>(Map.of("score", 99), cookieFor(me.getId())), String.class);

        assertThat(bad.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void post_returns401_whenUnauthenticated() {
        ResponseEntity<String> res = rest.exchange(
            url("/api/watch"), HttpMethod.POST,
            new HttpEntity<>("{\"anilistId\":1,\"status\":\"WATCHING\"}", jsonHeaders()), String.class);

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
./gradlew test --tests WatchControllerIT
```
Expected: FAIL — controller missing.

- [ ] **Step 3: Implement `WatchController.java`**

```java
package com.animesquad.watch;

import com.animesquad.anime.Anime;
import com.animesquad.anime.AnimeRepository;
import com.animesquad.auth.CurrentUser;
import com.animesquad.watch.dto.AddWatchRequest;
import com.animesquad.watch.dto.UpdateWatchRequest;
import com.animesquad.watch.dto.WatchEntryResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/watch")
public class WatchController {

    private final WatchService watchService;
    private final AnimeRepository animes;

    public WatchController(WatchService watchService, AnimeRepository animes) {
        this.watchService = watchService;
        this.animes = animes;
    }

    @PostMapping
    public ResponseEntity<WatchEntryResponse> add(
        @AuthenticationPrincipal CurrentUser me,
        @Valid @RequestBody AddWatchRequest req
    ) {
        WatchEntry e = watchService.addToList(me.userId(), req.anilistId(), req.status());
        Anime a = animes.findById(e.getAnimeId()).orElseThrow();
        return ResponseEntity.status(HttpStatus.CREATED).body(WatchEntryResponse.from(e, a));
    }

    @GetMapping
    public List<WatchEntryResponse> listMine(@AuthenticationPrincipal CurrentUser me) {
        return watchService.listMine(me.userId()).stream()
            .map(e -> WatchEntryResponse.from(e, animes.findById(e.getAnimeId()).orElseThrow()))
            .toList();
    }

    @PatchMapping("/{animeId}")
    public WatchEntryResponse update(
        @AuthenticationPrincipal CurrentUser me,
        @PathVariable Long animeId,
        @Valid @RequestBody UpdateWatchRequest req
    ) {
        WatchEntry e = watchService.updateEntry(
            me.userId(), animeId,
            req.status(), req.progress(), req.score(), req.comment());
        Anime a = animes.findById(e.getAnimeId()).orElseThrow();
        return WatchEntryResponse.from(e, a);
    }
}
```

- [ ] **Step 4: Run test, expect pass**

```bash
./gradlew test --tests WatchControllerIT
```
Expected: PASS (all four tests).

- [ ] **Step 5: Run full suite**

```bash
./gradlew test
```
Expected: ALL PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/animesquad/watch/WatchController.java \
        backend/src/test/java/com/animesquad/watch/WatchControllerIT.java
git commit -m "feat(watch): REST endpoints (POST/GET/PATCH /api/watch)"
```

---

## Task 7: Frontend `/anime/search` page + API client

**Files:**
- Modify: `frontend/src/app/lib/api.ts`
- Create: `frontend/src/app/anime/search/page.tsx`

- [ ] **Step 1: Extend `api.ts`** — add `apiPatch`, anime + watch types

Append to `frontend/src/app/lib/api.ts`:
```ts
export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "PATCH",
    credentials: "include",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export type AniListMedia = {
  anilistId: number;
  titleRomaji: string;
  titleNative: string;
  titleEnglish: string | null;
  coverImageUrl: string | null;
  episodes: number | null;
  status: string;
  format: string;
  seasonYear: number | null;
};

export type AnimeView = {
  id: number;
  anilistId: number;
  titleRomaji: string;
  titleNative: string;
  titleEnglish: string | null;
  coverImageUrl: string | null;
  episodes: number | null;
  status: string;
  format: string;
  seasonYear: number | null;
};

export type WatchStatus =
  | "WATCHING" | "COMPLETED" | "ON_HOLD" | "DROPPED" | "PLAN_TO_WATCH";

export type WatchEntry = {
  id: number;
  anime: AnimeView;
  status: WatchStatus;
  progress: number;
  score: number | null;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
};
```

- [ ] **Step 2: Create `frontend/src/app/anime/search/page.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost, type AniListMedia, type WatchEntry, type WatchStatus } from "@/app/lib/api";

const STATUSES: WatchStatus[] = ["WATCHING", "COMPLETED", "ON_HOLD", "DROPPED", "PLAN_TO_WATCH"];

export default function AnimeSearchPage() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<AniListMedia[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [added, setAdded] = useState<Record<number, true>>({});

  useEffect(() => {
    if (!q.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      try {
        setStatus(null);
        setResults(await apiGet<AniListMedia[]>(`/api/anime/search?q=${encodeURIComponent(q)}`));
      } catch (e) { setStatus(String(e)); }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  async function add(anilistId: number, status: WatchStatus) {
    setStatus(null);
    try {
      await apiPost<WatchEntry>("/api/watch", { anilistId, status });
      setAdded((m) => ({ ...m, [anilistId]: true }));
    } catch (e) { setStatus(String(e)); }
  }

  return (
    <main style={{ padding: 40, fontFamily: "sans-serif", maxWidth: 800 }}>
      <h1>작품 검색</h1>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="제목을 입력하세요"
        style={{ width: "100%", padding: 8, fontSize: 16 }}
      />
      {status && <p style={{ color: "crimson" }}>{status}</p>}

      <ul style={{ listStyle: "none", padding: 0, marginTop: 24 }}>
        {results.map((m) => (
          <li key={m.anilistId} style={{ display: "flex", gap: 16, padding: 12, borderBottom: "1px solid #eee" }}>
            {m.coverImageUrl && (
              <img src={m.coverImageUrl} alt="" width={60} height={84} style={{ objectFit: "cover" }} />
            )}
            <div style={{ flex: 1 }}>
              <strong>{m.titleRomaji}</strong>
              {m.titleEnglish && <span style={{ color: "#666" }}> · {m.titleEnglish}</span>}
              <div style={{ fontSize: 12, color: "#666" }}>
                {m.format} · {m.seasonYear ?? "-"} · {m.episodes ?? "?"}화 · {m.status}
              </div>
              <div style={{ marginTop: 8 }}>
                {added[m.anilistId] ? (
                  <span style={{ color: "#388e3c" }}>리스트에 추가됨 ✓</span>
                ) : (
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      const s = e.target.value as WatchStatus;
                      if (s) add(m.anilistId, s);
                    }}
                  >
                    <option value="">리스트에 추가…</option>
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 3: Build**

```bash
cd frontend && pnpm build
```
Expected: BUILD SUCCESSFUL with `/anime/search` in the route table.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/lib/api.ts frontend/src/app/anime/
git commit -m "feat(frontend): /anime/search page with add-to-list"
```

---

## Task 8: Frontend `/my/list` page

**Files:**
- Create: `frontend/src/app/my/list/page.tsx`

Inline-editable list of the user's watch entries. Each row has a status select, progress input, score input, and comment textarea with a "Save" button that calls PATCH.

- [ ] **Step 1: Create `frontend/src/app/my/list/page.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPatch, type WatchEntry, type WatchStatus } from "@/app/lib/api";

const STATUSES: WatchStatus[] = ["WATCHING", "COMPLETED", "ON_HOLD", "DROPPED", "PLAN_TO_WATCH"];

export default function MyListPage() {
  const [entries, setEntries] = useState<WatchEntry[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  async function refresh() {
    try { setEntries(await apiGet<WatchEntry[]>("/api/watch")); }
    catch (e) { setStatus(String(e)); }
  }

  useEffect(() => { refresh(); }, []);

  return (
    <main style={{ padding: 40, fontFamily: "sans-serif", maxWidth: 900 }}>
      <h1>내 리스트</h1>
      {status && <p style={{ color: "crimson" }}>{status}</p>}
      {entries.length === 0 && <p style={{ color: "#666" }}>아직 리스트가 비어 있어요. <a href="/anime/search">검색하러 가기</a></p>}

      <ul style={{ listStyle: "none", padding: 0 }}>
        {entries.map((e) => (
          <Row key={e.id} entry={e} onSaved={refresh} onError={setStatus} />
        ))}
      </ul>
    </main>
  );
}

function Row({
  entry, onSaved, onError,
}: {
  entry: WatchEntry;
  onSaved: () => void;
  onError: (s: string) => void;
}) {
  const [status, setStatus] = useState<WatchStatus>(entry.status);
  const [progress, setProgress] = useState<string>(String(entry.progress));
  const [score, setScore] = useState<string>(entry.score == null ? "" : String(entry.score));
  const [comment, setComment] = useState<string>(entry.comment ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await apiPatch(`/api/watch/${entry.anime.id}`, {
        status,
        progress: progress === "" ? null : Number(progress),
        score: score === "" ? null : Number(score),
        comment: comment === "" ? null : comment,
      });
      onSaved();
    } catch (err) { onError(String(err)); }
    finally { setSaving(false); }
  }

  return (
    <li style={{ display: "flex", gap: 16, padding: 12, borderBottom: "1px solid #eee" }}>
      {entry.anime.coverImageUrl && (
        <img src={entry.anime.coverImageUrl} alt="" width={60} height={84} style={{ objectFit: "cover" }} />
      )}
      <div style={{ flex: 1 }}>
        <strong>{entry.anime.titleRomaji}</strong>
        <div style={{ fontSize: 12, color: "#666" }}>
          {entry.anime.format} · {entry.anime.episodes ?? "?"}화
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <select value={status} onChange={(e) => setStatus(e.target.value as WatchStatus)}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input
            type="number" min={0} value={progress}
            onChange={(e) => setProgress(e.target.value)}
            placeholder="진도"
            style={{ width: 70 }}
          />
          <input
            type="number" min={1} max={10} value={score}
            onChange={(e) => setScore(e.target.value)}
            placeholder="점수"
            style={{ width: 70 }}
          />
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="한줄평 (최대 280자)"
            maxLength={280}
            style={{ flex: 1, minWidth: 200 }}
          />
          <button onClick={save} disabled={saving}>저장</button>
        </div>
      </div>
    </li>
  );
}
```

- [ ] **Step 2: Build**

```bash
pnpm build
```
Expected: BUILD SUCCESSFUL with `/my/list` in the route table.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/my/
git commit -m "feat(frontend): /my/list page with inline editing"
```

---

## Task 9: Manual smoke test

**No code — verification only.**

- [ ] **Step 1: Start backend + frontend**

```bash
# Terminal 1
cd backend
set -a; source .env.local; set +a
docker compose up -d
./gradlew bootRun

# Terminal 2
cd frontend && pnpm dev
```

- [ ] **Step 2: Exercise the search → add flow**

1. Sign in at `http://localhost:3000`.
2. Visit `http://localhost:3000/anime/search`, type "frieren" — results appear within ~300ms.
3. From the dropdown, pick `WATCHING` — the row turns into "리스트에 추가됨 ✓".

- [ ] **Step 3: Exercise the list page**

1. Visit `http://localhost:3000/my/list` — the entry you just added is there.
2. Change progress to `5`, score to `9`, type a comment, change status to `COMPLETED`, hit 저장.
3. Refresh the page — the values persisted.

- [ ] **Step 4: DB sanity check**

```bash
docker exec animesquad-db psql -U animesquad -d animesquad -c \
  "SELECT w.user_id, a.title_romaji, w.status, w.progress, w.score, w.comment
   FROM watch_entry w JOIN anime a ON a.id = w.anime_id;"
```
Expected: one row reflecting the values you saved.

- [ ] **Step 5: Update changelog**

```bash
cat >> CHANGELOG.md <<'EOF'

## Plan 4 — 2026-06-12
- `watch_entry` table (V4) with per-user uniqueness + score/progress checks
- `POST/GET /api/watch`, `PATCH /api/watch/{animeId}`
- `AniListClient.fetchById` + `AnimeService.findOrFetchByAnilistId` for cache-miss adds
- Frontend `/anime/search` with debounced query + add-to-list
- Frontend `/my/list` with inline edit (status / progress / score / comment)
EOF
git add CHANGELOG.md
git commit -m "docs: changelog for plan 4"
```

---

## Verification Checklist (Definition of Done)

- [ ] `cd backend && ./gradlew test` — green (Plans 1–3 tests + `WatchServiceIT`, `WatchControllerIT`, updated `AnimeServiceIT`)
- [ ] `cd frontend && pnpm build` — green with `/anime/search` and `/my/list` routes
- [ ] Manual smoke test (Task 9) executed
- [ ] CHANGELOG.md has a Plan 4 section

## Out of Scope for Plan 4 (covered later)

- `episode_rating` table + endpoints (Plan 5)
- Auto progress bump when a user rates an episode beyond current progress (Plan 5)
- `ActivityEvent` publication for `ANIME_ADDED`, `STATUS_CHANGED`, `PROGRESS_UPDATED`, `RATED` (Plan 6)
- Feed page rendering watch activity (Plan 6)
- Member profile view of someone else's list (later plan)
- Grouping `/my/list` by status / pagination / sort controls
- Optimistic UI updates / toast notifications
