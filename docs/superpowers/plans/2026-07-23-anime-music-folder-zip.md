# Anime Music Folder ZIP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an AnimeSquad administrator download a ZIP containing `연도/연도 N분기/한글 제목 (로마자 제목)/` empty folders for every Korean-titled anime in a selected season.

**Architecture:** A focused Spring service queries the existing anime cache, normalizes safe directory names, and builds an in-memory UTF-8 ZIP. The existing admin controller validates authorization and parameters; a small frontend binary client is called by the current season cache panel.

**Tech Stack:** Java 21, Spring Boot 3.3, Spring Data JPA, JUnit 5, Mockito, `java.util.zip`, Next.js 14, React 18, TypeScript, Node test runner, `tsx`.

## Global Constraints

- Include all matching anime with non-null, non-blank `title_korean`; do not filter format or airing status.
- Map `WINTER/SPRING/SUMMER/FALL` to quarters `1/2/3/4`.
- Write empty UTF-8 directory entries in memory only; do not create server files or add dependencies.
- Use `<year>년/<year>년 <quarter>분기/<Korean> (<Romaji>)/`.
- Replace `/`, `:`, and NUL with `-`; collapse whitespace; trim trailing dots/spaces; cap names at 200 Unicode code points.
- Add `[AniList-<id>]` to collisions, falling back to `[AnimeSquad-<id>]`.
- Reuse the existing administrator authorization and JSON error behavior.
- Preserve unrelated dirty-worktree changes.

## File Structure

- Create `backend/src/main/java/com/animesquad/admin/AnimeFolderArchiveService.java`: selection, safe naming, ZIP generation.
- Modify `backend/src/main/java/com/animesquad/anime/AnimeRepository.java`: deterministic season query.
- Create `backend/src/test/java/com/animesquad/admin/AnimeFolderArchiveServiceTest.java`: ZIP unit tests.
- Modify `backend/src/main/java/com/animesquad/admin/AdminAnimeController.java`: binary endpoint.
- Modify `backend/src/test/java/com/animesquad/admin/AdminAnimeControllerIT.java`: endpoint integration tests.
- Create `frontend/src/app/admin/anime/folder-archive.ts` and `.test.ts`: binary request helper and tests.
- Modify `frontend/src/app/admin/anime/page.tsx`: download button and browser save action.
- Create `frontend/src/app/admin/anime/folder-archive-ui.test.mjs`: UI source contract.

---

### Task 1: Generate deterministic folder archives

**Files:**
- Modify: `backend/src/main/java/com/animesquad/anime/AnimeRepository.java:40`
- Create: `backend/src/main/java/com/animesquad/admin/AnimeFolderArchiveService.java`
- Create: `backend/src/test/java/com/animesquad/admin/AnimeFolderArchiveServiceTest.java`

**Interfaces:**
- Consumes: `AnimeRepository`, existing `Anime` getters.
- Produces: `AnimeFolderArchiveService.create(int, String): Archive`, where `Archive` is `record Archive(byte[] bytes, String downloadFilename)`.

- [ ] **Step 1: Write the failing service tests**

Create three tests using a mocked repository and `ZipInputStream`:

```java
@Test
void createsQuarterTree_andSkipsBlankKoreanTitles() throws Exception {
    Anime included = anime(101, "Romaji / Title", "  한글   제목  ");
    Anime blank = anime(102, "Ignored", "   ");
    when(animes.findBySeasonYearAndSeasonAndTitleKoreanIsNotNullOrderByTitleKoreanAscIdAsc(
        2026, "SPRING")).thenReturn(List.of(blank, included));

    var archive = service.create(2026, "SPRING");

    assertThat(archive.downloadFilename()).isEqualTo("2026년-2분기-애니-음원-폴더.zip");
    assertThat(entries(archive.bytes())).containsExactly(
        "2026년/",
        "2026년/2026년 2분기/",
        "2026년/2026년 2분기/한글 제목 (Romaji - Title)/");
}

@Test
void createsOnlyRootFolders_whenSeasonHasNoTitledAnime() throws Exception {
    when(animes.findBySeasonYearAndSeasonAndTitleKoreanIsNotNullOrderByTitleKoreanAscIdAsc(
        2026, "WINTER")).thenReturn(List.of());
    assertThat(entries(service.create(2026, "WINTER").bytes()))
        .containsExactly("2026년/", "2026년/2026년 1분기/");
}

@Test
void limitsUnicodeNames_andAddsCollisionSuffix() throws Exception {
    Anime first = anime(201, "Same:Title", "한글/제목.");
    Anime second = anime(202, "Same/Title", "한글:제목.");
    Anime longTitle = anime(203, "😀".repeat(220), "긴 제목");
    when(animes.findBySeasonYearAndSeasonAndTitleKoreanIsNotNullOrderByTitleKoreanAscIdAsc(
        2026, "SUMMER")).thenReturn(List.of(first, second, longTitle));

    List<String> names = entries(service.create(2026, "SUMMER").bytes());

    assertThat(names).contains(
        "2026년/2026년 3분기/한글-제목 (Same-Title)/",
        "2026년/2026년 3분기/한글-제목 (Same-Title) [AniList-202]/");
    String entry = names.stream().filter(n -> n.contains("긴 제목 (")).findFirst().orElseThrow();
    String folder = entry.substring(entry.lastIndexOf('/', entry.length() - 2) + 1, entry.length() - 1);
    assertThat(folder.codePointCount(0, folder.length())).isLessThanOrEqualTo(200);
    assertThat(folder).endsWith(")");
}
```

