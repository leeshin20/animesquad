# Chrome Extension Learned Anime Aliases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 자동 검색 실패 또는 잘못된 자동 매칭을 사용자가 수동으로 바로잡은 스트리밍 작품명을 감상 기록 성공 후 기존 `anime.search_keywords`에 학습시켜 다음 감상부터 자동 검색되게 한다.

**Architecture:** 백엔드의 인증된 `POST /api/anime/{animeId}/aliases`가 단일 별칭을 받아 잠금 조회 후 기존 검색 키워드 문자열에 멱등적으로 추가한다. Chrome Extension 팝업은 최초 감지 제목과 수동 선택 여부를 보관하고, 자동 결과에도 `다른 작품 선택` 경로를 제공한다. 회차/진도 기록이 성공한 뒤에만 별칭 API를 호출하며 별칭 실패를 기록 실패와 분리한다.

**Tech Stack:** Java 21, Spring Boot 3.3, Spring Data JPA, PostgreSQL, JUnit 5, Testcontainers, Chrome Extension Manifest V3, Vanilla JavaScript, node:test

## Global Constraints

- 기존 `anime.search_keywords` 컬럼과 `/api/anime/search` 검색 로직을 재사용한다.
- 별도 별칭 테이블이나 DB 마이그레이션을 추가하지 않는다.
- 별칭은 스트리밍 사이트별로 구분하지 않고 모든 사이트에서 공통으로 사용한다.
- 별칭 추가 API는 로그인 사용자에게만 허용한다.
- 초기 버전은 인증된 모든 사용자의 전역 별칭 추가를 허용하며, 오염 가능성을 수용한다. 승인·신고·속도 제한·출처 관리나 별도 테이블은 구현하지 않는다.
- 별칭은 앞뒤 공백 제거 후 1자 이상 200자 이하여야 한다.
- 클라이언트는 전체 `search_keywords`를 덮어쓰지 않고 단일 별칭만 전송한다.
- 감상 기록이 성공하고 사용자가 검색 결과에서 작품을 직접 선택했을 때만 별칭을 학습한다.
- 자동 매칭, 감상 기록 실패, `무시` 선택에는 별칭을 학습하지 않는다.
- 화수는 자동 입력하되 사용자가 `기록하기`를 눌러야 저장한다.
- 별칭 저장 실패는 이미 성공한 감상 기록을 실패로 바꾸지 않는다.
- 자동 매칭 결과가 있어도 `다른 작품 선택`으로 감지 원문이 채워진 검색 UI를 열 수 있다. 검색 UI를 여는 것만으로는 수동 매칭이 아니며, 결과 클릭만 `manualMatch = true`로 만든다.

---

### Task 1: 멱등적 별칭 추가 서비스

**Files:**
- Create: `backend/src/main/java/com/animesquad/anime/AnimeAliasService.java`
- Modify: `backend/src/main/java/com/animesquad/anime/AnimeRepository.java`
- Test: `backend/src/test/java/com/animesquad/anime/AnimeAliasServiceTest.java`

**Interfaces:**
- Consumes: `AnimeRepository.findByIdForUpdate(Long id)`
- Produces: `void AnimeAliasService.addAlias(Long animeId, String alias)`
- Persistence rule: 비어 있으면 `alias`, 기존 값이 있으면 `existing.trim() + ", " + alias.trim()`
- Idempotency rule: 공백 제거·소문자화한 기존 제목/키워드 문자열이 공백 제거·소문자화한 별칭을 포함하면 no-op

- [ ] **Step 1: 별칭 서비스의 실패 테스트 작성**

Create `backend/src/test/java/com/animesquad/anime/AnimeAliasServiceTest.java`:

