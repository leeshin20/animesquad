# Watch Record Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let authenticated users delete their own series reviews, episode reviews, and plain progress activities from `/watchlist/reviews`, restoring a deleted progress activity from N to N-1 without creating a replacement feed event.

**Architecture:** Keep squad feeds read-only. Add an authenticated `MyProgressActivityController` and transactional service that deduplicates per-squad `PROGRESS_UPDATED` fan-out rows, verifies ownership from the persisted Activity, deletes all copies of the selected logical activity, and updates `WatchEntry.progress` silently. Reuse the existing series-review and episode-review DELETE endpoints in the frontend.

**Tech Stack:** Java 21, Spring Boot 3, Spring Data JPA, PostgreSQL/Flyway, JUnit 5/Testcontainers, Next.js 14, React 18, TypeScript, node:test with tsx.

## Global Constraints

- The squad feed remains read-only; do not add edit/delete controls to `Timeline`.
- Only `series`, `episode`, and plain `progress` records appear as deletable items in `/watchlist/reviews`.
- Every delete requires `ConfirmDialog` confirmation.
- Deleting progress N sets `WatchEntry.progress` to `max(0, N - 1)` and emits no replacement `PROGRESS_UPDATED` event.
- A progress delete removes every per-squad copy of the same logical activity.
- Never trust actor ID, anime ID, or progress supplied by the client; derive them from the persisted Activity row.
- Non-owned, missing, or non-progress activity IDs return 404 without changing Activity or WatchEntry data.
- Do not stage or modify the user's existing untracked files listed in `HANDOFF.md`.

---

### Task 1: Add the authenticated progress-activity API

**Files:**
- Create: `backend/src/main/java/com/animesquad/activity/MyProgressActivityService.java`
- Create: `backend/src/main/java/com/animesquad/activity/MyProgressActivityController.java`
- Create: `backend/src/main/resources/db/migration/V18__activity_actor_type_index.sql`
- Create: `backend/src/test/java/com/animesquad/activity/MyProgressActivityControllerIT.java`
- Modify: `backend/src/main/java/com/animesquad/activity/ActivityRepository.java:10-27`

**Interfaces:**
- Produces: `GET /api/me/progress-activities?limit=500`
- Produces: `DELETE /api/me/progress-activities/{activityId}` returning 204 or 404
- Produces: `MyProgressActivityService.ProgressActivity(Long id, Long animeId, int progress, OffsetDateTime createdAt)`
- Consumes: existing `Activity`, `ActivityRepository`, `WatchEntryRepository`, `AnimeRepository`, `CurrentUser`, and `AnimeRef`

- [ ] **Step 1: Write failing HTTP integration tests**

Create `MyProgressActivityControllerIT.java` with a regular authenticated user, two squads, one anime, and one WatchEntry. Use the existing JWT cookie pattern from `WatchControllerIT`.