Test helpers construct `Anime` with its public constructor, call `setTitleKorean`, and enumerate entry names with `ZipInputStream`.

Use this exact fixture and helper code in the test class:

```java
private final AnimeRepository animes = mock(AnimeRepository.class);
private final AnimeFolderArchiveService service = new AnimeFolderArchiveService(animes);

private static Anime anime(Integer anilistId, String romaji, String korean) {
    Anime anime = new Anime(anilistId, romaji, "Native", null, null, 12,
        "FINISHED", "TV", 2026, "SPRING", null);
    anime.setTitleKorean(korean);
    return anime;
}

private static List<String> entries(byte[] bytes) throws Exception {
    List<String> names = new ArrayList<>();
    try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(bytes))) {
        for (ZipEntry entry; (entry = zip.getNextEntry()) != null;) {
            names.add(entry.getName());
        }
    }
    return names;
}
```

- [ ] **Step 2: Verify the tests fail**

Run: `cd backend && ./gradlew test --tests com.animesquad.admin.AnimeFolderArchiveServiceTest`

Expected: compile failure because the service and repository method do not exist.

- [ ] **Step 3: Add the repository method**

```java
List<Anime> findBySeasonYearAndSeasonAndTitleKoreanIsNotNullOrderByTitleKoreanAscIdAsc(
    Integer seasonYear, String season);
```

- [ ] **Step 4: Implement the service**

The complete public flow is:

```java
@Service
public class AnimeFolderArchiveService {
    private static final int MAX_FOLDER_CODE_POINTS = 200;
    private final AnimeRepository animes;

    public AnimeFolderArchiveService(AnimeRepository animes) { this.animes = animes; }
    public record Archive(byte[] bytes, String downloadFilename) {}

    @Transactional(readOnly = true)
    public Archive create(int year, String season) {
        int quarter = switch (season) {
            case "WINTER" -> 1; case "SPRING" -> 2;
            case "SUMMER" -> 3; case "FALL" -> 4;
            default -> throw new IllegalArgumentException("invalid season: " + season);
        };
        String root = year + "년/";
        String quarterRoot = root + year + "년 " + quarter + "분기/";
        Set<String> used = new HashSet<>();
        List<Anime> selected = animes
            .findBySeasonYearAndSeasonAndTitleKoreanIsNotNullOrderByTitleKoreanAscIdAsc(year, season);
        try (ByteArrayOutputStream bytes = new ByteArrayOutputStream();
             ZipOutputStream zip = new ZipOutputStream(bytes, StandardCharsets.UTF_8)) {
            addDirectory(zip, root);
            addDirectory(zip, quarterRoot);
            for (Anime anime : selected) {
                if (!anime.getTitleKorean().isBlank()) {
                    addDirectory(zip, quarterRoot + uniqueFolderName(anime, used) + "/");
                }
            }
            zip.finish();
            return new Archive(bytes.toByteArray(),
                year + "년-" + quarter + "분기-애니-음원-폴더.zip");
        } catch (IOException e) {
            throw new IllegalStateException("failed to create anime folder archive", e);
        }
    }
}
```

Add private helpers with these exact contracts:

```java
private static String safeComponent(String value) {
    return value.trim().replace('/', '-').replace(':', '-').replace('\0', '-')
        .replaceAll("\\s+", " ").replaceAll("[. ]+$", "");
}

private static String truncate(String value, int max) {
    if (value.codePointCount(0, value.length()) <= max) return value;
    return value.substring(0, value.offsetByCodePoints(0, max));
}

private static String baseFolderName(Anime anime) {
    String korean = safeComponent(anime.getTitleKorean());
    String romaji = safeComponent(anime.getTitleRomaji());
    String full = korean + " (" + romaji + ")";
    if (full.codePointCount(0, full.length()) <= MAX_FOLDER_CODE_POINTS) return full;
    int romajiBudget = MAX_FOLDER_CODE_POINTS - korean.codePointCount(0, korean.length()) - 3;
    if (romajiBudget > 0) return korean + " (" + truncate(romaji, romajiBudget) + ")";
    return truncate(korean, MAX_FOLDER_CODE_POINTS - 4) + " (" + truncate(romaji, 1) + ")";
}

private static String uniqueFolderName(Anime anime, Set<String> used) {
    String base = baseFolderName(anime);
    if (used.add(base)) return base;
    String suffix = anime.getAnilistId() != null
        ? " [AniList-" + anime.getAnilistId() + "]"
        : " [AnimeSquad-" + anime.getId() + "]";
    String unique = truncate(base, MAX_FOLDER_CODE_POINTS
        - suffix.codePointCount(0, suffix.length())) + suffix;
    used.add(unique);
    return unique;
}

private static void addDirectory(ZipOutputStream zip, String path) throws IOException {
    zip.putNextEntry(new ZipEntry(path));
    zip.closeEntry();
}
```

- [ ] **Step 5: Verify service tests pass**

Run: `cd backend && ./gradlew test --tests com.animesquad.admin.AnimeFolderArchiveServiceTest`

Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/animesquad/anime/AnimeRepository.java \
  backend/src/main/java/com/animesquad/admin/AnimeFolderArchiveService.java \
  backend/src/test/java/com/animesquad/admin/AnimeFolderArchiveServiceTest.java
git commit -m "feat: generate anime music folder archives"
```

---

### Task 2: Expose the administrator endpoint

**Files:**
- Modify: `backend/src/main/java/com/animesquad/admin/AdminAnimeController.java:33-100`
- Modify: `backend/src/test/java/com/animesquad/admin/AdminAnimeControllerIT.java`

**Interfaces:**
- Consumes: Task 1 `Archive`.
- Produces: `GET /api/admin/anime/folder-archive?year=<year>&season=<season>` returning `application/zip`.

- [ ] **Step 1: Write failing integration tests**

Add tests which seed one `SPRING` anime and assert:

```java
ResponseEntity<byte[]> res = rest.exchange(
    url("/api/admin/anime/folder-archive?year=2026&season=SPRING"), HttpMethod.GET,
    new HttpEntity<>(cookieFor(adminId())), byte[].class);

assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
assertThat(res.getHeaders().getContentType())
    .isEqualTo(MediaType.parseMediaType("application/zip"));
assertThat(res.getHeaders().getFirst(HttpHeaders.CONTENT_DISPOSITION))
    .contains("anime-folders-2026-SPRING.zip")
    .contains("filename*=UTF-8''2026%EB%85%84-2%EB%B6%84%EA%B8%B0");
assertThat(zipEntries(res.getBody())).contains(
    "2026년/2026년 2분기/한글 제목 (Romaji501)/");
```

Add these parameter and authorization tests:

```java
@Test
void folderArchive_returnsRootFolders_whenNoAnimeMatch() throws Exception {
    ResponseEntity<byte[]> res = rest.exchange(
        url("/api/admin/anime/folder-archive?year=2026&season=WINTER"), HttpMethod.GET,
        new HttpEntity<>(cookieFor(adminId())), byte[].class);
    assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(zipEntries(res.getBody()))
        .containsExactly("2026년/", "2026년/2026년 1분기/");
}

@Test
void folderArchive_rejectsInvalidParameters() {
    Long admin = adminId();
    for (String query : List.of("year=1959&season=SPRING", "year=2026&season=NOPE")) {
        ResponseEntity<String> res = rest.exchange(
            url("/api/admin/anime/folder-archive?" + query), HttpMethod.GET,
            new HttpEntity<>(cookieFor(admin)), String.class);
        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }
}

