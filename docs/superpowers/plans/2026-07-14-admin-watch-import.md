# 관리자용 애니 감상 기록 가져오기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자가 이메일로 지정한 사용자의 여러 애니와 회차를 텍스트에서 미리보기한 후, 기존 리뷰를 보존하고 피드를 생성하지 않으면서 `WATCHING` 기록으로 일괄 저장한다.

**Architecture:** 파싱·제목 정규화·정확 매칭은 `AdminWatchImportService`의 미리보기 경로가 담당하고, 저장 경로는 선택된 `animeId/progress`만 다시 검증해 단일 트랜잭션으로 `WatchEntry`를 직접 생성·수정한다. 관리자 전용 컨트롤러가 인증을 강제하고, 프론트엔드 관리자 페이지는 미리보기 결과 중 `MATCHED` 항목만 선택해 저장한다.

**Tech Stack:** Java 21, Spring Boot, Spring Data JPA, PostgreSQL, JUnit 5/Testcontainers, Next.js 14, React, TypeScript, Tailwind CSS

## Global Constraints

- 미리보기와 저장 API는 관리자만 사용할 수 있다.
- 대상 사용자는 고유 이메일로 찾고, 저장 요청에서는 `targetUserId`의 존재를 다시 검증한다.
- 한 줄의 마지막 `숫자 + 화`만 회차로 해석하며 회차는 1 이상이다.
- 한 요청은 빈 줄을 제외하기 전 원본 기준 최대 200줄이다.
- 정규화 후 정확히 일치하는 단일 캐시 작품만 `MATCHED`다. 0개 또는 2개 이상이면 `UNMATCHED`다.
- 동일 작품이 여러 줄에서 매칭되면 마지막 줄만 `MATCHED`, 앞선 줄은 `DUPLICATE`다.
- 저장 시 신규·기존 기록 모두 상태는 `WATCHING`, 진도는 가져온 값으로 덮어쓴다.
- 기존 시리즈 별점·감상평과 회차별 리뷰는 변경하지 않는다.
- 가져오기 저장은 활동 이벤트를 발행하지 않아 피드를 생성하지 않는다.
- 선택 항목 전체를 하나의 트랜잭션으로 저장하며 하나라도 잘못되면 전체 롤백한다.
- 일반 사용자의 기존 기록·피드 흐름은 변경하지 않는다.

---

### Task 1: 입력 파싱과 정확 제목 매칭 미리보기

**Files:**
- Create: `backend/src/main/java/com/animesquad/admin/watchimport/AdminWatchImportDtos.java`
- Create: `backend/src/main/java/com/animesquad/admin/watchimport/AdminWatchImportService.java`
- Modify: `backend/src/main/java/com/animesquad/user/UserRepository.java`
- Test: `backend/src/test/java/com/animesquad/admin/watchimport/AdminWatchImportServiceTest.java`

**Interfaces:**
- Consumes: `AnimeSearchService.search(String)`, `UserRepository.findByEmailIgnoreCase(String)`
- Produces: `AdminWatchImportService.preview(String email, String text): PreviewResponse`, `LineStatus`, `PreviewLine`

- [ ] **Step 1: 파싱과 매칭 실패 테스트를 작성한다**

Create `AdminWatchImportServiceTest` with Mockito-backed repositories/search service and tests covering these exact cases:

