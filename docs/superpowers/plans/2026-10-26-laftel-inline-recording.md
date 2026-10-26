# Laftel Inline Recording Implementation Plan

> For agentic workers: use superpowers:executing-plans for inline implementation and a fresh whole-change review.

**Goal:** Record Laftel viewing through a logo/status button and embedded existing popup next to the work title.
**Architecture:** A Shadow DOM button/panel embeds the existing extension popup. Typed background messages resolve and validate the iframe's containing-tab context; content state tracks ending eligibility and navigation.
**Tech Stack:** Manifest V3 JavaScript, Node test runner, existing extension HTML/CSS.
**Spec:** docs/superpowers/specs/2026-10-26-laftel-inline-recording-design.md

## Global Constraints
- Laftel only; preserve other providers and toolbar behavior.
- No new permissions, generic request proxy, auto-submission or production test records.
- Reuse existing ID-first selection, exact-title fallback, alias learning and conflict handling.

## Review Focus
- Cross-tab pending records and stale iframe requests must not write the wrong episode (Tasks 1, 2).
- Only the extension iframe may issue inline completion/context/validation commands (Task 1).
- SPA navigation must replace stale panels and permit remounting after React removes the title area (Task 2).
- Missing anchors must retain the existing popup fallback; repeated mutations must not duplicate the button (Task 2).
- A record failure must remain retryable and must not show completion (Task 2).

### Task 1: Bound inline context and lifecycle
**Files:** background/service-worker.js, content/index.js; background/content tests (all under chrome-extension).
**Interfaces:** `LAFTEL_INLINE_CONTEXT` returns `{current, pending, episodeUrl}`; `LAFTEL_INLINE_VALIDATE` returns `{ok}`; `LAFTEL_INLINE_SAVED` / `LAFTEL_INLINE_CLOSE` accept an `episodeUrl` and affect only that URL. Content `GET_INLINE_STATE` returns current title/episode, URL, readiness and mounted availability. All inline worker commands require sender URL to be this extension's `popup/index.html?embedded=1` and a verified containing-tab Laftel playback URL. `pending` is null until ending-ready.
- [ ] Add tests for sender validation, per-tab context, stale validation, scoped completion, and mounted fallback; run and observe failures.
- [ ] Implement shared ID-first resolution and typed inline commands; expose fresh content state without changing existing GET_CURRENT_ANIME responses.
- [ ] Run extension tests; commit. Expected: all pass.

### Task 2: Logo panel and embedded record form
**Files:** create content/laftel-inline.js; modify content/index.js, popup/popup.js, popup/index.html, popup/popup.css, manifest.json; extend popup tests.
**Interfaces:** `asqUpdateLaftelInline({animeName, ep, episodeUrl, readyToRecord})` mounts/updates the logo control; `asqLaftelInlineAvailable()` reports mounting; `asqHandleLaftelInlineAction(message)` closes/completes only a matching episode URL. Existing popup requests inline context instead of active-tab/global pending when embedded and validates URL/readiness before writes.
- [ ] Add popup tests for embedded context, readiness gate, stale navigation, scoped completion and close; observe missing behavior failures.
- [ ] Implement Shadow DOM logo button and iframe; detach on leaving playback, reset on episode navigation, and refresh an already open waiting panel after ending.
- [ ] Reuse popup recording with embedded initialization/close/validation only; bump version to 1.0.4 and restrict web-accessible resources to Laftel.
- [ ] Run full extension suite and local browser DOM/visual checks for mounting, duplicate prevention, navigation and recording retry. Expected: all pass without production writes.
- [ ] Fresh code review; fix important findings and verify; package production files into a validated 1.0.4 ZIP and commit.