```java
package com.animesquad.activity;

import com.animesquad.anime.AniListClient;
import com.animesquad.anime.AniListMedia;
import com.animesquad.anime.Anime;
import com.animesquad.anime.AnimeService;
import com.animesquad.auth.JwtAuthenticationFilter;
import com.animesquad.auth.JwtService;
import com.animesquad.squad.SquadService;
import com.animesquad.support.AbstractIntegrationTest;
import com.animesquad.user.User;
import com.animesquad.user.UserService;
import com.animesquad.watch.WatchEntry;
import com.animesquad.watch.WatchEntryRepository;
import com.animesquad.watch.WatchService;
import com.animesquad.watch.WatchStatus;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.*;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class MyProgressActivityControllerIT extends AbstractIntegrationTest {

    @Autowired UserService users;
    @Autowired AnimeService animes;
    @Autowired SquadService squads;
    @Autowired WatchService watches;
    @Autowired WatchEntryRepository watchEntries;
    @Autowired ActivityRepository activities;
    @Autowired JwtService jwt;
    @Autowired TestRestTemplate rest;
    @LocalServerPort int port;
    @MockBean AniListClient aniList;

    private record Seed(User user, Anime anime, WatchEntry entry) {}

    private Seed seed(String suffix, int anilistId, int progress) {
        User user = users.upsertFromGoogle("g-" + suffix, suffix + "@x.y", suffix, null);
        squads.createSquad(user.getId(), suffix + "-A");
        squads.createSquad(user.getId(), suffix + "-B");
        Anime anime = animes.upsertFromAniList(new AniListMedia(
            anilistId, "Romaji" + anilistId, "Native", "English",
            "img", 12, "FINISHED", "TV", 2026, null, null));
        WatchEntry entry = watches.addToList(user.getId(), anilistId, WatchStatus.WATCHING);
        watches.updateEntry(user.getId(), anime.getId(), null, progress, null, null);
        return new Seed(user, anime, entry);
    }

    private HttpHeaders cookie(Long userId) {
        HttpHeaders headers = new HttpHeaders();
        headers.add(HttpHeaders.COOKIE,
            JwtAuthenticationFilter.COOKIE_NAME + "=" + jwt.issue(userId));
        return headers;
    }

    private String url(String path) { return "http://localhost:" + port + path; }

    @Test
    void get_deduplicatesFanOutRowsForMyProgress() {
        Seed mine = seed("mine", 7101, 7);
        seed("other", 7102, 4);

        ResponseEntity<Map[]> response = rest.exchange(
            url("/api/me/progress-activities?limit=500"), HttpMethod.GET,
            new HttpEntity<>(cookie(mine.user().getId())), Map[].class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).singleElement().satisfies(item -> {
            assertThat(item.get("progress")).isEqualTo(7);
            assertThat(((Map<?, ?>) item.get("anime")).get("id"))
                .isEqualTo(mine.anime().getId().intValue());
        });
    }

    @Test
    void delete_removesEveryFanOutCopyAndRestoresProgressWithoutReplacement() {
        Seed mine = seed("delete", 7103, 7);
        Map[] items = rest.exchange(
            url("/api/me/progress-activities"), HttpMethod.GET,
            new HttpEntity<>(cookie(mine.user().getId())), Map[].class).getBody();
        Number activityId = (Number) items[0].get("id");

        ResponseEntity<Void> response = rest.exchange(
            url("/api/me/progress-activities/" + activityId.longValue()), HttpMethod.DELETE,
            new HttpEntity<>(cookie(mine.user().getId())), Void.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        WatchEntry reloaded = watchEntries.findById(mine.entry().getId()).orElseThrow();
        assertThat(reloaded.getProgress()).isEqualTo(6);
        assertThat(activities.findAll()).noneMatch(a ->
            a.getActorId().equals(mine.user().getId()) &&
            a.getType() == ActivityType.PROGRESS_UPDATED);
    }

    @Test
    void delete_firstEpisodeRestoresZeroAndCreatesNoReplacement() {
        Seed mine = seed("first", 7104, 1);
        Map[] items = rest.exchange(
            url("/api/me/progress-activities"), HttpMethod.GET,
            new HttpEntity<>(cookie(mine.user().getId())), Map[].class).getBody();

        rest.exchange(url("/api/me/progress-activities/" + items[0].get("id")),
            HttpMethod.DELETE, new HttpEntity<>(cookie(mine.user().getId())), Void.class);

        assertThat(watchEntries.findById(mine.entry().getId()).orElseThrow().getProgress()).isZero();
        assertThat(activities.findAll()).isEmpty();
    }

    @Test
    void delete_pastProgressSetsCurrentProgressFromDeletedRecord() {
        Seed mine = seed("past", 7106, 2);
        watches.updateEntry(mine.user().getId(), mine.anime().getId(),
            null, 7, null, null);
        Map[] items = rest.exchange(
            url("/api/me/progress-activities"), HttpMethod.GET,
            new HttpEntity<>(cookie(mine.user().getId())), Map[].class).getBody();
        Map past = List.of(items).stream()
            .filter(item -> item.get("progress").equals(2))
            .findFirst().orElseThrow();

        rest.exchange(url("/api/me/progress-activities/" + past.get("id")),
            HttpMethod.DELETE, new HttpEntity<>(cookie(mine.user().getId())), Void.class);

        assertThat(watchEntries.findById(mine.entry().getId()).orElseThrow().getProgress())
            .isEqualTo(1);
        assertThat(activities.findAll()).allMatch(a ->
            !Integer.valueOf(2).equals(a.getPayload().get("progress")));
    }

    @Test
    void delete_otherUsersActivityReturns404AndPreservesData() {
        Seed owner = seed("owner", 7105, 5);
        User attacker = users.upsertFromGoogle("g-attacker", "attacker@x.y", "attacker", null);
        Long targetId = activities.findAll().stream()
            .filter(a -> a.getActorId().equals(owner.user().getId()))
            .findFirst().orElseThrow().getId();

        ResponseEntity<String> response = rest.exchange(
            url("/api/me/progress-activities/" + targetId), HttpMethod.DELETE,
            new HttpEntity<>(cookie(attacker.getId())), String.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(watchEntries.findById(owner.entry().getId()).orElseThrow().getProgress())
            .isEqualTo(5);
        assertThat(activities.findAll()).hasSize(2);
    }
}
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
cd backend
./gradlew test --tests com.animesquad.activity.MyProgressActivityControllerIT
```