```java
@Test
void preview_parsesTitleAndTrailingEpisode() {
    when(users.findByEmailIgnoreCase("target@x.y")).thenReturn(Optional.of(target));
    when(search.search("월드 이즈 댄싱")).thenReturn(List.of(worldIsDancing));

    PreviewResponse result = service.preview(
        " target@x.y ", "월드 이즈 댄싱3화\n");

    assertThat(result.targetUser().id()).isEqualTo(target.getId());
    assertThat(result.lines()).singleElement().satisfies(line -> {
        assertThat(line.title()).isEqualTo("월드 이즈 댄싱");
        assertThat(line.progress()).isEqualTo(3);
        assertThat(line.status()).isEqualTo(LineStatus.MATCHED);
        assertThat(line.anime().id()).isEqualTo(worldIsDancing.getId());
    });
}

@Test
void preview_marksInvalidAndUnmatchedWithoutFailingWholePreview() {
    when(users.findByEmailIgnoreCase("target@x.y")).thenReturn(Optional.of(target));
    when(search.search("없는 작품")).thenReturn(List.of());

    PreviewResponse result = service.preview(
        "target@x.y", "형식 오류\n없는 작품2화\n0화");

    assertThat(result.lines()).extracting(PreviewLine::status)
        .containsExactly(LineStatus.INVALID, LineStatus.UNMATCHED, LineStatus.INVALID);
}

@Test
void preview_rejectsMoreThan200PhysicalLines() {
    String text = IntStream.range(0, 201)
        .mapToObj(i -> "작품" + i + "1화")
        .collect(Collectors.joining("\n"));

    assertThatThrownBy(() -> service.preview("target@x.y", text))
        .isInstanceOf(ResponseStatusException.class)
        .satisfies(e -> assertThat(((ResponseStatusException) e).getStatusCode())
            .isEqualTo(HttpStatus.BAD_REQUEST));
}
```

Use reflection helpers in the test to assign IDs to `User` and `Anime`, matching existing test conventions where necessary.

- [ ] **Step 2: 테스트를 실행해 실패를 확인한다**

Run:

```bash
cd backend && ./gradlew test --tests '*AdminWatchImportServiceTest' --rerun-tasks
```

Expected: compilation fails because `AdminWatchImportService` and DTOs do not exist.

- [ ] **Step 3: DTO와 사용자 이메일 조회 인터페이스를 작성한다**

Create `AdminWatchImportDtos.java`:

```java
package com.animesquad.admin.watchimport;

import java.util.List;

public final class AdminWatchImportDtos {
    private AdminWatchImportDtos() {}

    public enum LineStatus { MATCHED, UNMATCHED, INVALID, DUPLICATE }

    public record TargetUser(Long id, String email, String displayName) {}
    public record AnimeRef(Long id, String titleKorean, String titleRomaji,
                           String coverImageUrl) {}
    public record PreviewLine(int lineNumber, String rawLine, String title,
                              Integer progress, LineStatus status,
                              AnimeRef anime, String message) {}
    public record PreviewResponse(TargetUser targetUser, List<PreviewLine> lines) {}
    public record PreviewRequest(String email, String text) {}
    public record CommitItem(Long animeId, Integer progress) {}
    public record CommitRequest(Long targetUserId, List<CommitItem> items) {}
    public record CommitResponse(int created, int updated) {}
}
```

Add to `UserRepository`:

```java
Optional<User> findByEmailIgnoreCase(String email);
```

- [ ] **Step 4: 최소 미리보기 구현을 작성한다**

Create `AdminWatchImportService` with:

```java
private static final int MAX_LINES = 200;
private static final Pattern LINE_PATTERN = Pattern.compile("^(.+?)(\\d+)화\\s*$");

public PreviewResponse preview(String email, String text) {
    if (email == null || email.isBlank() || text == null || text.isBlank()) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "email and text are required");
    }
    User target = users.findByEmailIgnoreCase(email.trim())
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "user not found"));
    String[] physicalLines = text.split("\\R", -1);
    if (physicalLines.length > MAX_LINES) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "maximum 200 lines");
    }

    List<PreviewLine> lines = new ArrayList<>();
    for (int index = 0; index < physicalLines.length; index++) {
        String raw = physicalLines[index];
        if (raw.isBlank()) continue;
        lines.add(previewLine(index + 1, raw));
    }
    markEarlierDuplicates(lines);
    return new PreviewResponse(
        new TargetUser(target.getId(), target.getEmail(), target.getDisplayName()),
        List.copyOf(lines));
}
```

