# 검색용 별칭 (search_keywords) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 정식 수입 제목과 다른 통용 명칭(뱅드림, 코노스바 등)으로도 애니가 검색되도록, 어드민이 입력하는 검색 전용 `search_keywords` 컬럼을 추가한다.

**Architecture:** `anime` 테이블에 nullable TEXT 컬럼 하나를 추가하고, 기존 LIKE 기반 `searchByTitle` 네이티브 쿼리에 OR 조건 2개(소문자 LIKE + 공백 제거 LIKE)를 더한다. 어드민 PATCH 엔드포인트와 어드민 페이지 행 편집 UI를 `titleKorean`과 같은 패턴으로 확장한다. 화면 표시에는 쓰지 않는다.

**Tech Stack:** Spring Boot 3 (JPA + Flyway + 네이티브 쿼리), PostgreSQL (Testcontainers IT), Next.js + TypeScript 프론트엔드.

**스펙:** `docs/superpowers/specs/2026-07-10-search-keywords-design.md`

**명령 실행 위치:** 백엔드는 `/Users/yubeen/animesquad/backend`(gradlew 위치), 프론트는 `/Users/yubeen/animesquad/frontend`.

---

### Task 1: DB 마이그레이션 + 엔티티 필드 (groundwork)

동작 검증은 Task 2·3의 테스트가 담당한다. 이 태스크는 컴파일 확인까지만 한다.

**Files:**
- Create: `backend/src/main/resources/db/migration/V14__anime_search_keywords.sql`
- Modify: `backend/src/main/java/com/animesquad/anime/Anime.java`

- [ ] **Step 1: 마이그레이션 파일 작성**

`V14__anime_search_keywords.sql` (V7이 `ALTER TABLE anime ADD COLUMN title_korean VARCHAR(255);` 한 줄인 것과 같은 스타일):

```sql
ALTER TABLE anime ADD COLUMN search_keywords TEXT;
```

- [ ] **Step 2: Anime 엔티티에 필드 추가**

`Anime.java`의 `titleKorean` 필드 선언(27-28행) 바로 아래에 추가:

```java
    @Column(name = "search_keywords")
    private String searchKeywords;
```

getter/setter는 기존 `titleKorean` 게터·세터 쌍(93-94행) 바로 아래에 같은 스타일로 추가:

```java
    public String getSearchKeywords() { return searchKeywords; }
    public void setSearchKeywords(String searchKeywords) { this.searchKeywords = searchKeywords; }
```

생성자·`refreshFrom`에는 넣지 않는다 — AniList 갱신 시 어드민이 입력한 별칭이 지워지면 안 되기 때문 (`titleKorean`과 동일한 이유로 동일한 취급).

- [ ] **Step 3: 컴파일 확인**

Run: `cd /Users/yubeen/animesquad/backend && ./gradlew compileJava`
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/resources/db/migration/V14__anime_search_keywords.sql backend/src/main/java/com/animesquad/anime/Anime.java
git commit -m "feat(anime): add search_keywords column and entity field"
```

---

### Task 2: 검색 쿼리 확장 (TDD)

**Files:**
- Test: `backend/src/test/java/com/animesquad/anime/AnimeControllerIT.java`
- Modify: `backend/src/main/java/com/animesquad/anime/AnimeRepository.java:15-27`

- [ ] **Step 1: 실패하는 테스트 작성**

`AnimeControllerIT.java`에 `AnimeRepository` 주입을 추가한다. 기존 `@Autowired AnimeService animeService;` 줄 아래에:

```java
    @Autowired AnimeRepository animes;