@Test
void folderArchive_returns403_forNonAdmin() {
    User viewer = userService.upsertFromGoogle(
        "g-archive-viewer", "archive@x.y", "Viewer", null);
    ResponseEntity<String> res = rest.exchange(
        url("/api/admin/anime/folder-archive?year=2026&season=SPRING"), HttpMethod.GET,
        new HttpEntity<>(cookieFor(viewer.getId())), String.class);
    assertThat(res.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
}
```

Use this ZIP helper:

```java
private static List<String> zipEntries(byte[] bytes) throws Exception {
    List<String> names = new java.util.ArrayList<>();
    try (java.util.zip.ZipInputStream zip = new java.util.zip.ZipInputStream(
            new java.io.ByteArrayInputStream(bytes))) {
        for (java.util.zip.ZipEntry entry; (entry = zip.getNextEntry()) != null;) {
            names.add(entry.getName());
        }
    }
    return names;
}
```

- [ ] **Step 2: Verify 404 failures**

Run: `cd backend && ./gradlew test --tests 'com.animesquad.admin.AdminAnimeControllerIT.folderArchive*'`

Expected: FAIL because the route is absent.

- [ ] **Step 3: Inject the service and add the endpoint**

```java
@GetMapping("/folder-archive")
public ResponseEntity<byte[]> folderArchive(
    @AuthenticationPrincipal CurrentUser current,
    @RequestParam int year,
    @RequestParam String season
) {
    requireAdmin(current);
    if (year < 1960 || year > 2100) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid year");
    }
    String normalized = season.toUpperCase(java.util.Locale.ROOT);
    if (!VALID_SEASONS.contains(normalized)) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
            "season must be WINTER/SPRING/SUMMER/FALL");
    }
    AnimeFolderArchiveService.Archive archive = folderArchives.create(year, normalized);
    String disposition = "attachment; filename=\"anime-folders-" + year + "-" + normalized
        + ".zip\"; filename*=UTF-8''"
        + UriUtils.encode(archive.downloadFilename(), StandardCharsets.UTF_8);
    return ResponseEntity.ok()
        .contentType(MediaType.parseMediaType("application/zip"))
        .header(HttpHeaders.CONTENT_DISPOSITION, disposition)
        .body(archive.bytes());
}
```

Add the `folderArchives` field and constructor parameter plus imports for `HttpHeaders`, `MediaType`, `StandardCharsets`, and `UriUtils`.

- [ ] **Step 4: Run focused backend tests**

Run: `cd backend && ./gradlew test --tests com.animesquad.admin.AnimeFolderArchiveServiceTest --tests com.animesquad.admin.AdminAnimeControllerIT`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/animesquad/admin/AdminAnimeController.java \
  backend/src/test/java/com/animesquad/admin/AdminAnimeControllerIT.java
git commit -m "feat: expose anime folder archive download"
```

---

### Task 3: Add the binary frontend client

**Files:**
- Create: `frontend/src/app/admin/anime/folder-archive.ts`
- Create: `frontend/src/app/admin/anime/folder-archive.test.ts`

**Interfaces:**
- Consumes: Task 2 endpoint and the existing API base convention.
- Produces: `fetchFolderArchive(year, season, fetcher?): Promise<{ blob, filename }>`.

- [ ] **Step 1: Write failing tests**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { fetchFolderArchive } from "./folder-archive";

test("requests the selected archive and decodes its UTF-8 filename", async () => {
  let request: { input: string; init?: RequestInit } | undefined;
  const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
    request = { input: String(input), init };
    return new Response(new Blob(["zip"]), {
      status: 200,
      headers: { "content-disposition":
        "attachment; filename=\"anime-folders-2026-Q2.zip\"; filename*=UTF-8''2026%EB%85%84-2%EB%B6%84%EA%B8%B0.zip" },
    });
  };
  const result = await fetchFolderArchive(2026, "SPRING", fetcher as typeof fetch);
  assert.match(request!.input, /year=2026&season=SPRING$/);
  assert.equal(request!.init?.credentials, "include");
  assert.equal(request!.init?.cache, "no-store");
  assert.equal(result.filename, "2026년-2분기.zip");
  assert.equal(await result.blob.text(), "zip");
});

test("uses the deterministic fallback filename", async () => {
  const fetcher = async () => new Response(new Blob(["zip"]), { status: 200 });
  const result = await fetchFolderArchive(2026, "FALL", fetcher as typeof fetch);
  assert.equal(result.filename, "2026년-4분기-애니-음원-폴더.zip");
});

test("reports failed archive requests", async () => {
  const fetcher = async () => new Response("forbidden", { status: 403 });
  await assert.rejects(
    fetchFolderArchive(2026, "SPRING", fetcher as typeof fetch), /API 403/);
});
```

- [ ] **Step 2: Verify missing-module failure**

Run: `cd frontend && pnpm exec tsx --test src/app/admin/anime/folder-archive.test.ts`

Expected: FAIL because the helper is absent.

- [ ] **Step 3: Implement the helper**

```ts
const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8080";
const QUARTER: Record<string, number> =
  { WINTER: 1, SPRING: 2, SUMMER: 3, FALL: 4 };

