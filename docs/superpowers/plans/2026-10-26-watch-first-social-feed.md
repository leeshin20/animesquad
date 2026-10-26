# Watch-first Squad Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatic watch logging, optional reviews, consecutive squad feed groups and independent recap data.
**Architecture:** Unique per-user episode history independent of squad activities; compatible progress POST; shared display projection over raw feed pages.
**Tech Stack:** Spring/JPA/PostgreSQL/Flyway, Next/React/TypeScript, MV3 JavaScript.
**Spec:** docs/superpowers/specs/2026-10-26-watch-first-social-feed-design.md

## Global Constraints

- Preserve Laftel 80% detection, work ID matching, aggregate status/reviews and old POST body/response.
- Source EXTENSION/MANUAL/UNKNOWN/LEGACY; source omitted means UNKNOWN. Extension1.0.7.
- Record only observed episodes, first timestamp once; no inferred gaps, recap product or watched minutes.
- Group increasing consecutive same-actor/anime/visibility observations <=2h apart. Other actors do not break sessions.
- Native execution under the user's instruction to implement; no extra method selection required.

## Review Focus

- Concurrent first writes and review writes serialize by user; no duplicate or regressed progress (Task1).
- Lower unseen episodes are recorded without lowering aggregate progress (Task1).
- Review deletion preserves original watch date and reveals watch activity (Tasks1,2).
- Raw-page cursors and different squad visibility remain correct after grouping (Task2).
- Legacy migration neither fabricates missing episodes nor republishes old events (Task1).

### Task 1: Independent history and compatible API

**Files:** Create V21 migration, watch/EpisodeWatch{,Repository,Service,Controller}.java, watch/events/EpisodeWatchedEvent.java and integration tests. Modify WatchService/Controller, EpisodeRatingService, ActivityListener, MyProgressActivityService, UserService, AdminAnimeController and regressions.
**Interfaces:** EpisodeWatchService.record(userId,animeId,episode,source) inserts once and advances aggregate; lock user row to serialize writes. GET /api/me/episode-watches?cursor=id&limit=50 returns {id,anime,episodeNumber,recordedAt,source}[] (max100). DELETE owns ID, blocks reviewed409, conditionally restores latest progress. Activity payload episodeWatchId/episode/progress.

- [ ] Write integration tests for no-squad, duplicates, lower/gapped episodes, review lifecycle, owned deletion, concurrency and migration.
- [ ] Run focused Gradle tests; expect missing behavior failures.
- [ ] Implement history migration/locking/write API, preserve watch events under reviews, lifecycle cleanup and old endpoint compatibility.
- [ ] Run `./gradlew --init-script /private/tmp/animesquad-docker-tests.gradle test`; expect all pass, then commit.

### Task 2: Feed projection

**Files:** Create frontend/src/app/lib/watch-feed.ts and .test.ts; modify Timeline.tsx/.test.tsx, home/page and squads/[id]/page.
**Interfaces:** projectWatchFeed(items: FeedItemWithSquad[]): FeedItemWithSquad[] projects all loaded raw rows, adds optional episodes/squads; keeps original IDs for server pagination.

- [ ] Tests for contiguous/missing/reverse/gapped sessions, interleaving actors/anime, scoped dedup, review hide/reveal and page joins.
- [ ] Run `pnpm exec tsx --test src/app/lib/watch-feed.test.ts`; expect missing projection failure.
- [ ] Implement projection, compact watched body and optional rating; project before home slicing, after squad raw accumulation.
- [ ] Run projection/Timeline/cursor tests; expect pass, then commit.

### Task 3: Watch-first web

**Files:** Create WatchEpisodeAction.tsx, watchlist/history/page.tsx; modify EpisodeLogModal, home, anime detail, watchlist layout/anime/reviews, NavBar, api types and tests.
**Interfaces:** WatchEpisodeAction(WatchEntry,onSaved) POSTs MANUAL; optional alternate episode. EpisodeLogModal initialEpisode defaults to actual selected watched episode and loads existing review. History uses Task1 cursor API and owned delete. Reviews excludes progress/empty records.

- [ ] Tests for simple watch action, selected review episode and review filtering; observe failures.
- [ ] Implement one-click watch, explicit review entry, history/delete, navigation/copy changes.
- [ ] Run `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`; expect pass, then commit.

### Task 4: Extension and integrated verification

**Files:** Modify chrome-extension manifest, background service-worker, popup html/js/css, focused tests/browser fixture.
**Interfaces:** Auto/manual POST source EXTENSION; manual watch no longer PATCH; explicit toggle for initially collapsed review fields. Keep matching/inline statuses and SPA guards.

- [ ] Add source/write/collapsed review tests and observe failure.
- [ ] Implement popup defaults and version1.0.7.
- [ ] Run extension unit suite and native browser fixture; full backend/frontend validation after final changes.
- [ ] Commit; fresh whole-branch review; fix material findings with regression tests and reverify.
- [ ] Package1.0.7 in worktree artifacts; report deployment separately.
