# Plan 6 — Activity events + squad feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Domain actions (anime added, status changed, progress advanced, anime rated, episode rated, joined squad) become `activity` rows visible in `GET /api/squads/{id}/feed`. Frontend renders a per-squad feed page.

**Architecture:** Each domain service publishes a typed event via `ApplicationEventPublisher`. A single `ActivityListener` in the activity module subscribes to all event types and writes one `activity` row per squad the actor belongs to (or per the specific squad for `SquadJoinedEvent`). Events run synchronously inside the publisher's transaction, so a rollback in the originating service also rolls back the activity rows. Feed reads use cursor pagination on the row id.

**Tech Stack:** Spring Boot 3.3.5, Spring Data JPA, Spring `ApplicationEvent`, Hibernate 6 native JSON (`@JdbcTypeCode(SqlTypes.JSON)`), Postgres `jsonb`, Next.js 14.

---

## File Structure

**Backend — created**
- `backend/src/main/resources/db/migration/V6__activity.sql`
- `backend/src/main/java/com/animesquad/activity/Activity.java`
- `backend/src/main/java/com/animesquad/activity/ActivityType.java`
- `backend/src/main/java/com/animesquad/activity/ActivityRepository.java`
- `backend/src/main/java/com/animesquad/activity/ActivityListener.java`
- `backend/src/main/java/com/animesquad/activity/ActivityService.java`
- `backend/src/main/java/com/animesquad/activity/FeedController.java`
- `backend/src/main/java/com/animesquad/activity/dto/FeedItemResponse.java`
- `backend/src/main/java/com/animesquad/activity/dto/ActorRef.java`
- `backend/src/main/java/com/animesquad/activity/dto/AnimeRef.java`
- `backend/src/main/java/com/animesquad/watch/events/AnimeAddedEvent.java`
- `backend/src/main/java/com/animesquad/watch/events/WatchStatusChangedEvent.java`
- `backend/src/main/java/com/animesquad/watch/events/ProgressUpdatedEvent.java`
- `backend/src/main/java/com/animesquad/watch/events/WatchRatedEvent.java`
- `backend/src/main/java/com/animesquad/episode/events/EpisodeRatedEvent.java`
- `backend/src/main/java/com/animesquad/squad/events/SquadJoinedEvent.java`

**Backend — modified**
- `backend/src/main/java/com/animesquad/watch/WatchService.java` — publish events
- `backend/src/main/java/com/animesquad/episode/EpisodeRatingService.java` — publish event
- `backend/src/main/java/com/animesquad/squad/SquadService.java` — publish event on join
- `backend/src/test/java/com/animesquad/support/AbstractIntegrationTest.java` — truncate `activity`

**Backend — tests**
- `backend/src/test/java/com/animesquad/activity/ActivityListenerIT.java`
- `backend/src/test/java/com/animesquad/activity/FeedControllerIT.java`

**Frontend — modified**
- `frontend/src/app/lib/api.ts` — `FeedItem` type
- `frontend/src/app/squads/page.tsx` — link squad rows to detail

**Frontend — created**
- `frontend/src/app/squads/[id]/page.tsx` — feed page

Events live with the domain that emits them (`watch.events.*`, `episode.events.*`, `squad.events.*`). The activity module depends on all of them; the inverse doesn't hold.

---

## Task 1: Flyway V6 — `activity` table

**Files:**
- Create: `backend/src/main/resources/db/migration/V6__activity.sql`

- [ ] **Step 1: Write the migration**

```sql
CREATE TABLE activity (
    id          BIGSERIAL PRIMARY KEY,
    squad_id    BIGINT      NOT NULL REFERENCES squad(id) ON DELETE CASCADE,
    actor_id    BIGINT      NOT NULL REFERENCES users(id),
    type        VARCHAR(32) NOT NULL,
    anime_id    BIGINT      REFERENCES anime(id),
    payload     JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_squad_id_desc ON activity(squad_id, id DESC);
```

- [ ] **Step 2: Verify Flyway applies cleanly**

```bash
cd backend && ./gradlew test --tests "*UserServiceIT*"
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/resources/db/migration/V6__activity.sql
git commit -m "feat(db): add activity table (V6)"
```

---

## Task 2: `Activity` entity + repository + `ActivityType`

**Files:**
- Create: `backend/src/main/java/com/animesquad/activity/ActivityType.java`
- Create: `backend/src/main/java/com/animesquad/activity/Activity.java`
- Create: `backend/src/main/java/com/animesquad/activity/ActivityRepository.java`

`payload` uses Hibernate 6 native JSON support (`@JdbcTypeCode(SqlTypes.JSON)`), which maps a `Map<String, Object>` straight to/from `jsonb`. No extra dependency needed in Spring Boot 3.3.

- [ ] **Step 1: `ActivityType.java`**

```java
package com.animesquad.activity;

public enum ActivityType {
    ANIME_ADDED,
    STATUS_CHANGED,
    PROGRESS_UPDATED,
    RATED,
    EPISODE_RATED,
    JOINED_SQUAD
}
```

- [ ] **Step 2: `Activity.java`**

```java
package com.animesquad.activity;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.OffsetDateTime;
import java.util.Map;

@Entity
@Table(name = "activity")
public class Activity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "squad_id", nullable = false)
    private Long squadId;

    @Column(name = "actor_id", nullable = false)
    private Long actorId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private ActivityType type;

    @Column(name = "anime_id")
    private Long animeId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private Map<String, Object> payload;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();

    protected Activity() {}

    public Activity(Long squadId, Long actorId, ActivityType type, Long animeId, Map<String, Object> payload) {
        this.squadId = squadId;
        this.actorId = actorId;
        this.type = type;
        this.animeId = animeId;
        this.payload = payload == null ? Map.of() : payload;
    }

    public Long getId() { return id; }
    public Long getSquadId() { return squadId; }
    public Long getActorId() { return actorId; }
    public ActivityType getType() { return type; }
    public Long getAnimeId() { return animeId; }
    public Map<String, Object> getPayload() { return payload; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
}
```