```

그리고 테스트 2개를 `search_isPublic_whenUnauthenticated` 테스트 뒤에 추가한다. 주의: 검색어에 공백을 넣으면 URL 인코딩이 필요하므로, 공백 무시 매칭은 "저장된 별칭에 공백이 있고 검색어에는 없는" 방향으로 검증한다 (쿼리·컬럼 양쪽 모두 공백 제거 후 비교하므로 같은 로직을 탄다):

```java
    @Test
    void search_matchesSearchKeywords() {
        Anime a = animeService.upsertFromAniList(new AniListMedia(
            2, "BanG Dream!", "バンドリ！", "BanG Dream!", "img", 13, "FINISHED", "TV", 2017, null, null));
        a.setSearchKeywords("뱅드림, 방드림");
        animes.save(a);

        ResponseEntity<AnimeResponse[]> res = rest.exchange(
            "http://localhost:" + port + "/api/anime/search?q=뱅드림",
            HttpMethod.GET, HttpEntity.EMPTY, AnimeResponse[].class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(res.getBody()).hasSize(1);
        assertThat(res.getBody()[0].anilistId()).isEqualTo(2);
    }

    @Test
    void search_matchesSearchKeywords_ignoringSpaces() {
        Anime a = animeService.upsertFromAniList(new AniListMedia(
            3, "KonoSuba", "この素晴らしい世界に祝福を！", null, "img", 10, "FINISHED", "TV", 2016, null, null));
        a.setSearchKeywords("코노 스바");
        animes.save(a);

        ResponseEntity<AnimeResponse[]> res = rest.exchange(
            "http://localhost:" + port + "/api/anime/search?q=코노스바",
            HttpMethod.GET, HttpEntity.EMPTY, AnimeResponse[].class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(res.getBody()).hasSize(1);
        assertThat(res.getBody()[0].anilistId()).isEqualTo(3);
    }
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd /Users/yubeen/animesquad/backend && ./gradlew test --tests 'com.animesquad.anime.AnimeControllerIT'`
Expected: 새 테스트 2개 FAIL — 검색 결과가 비어서 `Expected size: 1 but was: 0`. (다른 원인으로 실패하면 원인부터 파악할 것.)

- [ ] **Step 3: searchByTitle 쿼리에 OR 조건 추가**

`AnimeRepository.java`의 `@Query` 내용을 다음으로 교체 (search_keywords 줄 2개 추가가 유일한 변경):

```java
    @Query(value = """
        SELECT * FROM anime a
        WHERE LOWER(a.title_romaji) LIKE :q
           OR LOWER(COALESCE(a.title_english, '')) LIKE :q
           OR LOWER(COALESCE(a.title_korean, '')) LIKE :q
           OR LOWER(COALESCE(a.search_keywords, '')) LIKE :q
           OR a.title_native LIKE :raw
           OR REPLACE(LOWER(a.title_romaji), ' ', '') LIKE :qs
           OR REPLACE(LOWER(COALESCE(a.title_english, '')), ' ', '') LIKE :qs
           OR REPLACE(LOWER(COALESCE(a.title_korean, '')), ' ', '') LIKE :qs
           OR REPLACE(LOWER(COALESCE(a.search_keywords, '')), ' ', '') LIKE :qs
           OR REPLACE(a.title_native, ' ', '') LIKE :raws
        ORDER BY a.id DESC
        LIMIT 20
        """, nativeQuery = true)
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd /Users/yubeen/animesquad/backend && ./gradlew test --tests 'com.animesquad.anime.AnimeControllerIT'`
Expected: 전체 PASS (기존 테스트 포함)

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/animesquad/anime/AnimeRepository.java backend/src/test/java/com/animesquad/anime/AnimeControllerIT.java
git commit -m "feat(anime): match search_keywords in title search"
```

---

### Task 3: 어드민 PATCH 확장 + AnimeResponse (TDD)

**Files:**
- Modify: `backend/build.gradle.kts` (테스트 의존성 1개 추가)
- Test: `backend/src/test/java/com/animesquad/admin/AdminAnimeControllerIT.java`
- Modify: `backend/src/main/java/com/animesquad/admin/AdminAnimeController.java:27,102-115`
- Modify: `backend/src/main/java/com/animesquad/anime/dto/AnimeResponse.java`

- [ ] **Step 1: 테스트 의존성 추가 (PATCH 지원)**

`TestRestTemplate`은 기본 JDK 클라이언트로는 PATCH를 못 보낸다 (기존 IT에 PATCH 테스트가 없는 이유로 추정). `build.gradle.kts`의 `testImplementation("org.springframework.security:spring-security-test")` 줄 아래에 추가:

```kotlin
    testImplementation("org.apache.httpcomponents.client5:httpclient5")
```

클래스패스에 있으면 TestRestTemplate이 자동 감지해서 사용한다. 버전은 Spring Boot BOM이 관리하므로 명시하지 않는다.

- [ ] **Step 2: 실패하는 테스트 작성**

`AdminAnimeControllerIT.java`의 `list_withQuery_searchesAll_includingKoreanTitled` 테스트 뒤에 추가:

```java
    @SuppressWarnings("unchecked")
    @Test
    void patch_updatesTitleKoreanAndSearchKeywords() {
        Long admin = adminId();
        Anime a = seedAnime(103, null);

        ResponseEntity<Map> res = rest.exchange(
            url("/api/admin/anime/" + a.getId()), HttpMethod.PATCH,
            new HttpEntity<>(Map.of("titleKorean", "BanG Dream!", "searchKeywords", "뱅드림, 방드림"),
                cookieFor(admin)), Map.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(res.getBody().get("titleKorean")).isEqualTo("BanG Dream!");
        assertThat(res.getBody().get("searchKeywords")).isEqualTo("뱅드림, 방드림");
        Anime saved = animes.findById(a.getId()).orElseThrow();
        assertThat(saved.getTitleKorean()).isEqualTo("BanG Dream!");
        assertThat(saved.getSearchKeywords()).isEqualTo("뱅드림, 방드림");
    }

    @SuppressWarnings("unchecked")
    @Test
    void patch_clearsSearchKeywords_whenBlank() {
        Long admin = adminId();
        Anime a = seedAnime(104, "코난");
        a.setSearchKeywords("명탐정");
        animes.save(a);

        ResponseEntity<Map> res = rest.exchange(
            url("/api/admin/anime/" + a.getId()), HttpMethod.PATCH,
            new HttpEntity<>(Map.of("titleKorean", "코난", "searchKeywords", "  "),
                cookieFor(admin)), Map.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(res.getBody().get("searchKeywords")).isNull();
        assertThat(animes.findById(a.getId()).orElseThrow().getSearchKeywords()).isNull();
    }
```

- [ ] **Step 3: 테스트가 실패하는지 확인**

Run: `cd /Users/yubeen/animesquad/backend && ./gradlew test --tests 'com.animesquad.admin.AdminAnimeControllerIT'`
Expected: 새 테스트 2개 FAIL — `searchKeywords`가 응답에 없어 `expected: "뱅드림, 방드림" but was: null`. (PATCH 자체가 I/O 에러로 실패하면 Step 1 의존성이 제대로 추가됐는지 확인.)

- [ ] **Step 4: 컨트롤러·DTO 구현**

`AdminAnimeController.java` 27행의 레코드를 교체:

```java
    public record UpdateAnimeRequest(String titleKorean, String searchKeywords) {}
```

102-115행의 PATCH 핸들러를 교체 (메서드명도 실제 역할에 맞게 변경):

```java
    @PatchMapping("/{id}")
    @Transactional
    public AnimeResponse update(
        @AuthenticationPrincipal CurrentUser current,
        @PathVariable Long id,
        @RequestBody UpdateAnimeRequest body
    ) {
        requireAdmin(current);
        Anime anime = animes.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "anime not found"));
        anime.setTitleKorean(normalize(body.titleKorean()));
        anime.setSearchKeywords(normalize(body.searchKeywords()));
        return AnimeResponse.from(anime);
    }

    private static String normalize(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
```

`AnimeResponse.java`를 교체:

```java
package com.animesquad.anime.dto;

import com.animesquad.anime.Anime;
import java.time.LocalDate;

public record AnimeResponse(
    Long id,
    Integer anilistId,
    String titleRomaji,
    String titleNative,
    String titleEnglish,
    String titleKorean,
    String searchKeywords,
    String coverImageUrl,
    Integer episodes,
    String status,
    String format,
    Integer seasonYear,
    String season,
    LocalDate startDate
) {
    public static AnimeResponse from(Anime a) {
        return new AnimeResponse(
            a.getId(), a.getAnilistId(),
            a.getTitleRomaji(), a.getTitleNative(), a.getTitleEnglish(), a.getTitleKorean(),
            a.getSearchKeywords(),
            a.getCoverImageUrl(), a.getEpisodes(),
            a.getStatus(), a.getFormat(), a.getSeasonYear(), a.getSeason(),
            a.getStartDate()
        );
    }
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd /Users/yubeen/animesquad/backend && ./gradlew test --tests 'com.animesquad.admin.AdminAnimeControllerIT'`
Expected: 전체 PASS

- [ ] **Step 6: 백엔드 전체 테스트**

Run: `cd /Users/yubeen/animesquad/backend && ./gradlew test`
Expected: `BUILD SUCCESSFUL` (AnimeResponse 필드 추가로 다른 테스트가 깨지지 않는지 확인)

- [ ] **Step 7: Commit**

```bash
git add backend/build.gradle.kts backend/src/main/java/com/animesquad/admin/AdminAnimeController.java backend/src/main/java/com/animesquad/anime/dto/AnimeResponse.java backend/src/test/java/com/animesquad/admin/AdminAnimeControllerIT.java
git commit -m "feat(admin): edit search keywords via anime PATCH endpoint"
```

---

### Task 4: 프론트엔드 — 어드민 편집 UI

**Files:**
- Modify: `frontend/src/app/lib/api.ts:125-139` (AnimeView 타입)
- Modify: `frontend/src/app/admin/anime/page.tsx:226-337` (Row 컴포넌트)

- [ ] **Step 1: AnimeView 타입에 필드 추가**

`api.ts`의 `AnimeView` 타입에서 `titleKorean: string | null;` 줄 아래에 추가:

```typescript
  searchKeywords: string | null;
```

- [ ] **Step 2: Row 컴포넌트에 검색 키워드 입력란 추가**

`admin/anime/page.tsx`의 `Row` 컴포넌트에서:

(a) 상태 선언부 — `const [value, setValue] = useState(anime.titleKorean ?? "");` 아래에 추가:

```typescript
  const [keywords, setKeywords] = useState(anime.searchKeywords ?? "");
```

(b) dirty 계산 — 기존 줄을 교체:

```typescript
  const dirty =
    (anime.titleKorean ?? "") !== value.trim() ||
    (anime.searchKeywords ?? "") !== keywords.trim();
```

(c) `save()`의 PATCH 바디를 교체:

```typescript
      await apiPatch(`/api/admin/anime/${anime.id}`, { titleKorean: value, searchKeywords: keywords });
```

(d) 한국어 제목 `<input ... placeholder="한국어 제목 (비우면 미설정)" ... />` 요소 바로 아래(저장 버튼 위)에 입력란 추가:

```tsx
          <input
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="검색 키워드 (쉼표 구분, 예: 뱅드림, 방드림)"
            className="min-w-[240px] flex-1 rounded-md border border-neutral-300 px-3 py-1.5 text-sm focus:border-neutral-900 focus:outline-none"
          />
```

- [ ] **Step 3: 프론트엔드 빌드 확인**

Run: `cd /Users/yubeen/animesquad/frontend && npm run build`
Expected: 타입 오류 없이 빌드 성공

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/lib/api.ts frontend/src/app/admin/anime/page.tsx
git commit -m "feat(admin): search keywords input in anime admin page"
```

---

### Task 5: 최종 검증

- [ ] **Step 1: 백엔드 전체 테스트**

Run: `cd /Users/yubeen/animesquad/backend && ./gradlew test`
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 2: 프론트엔드 빌드**

Run: `cd /Users/yubeen/animesquad/frontend && npm run build`
Expected: 빌드 성공

- [ ] **Step 3: 작업 트리 확인**

Run: `git status`
Expected: 커밋 안 된 변경 없음 (있으면 누락 커밋 처리)

push는 하지 않는다 — 사용자 확인 후 진행.