```java
package com.animesquad.anime;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AnimeAliasServiceTest {

    @Mock AnimeRepository animes;
    AnimeAliasService service;

    @BeforeEach
    void setUp() {
        service = new AnimeAliasService(animes);
    }

    private Anime anime() {
        Anime anime = new Anime(
            1, "Tomb Raider King", "도굴왕", null,
            "img", 12, "FINISHED", "TV", 2026, null, null);
        anime.setTitleKorean("도굴왕");
        return anime;
    }

    @Test
    void addAlias_appendsTrimmedAliasWithoutOverwritingExistingKeywords() {
        Anime anime = anime();
        anime.setSearchKeywords("툼 레이더 킹");
        when(animes.findByIdForUpdate(1L)).thenReturn(Optional.of(anime));

        service.addAlias(1L, "  (자막) 도굴왕  ");

        assertThat(anime.getSearchKeywords()).isEqualTo("툼 레이더 킹, (자막) 도굴왕");
    }

    @Test
    void addAlias_setsFirstKeywordWhenSearchKeywordsAreBlank() {
        Anime anime = anime();
        when(animes.findByIdForUpdate(1L)).thenReturn(Optional.of(anime));

        service.addAlias(1L, "(자막) 도굴왕");

        assertThat(anime.getSearchKeywords()).isEqualTo("(자막) 도굴왕");
    }

    @Test
    void addAlias_isNoOpWhenAliasIsAlreadySearchableIgnoringCaseAndSpaces() {
        Anime anime = anime();
        anime.setSearchKeywords("툼 레이더 킹, (자막) 도굴왕");
        when(animes.findByIdForUpdate(1L)).thenReturn(Optional.of(anime));

        service.addAlias(1L, " (자막)도굴왕 ");

        assertThat(anime.getSearchKeywords()).isEqualTo("툼 레이더 킹, (자막) 도굴왕");
    }

    @Test
    void addAlias_rejectsBlankAndOver200Characters() {
        assertThatThrownBy(() -> service.addAlias(1L, "   "))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessage("alias is required");
        assertThatThrownBy(() -> service.addAlias(1L, "x".repeat(201)))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessage("alias must be 200 characters or fewer");
    }

    @Test
    void addAlias_appliesLengthLimitAfterTrimming() {
        Anime anime = anime();
        when(animes.findByIdForUpdate(1L)).thenReturn(Optional.of(anime));

        service.addAlias(1L, "  " + "x".repeat(200) + "  ");

        assertThat(anime.getSearchKeywords()).isEqualTo("x".repeat(200));
    }

    @Test
    void addAlias_returns404WhenAnimeDoesNotExist() {
        when(animes.findByIdForUpdate(99L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.addAlias(99L, "별칭"))
            .isInstanceOf(ResponseStatusException.class)
            .satisfies(error -> assertThat(
                ((ResponseStatusException) error).getStatusCode().value()).isEqualTo(404));
    }
}
```

- [ ] **Step 2: 서비스 테스트가 컴파일 실패하는지 확인**

Run:

```bash
cd /Users/yubeen/animesquad/.worktrees/chrome-extension-v2/backend
./gradlew test --tests com.animesquad.anime.AnimeAliasServiceTest
```

Expected: FAIL because `AnimeAliasService` and `findByIdForUpdate` do not exist.

- [ ] **Step 3: 잠금 조회 인터페이스 추가**

Add these imports and method to `backend/src/main/java/com/animesquad/anime/AnimeRepository.java`:

```java
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Lock;

@Lock(LockModeType.PESSIMISTIC_WRITE)
@Query("SELECT a FROM Anime a WHERE a.id = :id")
Optional<Anime> findByIdForUpdate(@Param("id") Long id);
```

- [ ] **Step 4: 최소 별칭 서비스 구현**

Create `backend/src/main/java/com/animesquad/anime/AnimeAliasService.java`:

```java
package com.animesquad.anime;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.Locale;
import java.util.Objects;
import java.util.stream.Stream;

@Service
public class AnimeAliasService {

    private static final int MAX_ALIAS_LENGTH = 200;

    private final AnimeRepository animes;

    public AnimeAliasService(AnimeRepository animes) {
        this.animes = animes;
    }

    @Transactional
    public void addAlias(Long animeId, String alias) {
        String trimmed = normalizeInput(alias);
        Anime anime = animes.findByIdForUpdate(animeId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "anime not found"));

        String needle = normalizeForSearch(trimmed);
        boolean alreadySearchable = Stream.of(
                anime.getTitleRomaji(), anime.getTitleNative(), anime.getTitleEnglish(),
                anime.getTitleKorean(), anime.getSearchKeywords())
            .filter(Objects::nonNull)
            .map(AnimeAliasService::normalizeForSearch)
            .anyMatch(value -> value.contains(needle));
        if (alreadySearchable) return;

        String existing = anime.getSearchKeywords();
        anime.setSearchKeywords(existing == null || existing.isBlank()
            ? trimmed
            : existing.trim() + ", " + trimmed);
    }

    private static String normalizeInput(String alias) {
        if (alias == null || alias.isBlank()) {
            throw new IllegalArgumentException("alias is required");
        }
        String trimmed = alias.trim();
        if (trimmed.length() > MAX_ALIAS_LENGTH) {
            throw new IllegalArgumentException("alias must be 200 characters or fewer");
        }
        return trimmed;
    }

    private static String normalizeForSearch(String value) {
        return value.toLowerCase(Locale.ROOT).replaceAll("\\s+", "");
    }
}
```

- [ ] **Step 5: 서비스 테스트 통과 확인**

Run:

```bash
cd /Users/yubeen/animesquad/.worktrees/chrome-extension-v2/backend
./gradlew test --tests com.animesquad.anime.AnimeAliasServiceTest
```

Expected: `6 tests completed, 0 failed`.

- [ ] **Step 6: Task 1 커밋**

```bash
cd /Users/yubeen/animesquad/.worktrees/chrome-extension-v2
git add backend/src/main/java/com/animesquad/anime/AnimeAliasService.java backend/src/main/java/com/animesquad/anime/AnimeRepository.java backend/src/test/java/com/animesquad/anime/AnimeAliasServiceTest.java
git commit -m "feat(extension): add idempotent anime alias service"
```

---

### Task 2: 인증된 별칭 API와 검색 통합

**Files:**
- Create: `backend/src/main/java/com/animesquad/anime/AnimeAliasController.java`
- Create: `backend/src/test/java/com/animesquad/anime/AnimeAliasControllerIT.java`

**Interfaces:**
- Consumes: `AnimeAliasService.addAlias(Long animeId, String alias)`
- Produces: authenticated `POST /api/anime/{animeId}/aliases`, JSON `{ "alias": string }`, `204 No Content`
- Existing integration: `GET /api/anime/search?q={alias}` returns the learned anime through `search_keywords`

- [ ] **Step 1: API 통합 실패 테스트 작성**

Create `backend/src/test/java/com/animesquad/anime/AnimeAliasControllerIT.java`:

```java
package com.animesquad.anime;

import com.animesquad.anime.dto.AnimeResponse;
import com.animesquad.auth.JwtAuthenticationFilter;
import com.animesquad.auth.JwtService;
import com.animesquad.support.AbstractIntegrationTest;
import com.animesquad.user.UserService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AnimeAliasControllerIT extends AbstractIntegrationTest {

    @Autowired UserService userService;
    @Autowired AnimeService animeService;
    @Autowired AnimeRepository animes;
    @Autowired JwtService jwtService;
    @Autowired TestRestTemplate rest;
    @LocalServerPort int port;

    @MockBean AniListClient aniList;

    private HttpHeaders cookieFor(Long userId) {
        HttpHeaders headers = new HttpHeaders();
        headers.add(HttpHeaders.COOKIE,
            JwtAuthenticationFilter.COOKIE_NAME + "=" + jwtService.issue(userId));
        headers.setContentType(MediaType.APPLICATION_JSON);
        return headers;
    }

    private String url(String path) {
        return "http://localhost:" + port + path;
    }

    private Anime seedAnime() {
        Anime anime = animeService.upsertFromAniList(new AniListMedia(
            701, "Tomb Raider King", "도굴왕", null,
            "img", 12, "FINISHED", "TV", 2026, null, null));
        anime.setTitleKorean("도굴왕");
        anime.setSearchKeywords("툼 레이더 킹");
        return animes.save(anime);
    }

    @Test
    void addAlias_appendsOnceAndMakesAliasSearchable() {
        Long userId = userService.upsertFromGoogle("g-alias", "alias@x.y", "Alias", null).getId();
        Anime anime = seedAnime();
        HttpEntity<Map<String, String>> request = new HttpEntity<>(
            Map.of("alias", "(자막) 도굴왕"), cookieFor(userId));

        ResponseEntity<Void> first = rest.exchange(
            url("/api/anime/" + anime.getId() + "/aliases"), HttpMethod.POST, request, Void.class);
        ResponseEntity<Void> duplicate = rest.exchange(
            url("/api/anime/" + anime.getId() + "/aliases"), HttpMethod.POST, request, Void.class);

        assertThat(first.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(duplicate.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(animes.findById(anime.getId()).orElseThrow().getSearchKeywords())
            .isEqualTo("툼 레이더 킹, (자막) 도굴왕");

        String query = URLEncoder.encode("(자막) 도굴왕", StandardCharsets.UTF_8);
        ResponseEntity<AnimeResponse[]> search = rest.getForEntity(
            url("/api/anime/search?q=" + query), AnimeResponse[].class);
        assertThat(search.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(search.getBody()).extracting(AnimeResponse::id).containsExactly(anime.getId());
    }

    @Test
    void addAlias_requiresAuthentication() {
        Anime anime = seedAnime();

        ResponseEntity<String> response = rest.postForEntity(
            url("/api/anime/" + anime.getId() + "/aliases"),
            Map.of("alias", "(자막) 도굴왕"), String.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(animes.findById(anime.getId()).orElseThrow().getSearchKeywords())
            .isEqualTo("툼 레이더 킹");
    }

    @Test
    void addAlias_rejectsBlankAndOver200Characters() {
        Long userId = userService.upsertFromGoogle("g-invalid", "invalid@x.y", "Invalid", null).getId();
        Anime anime = seedAnime();

        ResponseEntity<String> blank = rest.exchange(
            url("/api/anime/" + anime.getId() + "/aliases"), HttpMethod.POST,
            new HttpEntity<>(Map.of("alias", "   "), cookieFor(userId)), String.class);
        ResponseEntity<String> tooLong = rest.exchange(
            url("/api/anime/" + anime.getId() + "/aliases"), HttpMethod.POST,
            new HttpEntity<>(Map.of("alias", "x".repeat(201)), cookieFor(userId)), String.class);

        assertThat(blank.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(tooLong.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void addAlias_returns404WhenAnimeDoesNotExist() {
        Long userId = userService.upsertFromGoogle("g-missing", "missing@x.y", "Missing", null).getId();

        ResponseEntity<String> response = rest.exchange(
            url("/api/anime/999999/aliases"), HttpMethod.POST,
            new HttpEntity<>(Map.of("alias", "별칭"), cookieFor(userId)), String.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }
}
```

- [ ] **Step 2: API 통합 테스트 실패 확인**

Run:

```bash
cd /Users/yubeen/animesquad/.worktrees/chrome-extension-v2/backend
./gradlew test --tests com.animesquad.anime.AnimeAliasControllerIT
```

Expected: FAIL because `POST /api/anime/{id}/aliases` is not mapped.

- [ ] **Step 3: 별칭 컨트롤러 구현**

Create `backend/src/main/java/com/animesquad/anime/AnimeAliasController.java`:

```java
package com.animesquad.anime;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/anime")
public class AnimeAliasController {

    public record AddAliasRequest(
        @NotBlank(message = "alias is required")
        String alias
    ) {}

    private final AnimeAliasService aliases;

    public AnimeAliasController(AnimeAliasService aliases) {
        this.aliases = aliases;
    }

    @PostMapping("/{animeId}/aliases")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void addAlias(
        @PathVariable Long animeId,
        @Valid @RequestBody AddAliasRequest body
    ) {
        aliases.addAlias(animeId, body.alias());
    }
}
```

`SecurityConfig` already permits only `GET /api/anime/**` anonymously and requires authentication for every other `/api/**` request, so do not change security configuration.

- [ ] **Step 4: API 통합 테스트 통과 확인**

Run:

```bash
cd /Users/yubeen/animesquad/.worktrees/chrome-extension-v2/backend
./gradlew test --tests com.animesquad.anime.AnimeAliasControllerIT
```

Expected: `4 tests completed, 0 failed`.

- [ ] **Step 5: 애니 검색 회귀 테스트까지 함께 확인**

Run:

```bash
cd /Users/yubeen/animesquad/.worktrees/chrome-extension-v2/backend
./gradlew test --tests com.animesquad.anime.AnimeAliasServiceTest --tests com.animesquad.anime.AnimeAliasControllerIT --tests com.animesquad.anime.AnimeControllerIT
```

Expected: all selected tests pass with `0 failed`.

- [ ] **Step 6: Task 2 커밋**

```bash
cd /Users/yubeen/animesquad/.worktrees/chrome-extension-v2
git add backend/src/main/java/com/animesquad/anime/AnimeAliasController.java backend/src/test/java/com/animesquad/anime/AnimeAliasControllerIT.java
git commit -m "feat(extension): expose authenticated anime alias API"
```

---

### Task 3: 수동 매칭 성공 후 별칭 학습

최종 검토 반영: 검색 결과가 비어 있을 때뿐 아니라 자동 매칭이 틀렸을 때도 `다른 작품 선택`으로 검색 UI를 열 수 있어야 한다. 최초 감지 제목을 미리 채우고, 실제 결과 클릭 전에는 별칭을 학습하지 않는다.

**Files:**
- Modify: `chrome-extension/popup/popup.js:1-151`
- Modify: `chrome-extension/test/popup.test.js:42-113`

**Interfaces:**
- Consumes: pending `{ animeName: string, ep: number | null, results: AnimeResponse[] }`
- Consumes: authenticated `POST /api/anime/{animeId}/aliases` body `{ alias: string }`
- Produces: `learnAliasIfNeeded(): Promise<boolean>` where `true` means no learning was needed or learning succeeded, and `false` means only alias learning failed
- State: `detectedAnimeName: string | null`, `manualMatch: boolean`

- [ ] **Step 1: 팝업 테스트 하네스를 수동 검색 시나리오까지 지원하도록 확장**

In `chrome-extension/test/popup.test.js`, replace `popupContext(apiFetch)` with:

```js
function popupContext(apiFetch, {
  pending = {
    animeName: '장송의 프리렌',
    ep: 11,
    results: [{ id: 3, titleKorean: '장송의 프리렌' }],
  },
  searchResults = [],
} = {}) {
  const ids = [
    'view-login', 'view-empty', 'view-record', 'view-done', 'anime-label',
    'watchlist-warning', 'search-section', 'search-input', 'search-results',
    'ep-input', 'comment-input', 'btn-login', 'btn-dismiss', 'btn-record',
  ];
  const elements = Object.fromEntries(ids.map((id) => [id, new FakeElement()]));
  const stars = Array.from({ length: 5 }, (_, index) => {
    const star = new FakeElement();
    star.dataset.v = String(index + 1);
    return star;
  });
  const alerts = [];
  let removedKey;

  return {
    alerts,
    elements,
    get removedKey() { return removedKey; },
    context: {
      apiFetch,
      searchAnime: async () => searchResults,
      WEB_BASE: 'https://animesquad.me',
      document: {
        getElementById: (id) => elements[id],
        querySelectorAll: (selector) => selector === '.star' ? stars : [],
        createElement: () => new FakeElement(),
      },
      chrome: {
        storage: {
          local: {
            get: async () => ({ pending }),
            remove: async (key) => { removedKey = key; },
          },
        },
        action: { setBadgeText: () => {} },
        tabs: { create: () => {} },
      },
      window: { close: () => {} },
      alert: (message) => alerts.push(message),
      setTimeout: (callback) => { callback(); },
      clearTimeout: () => {},
    },
  };
}

async function selectManualSearchResult(harness) {
  harness.elements['search-input'].value = '도굴왕';
  harness.elements['search-input'].dispatch('input');
  await new Promise((resolve) => setImmediate(resolve));
  await harness.elements['search-results'].children[0].dispatch('click');
  await new Promise((resolve) => setImmediate(resolve));
}
```