- [ ] **Step 3: `ActivityRepository.java`**

```java
package com.animesquad.activity;

import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ActivityRepository extends JpaRepository<Activity, Long> {

    List<Activity> findBySquadIdAndIdLessThanOrderByIdDesc(Long squadId, Long cursor, Limit limit);

    List<Activity> findBySquadIdOrderByIdDesc(Long squadId, Limit limit);
}
```

- [ ] **Step 4: Compile**

```bash
./gradlew compileJava
```
Expected: BUILD SUCCESSFUL.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/animesquad/activity/
git commit -m "feat(activity): add Activity entity + repo + ActivityType"
```

---

## Task 3: Domain event records

**Files:**
- Create: `backend/src/main/java/com/animesquad/watch/events/AnimeAddedEvent.java`
- Create: `backend/src/main/java/com/animesquad/watch/events/WatchStatusChangedEvent.java`
- Create: `backend/src/main/java/com/animesquad/watch/events/ProgressUpdatedEvent.java`
- Create: `backend/src/main/java/com/animesquad/watch/events/WatchRatedEvent.java`
- Create: `backend/src/main/java/com/animesquad/episode/events/EpisodeRatedEvent.java`
- Create: `backend/src/main/java/com/animesquad/squad/events/SquadJoinedEvent.java`

All events are simple records — pure data, no behavior. The activity listener (Task 4) maps each to an `ActivityType` and a payload.

- [ ] **Step 1: Watch events**

`AnimeAddedEvent.java`:
```java
package com.animesquad.watch.events;

import com.animesquad.watch.WatchStatus;

public record AnimeAddedEvent(Long actorId, Long animeId, WatchStatus status) {}
```

`WatchStatusChangedEvent.java`:
```java
package com.animesquad.watch.events;

import com.animesquad.watch.WatchStatus;

public record WatchStatusChangedEvent(
    Long actorId, Long animeId, WatchStatus from, WatchStatus to
) {}
```

`ProgressUpdatedEvent.java`:
```java
package com.animesquad.watch.events;

public record ProgressUpdatedEvent(Long actorId, Long animeId, int progress) {}
```

`WatchRatedEvent.java`:
```java
package com.animesquad.watch.events;

public record WatchRatedEvent(Long actorId, Long animeId, int score) {}
```

- [ ] **Step 2: Episode event**

`EpisodeRatedEvent.java`:
```java
package com.animesquad.episode.events;

public record EpisodeRatedEvent(Long actorId, Long animeId, int episodeNumber, int score) {}
```

- [ ] **Step 3: Squad event**

`SquadJoinedEvent.java`:
```java
package com.animesquad.squad.events;

public record SquadJoinedEvent(Long actorId, Long squadId) {}
```

- [ ] **Step 4: Compile**

```bash
./gradlew compileJava
```
Expected: BUILD SUCCESSFUL.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/animesquad/watch/events/ \
        backend/src/main/java/com/animesquad/episode/events/ \
        backend/src/main/java/com/animesquad/squad/events/
git commit -m "feat(events): add domain event records"
```

---

## Task 4: `ActivityListener` (TDD)

**Files:**
- Create: `backend/src/main/java/com/animesquad/activity/ActivityListener.java`
- Test: `backend/src/test/java/com/animesquad/activity/ActivityListenerIT.java`
- Modify: `backend/src/test/java/com/animesquad/support/AbstractIntegrationTest.java`

The listener has six `@EventListener` methods. For most events, it fans out to **one activity row per squad the actor is in**. `SquadJoinedEvent` writes a single row for the specific squad. Listeners run synchronously inside the publisher's transaction.

- [ ] **Step 1: Add `activity` to truncate list**

In `AbstractIntegrationTest.java`, change `cleanDatabase` to:
```java
    @BeforeEach
    void cleanDatabase() {
        jdbc.execute("TRUNCATE TABLE activity, episode_rating, watch_entry, membership, squad, anime, users RESTART IDENTITY CASCADE");
    }
```

- [ ] **Step 2: Write `ActivityListenerIT.java`**