Expected: the GET and owner DELETE tests fail with 404 because `/api/me/progress-activities` does not exist.

- [ ] **Step 3: Add indexed repository access**

Add to `ActivityRepository`:

```java
List<Activity> findByActorIdAndTypeOrderByCreatedAtDesc(
    Long actorId, ActivityType type, Limit limit);
```

Create `V18__activity_actor_type_index.sql`:

```sql
CREATE INDEX idx_activity_actor_type_created
    ON activity(actor_id, type, created_at DESC);
```

- [ ] **Step 4: Implement the transactional service**

Create `MyProgressActivityService.java`. The one-second window groups per-squad copies, while deletion derives all sensitive values from the persisted target row.

```java
package com.animesquad.activity;

import com.animesquad.watch.WatchEntry;
import com.animesquad.watch.WatchEntryRepository;
import org.springframework.data.domain.Limit;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

@Service
public class MyProgressActivityService {

    private static final int MAX_LOGICAL = 500;
    private static final int MAX_ROWS = 1500;
    private static final Duration COPY_WINDOW = Duration.ofSeconds(1);

    public record ProgressActivity(
        Long id, Long animeId, int progress, OffsetDateTime createdAt
    ) {}

    private final ActivityRepository activities;
    private final WatchEntryRepository watches;

    public MyProgressActivityService(
        ActivityRepository activities, WatchEntryRepository watches
    ) {
        this.activities = activities;
        this.watches = watches;
    }

    @Transactional(readOnly = true)
    public List<ProgressActivity> listMine(Long userId, int requestedLimit) {
        int limit = Math.max(1, Math.min(requestedLimit, MAX_LOGICAL));
        List<ProgressActivity> logical = new ArrayList<>();
        for (Activity row : activities.findByActorIdAndTypeOrderByCreatedAtDesc(
                userId, ActivityType.PROGRESS_UPDATED, Limit.of(MAX_ROWS))) {
            Integer progress = progressOf(row);
            if (row.getAnimeId() == null || progress == null) continue;
            int duplicateIndex = duplicateIndex(logical, row, progress);
            if (duplicateIndex < 0) {
                logical.add(new ProgressActivity(
                    row.getId(), row.getAnimeId(), progress, row.getCreatedAt()));
            } else {
                ProgressActivity prior = logical.get(duplicateIndex);
                logical.set(duplicateIndex, new ProgressActivity(
                    Math.min(prior.id(), row.getId()), prior.animeId(), prior.progress(),
                    prior.createdAt().isAfter(row.getCreatedAt())
                        ? prior.createdAt() : row.getCreatedAt()));
            }
        }
        return logical.stream()
            .sorted(Comparator.comparing(ProgressActivity::createdAt).reversed())
            .limit(limit)
            .toList();
    }

    @Transactional
    public void deleteMine(Long userId, Long activityId) {
        Activity target = activities.findById(activityId)
            .filter(a -> a.getActorId().equals(userId))
            .filter(a -> a.getType() == ActivityType.PROGRESS_UPDATED)
            .orElseThrow(MyProgressActivityService::notFound);
        Integer progress = progressOf(target);
        if (target.getAnimeId() == null || progress == null) throw notFound();

        WatchEntry watch = watches.findByUserIdAndAnimeId(userId, target.getAnimeId())
            .orElseThrow(MyProgressActivityService::notFound);
        List<Activity> copies = activities
            .findAllByActorIdAndAnimeIdAndType(
                userId, target.getAnimeId(), ActivityType.PROGRESS_UPDATED)
            .stream()
            .filter(a -> progress.equals(progressOf(a)))
            .filter(a -> withinWindow(a.getCreatedAt(), target.getCreatedAt()))
            .toList();

        activities.deleteAll(copies);
        watch.apply(null, Math.max(0, progress - 1), null, null);
    }

    private static int duplicateIndex(
        List<ProgressActivity> logical, Activity row, int progress
    ) {
        for (int i = 0; i < logical.size(); i++) {
            ProgressActivity item = logical.get(i);
            if (item.animeId().equals(row.getAnimeId()) && item.progress() == progress &&
                withinWindow(item.createdAt(), row.getCreatedAt())) return i;
        }
        return -1;
    }

    private static boolean withinWindow(OffsetDateTime a, OffsetDateTime b) {
        return Duration.between(a, b).abs().compareTo(COPY_WINDOW) <= 0;
    }

    private static Integer progressOf(Activity activity) {
        Object value = activity.getPayload().get("progress");
        return value instanceof Number number ? number.intValue() : null;
    }

    private static ResponseStatusException notFound() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "진도 기록이 없어요");
    }
}
```