`previewLine` must parse the pattern, reject progress below 1, call `search.search(title)`, filter candidates with `matchesExactNormalizedTitle`, deduplicate by anime ID, and return `MATCHED` only when exactly one candidate remains.

Normalization must use NFKC, lowercase with `Locale.ROOT`, and retain only letters and digits:

```java
static String normalizeTitle(String value) {
    if (value == null) return "";
    String normalized = Normalizer.normalize(value, Normalizer.Form.NFKC)
        .toLowerCase(Locale.ROOT);
    return normalized.codePoints()
        .filter(Character::isLetterOrDigit)
        .collect(StringBuilder::new, StringBuilder::appendCodePoint, StringBuilder::append)
        .toString();
}
```

Match against the four title fields and individual `searchKeywords` aliases split by commas or line breaks:

```java
private boolean matchesExactNormalizedTitle(Anime anime, String expected) {
    Stream<String> titles = Stream.of(
        anime.getTitleKorean(), anime.getTitleNative(),
        anime.getTitleEnglish(), anime.getTitleRomaji());
    Stream<String> aliases = anime.getSearchKeywords() == null
        ? Stream.empty()
        : Arrays.stream(anime.getSearchKeywords().split(",|\\R"));
    return Stream.concat(titles, aliases)
        .filter(Objects::nonNull)
        .map(AdminWatchImportService::normalizeTitle)
        .anyMatch(expected::equals);
}
```

`markEarlierDuplicates` must scan matched rows from bottom to top by `anime.id`, preserve the last `MATCHED`, and replace earlier matches with `DUPLICATE`, `anime = null`, message `뒤의 동일 작품 입력으로 대체됨`.

- [ ] **Step 5: 정규화·모호성·중복 테스트를 추가한다**

Add exact tests:

```java
@Test
void preview_matchesPunctuationAndSpacingDifferences() { /* 아주르 레인 미속전진! 2!! ↔ 아주르레인 미속전진 2 */ }

@Test
void preview_treatsTwoExactCandidatesAsUnmatched() { /* search returns two normalized exact matches */ }

@Test
void preview_keepsLastDuplicateAsMatched() { /* same anime at 2화 then 3화 */ }

@Test
void preview_matchesIndividualSearchKeywordAlias() { /* "뱅드림, 방드림" and input 방드림 */ }
```

Assertions must verify status, line number, progress, selected anime ID, and message—not just list size.

- [ ] **Step 6: Task 1 테스트를 통과시킨다**

```bash
cd backend && ./gradlew test --tests '*AdminWatchImportServiceTest' --rerun-tasks
```

Expected: all `AdminWatchImportServiceTest` tests pass.

- [ ] **Step 7: Task 1을 커밋한다**

```bash
git add backend/src/main/java/com/animesquad/admin/watchimport \
  backend/src/main/java/com/animesquad/user/UserRepository.java \
  backend/src/test/java/com/animesquad/admin/watchimport/AdminWatchImportServiceTest.java
git commit -m "feat(import): 감상 기록 텍스트 미리보기와 제목 매칭 추가"
```

---

### Task 2: 관리자 API와 피드 없는 일괄 저장

**Files:**
- Create: `backend/src/main/java/com/animesquad/admin/watchimport/AdminWatchImportController.java`
- Modify: `backend/src/main/java/com/animesquad/admin/watchimport/AdminWatchImportService.java`
- Test: `backend/src/test/java/com/animesquad/admin/watchimport/AdminWatchImportControllerIT.java`

**Interfaces:**
- Consumes: Task 1 DTOs and `preview`, `WatchEntryRepository`, `AnimeRepository`
- Produces: `POST /api/admin/watch-import/preview`, `POST /api/admin/watch-import/commit`, `AdminWatchImportService.commit(Long, List<CommitItem>)`