export async function fetchFolderArchive(
  year: number,
  season: string,
  fetcher: typeof fetch = fetch,
): Promise<{ blob: Blob; filename: string }> {
  const query = new URLSearchParams({ year: String(year), season });
  const response = await fetcher(
    `${BASE}/api/admin/anime/folder-archive?${query}`,
    { credentials: "include", cache: "no-store" },
  );
  if (!response.ok) throw new Error(`API ${response.status}`);
  const encoded = response.headers.get("content-disposition")
    ?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  return {
    blob: await response.blob(),
    filename: encoded
      ? decodeURIComponent(encoded)
      : `${year}년-${QUARTER[season]}분기-애니-음원-폴더.zip`,
  };
}
```

- [ ] **Step 4: Verify the three helper tests pass**

Run: `cd frontend && pnpm exec tsx --test src/app/admin/anime/folder-archive.test.ts`

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/admin/anime/folder-archive.ts \
  frontend/src/app/admin/anime/folder-archive.test.ts
git commit -m "feat: fetch anime folder archives"
```

---

### Task 4: Add the administrator download button

**Files:**
- Modify: `frontend/src/app/admin/anime/page.tsx:3-7,168-233`
- Create: `frontend/src/app/admin/anime/folder-archive-ui.test.mjs`

**Interfaces:**
- Consumes: Task 3 helper.
- Produces: one secondary download button using the current year and season.

- [ ] **Step 1: Write a failing source-contract test**

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("admin season panel wires the folder archive download", async () => {
  const page = await readFile(new URL("./page.tsx", import.meta.url), "utf8");
  assert.match(page, /import \{ fetchFolderArchive \} from "\.\/folder-archive"/);
  assert.match(page, /await fetchFolderArchive\(Number\(year\), season\)/);
  assert.match(page, /URL\.createObjectURL\(blob\)/);
  assert.match(page, /URL\.revokeObjectURL\(url\)/);
  assert.match(page, /음원 폴더 ZIP 다운로드/);
  assert.match(page, /ZIP 생성 중…/);
});
```

- [ ] **Step 2: Verify failure**

Run: `cd frontend && node --test src/app/admin/anime/folder-archive-ui.test.mjs`

Expected: FAIL because the button is absent.

- [ ] **Step 3: Add state and download behavior**

```tsx
const [downloading, setDownloading] = useState(false);

async function downloadFolders() {
  setDownloading(true);
  try {
    const { blob, filename } = await fetchFolderArchive(Number(year), season);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    onError(String(e));
  } finally {
    setDownloading(false);
  }
}
```

Import `fetchFolderArchive`, then place this beside `가져오기`:

```tsx
<button
  onClick={downloadFolders}
  disabled={downloading}
  className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
>
  {downloading ? "ZIP 생성 중…" : "음원 폴더 ZIP 다운로드"}
</button>
```

- [ ] **Step 4: Run focused frontend verification**

Run:
`cd frontend && pnpm exec tsx --test src/app/admin/anime/folder-archive.test.ts && node --test src/app/admin/anime/folder-archive-ui.test.mjs && pnpm exec tsc --noEmit && pnpm lint`

Expected: all commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/admin/anime/page.tsx \
  frontend/src/app/admin/anime/folder-archive-ui.test.mjs
git commit -m "feat: download anime music folder zip"
```

---

### Task 5: Full verification and handoff

**Files:** No code changes expected.

- [ ] **Step 1: Run all backend tests**

Run: `cd backend && ./gradlew test`

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 2: Run the new frontend tests and production checks**

Run:
`cd frontend && pnpm exec tsx --test src/app/admin/anime/folder-archive.test.ts && node --test src/app/admin/anime/folder-archive-ui.test.mjs && pnpm exec tsc --noEmit && pnpm lint && pnpm build`

Expected: all checks pass and the Next.js build succeeds.

- [ ] **Step 3: Inspect scope and whitespace**

Run: `git status --short`, `git diff --check`, and `git log --oneline -5`.

Expected: only the listed feature files are new or modified by this work. Do not stage the pre-existing deleted Chrome extension tests, package store, archives, or unrelated plans.

- [ ] **Step 4: Perform manual acceptance**

Open `/admin/anime`, select `2026` and `봄`, click `음원 폴더 ZIP 다운로드`, extract it in Finder, and confirm empty folders appear under `2026년/2026년 2분기/` using `한글 제목 (Romaji)` names.