```java
package com.animesquad.activity;

import com.animesquad.anime.AniListClient;
import com.animesquad.anime.AniListMedia;
import com.animesquad.anime.Anime;
import com.animesquad.anime.AnimeService;
import com.animesquad.episode.events.EpisodeRatedEvent;
import com.animesquad.squad.Squad;
import com.animesquad.squad.SquadService;
import com.animesquad.squad.events.SquadJoinedEvent;
import com.animesquad.support.AbstractIntegrationTest;
import com.animesquad.user.User;
import com.animesquad.user.UserService;
import com.animesquad.watch.WatchStatus;
import com.animesquad.watch.events.AnimeAddedEvent;
import com.animesquad.watch.events.ProgressUpdatedEvent;
import com.animesquad.watch.events.WatchRatedEvent;
import com.animesquad.watch.events.WatchStatusChangedEvent;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Limit;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class ActivityListenerIT extends AbstractIntegrationTest {

    @Autowired ApplicationEventPublisher events;
    @Autowired ActivityRepository activities;
    @Autowired SquadService squadService;
    @Autowired UserService userService;
    @Autowired AnimeService animeService;
    @MockBean AniListClient aniList;

    private record Setup(User actor, Squad squadA, Squad squadB, Anime anime) {}

    private Setup seedTwoSquadsWithMember() {
        User actor = userService.upsertFromGoogle("g-actor", "a@x.y", "Actor", null);
        Squad a = squadService.createSquad(actor.getId(), "A");
        Squad b = squadService.createSquad(actor.getId(), "B");
        Anime anime = animeService.upsertFromAniList(new AniListMedia(
            5001, "Romaji", "Native", "Eng", "img", 12, "FINISHED", "TV", 2024));
        return new Setup(actor, a, b, anime);
    }

    @Test
    void animeAdded_fansOutToAllSquadsTheActorIsIn() {
        Setup s = seedTwoSquadsWithMember();

        events.publishEvent(new AnimeAddedEvent(s.actor().getId(), s.anime().getId(), WatchStatus.WATCHING));

        List<Activity> all = activities.findAll();
        assertThat(all).hasSize(2);
        assertThat(all).extracting(Activity::getSquadId)
            .containsExactlyInAnyOrder(s.squadA().getId(), s.squadB().getId());
        assertThat(all).allSatisfy(a -> {
            assertThat(a.getType()).isEqualTo(ActivityType.ANIME_ADDED);
            assertThat(a.getActorId()).isEqualTo(s.actor().getId());
            assertThat(a.getAnimeId()).isEqualTo(s.anime().getId());
            assertThat(a.getPayload()).containsEntry("status", "WATCHING");
        });
    }

    @Test
    void animeAdded_emitsNothing_whenActorHasNoSquads() {
        User loner = userService.upsertFromGoogle("g-loner", "l@x.y", "L", null);
        Anime anime = animeService.upsertFromAniList(new AniListMedia(
            5002, "R", "N", "E", "img", 12, "FINISHED", "TV", 2024));

        events.publishEvent(new AnimeAddedEvent(loner.getId(), anime.getId(), WatchStatus.WATCHING));

        assertThat(activities.count()).isZero();
    }

    @Test
    void statusChanged_emitsWithFromTo() {
        Setup s = seedTwoSquadsWithMember();

        events.publishEvent(new WatchStatusChangedEvent(
            s.actor().getId(), s.anime().getId(), WatchStatus.WATCHING, WatchStatus.COMPLETED));

        Activity row = activities.findBySquadIdOrderByIdDesc(s.squadA().getId(), Limit.of(1)).get(0);
        assertThat(row.getType()).isEqualTo(ActivityType.STATUS_CHANGED);
        assertThat(row.getPayload()).containsEntry("from", "WATCHING");
        assertThat(row.getPayload()).containsEntry("to", "COMPLETED");
    }

    @Test
    void progressUpdated_emitsWithProgressNumber() {
        Setup s = seedTwoSquadsWithMember();

        events.publishEvent(new ProgressUpdatedEvent(s.actor().getId(), s.anime().getId(), 7));

        Activity row = activities.findBySquadIdOrderByIdDesc(s.squadA().getId(), Limit.of(1)).get(0);
        assertThat(row.getType()).isEqualTo(ActivityType.PROGRESS_UPDATED);
        assertThat(((Number) row.getPayload().get("progress")).intValue()).isEqualTo(7);
    }

    @Test
    void watchRated_emitsWithScore() {
        Setup s = seedTwoSquadsWithMember();

        events.publishEvent(new WatchRatedEvent(s.actor().getId(), s.anime().getId(), 9));

        Activity row = activities.findBySquadIdOrderByIdDesc(s.squadA().getId(), Limit.of(1)).get(0);
        assertThat(row.getType()).isEqualTo(ActivityType.RATED);
        assertThat(((Number) row.getPayload().get("score")).intValue()).isEqualTo(9);
    }

    @Test
    void episodeRated_emitsWithEpisodeAndScore() {
        Setup s = seedTwoSquadsWithMember();

        events.publishEvent(new EpisodeRatedEvent(s.actor().getId(), s.anime().getId(), 4, 8));

        Activity row = activities.findBySquadIdOrderByIdDesc(s.squadA().getId(), Limit.of(1)).get(0);
        assertThat(row.getType()).isEqualTo(ActivityType.EPISODE_RATED);
        assertThat(((Number) row.getPayload().get("episode")).intValue()).isEqualTo(4);
        assertThat(((Number) row.getPayload().get("score")).intValue()).isEqualTo(8);
    }

    @Test
    void squadJoined_emitsOnlyForThatSquad_animeIdNull() {
        User actor = userService.upsertFromGoogle("g-j", "j@x.y", "J", null);
        Squad target = squadService.createSquad(actor.getId(), "Target");
        // creating squad does NOT emit JOINED_SQUAD; emulate the join explicitly:
        events.publishEvent(new SquadJoinedEvent(actor.getId(), target.getId()));

        List<Activity> all = activities.findAll();
        assertThat(all).hasSize(1);
        assertThat(all.get(0).getType()).isEqualTo(ActivityType.JOINED_SQUAD);
        assertThat(all.get(0).getSquadId()).isEqualTo(target.getId());
        assertThat(all.get(0).getAnimeId()).isNull();
    }
}
```

- [ ] **Step 3: Run test, expect failure**

```bash
./gradlew test --tests ActivityListenerIT
```
Expected: FAIL — `ActivityListener` does not exist.

- [ ] **Step 4: Implement `ActivityListener.java`**

```java
package com.animesquad.activity;

import com.animesquad.episode.events.EpisodeRatedEvent;
import com.animesquad.squad.MembershipRepository;
import com.animesquad.squad.events.SquadJoinedEvent;
import com.animesquad.watch.events.AnimeAddedEvent;
import com.animesquad.watch.events.ProgressUpdatedEvent;
import com.animesquad.watch.events.WatchRatedEvent;
import com.animesquad.watch.events.WatchStatusChangedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.function.Function;

@Component
public class ActivityListener {

    private final ActivityRepository activities;
    private final MembershipRepository memberships;

    public ActivityListener(ActivityRepository activities, MembershipRepository memberships) {
        this.activities = activities;
        this.memberships = memberships;
    }

    @EventListener
    public void on(AnimeAddedEvent e) {
        fanOut(e.actorId(), ActivityType.ANIME_ADDED, e.animeId(),
            Map.of("status", e.status().name()));
    }

    @EventListener
    public void on(WatchStatusChangedEvent e) {
        fanOut(e.actorId(), ActivityType.STATUS_CHANGED, e.animeId(),
            Map.of("from", e.from().name(), "to", e.to().name()));
    }

    @EventListener
    public void on(ProgressUpdatedEvent e) {
        fanOut(e.actorId(), ActivityType.PROGRESS_UPDATED, e.animeId(),
            Map.of("progress", e.progress()));
    }

    @EventListener
    public void on(WatchRatedEvent e) {
        fanOut(e.actorId(), ActivityType.RATED, e.animeId(),
            Map.of("score", e.score()));
    }

    @EventListener
    public void on(EpisodeRatedEvent e) {
        fanOut(e.actorId(), ActivityType.EPISODE_RATED, e.animeId(),
            Map.of("episode", e.episodeNumber(), "score", e.score()));
    }

    @EventListener
    public void on(SquadJoinedEvent e) {
        activities.save(new Activity(
            e.squadId(), e.actorId(), ActivityType.JOINED_SQUAD, null, Map.of()));
    }

    private void fanOut(Long actorId, ActivityType type, Long animeId, Map<String, Object> payload) {
        List<Long> squadIds = memberships.findAllByUserId(actorId).stream()
            .map(m -> m.getSquadId()).toList();
        if (squadIds.isEmpty()) return;
        activities.saveAll(squadIds.stream()
            .map(sid -> new Activity(sid, actorId, type, animeId, payload))
            .toList());
    }
}
```