- [ ] **Step 1: API 권한과 저장 통합 테스트를 작성한다**

Create `AdminWatchImportControllerIT` following `AdminAnimeControllerIT` setup (`@SpringBootTest`, `AbstractIntegrationTest`, JWT cookie helper, `app.admin.emails=admin@x.y`). Include:

```java
@Test
void preview_returns401_withoutAuthentication() { /* expect UNAUTHORIZED */ }

@Test
void preview_returns403_forNonAdmin() { /* regular user JWT */ }

@Test
void preview_returns404_forUnknownEmail() { /* admin JWT, unknown target */ }

@Test
void commit_createsAndOverwritesSilently_whilePreservingReview() {
    // Seed target, two anime, one existing WatchEntry with status COMPLETED,
    // progress 8, score 5, comment "keep me".
    // Seed squad membership for target so feed fan-out would be observable.
    // POST commit with existing anime progress 2 and new anime progress 3.
    // Assert response created=1, updated=1.
    // Assert both entries WATCHING with imported progress.
    // Assert existing score/comment remain 5/"keep me".
    // Assert ActivityRepository contains no new activities for either anime.
}

@Test
void commit_rejectsDuplicateAnimeIds_andWritesNothing() { /* expect 400; no entries */ }

@Test
void commit_rejectsMissingAnime_andRollsBackAllItems() { /* one valid + one missing; expect 404; valid not saved */ }
```

- [ ] **Step 2: 통합 테스트 실패를 확인한다**

```bash
cd backend && ./gradlew test --tests '*AdminWatchImportControllerIT' --rerun-tasks
```

Expected: compilation fails because the controller and `commit` method do not exist.

- [ ] **Step 3: 관리자 전용 컨트롤러를 구현한다**

Create `AdminWatchImportController`:

```java
@RestController
@RequestMapping("/api/admin/watch-import")
public class AdminWatchImportController {
    private final AdminWatchImportService imports;
    private final UserService users;
    private final AdminProperties adminProperties;

    private void requireAdmin(CurrentUser current) {
        User user = users.getById(current.userId());
        if (!adminProperties.isAdminEmail(user.getEmail())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "admin only");
        }
    }

    @PostMapping("/preview")
    public PreviewResponse preview(@AuthenticationPrincipal CurrentUser current,
                                   @RequestBody PreviewRequest body) {
        requireAdmin(current);
        return imports.preview(body.email(), body.text());
    }

    @PostMapping("/commit")
    public CommitResponse commit(@AuthenticationPrincipal CurrentUser current,
                                 @RequestBody CommitRequest body) {
        requireAdmin(current);
        return imports.commit(body.targetUserId(), body.items());
    }
}
```

Use constructor injection for all dependencies.

- [ ] **Step 4: 무이벤트 일괄 저장을 구현한다**

Add to `AdminWatchImportService`:

```java
@Transactional
public CommitResponse commit(Long targetUserId, List<CommitItem> items) {
    if (targetUserId == null || items == null || items.isEmpty() || items.size() > MAX_LINES) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "target user and 1-200 items are required");
    }
    if (!users.existsById(targetUserId)) {
        throw new ResponseStatusException(HttpStatus.NOT_FOUND, "user not found");
    }
    if (items.stream().anyMatch(i -> i == null || i.animeId() == null
            || i.progress() == null || i.progress() < 1)) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid import item");
    }
    Set<Long> animeIds = items.stream().map(CommitItem::animeId).collect(Collectors.toSet());
    if (animeIds.size() != items.size()) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "duplicate anime id");
    }
    Map<Long, Anime> animeMap = animes.findAllById(animeIds).stream()
        .collect(Collectors.toMap(Anime::getId, Function.identity()));
    if (animeMap.size() != animeIds.size()) {
        throw new ResponseStatusException(HttpStatus.NOT_FOUND, "anime not found");
    }

    int created = 0;
    int updated = 0;
    for (CommitItem item : items) {
        WatchEntry entry = entries.findByUserIdAndAnimeId(targetUserId, item.animeId())
            .orElse(null);
        if (entry == null) {
            entry = new WatchEntry(targetUserId, item.animeId(), WatchStatus.WATCHING);
            entry.apply(null, item.progress(), null, null);
            entries.save(entry);
            created++;
        } else {
            entry.apply(WatchStatus.WATCHING, item.progress(), null, null);
            updated++;
        }
    }
    return new CommitResponse(created, updated);
}
```

