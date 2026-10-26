# Laftel Automatic Recording Implementation Plan

> Use superpowers:executing-plans inline, then one fresh whole-change review.

**Goal:** Automatically record the current Laftel episode at 80% playback with a fixed logo label.
**Architecture:** Content code sends a bounded threshold event; background verifies fresh tab/media identity, resolves an exact match and calls an atomic advance-only server endpoint. Existing panel displays outcome and handles unmatched/manual correction.
**Tech Stack:** Java/Spring/PostgreSQL; Manifest V3 JavaScript; Node and Chromium tests.
**Spec:** docs/superpowers/specs/2026-10-26-laftel-auto-recording-design.md

## Global Constraints
- Laftel only; no new permissions or production viewing writes.
- 80% of current playback position, no extra delay, fixed `🟢 자동 기록 중` label.
- Preserve reviews, existing status and higher progress; no duplicate activity on replays.

## Review Focus
- Concurrent/retried/lower episode writes never regress progress (Task 1).
- Seeking/buffering, short media and SPA stale media cannot auto-record incorrectly (Task 2).
- Ambiguous/unmatched titles never cause guessed automatic writes (Task 2).
- Authentication/network/mapping failures do not falsely report success or repeat successful progress writes (Task 2).
- Fixed UI remains constant while clicked panel shows actual result (Task 2).

### Task 1: Atomic advance-only progress
**Files:** WatchController, WatchService, WatchEntryRepository and integration tests.
**Interface:** authenticated POST `/api/watch/{animeId}/progress` with `{progress: positive integer}` returns WatchEntryResponse; missing anime 404; invalid request 400. Insert missing WATCHING row; SQL ON CONFLICT advances only when larger. Publish progress activity only on inserted/advanced row.
- [x] Integration tests: create/repeat/lower progress, preserve reviews/status, authentication, missing/invalid input, concurrent first writes; observe missing endpoint failures.
- [x] Implement controller validation, atomic repository upsert, service event; run full backend suite and commit.

### Task 2: Threshold, automatic worker and fixed UI
**Files:** content/index.js, content/watch-detectors.js, background/service-worker.js, shared/api.js, popup/popup.js, content/laftel-inline.js, manifest and extension tests.
**Interfaces:** pure `asqIsAutoRecordPosition(snapshot)`; shared `asqExactAnimeMatch(results,title)`; content `LAFTEL_AUTO_RECORD` requests contain no trusted identity; background re-reads `GET_INLINE_STATE` including media snapshot/eligibility and returns saved, needs-match, login-required or failed. GET_INLINE_STATE also includes automatic status; inline context forwards it to panel. Endpoint is Task 1 POST progress; ID mapping learned only after success.
- [x] Test 79%/80%, paused/seeking/invalid media, one in-flight write, 60-second retry, SPA high-position reset; trusted sender, ID-first/exact-only match, auth, stale navigation, score/comment preservation and mapping-only failures; observe failures.
- [x] Implement threshold and scoped background auto-write, fixed label, and clicked panel feedback using existing fallback.
- [x] Full extension suite and isolated real-extension browser test with native video metadata/seek/play: 79% no write, 80% auto write without click, no duplicate, fixed text, outcome panel, episode navigation.
- [x] Fresh review; fix important issues RED→GREEN; validate ZIP1.0.5 and commit verification.

## Completion evidence
- Full backend suite: 244/244 passed, including new entry, duplicate activity prevention, review/status preservation, lower/replayed progress, validation/auth and concurrent first writes.
- Full extension suite: 125/125 passed.
- Actual extension Chromium + native 24-minute video: 79% no write; 80% automatic POST without record click; fixed label; actual outcome panel; comment retention; no duplicates; next episode old-media guard; closed panel refresh; React remount and non-player cleanup. All API writes used a disposable local server.
- Fresh whole-change review found one P1 ordering bug: separate SPA URL and title resets could overwrite the previous video reference with null. Added a regression, observed failure, preserved the last non-null video, and passed the complete extension and native-video browser suites. No declined behaviors or deferred minors.
- ZIP1.0.5: CRC, all manifest resource references, existing permissions and Laftel-only web-accessible resource scope verified.
- Backend API deployment is required for automatic saving. Implementation is committed on `codex/laftel-work-id-matching`; no main integration, remote push, deployment or production viewing writes were performed.

Browser check: `node chrome-extension/test/browser/laftel-inline.cjs` with Playwright/extension-capable Chromium and ffmpeg, or `ASQ_VIDEO_FIXTURE` pointing to a 24-minute fixture. Optional `ASQ_PLAYWRIGHT_MODULE`, `ASQ_CHROMIUM_PATH`, `ASQ_ARTIFACT_DIR`.
