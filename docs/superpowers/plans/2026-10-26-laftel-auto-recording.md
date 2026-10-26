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
- [ ] Integration tests: create/repeat/lower progress, preserve reviews/status, authentication, missing/invalid input, concurrent first writes; observe missing endpoint failures.
- [ ] Implement controller validation, atomic repository upsert, service event; run full backend suite and commit.

### Task 2: Threshold, automatic worker and fixed UI
**Files:** content/index.js, content/watch-detectors.js, background/service-worker.js, shared/api.js, popup/popup.js, content/laftel-inline.js, manifest and extension tests.
**Interfaces:** pure `asqIsAutoRecordPosition(snapshot)`; shared `asqExactAnimeMatch(results,title)`; content `LAFTEL_AUTO_RECORD` requests contain no trusted identity; background re-reads `GET_INLINE_STATE` including media snapshot/eligibility and returns saved, needs-match, login-required or failed. GET_INLINE_STATE also includes automatic status; inline context forwards it to panel. Endpoint is Task 1 POST progress; ID mapping learned only after success.
- [ ] Test 79%/80%, paused/seeking/invalid media, one in-flight write, 60-second retry, SPA high-position reset; trusted sender, ID-first/exact-only match, auth, stale navigation, score/comment preservation and mapping-only failures; observe failures.
- [ ] Implement threshold and scoped background auto-write, fixed label, and clicked panel feedback using existing fallback.
- [ ] Full extension suite and isolated real-extension browser test with native video metadata/seek/play: 79% no write, 80% auto write without click, no duplicate, fixed text, outcome panel, episode navigation.
- [ ] Fresh review; fix important issues RED→GREEN; validate ZIP1.0.5 and commit verification.