Do not inject or call `ApplicationEventPublisher` or `WatchService` in this service. `WatchEntry.apply(..., null, null)` preserves score/comment and only changes status/progress/updatedAt.

- [ ] **Step 5: 저장 검증 테스트를 통과시킨다**

```bash
cd backend && ./gradlew test --tests '*AdminWatchImportControllerIT' --rerun-tasks
```

Expected: all controller integration tests pass with zero new activity rows.

- [ ] **Step 6: 기존 관리자·감상 API 회귀 테스트를 실행한다**

```bash
cd backend && ./gradlew test --tests '*AdminAnimeControllerIT' --tests '*WatchControllerIT' --rerun-tasks
```

Expected: existing tests pass unchanged.

- [ ] **Step 7: Task 2를 커밋한다**

```bash
git add backend/src/main/java/com/animesquad/admin/watchimport \
  backend/src/test/java/com/animesquad/admin/watchimport/AdminWatchImportControllerIT.java
git commit -m "feat(import): 관리자 전용 무이벤트 감상 기록 일괄 저장 추가"
```

---

### Task 3: 프론트엔드 가져오기 API 타입

**Files:**
- Modify: `frontend/src/app/lib/api.ts`

**Interfaces:**
- Consumes: Task 2 JSON contracts
- Produces: `WatchImportPreview`, `WatchImportLine`, `WatchImportCommitResponse` TypeScript types

- [ ] **Step 1: API 타입을 추가한다**

Append to `api.ts`:

```ts
export type WatchImportLineStatus = "MATCHED" | "UNMATCHED" | "INVALID" | "DUPLICATE";

export type WatchImportAnimeRef = {
  id: number;
  titleKorean: string | null;
  titleRomaji: string;
  coverImageUrl: string | null;
};

export type WatchImportLine = {
  lineNumber: number;
  rawLine: string;
  title: string | null;
  progress: number | null;
  status: WatchImportLineStatus;
  anime: WatchImportAnimeRef | null;
  message: string | null;
};

export type WatchImportPreview = {
  targetUser: { id: number; email: string; displayName: string };
  lines: WatchImportLine[];
};

export type WatchImportCommitResponse = {
  created: number;
  updated: number;
};
```

- [ ] **Step 2: TypeScript 검사를 실행한다**

```bash
cd frontend && pnpm exec tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 3: Task 3을 커밋한다**

```bash
git add frontend/src/app/lib/api.ts
git commit -m "feat(import): 관리자 감상 기록 가져오기 API 타입 추가"
```

---

### Task 4: 관리자 미리보기·선택·저장 화면

**Files:**
- Create: `frontend/src/app/admin/watch-import/page.tsx`
- Modify: `frontend/src/app/admin/anime/page.tsx`

**Interfaces:**
- Consumes: `apiPost`, Task 3 types, `/api/me`, preview and commit APIs
- Produces: `/admin/watch-import` 관리자 UI and navigation link

- [ ] **Step 1: 관리자 페이지 상태와 요청 흐름을 구현한다**

Create a client page with these exact states:

```ts
const [me, setMe] = useState<Me | null>(null);
const [email, setEmail] = useState("");
const [text, setText] = useState("");
const [preview, setPreview] = useState<WatchImportPreview | null>(null);
const [selected, setSelected] = useState<Set<number>>(new Set());
const [loading, setLoading] = useState(true);
const [previewing, setPreviewing] = useState(false);
const [committing, setCommitting] = useState(false);
const [error, setError] = useState<string | null>(null);
const [result, setResult] = useState<WatchImportCommitResponse | null>(null);
```

On mount, call `apiGet<Me>("/api/me")`. Render `관리자 권한이 필요해요` and no form when `!me.isAdmin`. Backend authorization remains authoritative.

Preview request:

```ts
const response = await apiPost<WatchImportPreview>(
  "/api/admin/watch-import/preview", { email, text }
);
setPreview(response);
setSelected(new Set(
  response.lines
    .filter((line) => line.status === "MATCHED" && line.anime)
    .map((line) => line.lineNumber)
));
```

Commit request must derive items only from currently selected matched lines:

```ts
const items = preview.lines
  .filter((line) => selected.has(line.lineNumber) && line.status === "MATCHED" && line.anime && line.progress)
  .map((line) => ({ animeId: line.anime!.id, progress: line.progress! }));