- [ ] **Step 5: Implement the controller and response mapping**

Create `MyProgressActivityController.java`:

```java
package com.animesquad.activity;

import com.animesquad.activity.dto.AnimeRef;
import com.animesquad.anime.Anime;
import com.animesquad.anime.AnimeRepository;
import com.animesquad.auth.CurrentUser;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/me/progress-activities")
public class MyProgressActivityController {

    public record Item(
        Long id, AnimeRef anime, int progress, OffsetDateTime createdAt
    ) {}

    private final MyProgressActivityService service;
    private final AnimeRepository animes;

    public MyProgressActivityController(
        MyProgressActivityService service, AnimeRepository animes
    ) {
        this.service = service;
        this.animes = animes;
    }

    @GetMapping
    public List<Item> list(
        @AuthenticationPrincipal CurrentUser me,
        @RequestParam(defaultValue = "500") int limit
    ) {
        List<MyProgressActivityService.ProgressActivity> rows =
            service.listMine(me.userId(), limit);
        Map<Long, Anime> animeById = animes.findAllById(
            rows.stream().map(MyProgressActivityService.ProgressActivity::animeId).toList()
        ).stream().collect(Collectors.toMap(Anime::getId, anime -> anime));
        return rows.stream()
            .filter(row -> animeById.containsKey(row.animeId()))
            .map(row -> new Item(
                row.id(), AnimeRef.from(animeById.get(row.animeId())),
                row.progress(), row.createdAt()))
            .toList();
    }

    @DeleteMapping("/{activityId}")
    public ResponseEntity<Void> delete(
        @AuthenticationPrincipal CurrentUser me,
        @PathVariable Long activityId
    ) {
        service.deleteMine(me.userId(), activityId);
        return ResponseEntity.noContent().build();
    }
}
```

- [ ] **Step 6: Run the API tests and verify GREEN**

Run:

```bash
cd backend
./gradlew test --tests com.animesquad.activity.MyProgressActivityControllerIT
```

Expected: `BUILD SUCCESSFUL` and all five tests pass.

- [ ] **Step 7: Commit the backend API**

```bash
git add backend/src/main/java/com/animesquad/activity/ActivityRepository.java \
  backend/src/main/java/com/animesquad/activity/MyProgressActivityService.java \
  backend/src/main/java/com/animesquad/activity/MyProgressActivityController.java \
  backend/src/main/resources/db/migration/V18__activity_actor_type_index.sql \
  backend/src/test/java/com/animesquad/activity/MyProgressActivityControllerIT.java
git commit -m "feat(activity): 내 진도 기록 조회 및 삭제 API 추가"
```

---

### Task 2: Merge progress activities into review records

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/pnpm-lock.yaml`
- Modify: `frontend/src/app/lib/api.ts:204-212`
- Modify: `frontend/src/app/watchlist/reviews/merge-records.ts:1-50`
- Create: `frontend/src/app/watchlist/reviews/merge-records.test.ts`

**Interfaces:**
- Consumes: `MyProgressActivity` returned by Task 1
- Produces: `ReviewRecord.kind: "series" | "episode" | "progress"`
- Produces: `ReviewRecord.sourceId: number` for deletion routing
- Produces: `mergeRecords(entries, episodeReviews, progressActivities)`

- [ ] **Step 1: Add the TypeScript test runner**

Run:

```bash
cd frontend
pnpm add -D tsx
```

Expected: `tsx` appears in `devDependencies` and `pnpm-lock.yaml` changes.

- [ ] **Step 2: Add the API type and failing merge test**

Add to `api.ts`:

```ts
export type MyProgressActivity = {
  id: number;
  anime: {
    id: number;
    titleRomaji: string;
    titleKorean: string | null;
    coverImageUrl: string | null;
  };
  progress: number;
  createdAt: string;
};
```

Create `merge-records.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import type { MyProgressActivity, WatchEntry } from "@/app/lib/api";
import { mergeRecords } from "./merge-records";