- [ ] **Step 2: 별칭 학습 조건의 실패 테스트 추가**

Append these tests to `chrome-extension/test/popup.test.js`:

```js
test('수동 매칭 기록 성공 후 감지 원문을 별칭으로 학습한다', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../popup/popup.js'), 'utf8');
  const calls = [];
  const apiFetch = async (requestPath, options = {}) => {
    calls.push([requestPath, options]);
    if (requestPath === '/api/me') return { ok: true };
    if (requestPath === '/api/watch/3' && !options.method) return { ok: true };
    return { ok: true };
  };
  const harness = popupContext(apiFetch, {
    pending: { animeName: '(자막) 도굴왕', ep: 11, results: [] },
    searchResults: [{ id: 3, titleKorean: '도굴왕' }],
  });

  vm.runInNewContext(source, harness.context);
  await new Promise((resolve) => setImmediate(resolve));
  await selectManualSearchResult(harness);
  await harness.elements['btn-record'].dispatch('click');

  assert.deepStrictEqual(JSON.parse(JSON.stringify(calls.slice(-2))), [
    ['/api/watch/3', { method: 'PATCH', body: { progress: 11 } }],
    ['/api/anime/3/aliases', { method: 'POST', body: { alias: '(자막) 도굴왕' } }],
  ]);
});

test('감상 기록 실패 시 별칭을 학습하지 않는다', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../popup/popup.js'), 'utf8');
  const calls = [];
  const apiFetch = async (requestPath, options = {}) => {
    calls.push([requestPath, options]);
    if (requestPath === '/api/me') return { ok: true };
    if (requestPath === '/api/watch/3' && !options.method) return { ok: true };
    if (options.method === 'PATCH') return { ok: false, status: 500 };
    return { ok: true };
  };
  const harness = popupContext(apiFetch, {
    pending: { animeName: '(자막) 도굴왕', ep: 11, results: [] },
    searchResults: [{ id: 3, titleKorean: '도굴왕' }],
  });

  vm.runInNewContext(source, harness.context);
  await new Promise((resolve) => setImmediate(resolve));
  await selectManualSearchResult(harness);
  await harness.elements['btn-record'].dispatch('click');

  assert.strictEqual(calls.some(([requestPath]) => requestPath.endsWith('/aliases')), false);
  assert.strictEqual(harness.removedKey, undefined);
});

test('별칭 저장 실패는 성공한 감상 기록을 되돌리지 않는다', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../popup/popup.js'), 'utf8');
  const apiFetch = async (requestPath, options = {}) => {
    if (requestPath === '/api/me') return { ok: true };
    if (requestPath === '/api/watch/3' && !options.method) return { ok: true };
    if (requestPath.endsWith('/aliases')) return { ok: false, status: 500 };
    return { ok: true };
  };
  const harness = popupContext(apiFetch, {
    pending: { animeName: '(자막) 도굴왕', ep: 11, results: [] },
    searchResults: [{ id: 3, titleKorean: '도굴왕' }],
  });

  vm.runInNewContext(source, harness.context);
  await new Promise((resolve) => setImmediate(resolve));
  await selectManualSearchResult(harness);
  await harness.elements['btn-record'].dispatch('click');

  assert.strictEqual(harness.removedKey, 'pending');
  assert.strictEqual(harness.elements['view-done'].classNames.has('hidden'), false);
  assert.deepStrictEqual(harness.alerts, ['기록은 완료됐지만 별칭 저장에 실패했어요.']);
});
```

In the existing automatic-match test, add this assertion after the request assertions:

```js
assert.strictEqual(calls.some(([requestPath]) => requestPath.endsWith('/aliases')), false);
```

- [ ] **Step 3: 팝업 테스트가 별칭 API 미호출로 실패하는지 확인**

Run:

```bash
cd /Users/yubeen/animesquad/.worktrees/chrome-extension-v2
node --test chrome-extension/test/popup.test.js
```

Expected: FAIL in `수동 매칭 기록 성공 후 감지 원문을 별칭으로 학습한다` because no alias request is made.