const response = await apiPost<WatchImportCommitResponse>(
  "/api/admin/watch-import/commit",
  { targetUserId: preview.targetUser.id, items }
);
```

Disable inputs and buttons during requests, clear stale preview/result when email or text changes, and prevent commit when no rows are selected.

- [ ] **Step 2: 미리보기 UI를 구현한다**

Render:

- heading `관리자 · 감상 기록 가져오기`
- link back to `/admin/anime`
- labeled email input
- labeled multiline textarea with the sample format placeholder
- `미리보기` button
- target user summary (`displayName`, `email`)
- each row with line number, raw title/progress, status badge, matched anime cover/title
- checkbox only for `MATCHED` rows
- `UNMATCHED`: `직접 검색해서 추가해주세요`
- `INVALID` and `DUPLICATE`: server message
- `선택 항목 가져오기 (N개)` button
- success: `신규 N개, 기존 M개 갱신 완료 · 피드에는 표시되지 않아요`

Use a `<label>` for every input, native checkboxes, `aria-live="polite"` for success/error summaries, and existing neutral/rose/emerald Tailwind styles.

- [ ] **Step 3: 관리자 애니 화면에 이동 링크를 추가한다**

Import `Link` and add beside the existing heading:

```tsx
<Link
  href="/admin/watch-import"
  className="text-sm font-medium text-neutral-600 hover:text-neutral-900"
>
  감상 기록 가져오기
</Link>
```

- [ ] **Step 4: 프론트엔드 검사를 실행한다**

```bash
cd frontend && pnpm exec tsc --noEmit && pnpm lint
```

Expected: TypeScript exit 0; lint has no new errors or warnings. The pre-existing `NavBar.tsx:44` exhaustive-deps warning may remain.

- [ ] **Step 5: Task 4를 커밋한다**

```bash
git add frontend/src/app/admin/watch-import/page.tsx frontend/src/app/admin/anime/page.tsx
git commit -m "feat(import): 관리자 감상 기록 미리보기와 저장 화면 추가"
```

---

### Task 5: 전체 회귀 검증

**Files:**
- Verify only

**Interfaces:**
- Consumes: Tasks 1–4 complete implementation
- Produces: backend/frontend verification evidence

- [ ] **Step 1: 백엔드 전체 테스트를 캐시 없이 실행한다**

```bash
cd backend && ./gradlew test --rerun-tasks
```

Expected: `BUILD SUCCESSFUL`, zero failed tests.

- [ ] **Step 2: 프론트엔드 타입과 lint를 실행한다**

```bash
cd frontend && pnpm exec tsc --noEmit && pnpm lint
```

Expected: exit 0; only the pre-existing `NavBar.tsx:44` exhaustive-deps warning is allowed.

- [ ] **Step 3: diff 무결성과 범위를 확인한다**

```bash
git diff --check 89e793d..HEAD
git status --short
```

Expected: no whitespace errors; only the existing unrelated untracked files remain.