const entry = {
  id: 1,
  anime: { id: 10, titleRomaji: "Series", titleKorean: null },
  status: "WATCHING",
  progress: 7,
  score: null,
  comment: null,
  createdAt: "2026-07-15T00:00:00Z",
  updatedAt: "2026-07-15T00:00:00Z",
} as WatchEntry;

const progress = {
  id: 99,
  anime: { id: 10, titleRomaji: "Series", titleKorean: null, coverImageUrl: null },
  progress: 7,
  createdAt: "2026-07-15T01:00:00Z",
} satisfies MyProgressActivity;

test("merges a progress activity with watch status and deletion identity", () => {
  const records = mergeRecords([entry], [], [progress]);

  assert.deepEqual(records, [{
    key: "p99",
    kind: "progress",
    sourceId: 99,
    animeId: 10,
    title: "Series",
    status: "WATCHING",
    episodeNumber: 7,
    score: null,
    comment: null,
    updatedAt: "2026-07-15T01:00:00Z",
  }]);
});

test("excludes series rows with no score or comment", () => {
  assert.deepEqual(mergeRecords([entry], [], []), []);
});
```

- [ ] **Step 3: Run the merge tests and verify RED**

Run:

```bash
cd frontend
pnpm exec tsx --test src/app/watchlist/reviews/merge-records.test.ts
```

Expected: FAIL because `mergeRecords` ignores the third argument and returns no progress record.

- [ ] **Step 4: Extend the record union and merge function**

Update imports and types in `merge-records.ts`:

```ts
import type {
  WatchEntry, MyEpisodeReview, MyProgressActivity, WatchStatus,
} from "@/app/lib/api";
import { displayTitle } from "@/app/lib/anilist-labels";

export type ReviewRecord = {
  key: string;
  kind: "series" | "episode" | "progress";
  sourceId: number;
  animeId: number;
  title: string;
  status: WatchStatus | null;
  episodeNumber: number | null;
  score: number | null;
  comment: string | null;
  updatedAt: string;
};
```

Change `mergeRecords` to accept the third input, filter empty series rows, and add progress rows:

```ts
export function mergeRecords(
  entries: WatchEntry[],
  episodeReviews: MyEpisodeReview[],
  progressActivities: MyProgressActivity[]
): ReviewRecord[] {
  const statusByAnimeId = new Map<number, WatchStatus>(
    entries.map((entry) => [entry.anime.id, entry.status])
  );

  const seriesRecords: ReviewRecord[] = entries
    .filter((entry) => entry.score != null || entry.comment != null)
    .map((entry) => ({
      key: `s${entry.id}`,
      kind: "series",
      sourceId: entry.id,
      animeId: entry.anime.id,
      title: displayTitle(entry.anime),
      status: entry.status,
      episodeNumber: null,
      score: entry.score,
      comment: entry.comment,
      updatedAt: entry.updatedAt,
    }));

  const episodeRecords: ReviewRecord[] = episodeReviews
    .filter((review) => review.anime != null)
    .map((review) => ({
      key: `e${review.id}`,
      kind: "episode",
      sourceId: review.id,
      animeId: review.anime!.id,
      title: displayTitle(review.anime!),
      status: statusByAnimeId.get(review.anime!.id) ?? null,
      episodeNumber: review.episodeNumber,
      score: review.score,
      comment: review.comment,
      updatedAt: review.updatedAt,
    }));

  const progressRecords: ReviewRecord[] = progressActivities.map((activity) => ({
    key: `p${activity.id}`,
    kind: "progress",
    sourceId: activity.id,
    animeId: activity.anime.id,
    title: displayTitle(activity.anime),
    status: statusByAnimeId.get(activity.anime.id) ?? null,
    episodeNumber: activity.progress,
    score: null,
    comment: null,
    updatedAt: activity.createdAt,
  }));

  return [...seriesRecords, ...episodeRecords, ...progressRecords];
}
```

- [ ] **Step 5: Run the merge tests and verify GREEN**

Run:

```bash
cd frontend
pnpm exec tsx --test src/app/watchlist/reviews/merge-records.test.ts
```

Expected: both tests pass.

- [ ] **Step 6: Commit the frontend record model**

```bash
git add frontend/package.json frontend/pnpm-lock.yaml \
  frontend/src/app/lib/api.ts \
  frontend/src/app/watchlist/reviews/merge-records.ts \
  frontend/src/app/watchlist/reviews/merge-records.test.ts
