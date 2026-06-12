# Plan 3 — Anime catalog (AniList search proxy + cache) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Authenticated users can search AniList for anime through our backend (`GET /api/anime/search?q=…`). The `anime` cache table is created and a reusable `AnimeService.upsertFromAniList(...)` is in place so Plan 4 (watch entries) can persist works on first add.

**Architecture:** Search is a thin proxy — no DB writes, results come straight from AniList's public GraphQL endpoint. An `AniListClient` interface abstracts the HTTP call so services can be tested against a Mockito mock; the production impl uses Spring 6's `RestClient`. The `anime` table mirrors the schema in the design doc; status/format are stored as `VARCHAR` to absorb future AniList enum additions without migrations.

**Tech Stack:** Spring Boot 3.3.5, Spring Web (RestClient), Spring Data JPA, Flyway, JUnit 5, Mockito, Testcontainers Postgres.

---

## File Structure

**Backend — created**
- `backend/src/main/resources/db/migration/V3__anime.sql`
- `backend/src/main/java/com/animesquad/anime/Anime.java`
- `backend/src/main/java/com/animesquad/anime/AnimeRepository.java`
- `backend/src/main/java/com/animesquad/anime/AniListClient.java` — interface
- `backend/src/main/java/com/animesquad/anime/AniListClientImpl.java` — RestClient impl
- `backend/src/main/java/com/animesquad/anime/AniListMedia.java` — DTO (HTTP + service tier)
- `backend/src/main/java/com/animesquad/anime/AnimeSearchService.java`
- `backend/src/main/java/com/animesquad/anime/AnimeService.java`
- `backend/src/main/java/com/animesquad/anime/AnimeController.java`

**Backend — modified**
- `backend/src/main/resources/application.yml` — add `app.anilist.url`

**Backend — tests**
- `backend/src/test/java/com/animesquad/anime/AnimeSearchServiceTest.java`
- `backend/src/test/java/com/animesquad/anime/AnimeServiceIT.java`
- `backend/src/test/java/com/animesquad/anime/AnimeControllerIT.java`

`AniListClientImpl` is the only file without a dedicated test — it's a thin HTTP adapter and is exercised by Task 7's manual smoke test against the real AniList endpoint.

Frontend changes are deferred to Plan 4 (`/anime/search` page will include the "add to my list" action that depends on the watch module).

---

## Task 1: Flyway V3 — `anime` table

**Files:**
- Create: `backend/src/main/resources/db/migration/V3__anime.sql`

- [ ] **Step 1: Write the migration**

```sql
CREATE TABLE anime (
    id              BIGSERIAL PRIMARY KEY,
    anilist_id      INT          UNIQUE,           -- nullable to allow future self-hosted entries
    title_romaji    VARCHAR(255) NOT NULL,
    title_native    VARCHAR(255) NOT NULL,
    title_english   VARCHAR(255),
    cover_image_url VARCHAR(512),
    episodes        INT,
    status          VARCHAR(32)  NOT NULL,
    format          VARCHAR(32)  NOT NULL,
    season_year     INT,
    cached_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_anime_anilist_id ON anime(anilist_id);
```

- [ ] **Step 2: Verify Flyway applies cleanly**

```bash
cd backend && ./gradlew test --tests "*UserServiceIT*"
```
Expected: PASS — Testcontainers DB starts and applies V1+V2+V3.

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/resources/db/migration/V3__anime.sql
git commit -m "feat(db): add anime cache table (V3)"
```

---

## Task 2: `Anime` entity + repository

**Files:**
- Create: `backend/src/main/java/com/animesquad/anime/Anime.java`
- Create: `backend/src/main/java/com/animesquad/anime/AnimeRepository.java`

- [ ] **Step 1: `Anime.java`**

```java
package com.animesquad.anime;

import jakarta.persistence.*;
import java.time.OffsetDateTime;