- [ ] **Step 5: Run test, expect pass**

```bash
./gradlew test --tests ActivityListenerIT
```
Expected: PASS (all seven tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/animesquad/activity/ActivityListener.java \
        backend/src/test/java/com/animesquad/activity/ActivityListenerIT.java \
        backend/src/test/java/com/animesquad/support/AbstractIntegrationTest.java
git commit -m "feat(activity): listener writes rows for all domain events"
```

---

## Task 5: Wire publishers into existing services

**Files:**
- Modify: `backend/src/main/java/com/animesquad/squad/SquadService.java`
- Modify: `backend/src/main/java/com/animesquad/watch/WatchService.java`
- Modify: `backend/src/main/java/com/animesquad/episode/EpisodeRatingService.java`
- Modify: `backend/src/test/java/com/animesquad/squad/SquadServiceIT.java` (light e2e)
- Modify: `backend/src/test/java/com/animesquad/watch/WatchServiceIT.java` (light e2e)
- Modify: `backend/src/test/java/com/animesquad/episode/EpisodeRatingServiceIT.java` (light e2e)

Each service gets `ApplicationEventPublisher` injected. WatchService.updateEntry captures old values before mutation, then publishes one event per *changed* observable field. `addToList` is idempotent — only publish when a new row was created.

- [ ] **Step 1: Update `SquadService.java`**

Replace the whole file:
```java
package com.animesquad.squad;

import com.animesquad.squad.events.SquadJoinedEvent;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class SquadService {

    private final SquadRepository squads;
    private final MembershipRepository memberships;
    private final InviteCodeGenerator codes;
    private final ApplicationEventPublisher events;

    public SquadService(SquadRepository squads, MembershipRepository memberships,
                        InviteCodeGenerator codes, ApplicationEventPublisher events) {
        this.squads = squads;
        this.memberships = memberships;
        this.codes = codes;
        this.events = events;
    }

    @Transactional
    public Squad createSquad(Long ownerId, String name) {
        Squad squad = squads.save(new Squad(name, ownerId, generateUniqueCode()));
        memberships.save(new Membership(ownerId, squad.getId(), MembershipRole.OWNER));
        return squad;
    }

    @Transactional
    public Squad joinByInviteCode(Long userId, String inviteCode) {
        Squad squad = squads.findByInviteCode(inviteCode)
            .orElseThrow(() -> new IllegalArgumentException("invite code not found"));
        if (!memberships.existsByUserIdAndSquadId(userId, squad.getId())) {
            memberships.save(new Membership(userId, squad.getId(), MembershipRole.MEMBER));
            events.publishEvent(new SquadJoinedEvent(userId, squad.getId()));
        }
        return squad;
    }

    @Transactional(readOnly = true)
    public List<Squad> listMySquads(Long userId) {
        List<Long> squadIds = memberships.findAllByUserId(userId).stream()
            .map(Membership::getSquadId).toList();
        return squads.findAllById(squadIds);
    }

    @Transactional(readOnly = true)
    public Squad getSquadForMember(Long userId, Long squadId) {
        if (!memberships.existsByUserIdAndSquadId(userId, squadId)) {
            throw new IllegalArgumentException("squad not found");
        }
        return squads.findById(squadId)
            .orElseThrow(() -> new IllegalArgumentException("squad not found"));
    }

    private String generateUniqueCode() {
        for (int attempt = 0; attempt < 5; attempt++) {
            String code = codes.next();
            if (!squads.existsByInviteCode(code)) return code;
        }
        throw new IllegalStateException("could not generate unique invite code");
    }
}
```

- [ ] **Step 2: Update `WatchService.java`**

Replace the whole file:
```java
package com.animesquad.watch;

import com.animesquad.anime.Anime;
import com.animesquad.anime.AnimeService;
import com.animesquad.watch.events.AnimeAddedEvent;
import com.animesquad.watch.events.ProgressUpdatedEvent;
import com.animesquad.watch.events.WatchRatedEvent;
import com.animesquad.watch.events.WatchStatusChangedEvent;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class WatchService {

    private final WatchEntryRepository entries;
    private final AnimeService animeService;
    private final ApplicationEventPublisher events;

    public WatchService(WatchEntryRepository entries, AnimeService animeService,
                        ApplicationEventPublisher events) {
        this.entries = entries;
        this.animeService = animeService;
        this.events = events;
    }

    @Transactional
    public WatchEntry addToList(Long userId, int anilistId, WatchStatus status) {
        Anime anime = animeService.findOrFetchByAnilistId(anilistId);
        return entries.findByUserIdAndAnimeId(userId, anime.getId())
            .orElseGet(() -> {
                WatchEntry saved = entries.save(new WatchEntry(userId, anime.getId(), status));
                events.publishEvent(new AnimeAddedEvent(userId, anime.getId(), status));
                return saved;
            });
    }

    @Transactional
    public WatchEntry updateEntry(Long userId, Long animeId,
                                  WatchStatus status, Integer progress,
                                  Integer score, String comment) {
        WatchEntry e = entries.findByUserIdAndAnimeId(userId, animeId)
            .orElseThrow(() -> new IllegalArgumentException("watch entry not found"));

        WatchStatus oldStatus = e.getStatus();
        int oldProgress = e.getProgress();
        Integer oldScore = e.getScore();

        e.apply(status, progress, score, comment);

        if (status != null && status != oldStatus) {
            events.publishEvent(new WatchStatusChangedEvent(userId, animeId, oldStatus, status));
        }
        if (progress != null && progress != oldProgress) {
            events.publishEvent(new ProgressUpdatedEvent(userId, animeId, progress));
        }
        if (score != null && !score.equals(oldScore)) {
            events.publishEvent(new WatchRatedEvent(userId, animeId, score));
        }
        return e;
    }

    @Transactional(readOnly = true)
    public List<WatchEntry> listMine(Long userId) {
        return entries.findAllByUserIdOrderByUpdatedAtDesc(userId);
    }
}
```

- [ ] **Step 3: Update `EpisodeRatingService.java`**

Replace the whole file:
```java
package com.animesquad.episode;

import com.animesquad.episode.events.EpisodeRatedEvent;
import com.animesquad.watch.WatchEntry;
import com.animesquad.watch.WatchEntryRepository;
import com.animesquad.watch.WatchService;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class EpisodeRatingService {

    private final EpisodeRatingRepository ratings;
    private final WatchEntryRepository watches;
    private final WatchService watchService;
    private final ApplicationEventPublisher events;

    public EpisodeRatingService(EpisodeRatingRepository ratings,
                                WatchEntryRepository watches,
                                WatchService watchService,
                                ApplicationEventPublisher events) {
        this.ratings = ratings;
        this.watches = watches;
        this.watchService = watchService;
        this.events = events;
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

        events.publishEvent(new EpisodeRatedEvent(userId, animeId, episodeNumber, score));
        return rating;
    }

    @Transactional(readOnly = true)
    public List<EpisodeRating> listForUserAnime(Long userId, Long animeId) {
        return ratings.findAllByUserIdAndAnimeIdOrderByEpisodeNumberAsc(userId, animeId);
    }
}
```

- [ ] **Step 4: Add a light e2e assertion to `SquadServiceIT.java`**

Append inside the class, before the closing brace:
```java
    @org.springframework.beans.factory.annotation.Autowired
    com.animesquad.activity.ActivityRepository activityRepo;

    @Test
    void joinByInviteCode_emitsActivity_butCreateDoesNot() {
        User owner = userService.upsertFromGoogle("g-evt-o", "evto@x.y", "EvtO", null);
        User joiner = userService.upsertFromGoogle("g-evt-j", "evtj@x.y", "EvtJ", null);
        Squad s = squadService.createSquad(owner.getId(), "S");
        assertThat(activityRepo.count()).isZero();

        squadService.joinByInviteCode(joiner.getId(), s.getInviteCode());

        assertThat(activityRepo.count()).isEqualTo(1);
        assertThat(activityRepo.findAll().get(0).getType())
            .isEqualTo(com.animesquad.activity.ActivityType.JOINED_SQUAD);
    }
```

- [ ] **Step 5: Add a light e2e assertion to `WatchServiceIT.java`**

Append inside the class:
```java
    @org.springframework.beans.factory.annotation.Autowired
    com.animesquad.activity.ActivityRepository activityRepo2;
    @org.springframework.beans.factory.annotation.Autowired
    com.animesquad.squad.SquadService squadServiceForEvents;

    @Test
    void addThenUpdate_writesActivityRows_whenActorInSquad() {
        User me = userService.upsertFromGoogle("g-evt", "evt@x.y", "Evt", null);
        squadServiceForEvents.createSquad(me.getId(), "S");
        animeService.upsertFromAniList(media(80));

        WatchEntry added = watchService.addToList(me.getId(), 80, WatchStatus.WATCHING);
        watchService.updateEntry(me.getId(), added.getAnimeId(),
            WatchStatus.COMPLETED, 12, 9, null);

        assertThat(activityRepo2.findAll())
            .extracting(a -> a.getType().name())
            .containsExactlyInAnyOrder("ANIME_ADDED", "STATUS_CHANGED", "PROGRESS_UPDATED", "RATED");
    }
```

- [ ] **Step 6: Add a light e2e assertion to `EpisodeRatingServiceIT.java`**

Append inside the class:
```java
    @org.springframework.beans.factory.annotation.Autowired
    com.animesquad.activity.ActivityRepository activityRepo3;
    @org.springframework.beans.factory.annotation.Autowired
    com.animesquad.squad.SquadService squadServiceForEvents3;

    @Test
    void upsertRating_emitsEpisodeRated_andProgressUpdatedOnBump_whenInSquad() {
        Seeded s = seed("evt", 9001);
        squadServiceForEvents3.createSquad(s.user().getId(), "S");
        // progress starts at 0; rating ep 5 should bump it → ProgressUpdated also fires

        service.upsertRating(s.user().getId(), s.anime().getId(), 5, 7, null);

        assertThat(activityRepo3.findAll())
            .extracting(a -> a.getType().name())
            .containsExactlyInAnyOrder("EPISODE_RATED", "PROGRESS_UPDATED");
    }
```

- [ ] **Step 7: Run the affected ITs**

```bash
./gradlew test --tests SquadServiceIT --tests WatchServiceIT --tests EpisodeRatingServiceIT
```
Expected: ALL PASS.

- [ ] **Step 8: Run the full backend suite**

```bash
./gradlew test
```
Expected: ALL PASS.

- [ ] **Step 9: Commit**

```bash
git add backend/src/main/java/com/animesquad/squad/SquadService.java \
        backend/src/main/java/com/animesquad/watch/WatchService.java \
        backend/src/main/java/com/animesquad/episode/EpisodeRatingService.java \
        backend/src/test/java/com/animesquad/squad/SquadServiceIT.java \
        backend/src/test/java/com/animesquad/watch/WatchServiceIT.java \
        backend/src/test/java/com/animesquad/episode/EpisodeRatingServiceIT.java
git commit -m "feat: publish domain events from squad/watch/episode services"
```

---

## Task 6: `ActivityService.listForSquad`

**Files:**
- Create: `backend/src/main/java/com/animesquad/activity/ActivityService.java`

Membership-gated read with cursor pagination. Cursor is the last seen `id`; the next page is everything with smaller id.

- [ ] **Step 1: Implement `ActivityService.java`**

```java
package com.animesquad.activity;

import com.animesquad.squad.MembershipRepository;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class ActivityService {

    private static final int MAX_LIMIT = 100;

    private final ActivityRepository activities;
    private final MembershipRepository memberships;

    public ActivityService(ActivityRepository activities, MembershipRepository memberships) {
        this.activities = activities;
        this.memberships = memberships;
    }

    @Transactional(readOnly = true)
    public List<Activity> listForSquad(Long viewerId, Long squadId, Long cursor, int limit) {
        if (!memberships.existsByUserIdAndSquadId(viewerId, squadId)) {
            throw new IllegalArgumentException("squad not found");
        }
        int bounded = Math.max(1, Math.min(limit, MAX_LIMIT));
        Limit l = Limit.of(bounded);
        if (cursor == null) {
            return activities.findBySquadIdOrderByIdDesc(squadId, l);
        }
        return activities.findBySquadIdAndIdLessThanOrderByIdDesc(squadId, cursor, l);
    }
}
```

- [ ] **Step 2: Compile**

```bash
./gradlew compileJava
```
Expected: BUILD SUCCESSFUL.

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/java/com/animesquad/activity/ActivityService.java
git commit -m "feat(activity): membership-gated feed listing with cursor pagination"
```

---

## Task 7: `FeedController` + DTOs (TDD)

**Files:**
- Create: `backend/src/main/java/com/animesquad/activity/dto/ActorRef.java`
- Create: `backend/src/main/java/com/animesquad/activity/dto/AnimeRef.java`
- Create: `backend/src/main/java/com/animesquad/activity/dto/FeedItemResponse.java`
- Create: `backend/src/main/java/com/animesquad/activity/FeedController.java`
- Test: `backend/src/test/java/com/animesquad/activity/FeedControllerIT.java`

The endpoint is `GET /api/squads/{squadId}/feed?cursor=<lastId>&limit=30`. Response items embed actor + anime hydration (each from a single batch fetch keyed by id).

- [ ] **Step 1: DTOs**

`ActorRef.java`:
```java
package com.animesquad.activity.dto;

import com.animesquad.user.User;

public record ActorRef(Long id, String displayName, String avatarUrl) {
    public static ActorRef from(User u) {
        return new ActorRef(u.getId(), u.getDisplayName(), u.getAvatarUrl());
    }
}
```

`AnimeRef.java`:
```java
package com.animesquad.activity.dto;

import com.animesquad.anime.Anime;

public record AnimeRef(Long id, String titleRomaji, String coverImageUrl) {
    public static AnimeRef from(Anime a) {
        return new AnimeRef(a.getId(), a.getTitleRomaji(), a.getCoverImageUrl());
    }
}
```

`FeedItemResponse.java`:
```java
package com.animesquad.activity.dto;

import com.animesquad.activity.Activity;
import com.animesquad.activity.ActivityType;

import java.time.OffsetDateTime;
import java.util.Map;

public record FeedItemResponse(
    Long id,
    ActivityType type,
    ActorRef actor,
    AnimeRef anime,
    Map<String, Object> payload,
    OffsetDateTime createdAt
) {
    public static FeedItemResponse from(Activity a, ActorRef actor, AnimeRef anime) {
        return new FeedItemResponse(
            a.getId(), a.getType(), actor, anime, a.getPayload(), a.getCreatedAt());
    }
}
```

- [ ] **Step 2: Write the failing IT**

`FeedControllerIT.java`:
```java
package com.animesquad.activity;

import com.animesquad.anime.AniListClient;
import com.animesquad.anime.AniListMedia;
import com.animesquad.anime.AnimeService;
import com.animesquad.auth.JwtAuthenticationFilter;
import com.animesquad.auth.JwtService;
import com.animesquad.squad.Squad;
import com.animesquad.squad.SquadService;
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
class FeedControllerIT extends AbstractIntegrationTest {

    @Autowired UserService userService;
    @Autowired AnimeService animeService;
    @Autowired WatchService watchService;
    @Autowired SquadService squadService;
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

    private String url(String path) { return "http://localhost:" + port + path; }

    @Test
    void feed_returnsEventsForSquad_inDescendingOrder_withActorAndAnime() {
        User me = userService.upsertFromGoogle("g-feed", "feed@x.y", "Feeder", "avatar");
        Squad s = squadService.createSquad(me.getId(), "S");
        animeService.upsertFromAniList(new AniListMedia(
            7001, "Frieren", "葬送", "FrierenE", "img", 28, "FINISHED", "TV", 2023));
        watchService.addToList(me.getId(), 7001, WatchStatus.WATCHING);
        watchService.updateEntry(me.getId(), 1L, null, 5, null, null);

        ResponseEntity<Map[]> res = rest.exchange(
            url("/api/squads/" + s.getId() + "/feed"), HttpMethod.GET,
            new HttpEntity<>(cookieFor(me.getId())), Map[].class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(res.getBody().length).isGreaterThanOrEqualTo(2);
        // Most recent first
        assertThat((String) res.getBody()[0].get("type")).isEqualTo("PROGRESS_UPDATED");
        // Actor hydrated
        assertThat(((Map<?, ?>) res.getBody()[0].get("actor")).get("displayName")).isEqualTo("Feeder");
        // Anime hydrated
        assertThat(((Map<?, ?>) res.getBody()[0].get("anime")).get("titleRomaji")).isEqualTo("Frieren");
    }

    @Test
    void feed_respectsCursor() {
        User me = userService.upsertFromGoogle("g-cur", "cur@x.y", "Cur", null);
        Squad s = squadService.createSquad(me.getId(), "S");
        animeService.upsertFromAniList(new AniListMedia(
            7002, "R", "N", "E", "img", 12, "FINISHED", "TV", 2024));
        watchService.addToList(me.getId(), 7002, WatchStatus.WATCHING);
        watchService.updateEntry(me.getId(), 1L, null, 1, null, null);
        watchService.updateEntry(me.getId(), 1L, null, 2, null, null);

        ResponseEntity<Map[]> first = rest.exchange(
            url("/api/squads/" + s.getId() + "/feed?limit=1"), HttpMethod.GET,
            new HttpEntity<>(cookieFor(me.getId())), Map[].class);
        assertThat(first.getBody()).hasSize(1);
        Integer firstId = (Integer) first.getBody()[0].get("id");

        ResponseEntity<Map[]> second = rest.exchange(
            url("/api/squads/" + s.getId() + "/feed?limit=1&cursor=" + firstId),
            HttpMethod.GET,
            new HttpEntity<>(cookieFor(me.getId())), Map[].class);
        assertThat(second.getBody()).hasSize(1);
        assertThat((Integer) second.getBody()[0].get("id")).isLessThan(firstId);
    }

    @Test
    void feed_returns400_whenViewerNotMember() {
        User owner = userService.upsertFromGoogle("g-fo", "fo@x.y", "FO", null);
        User stranger = userService.upsertFromGoogle("g-fs", "fs@x.y", "FS", null);
        Squad s = squadService.createSquad(owner.getId(), "S");

        ResponseEntity<String> res = rest.exchange(
            url("/api/squads/" + s.getId() + "/feed"), HttpMethod.GET,
            new HttpEntity<>(cookieFor(stranger.getId())), String.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void feed_returns401_whenUnauthenticated() {
        ResponseEntity<String> res = rest.exchange(
            url("/api/squads/1/feed"), HttpMethod.GET,
            HttpEntity.EMPTY, String.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }
}
```

- [ ] **Step 3: Run test, expect failure**

```bash
./gradlew test --tests FeedControllerIT
```
Expected: FAIL — controller missing.

- [ ] **Step 4: Implement `FeedController.java`**

```java
package com.animesquad.activity;

import com.animesquad.activity.dto.ActorRef;
import com.animesquad.activity.dto.AnimeRef;
import com.animesquad.activity.dto.FeedItemResponse;
import com.animesquad.anime.Anime;
import com.animesquad.anime.AnimeRepository;
import com.animesquad.auth.CurrentUser;
import com.animesquad.user.User;
import com.animesquad.user.UserRepository;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/squads/{squadId}/feed")
public class FeedController {

    private final ActivityService activityService;
    private final UserRepository users;
    private final AnimeRepository animes;

    public FeedController(ActivityService activityService, UserRepository users, AnimeRepository animes) {
        this.activityService = activityService;
        this.users = users;
        this.animes = animes;
    }

    @GetMapping
    public List<FeedItemResponse> feed(
        @AuthenticationPrincipal CurrentUser me,
        @PathVariable Long squadId,
        @RequestParam(required = false) Long cursor,
        @RequestParam(defaultValue = "30") int limit
    ) {
        List<Activity> rows = activityService.listForSquad(me.userId(), squadId, cursor, limit);
        if (rows.isEmpty()) return List.of();

        Map<Long, User> actorById = users.findAllById(
                rows.stream().map(Activity::getActorId).distinct().toList()).stream()
            .collect(Collectors.toMap(User::getId, u -> u));

        List<Long> animeIds = rows.stream()
            .map(Activity::getAnimeId).filter(java.util.Objects::nonNull).distinct().toList();
        Map<Long, Anime> animeById = animes.findAllById(animeIds).stream()
            .collect(Collectors.toMap(Anime::getId, a -> a));

        return rows.stream().map(a -> FeedItemResponse.from(
            a,
            actorById.get(a.getActorId()) == null
                ? null
                : ActorRef.from(actorById.get(a.getActorId())),
            a.getAnimeId() == null || animeById.get(a.getAnimeId()) == null
                ? null
                : AnimeRef.from(animeById.get(a.getAnimeId()))
        )).toList();
    }
}
```

- [ ] **Step 5: Run test, expect pass**

```bash
./gradlew test --tests FeedControllerIT
```
Expected: PASS (all four tests).

- [ ] **Step 6: Run full suite**

```bash
./gradlew test
```
Expected: ALL PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/animesquad/activity/dto/ \
        backend/src/main/java/com/animesquad/activity/FeedController.java \
        backend/src/test/java/com/animesquad/activity/FeedControllerIT.java
git commit -m "feat(activity): GET /api/squads/{id}/feed with cursor + hydration"
```

---

## Task 8: Frontend — squad detail / feed page

**Files:**
- Modify: `frontend/src/app/lib/api.ts`
- Modify: `frontend/src/app/squads/page.tsx`
- Create: `frontend/src/app/squads/[id]/page.tsx`

Squad listing on `/squads` now links each row to `/squads/{id}`. The detail page renders the feed with cursor-driven "Load more" and type-specific messages.

- [ ] **Step 1: Extend `api.ts`** — feed types

Append to `frontend/src/app/lib/api.ts`:
```ts
export type FeedItem = {
  id: number;
  type:
    | "ANIME_ADDED" | "STATUS_CHANGED" | "PROGRESS_UPDATED"
    | "RATED" | "EPISODE_RATED" | "JOINED_SQUAD";
  actor: { id: number; displayName: string; avatarUrl: string | null } | null;
  anime: { id: number; titleRomaji: string; coverImageUrl: string | null } | null;
  payload: Record<string, unknown>;
  createdAt: string;
};
```

- [ ] **Step 2: Link squad rows on `/squads`**

In `frontend/src/app/squads/page.tsx`, find the `squads.map((s) => (` block and replace its `<li>` content with a link:
```tsx
        {squads.map((s) => (
          <li key={s.id}>
            <a href={`/squads/${s.id}`} style={{ textDecoration: "none", color: "inherit" }}>
              <strong>{s.name}</strong>
            </a>
            {" "}— 초대 코드: <code>{s.inviteCode}</code>
          </li>
        ))}
```

- [ ] **Step 3: Create `frontend/src/app/squads/[id]/page.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { apiGet, type FeedItem } from "@/app/lib/api";

const PAGE_SIZE = 30;

export default function SquadFeedPage({ params }: { params: { id: string } }) {
  const squadId = params.id;
  const [items, setItems] = useState<FeedItem[]>([]);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadMore() {
    setLoading(true);
    setError(null);
    try {
      const cursor = items.length === 0 ? "" : `&cursor=${items[items.length - 1].id}`;
      const page = await apiGet<FeedItem[]>(
        `/api/squads/${squadId}/feed?limit=${PAGE_SIZE}${cursor}`);
      setItems((cur) => [...cur, ...page]);
      if (page.length < PAGE_SIZE) setDone(true);
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadMore(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  return (
    <main style={{ padding: 40, fontFamily: "sans-serif", maxWidth: 720 }}>
      <h1>스쿼드 피드</h1>
      {error && <p style={{ color: "crimson" }}>{error}</p>}

      <ul style={{ listStyle: "none", padding: 0 }}>
        {items.map((it) => (
          <li key={it.id} style={{ display: "flex", gap: 12, padding: 10, borderBottom: "1px solid #eee" }}>
            {it.anime?.coverImageUrl && (
              <img src={it.anime.coverImageUrl} alt="" width={40} height={56} style={{ objectFit: "cover" }} />
            )}
            <div>
              <div>{describe(it)}</div>
              <div style={{ fontSize: 12, color: "#999" }}>{new Date(it.createdAt).toLocaleString()}</div>
            </div>
          </li>
        ))}
      </ul>

      {!done && (
        <button onClick={loadMore} disabled={loading} style={{ marginTop: 12 }}>
          {loading ? "불러오는 중…" : "더 보기"}
        </button>
      )}
      {done && items.length === 0 && <p style={{ color: "#666" }}>아직 활동이 없어요.</p>}
    </main>
  );
}

function describe(it: FeedItem): string {
  const who = it.actor?.displayName ?? "누군가";
  const what = it.anime?.titleRomaji ?? "작품";
  const p = it.payload as Record<string, unknown>;
  switch (it.type) {
    case "ANIME_ADDED":
      return `${who} 님이 "${what}" 추가 (${p.status})`;
    case "STATUS_CHANGED":
      return `${who} 님이 "${what}" 상태를 ${p.from} → ${p.to}`;
    case "PROGRESS_UPDATED":
      return `${who} 님이 "${what}" ${p.progress}화까지 봄`;
    case "RATED":
      return `${who} 님이 "${what}"에 ${p.score}/10`;
    case "EPISODE_RATED":
      return `${who} 님이 "${what}" ${p.episode}화에 ${p.score}/10`;
    case "JOINED_SQUAD":
      return `${who} 님이 스쿼드에 참여`;
  }
}
```

- [ ] **Step 4: Build**

```bash
cd frontend && pnpm build
```
Expected: BUILD SUCCESSFUL with `/squads/[id]` in the route table.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/lib/api.ts \
        frontend/src/app/squads/page.tsx \
        frontend/src/app/squads/\[id\]/
git commit -m "feat(frontend): squad detail feed page with cursor pagination"
```

---

## Task 9: Manual smoke test

**No code — verification only.**

- [ ] **Step 1: Restart backend (apply V6) + frontend**

```bash
# Terminal 1
cd backend
set -a; source .env.local; set +a
docker compose up -d
./gradlew bootRun

# Terminal 2
cd frontend && pnpm dev
```

- [ ] **Step 2: Exercise the event sources**

In the browser, signed in:
1. Visit `/squads`, ensure you're in at least one squad (create one if not).
2. Visit `/anime/search`, add an anime in `WATCHING`.
3. Visit `/my/list`, change progress and score on that row, hit 저장.
4. Use the curl PUT from Plan 5 to rate episode 5.

- [ ] **Step 3: Open the squad feed**

Click the squad name on `/squads`. The feed should list, newest first:
- "Episode rated" entries
- "Status changed" / "progress updated" / "rated"
- The original "anime added"

In a second account, join the squad with the invite code — the feed should now also include a "joined" entry for them.

- [ ] **Step 4: Sanity-check cursor pagination**

If there are more than 30 events, "더 보기" appears. Click it; the next page loads without duplicates.

- [ ] **Step 5: DB sanity check**

```bash
docker exec animesquad-db psql -U animesquad -d animesquad -c \
  "SELECT id, type, squad_id, actor_id, anime_id, payload, created_at
   FROM activity ORDER BY id DESC LIMIT 10;"
```
Expected: rows match what you did, payloads contain the expected keys.

- [ ] **Step 6: Update changelog**

```bash
cat >> CHANGELOG.md <<'EOF'

## Plan 6 — 2026-06-12
- `activity` table (V6) with jsonb payload
- Domain events from squad / watch / episode services
- ActivityListener fans out events to per-squad activity rows in the same tx
- `GET /api/squads/{id}/feed?cursor=&limit=` with actor + anime hydration
- Frontend `/squads/{id}` feed page with "더 보기" pagination
EOF
git add CHANGELOG.md
git commit -m "docs: changelog for plan 6"
```

---

## Verification Checklist (Definition of Done)

- [ ] `cd backend && ./gradlew test` — green (Plans 1–5 + `ActivityListenerIT`, `FeedControllerIT`, augmented service ITs)
- [ ] `cd frontend && pnpm build` — green with `/squads/[id]` route
- [ ] Manual smoke test (Task 9) executed
- [ ] CHANGELOG.md has a Plan 6 section

## Out of Scope for Plan 6 (covered later)

- Client-side grouping ("same user, same anime, EPISODE_RATED within 1h" — spec §6.6) — Plan 7 polish
- Realtime updates / push notifications
- Filtering feed by type
- `GET /api/squads/{id}/members/{userId}` (member profile) — its own plan
- Activity deletion / moderation