git commit -m "feat(watchlist): 진도 활동을 감상 기록에 병합"
```

---

### Task 3: Add confirmed deletion controls to the review page

**Files:**
- Modify: `frontend/src/app/watchlist/reviews/page.tsx:3-267`

**Interfaces:**
- Consumes: `ReviewRecord.kind` and `ReviewRecord.sourceId` from Task 2
- Consumes: existing `apiDelete` and `ConfirmDialog`
- Calls: series `DELETE /api/watch/{animeId}/review`
- Calls: episode `DELETE /api/watch/{animeId}/episodes/{episodeNumber}`
- Calls: progress `DELETE /api/me/progress-activities/{sourceId}`

- [ ] **Step 1: Extend page loading to three sources**

Update imports:

```ts
import {
  apiDelete, apiGet, type MyEpisodeReview, type MyProgressActivity,
  type WatchEntry, type WatchStatus,
} from "@/app/lib/api";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";
```

Add state and replace the three independent effects with one reloadable function:

```ts
const [progressActivities, setProgressActivities] =
  useState<MyProgressActivity[] | null>(null);
const [pendingDelete, setPendingDelete] = useState<ReviewRecord | null>(null);
const [deleting, setDeleting] = useState(false);

async function loadRecords() {
  setError(null);
  try {
    const [watchRows, episodeRows, progressRows] = await Promise.all([
      apiGet<WatchEntry[]>("/api/watch"),
      apiGet<MyEpisodeReview[]>("/api/me/episode-reviews?limit=500&commentOnly=false"),
      apiGet<MyProgressActivity[]>("/api/me/progress-activities?limit=500"),
    ]);
    setEntries(watchRows);
    setEpisodeReviews(episodeRows);
    setProgressActivities(progressRows);
  } catch (error) {
    setError(String(error));
  }
}

useEffect(() => { loadRecords(); }, []);

const loading = entries === null || episodeReviews === null || progressActivities === null;
const records = loading ? [] : mergeRecords(entries, episodeReviews, progressActivities);
```

- [ ] **Step 2: Add deletion routing and confirmation copy**

Add these functions inside `ReviewsPage`:

```ts
function deleteMessage(record: ReviewRecord): string {
  if (record.kind === "series") {
    return "이 시리즈 감상평을 삭제할까요? 상태와 진도는 유지됩니다.";
  }
  if (record.kind === "episode") {
    return `${record.episodeNumber}화 감상평을 삭제할까요? 현재 진도는 유지됩니다.`;
  }
  const restored = Math.max(0, (record.episodeNumber ?? 0) - 1);
  return `${record.episodeNumber}화 기록을 삭제할까요? 현재 진도가 ${restored}화로 복구됩니다.`;
}