@Entity
@Table(name = "anime")
public class Anime {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "anilist_id", unique = true)
    private Integer anilistId;

    @Column(name = "title_romaji", nullable = false)
    private String titleRomaji;

    @Column(name = "title_native", nullable = false)
    private String titleNative;

    @Column(name = "title_english")
    private String titleEnglish;

    @Column(name = "cover_image_url")
    private String coverImageUrl;

    @Column(name = "episodes")
    private Integer episodes;

    @Column(nullable = false, length = 32)
    private String status;

    @Column(nullable = false, length = 32)
    private String format;

    @Column(name = "season_year")
    private Integer seasonYear;

    @Column(name = "cached_at", nullable = false)
    private OffsetDateTime cachedAt = OffsetDateTime.now();

    protected Anime() {}

    public Anime(Integer anilistId, String titleRomaji, String titleNative, String titleEnglish,
                 String coverImageUrl, Integer episodes, String status, String format, Integer seasonYear) {
        this.anilistId = anilistId;
        this.titleRomaji = titleRomaji;
        this.titleNative = titleNative;
        this.titleEnglish = titleEnglish;
        this.coverImageUrl = coverImageUrl;
        this.episodes = episodes;
        this.status = status;
        this.format = format;
        this.seasonYear = seasonYear;
    }

    public void refreshFrom(String titleRomaji, String titleNative, String titleEnglish,
                            String coverImageUrl, Integer episodes, String status,
                            String format, Integer seasonYear) {
        this.titleRomaji = titleRomaji;
        this.titleNative = titleNative;
        this.titleEnglish = titleEnglish;
        this.coverImageUrl = coverImageUrl;
        this.episodes = episodes;
        this.status = status;
        this.format = format;
        this.seasonYear = seasonYear;
        this.cachedAt = OffsetDateTime.now();
    }

    public Long getId() { return id; }
    public Integer getAnilistId() { return anilistId; }
    public String getTitleRomaji() { return titleRomaji; }
    public String getTitleNative() { return titleNative; }
    public String getTitleEnglish() { return titleEnglish; }
    public String getCoverImageUrl() { return coverImageUrl; }
    public Integer getEpisodes() { return episodes; }
    public String getStatus() { return status; }
    public String getFormat() { return format; }
    public Integer getSeasonYear() { return seasonYear; }
    public OffsetDateTime getCachedAt() { return cachedAt; }
}
```

- [ ] **Step 2: `AnimeRepository.java`**

```java
package com.animesquad.anime;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface AnimeRepository extends JpaRepository<Anime, Long> {
    Optional<Anime> findByAnilistId(Integer anilistId);
}
```

- [ ] **Step 3: Compile**

```bash
./gradlew compileJava
```
Expected: BUILD SUCCESSFUL.

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/com/animesquad/anime/
git commit -m "feat(anime): add Anime entity + repository"
```

---

## Task 3: `AniListMedia` DTO + `AniListClient` interface + `AniListClientImpl`

**Files:**
- Create: `backend/src/main/java/com/animesquad/anime/AniListMedia.java`
- Create: `backend/src/main/java/com/animesquad/anime/AniListClient.java`
- Create: `backend/src/main/java/com/animesquad/anime/AniListClientImpl.java`
- Modify: `backend/src/main/resources/application.yml`

The DTO shape matches both the AniList GraphQL response *and* what we want to expose from `GET /api/anime/search`. This keeps the proxy thin — no second mapping step.

- [ ] **Step 1: `AniListMedia.java`**

```java
package com.animesquad.anime;

public record AniListMedia(
    Integer anilistId,
    String titleRomaji,
    String titleNative,
    String titleEnglish,
    String coverImageUrl,
    Integer episodes,
    String status,
    String format,
    Integer seasonYear
) {}
```

- [ ] **Step 2: `AniListClient.java`**

```java
package com.animesquad.anime;

import java.util.List;

public interface AniListClient {
    List<AniListMedia> search(String query);
}
```

- [ ] **Step 3: `AniListClientImpl.java`**

