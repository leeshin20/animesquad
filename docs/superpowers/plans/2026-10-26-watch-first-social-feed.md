# Watch-first Squad Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

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

- [x] Write integration tests for no-squad, duplicates, lower/gapped episodes, review lifecycle, owned deletion, concurrency and migration.
- [x] Run focused Gradle tests; expect missing behavior failures.
- [x] Implement history migration/locking/write API, preserve watch events under reviews, lifecycle cleanup and old endpoint compatibility.
- [x] Run `./gradlew --init-script /private/tmp/animesquad-docker-tests.gradle test`; expect all pass, then commit.

### Task 2: Feed projection

**Files:** Create frontend/src/app/lib/watch-feed.ts and .test.ts; modify Timeline.tsx/.test.tsx, home/page and squads/[id]/page.
**Interfaces:** projectWatchFeed(items: FeedItemWithSquad[]): FeedItemWithSquad[] projects all loaded raw rows, adds optional episodes/squads; keeps original IDs for server pagination.

- [x] Tests for contiguous/missing/reverse/gapped sessions, interleaving actors/anime, scoped dedup, review hide/reveal and page joins.
- [x] Run `pnpm exec tsx --test src/app/lib/watch-feed.test.ts`; expect missing projection failure.
- [x] Implement projection, compact watched body and optional rating; project before home slicing, after squad raw accumulation.
- [x] Run projection/Timeline/cursor tests; expect pass, then commit.

### Task 3: Watch-first web

**Files:** Create WatchEpisodeAction.tsx, watchlist/history/page.tsx; modify EpisodeLogModal, home, anime detail, watchlist layout/anime/reviews, NavBar, api types and tests.
**Interfaces:** WatchEpisodeAction(WatchEntry,onSaved) POSTs MANUAL; optional alternate episode. EpisodeLogModal initialEpisode defaults to actual selected watched episode and loads existing review. History uses Task1 cursor API and owned delete. Reviews excludes progress/empty records.

- [x] Tests for simple watch action, selected review episode and review filtering; observe failures.
- [x] Implement one-click watch, explicit review entry, history/delete, navigation/copy changes.
- [x] Run `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`; expect pass, then commit.

### Task 4: Extension and integrated verification

**Files:** Modify chrome-extension manifest, background service-worker, popup html/js/css, focused tests/browser fixture.
**Interfaces:** Auto/manual POST source EXTENSION; manual watch no longer PATCH; explicit toggle for initially collapsed review fields. Keep matching/inline statuses and SPA guards.

- [x] Add source/write/collapsed review tests and observe failure.
- [x] Implement popup defaults and version1.0.7.
- [x] Run extension unit suite and native browser fixture; full backend/frontend validation after final changes.
- [x] Commit; fresh whole-branch review; fix material findings with regression tests and reverify.
- [x] Package1.0.7 in worktree artifacts; report deployment separately.

## Verified outcome

- Backend: 250 tests, zero failures, including PostgreSQL migration, concurrent recording, source validation, no-squad history and deletion ownership.
- Frontend: 26 TypeScript/TSX tests and 18 JavaScript tests, zero failures; typecheck and production build pass. Lint retains the pre-existing NavBar effect-dependency warning.
- Extension: 129 tests, zero failures; native-video browser fixture verifies 79%/80%, paused seek, SPA media replacement, collapsed reviews, retained drafts and duplicate suppression.
- Web browser fixture verifies grouped feed, one-click watch, exact-episode existing review load/edit, delayed-load input protection, history deletion, mobile layout, raw cursor pagination, explicit progress correction and preserving concurrent auto records.
- Fresh whole-branch review identified three Important issues, all reproduced RED and corrected GREEN: hidden-watch session boundaries, missing auxiliary progress correction, and review hydration overwriting drafts. The correction browser test additionally reproduced and fixed stale unchanged progress overwriting new auto records.
- History channel wording uses 확장 프로그램 for EXTENSION because manual extension submission and automatic detection share this source.
- Existing nullable-score retention and admin-import concurrency were reviewed as pre-existing behavior; no changes to those policies. Account history cleanup uses its user FK cascade; admin deletion guards and watch-list removal explicitly include history.
- Extension1.0.7 ZIP contains all 15 production files with every manifest reference checked, and matches current source. Output: backend/build/distributions/AnimeSquad-1.0.7.zip (generated, untracked).
- Work remains on codex/laftel-work-id-matching in the existing managed worktree. No production push or deployment was performed for this change.