- [ ] **Step 4: 감지 원문과 수동 선택 상태 저장**

At the top of `chrome-extension/popup/popup.js`, add:

```js
let detectedAnimeName = null;
let manualMatch = false;
```

Replace `loadRecord` and the manual result selection call with:

```js
async function loadRecord({ animeName, ep, results }) {
  detectedAnimeName = animeName;
  if (ep) $('ep-input').value = ep;

  if (results && results.length > 0) {
    await selectAnime(results[0]);
  } else {
    $('anime-label').textContent = `"${animeName}" 을(를) 찾지 못했어요. 직접 검색해주세요.`;
    $('search-section').classList.remove('hidden');
    $('search-input').value = animeName;
  }
}
```

Inside the search-result click listener, immediately before `selectAnime(a)`, add:

```js
manualMatch = true;
```

- [ ] **Step 5: 기록 성공 후 비차단 별칭 학습 구현**

Add this function before the button handlers in `chrome-extension/popup/popup.js`:

```js
async function learnAliasIfNeeded() {
  if (!manualMatch || !detectedAnimeName) return true;
  try {
    const response = await apiFetch(`/api/anime/${selectedAnime.id}/aliases`, {
      method: 'POST',
      body: { alias: detectedAnimeName },
    });
    return response.ok;
  } catch {
    return false;
  }
}
```

After the successful episode/progress request and before clearing pending data, insert:

```js
const aliasLearned = await learnAliasIfNeeded();
```

After clearing pending data and badge, but before `showView('view-done')`, insert:

```js
if (!aliasLearned) {
  alert('기록은 완료됐지만 별칭 저장에 실패했어요.');
}
```

- [ ] **Step 6: 전체 Chrome Extension 테스트 통과 확인**

Run:

```bash
cd /Users/yubeen/animesquad/.worktrees/chrome-extension-v2
node --test chrome-extension/test/*.test.js
```

Expected: all tests pass with `0 failed`; the original progress test still proves episode `11` is sent as `{ progress: 11 }`.

- [ ] **Step 7: JavaScript 문법과 diff 형식 확인**

Run:

```bash
cd /Users/yubeen/animesquad/.worktrees/chrome-extension-v2
node --check chrome-extension/popup/popup.js
git diff --check
```

Expected: both commands exit `0` with no output.

- [ ] **Step 8: Task 3 커밋**

```bash
cd /Users/yubeen/animesquad/.worktrees/chrome-extension-v2
git add chrome-extension/popup/popup.js chrome-extension/test/popup.test.js
git commit -m "feat(extension): learn aliases after manual matching"
```

---

## Final Verification

- [ ] Run backend alias and search tests:

```bash
cd /Users/yubeen/animesquad/.worktrees/chrome-extension-v2/backend
./gradlew test --tests com.animesquad.anime.AnimeAliasServiceTest --tests com.animesquad.anime.AnimeAliasControllerIT --tests com.animesquad.anime.AnimeControllerIT
```

Expected: all selected backend tests pass with `0 failed`.

- [ ] Run all extension tests:

```bash
cd /Users/yubeen/animesquad/.worktrees/chrome-extension-v2
node --test chrome-extension/test/*.test.js
```

Expected: all extension tests pass with `0 failed`.

- [ ] Verify clean syntax and intended diff:

```bash
cd /Users/yubeen/animesquad/.worktrees/chrome-extension-v2
node --check chrome-extension/popup/popup.js
git diff --check e39680a..HEAD
git status --short
```

Expected: syntax and diff checks exit `0`; status is clean; changes are limited to the original Chrome Extension implementation, the learned-alias backend/extension changes, and their docs/tests.

- [ ] Manual Chrome smoke test with the unpacked extension:

1. Load `/Users/yubeen/animesquad/.worktrees/chrome-extension-v2/chrome-extension` from `chrome://extensions`.
2. Trigger a title with no automatic result, such as `(자막) 도굴왕`, and manually search/select `도굴왕`.
3. Confirm the detected episode remains prefilled and click `기록하기`.
4. Confirm the watch/progress record succeeds.
5. Trigger the same detected title again and confirm it now auto-matches without manual search.