```java
package com.animesquad.anime;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.Map;

@Component
public class AniListClientImpl implements AniListClient {

    private static final String QUERY = """
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

    private final RestClient client;

    public AniListClientImpl(@Value("${app.anilist.url}") String url) {
        this.client = RestClient.builder().baseUrl(url).build();
    }

    @Override
    public List<AniListMedia> search(String query) {
        Map<?, ?> resp = client.post()
            .body(Map.of("query", QUERY, "variables", Map.of("q", query)))
            .retrieve()
            .body(Map.class);

        if (resp == null) return List.of();
        Map<?, ?> data = (Map<?, ?>) resp.get("data");
        if (data == null) return List.of();
        Map<?, ?> page = (Map<?, ?>) data.get("Page");
        if (page == null) return List.of();
        List<?> media = (List<?>) page.get("media");
        if (media == null) return List.of();

        return media.stream().map(this::toMedia).toList();
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

- [ ] **Step 4: Add config to `application.yml`**

Add under the existing `app:` block (alongside `app.jwt`, `app.oauth`, `app.cookie`):
```yaml
  anilist:
    url: ${ANILIST_URL:https://graphql.anilist.co}
```

- [ ] **Step 5: Compile**

```bash
./gradlew compileJava
```
Expected: BUILD SUCCESSFUL.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/animesquad/anime/AniListMedia.java \
        backend/src/main/java/com/animesquad/anime/AniListClient.java \
        backend/src/main/java/com/animesquad/anime/AniListClientImpl.java \
        backend/src/main/resources/application.yml
git commit -m "feat(anime): AniList GraphQL client (RestClient impl)"
```

---

## Task 4: `AnimeSearchService` (TDD, mocked client)

**Files:**
- Create: `backend/src/main/java/com/animesquad/anime/AnimeSearchService.java`
- Test: `backend/src/test/java/com/animesquad/anime/AnimeSearchServiceTest.java`

The service is a passthrough: it validates `query` is non-blank and delegates to the client. Keeping the wrapper means future changes (caching, rate limit, censoring) have a place to live.

- [ ] **Step 1: Write the failing test**

`AnimeSearchServiceTest.java`:
```java
package com.animesquad.anime;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AnimeSearchServiceTest {

    private final AniListClient client = mock(AniListClient.class);
    private final AnimeSearchService service = new AnimeSearchService(client);

    @Test
    void search_delegatesToClient() {
        AniListMedia hit = new AniListMedia(1, "R", "N", "E", "img", 12, "FINISHED", "TV", 2024);
        when(client.search(eq("frieren"))).thenReturn(List.of(hit));

        List<AniListMedia> result = service.search("frieren");

        assertThat(result).containsExactly(hit);
    }

    @Test
    void search_throws_whenQueryBlank() {
        assertThatThrownBy(() -> service.search(" "))
            .isInstanceOf(IllegalArgumentException.class);
    }
}
```

- [ ] **Step 2: Run test, expect failure**

```bash
./gradlew test --tests AnimeSearchServiceTest
```
Expected: FAIL (`AnimeSearchService` does not exist).

- [ ] **Step 3: Implement**

```java
package com.animesquad.anime;

import org.springframework.stereotype.Service;
import java.util.List;

@Service
public class AnimeSearchService {

    private final AniListClient client;

    public AnimeSearchService(AniListClient client) {
        this.client = client;
    }

    public List<AniListMedia> search(String query) {
        if (query == null || query.isBlank()) {
            throw new IllegalArgumentException("query is required");
        }
        return client.search(query.trim());
    }
}
```

- [ ] **Step 4: Run test, expect pass**

```bash
./gradlew test --tests AnimeSearchServiceTest
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/animesquad/anime/AnimeSearchService.java \
        backend/src/test/java/com/animesquad/anime/AnimeSearchServiceTest.java
git commit -m "feat(anime): AnimeSearchService (validated passthrough)"
```

---

## Task 5: `AnimeService.upsertFromAniList` (TDD, real DB)

**Files:**
- Create: `backend/src/main/java/com/animesquad/anime/AnimeService.java`
- Test: `backend/src/test/java/com/animesquad/anime/AnimeServiceIT.java`

This is what Plan 4's watch module will call when a user adds a new anime to their list.

- [ ] **Step 1: Write the failing test**

`AnimeServiceIT.java`:
```java
package com.animesquad.anime;

import com.animesquad.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import static org.assertj.core.api.Assertions.assertThat;

class AnimeServiceIT extends AbstractIntegrationTest {

    @Autowired AnimeService animeService;
    @Autowired AnimeRepository animes;

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
}
```

- [ ] **Step 2: Run test, expect failure**

```bash
./gradlew test --tests AnimeServiceIT
```
Expected: FAIL (`AnimeService` not found).

- [ ] **Step 3: Implement `AnimeService.java`**

```java
package com.animesquad.anime;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AnimeService {

    private final AnimeRepository animes;

    public AnimeService(AnimeRepository animes) {
        this.animes = animes;
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
}
```

- [ ] **Step 4: Run test, expect pass**

```bash
./gradlew test --tests AnimeServiceIT
```
Expected: PASS.

- [ ] **Step 5: Update `AbstractIntegrationTest` truncate to include `anime`**

In `backend/src/test/java/com/animesquad/support/AbstractIntegrationTest.java`, replace the `cleanDatabase` body:
```java
    @BeforeEach
    void cleanDatabase() {
        jdbc.execute("TRUNCATE TABLE membership, squad, anime, users RESTART IDENTITY CASCADE");
    }
```

- [ ] **Step 6: Re-run all backend tests**

```bash
./gradlew test
```
Expected: ALL PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/animesquad/anime/AnimeService.java \
        backend/src/test/java/com/animesquad/anime/AnimeServiceIT.java \
        backend/src/test/java/com/animesquad/support/AbstractIntegrationTest.java
git commit -m "feat(anime): AnimeService.upsertFromAniList + truncate anime in tests"
```

---

## Task 6: `AnimeController` — `GET /api/anime/search` (TDD)

**Files:**
- Create: `backend/src/main/java/com/animesquad/anime/AnimeController.java`
- Test: `backend/src/test/java/com/animesquad/anime/AnimeControllerIT.java`

`AniListClient` is replaced with a Mockito `@MockBean` so the test does not hit the real network. Auth is verified via the existing JWT cookie filter.

- [ ] **Step 1: Write the failing controller IT**

`AnimeControllerIT.java`:
```java
package com.animesquad.anime;

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

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AnimeControllerIT extends AbstractIntegrationTest {

    @Autowired UserService userService;
    @Autowired JwtService jwtService;
    @Autowired TestRestTemplate rest;
    @LocalServerPort int port;

    @MockBean AniListClient aniList;

    private HttpHeaders cookieFor(Long userId) {
        HttpHeaders h = new HttpHeaders();
        h.add(HttpHeaders.COOKIE,
            JwtAuthenticationFilter.COOKIE_NAME + "=" + jwtService.issue(userId));
        return h;
    }

    @Test
    void search_returnsClientResults() {
        User me = userService.upsertFromGoogle("g-as", "as@x.y", "AS", null);
        when(aniList.search(eq("frieren"))).thenReturn(List.of(
            new AniListMedia(1, "Frieren", "葬送のフリーレン", "Frieren", "img", 28, "FINISHED", "TV", 2023)
        ));

        ResponseEntity<AniListMedia[]> res = rest.exchange(
            "http://localhost:" + port + "/api/anime/search?q=frieren",
            HttpMethod.GET, new HttpEntity<>(cookieFor(me.getId())), AniListMedia[].class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(res.getBody()).hasSize(1);
        assertThat(res.getBody()[0].anilistId()).isEqualTo(1);
        assertThat(res.getBody()[0].titleRomaji()).isEqualTo("Frieren");
    }

    @Test
    void search_returns400_whenQueryBlank() {
        User me = userService.upsertFromGoogle("g-bl", "bl@x.y", "BL", null);

        ResponseEntity<String> res = rest.exchange(
            "http://localhost:" + port + "/api/anime/search?q=",
            HttpMethod.GET, new HttpEntity<>(cookieFor(me.getId())), String.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void search_returns401_whenUnauthenticated() {
        ResponseEntity<String> res = rest.exchange(
            "http://localhost:" + port + "/api/anime/search?q=x",
            HttpMethod.GET, HttpEntity.EMPTY, String.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }
}
```

- [ ] **Step 2: Run test, expect failure**

```bash
./gradlew test --tests AnimeControllerIT
```
Expected: FAIL (`AnimeController` missing — `/api/anime/search` 404).

- [ ] **Step 3: Implement `AnimeController.java`**

```java
package com.animesquad.anime;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/anime")
public class AnimeController {

    private final AnimeSearchService searchService;

    public AnimeController(AnimeSearchService searchService) {
        this.searchService = searchService;
    }

    @GetMapping("/search")
    public List<AniListMedia> search(@RequestParam("q") String q) {
        return searchService.search(q);
    }
}
```

- [ ] **Step 4: Run test, expect pass**

```bash
./gradlew test --tests AnimeControllerIT
```
Expected: PASS (all three tests).

- [ ] **Step 5: Re-run full backend suite**

```bash
./gradlew test
```
Expected: ALL PASS (existing + new `AnimeSearchServiceTest`, `AnimeServiceIT`, `AnimeControllerIT`).

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/animesquad/anime/AnimeController.java \
        backend/src/test/java/com/animesquad/anime/AnimeControllerIT.java
git commit -m "feat(anime): GET /api/anime/search endpoint"
```

---

## Task 7: Manual smoke test against real AniList

**No code — verification only.**

Hits the live AniList GraphQL endpoint through our backend to confirm the real `AniListClientImpl` parses production responses correctly.

- [ ] **Step 1: Start backend + Postgres**

```bash
cd backend
set -a; source .env.local; set +a
docker compose up -d
./gradlew bootRun
```

- [ ] **Step 2: Sign in via the browser**

1. Visit `http://localhost:3000` → "Sign in with Google" → you land on `/me`.
2. Open browser devtools → Application → Cookies → copy the value of `ASQ_SESSION`.

- [ ] **Step 3: Call the search endpoint from the terminal**

```bash
curl -sS -H "Cookie: ASQ_SESSION=<paste value>" \
  "http://localhost:8080/api/anime/search?q=frieren" | jq '.[0]'
```
Expected JSON shape:
```json
{
  "anilistId": 154587,
  "titleRomaji": "Sousou no Frieren",
  "titleNative": "葬送のフリーレン",
  "titleEnglish": "Frieren: Beyond Journey's End",
  "coverImageUrl": "https://s4.anilist.co/...",
  "episodes": 28,
  "status": "FINISHED",
  "format": "TV",
  "seasonYear": 2023
}
```
(Field values may shift over time; what matters is the shape and that `anilistId`/`titleRomaji` are populated.)

- [ ] **Step 4: Verify the unauth path is still locked down**

```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  "http://localhost:8080/api/anime/search?q=frieren"
```
Expected: `401`.

- [ ] **Step 5: Update changelog**

Append under existing entries:
```bash
cat >> CHANGELOG.md <<'EOF'

## Plan 3 — 2026-06-12
- `anime` cache table (V3)
- AniList GraphQL proxy: `GET /api/anime/search?q=…`
- `AnimeService.upsertFromAniList` (used by Plan 4 watch module)
EOF
git add CHANGELOG.md
git commit -m "docs: changelog for plan 3"
```

---

## Verification Checklist (Definition of Done)

- [ ] `cd backend && ./gradlew test` — all green (Plan 1 + 2 tests, plus `AnimeSearchServiceTest`, `AnimeServiceIT`, `AnimeControllerIT`)
- [ ] Manual curl in Task 7 returns a populated `AniListMedia[]`
- [ ] CHANGELOG.md has a Plan 3 section

## Out of Scope for Plan 3 (covered later)

- Frontend `/anime/search` page (Plan 4 — bundled with "add to my list")
- Lazy refresh of cached anime when `status = RELEASING` and `cached_at > 7 days` (spec §5; defer until needed)
- AniList rate-limit / circuit breaker (introduce when actually needed)
- Pagination / `perPage` tuning beyond 20