async function deleteRecord(record: ReviewRecord) {
  setDeleting(true);
  setError(null);
  try {
    if (record.kind === "series") {
      await apiDelete(`/api/watch/${record.animeId}/review`);
    } else if (record.kind === "episode") {
      await apiDelete(`/api/watch/${record.animeId}/episodes/${record.episodeNumber}`);
    } else {
      await apiDelete(`/api/me/progress-activities/${record.sourceId}`);
    }
    setPendingDelete(null);
    await loadRecords();
  } catch (error) {
    setError(String(error));
  } finally {
    setDeleting(false);
  }
}
```

- [ ] **Step 3: Refactor the row so the delete button is not nested in a link**

Pass `onDelete` from the list:

```tsx
{filtered.map((record) => (
  <RecordRow key={record.key} record={record} onDelete={setPendingDelete} />
))}
```

Replace `RecordRow` with a non-nested card. Keep the existing title, tags, stars, and comment rendering inside the content link.

```tsx
function RecordRow({
  record,
  onDelete,
}: {
  record: ReviewRecord;
  onDelete: (record: ReviewRecord) => void;
}) {
  return (
    <li className="flex items-start gap-3 rounded-xl border border-neutral-200 p-4 transition hover:bg-neutral-50">
      <Link href={`/anime/${record.animeId}`} className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 truncate text-sm font-medium text-neutral-800">
            {record.title}
          </p>
          <span className="shrink-0 text-xs text-neutral-400">
            {relativeTime(record.updatedAt)}
          </span>
        </div>
        <div className="mt-1.5 flex items-center gap-1.5">
          {record.episodeNumber != null ? (
            <span className="flex-none whitespace-nowrap rounded bg-blue-50 px-1.5 py-0.5 text-sm font-medium text-blue-700">
              {record.episodeNumber}화
            </span>
          ) : record.status != null ? (
            <span className={`flex-none whitespace-nowrap rounded px-1.5 py-0.5 text-sm font-medium ${statusBadge(record.status)}`}>
              {statusLabel(record.status)}
            </span>
          ) : null}
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
      <button
        type="button"
        onClick={() => onDelete(record)}
        className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-rose-500 hover:bg-rose-50 hover:text-rose-700"
      >
        삭제
      </button>
    </li>
  );
}
```

- [ ] **Step 4: Render the confirmation dialog**

Add before the closing fragment in `ReviewsPage`:

```tsx
{pendingDelete && (
  <ConfirmDialog
    message={deleteMessage(pendingDelete)}
    confirmLabel={deleting ? "삭제 중…" : "삭제"}
    onCancel={() => { if (!deleting) setPendingDelete(null); }}
    onConfirm={() => { if (!deleting) deleteRecord(pendingDelete); }}
  />
)}
```

- [ ] **Step 5: Run focused tests and the production build**

Run:

```bash
cd frontend
pnpm exec tsx --test src/app/watchlist/reviews/merge-records.test.ts
pnpm build
```

Expected: merge tests pass and Next.js reports `Compiled successfully`. The pre-existing `NavBar.tsx` hook warning may remain; no new warning is allowed.

- [ ] **Step 6: Commit the deletion UI**

```bash
git add frontend/src/app/watchlist/reviews/page.tsx
git commit -m "feat(watchlist): 감상 기록 삭제 UI 추가"
```

---

### Task 4: Full verification and review

**Files:**
- Verify only; modify files only when a failing check is caused by Tasks 1-3

**Interfaces:**
- Consumes all APIs and UI behavior produced by Tasks 1-3
- Produces a verified, review-ready branch

- [ ] **Step 1: Run backend tests**

```bash
cd backend
./gradlew test
```

Expected: `BUILD SUCCESSFUL` with zero failed tests.

- [ ] **Step 2: Run frontend tests and build**

```bash
cd frontend
node --test src/app/lib/feed-pagination.test.mjs src/app/lib/episode-log.test.mjs
pnpm exec tsx --test src/app/watchlist/reviews/merge-records.test.ts
pnpm build
```

Expected: every node:test/tsx test passes and the production build succeeds. Only the already-known `NavBar.tsx` exhaustive-deps warning is acceptable.

- [ ] **Step 3: Inspect scope and migration ordering**

```bash
git status --short
git diff --check
git diff main...HEAD --stat
ls backend/src/main/resources/db/migration/V17__nullable_episode_score.sql \
  backend/src/main/resources/db/migration/V18__activity_actor_type_index.sql
```

Expected: no whitespace errors, V17 and V18 both exist in order, and the diff contains only the approved API, migration, tests, review-page model, and review-page UI changes plus their spec/plan documents.

- [ ] **Step 4: Request an independent code review**

Use `superpowers:requesting-code-review` with these review requirements:

```text
Verify ownership enforcement, transactional deletion, fan-out deduplication,
the one-second logical-copy window, absence of replacement progress events,
N-to-N-1 and 1-to-0 behavior, correct series/episode endpoint routing,
valid non-nested link/button markup, and loading/error state recovery.
```

Expected: no Critical or Important findings remain. Fix any valid finding with a failing regression test first, then rerun Steps 1-3.

- [ ] **Step 5: Record the final commit range**

```bash
git log --oneline main..HEAD
```

Expected: the design/plan commit and the three implementation commits are listed in order, with no unrelated user files committed.
