# Laftel Work ID Matching Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this approved design in the current session, with a fresh whole-branch review at the end.

**Goal:** Reuse the first user's recorded Laftel work selection across later viewers and episodes using its platform work ID.

**Architecture:** Persist unique `(platform, platform_anime_id) -> anime_id` links behind public resolution and authenticated registration APIs. The extension derives Laftel identity from the sender tab URL, resolves it before title search, and learns the link only after successful record submission. Existing alias learning and legacy pending messages remain compatible.

**Tech Stack:** Java 21, Spring Boot/JPA, PostgreSQL/Flyway, Manifest V3 plain JavaScript, Node test runner.

**Spec:** docs/superpowers/specs/2026-10-26-laftel-work-id-matching-design.md

## Global Constraints

- Support Laftel only; do not implement Netflix mappings, episode-number conversion, admin mapping UI, or automatic record submission.
- Keep existing aliases, old extension payloads, Netflix and Crunchyroll flows compatible.
- Same-link registration is idempotent; different-target registration returns 409 without overwriting.
- Mapping failures must not repeat a successful viewing record or propagate a conflicting alias.
- Preserve all unrelated changes in the original checkout. Never write test viewing records to production.

## Review Focus

- Sender URL identity must override untrusted message fields; detail pages and lookalike hosts must not create Laftel identities (Task 2).
- Concurrent first registrations must produce one persistent link (Task 1).
- Deleted or excluded anime must never resolve from a stale link (Task 1).
- A title search returning a spinoff first must not select it automatically (Task 2).
- A failed link write after a successful record must preserve completion and avoid alias propagation on conflict (Task 3).

### Task 1: Persist and resolve Laftel links

**Files:** Create `AnimePlatformLink.java`, `AnimePlatformLinkRepository.java`, `AnimePlatformLinkService.java`, `AnimePlatformLinkController.java` under `backend/src/main/java/com/animesquad/anime/`; create migration `V20__anime_platform_link.sql`; create `backend/src/test/java/com/animesquad/anime/AnimePlatformLinkControllerIT.java`.

**Interfaces:** GET `/api/anime/platform-links/LAFTEL/{platformAnimeId}` returns AnimeResponse or 404; POST `/api/anime/{animeId}/platform-links` accepts `{platform:"LAFTEL",platformAnimeId:"41666"}` and returns 204/409. Validate 1–20 decimal digits without a leading zero; other platforms return 400. `resolve(String platform, String platformAnimeId)` returns Anime, `register(Long animeId, String platform, String platformAnimeId)` is idempotent. Atomic PostgreSQL ON CONFLICT DO NOTHING plus reading the winner prevents concurrent overwrites. FK to anime uses ON DELETE CASCADE, and an anime row write lock coordinates registration with deletion.

- [x] Write integration tests for cross-user reuse, idempotency, missing/bad input, unauthorized writes, conflicts, concurrent registration, and cascade on deletion.
- [x] Run new tests and observe missing-endpoint failures.
- [x] Implement migration, entity, repository, service, and controller.
- [x] Run new tests and the backend suite; commit this task.

### Task 2: Resolve Laftel identities before title search

**Files:** Modify `chrome-extension/shared/api.js`, `chrome-extension/background/service-worker.js`; extend `chrome-extension/test/background.test.js` and `api.test.js`.

**Interfaces:** `asqLaftelSource(tabUrl)` returns `{platform:"LAFTEL", platformAnimeId:"41666"}` or null. `findPlatformAnime(source)` returns AnimeResponse or null for 404; other HTTP errors throw. Pending adds `platformLink` and `matchedByPlatform` only for verified Laftel playback URLs. Generic non-Laftel messages retain their old fields.

- [x] Write tests proving ID-first lookup, title-change and next-episode reuse, title-search fallback on 404/error, and ignored malformed/non-player Laftel URLs.
- [x] Run extension tests and observe failures for missing ID behavior.
- [x] Implement helpers and the worker's mapping-first branch without changing unrelated providers.
- [x] Run the extension suite; commit this task.

### Task 3: Learn confirmed links after records

**Files:** Modify `chrome-extension/popup/popup.js`, `chrome-extension/manifest.json`; extend `chrome-extension/test/popup.test.js` and `api.test.js`; update `chrome-extension/test/brand-assets.test.js` only if its existing version assertion requires it.

**Interfaces:** New Laftel pending chooses the ID-resolved result, otherwise exactly one exact normalized title/alias result. Normalize case/whitespace only; do not erase season or edition markers. `learnPlatformLinkIfNeeded()` returns `saved`, `conflict`, or `failed`; no-link pending is a no-op. POST the selected anime and trusted platformLink only after viewing API success. Conflict skips alias learning; other link failures can preserve independent alias learning. Show record-complete plus learning-failure feedback. Version 1.0.2 identifies the updated unpacked extension.

- [x] Write popup tests for ID match, ambiguous fallback, manual selection -> successful record -> link and alias, failures/conflicts, dismiss, legacy pending, and retry behavior.
- [x] Run tests and observe the missing-behavior failures.
- [x] Implement exact selection and post-record learning; do not add new permissions.
- [x] Run backend and extension full suites, create a clean extension ZIP artifact, run fresh whole-branch review, fix important findings, and commit the final changes.

## Completion

- Backend suite: 240 tests passed; extension suite: 87 tests passed.
- A fresh whole-branch review found no actionable issues in `ed1575b..121a807`; the reviewer independently reran the extension suite.
- Extension ZIP 1.0.2 was checked for archive integrity, manifest references, and unchanged permissions.
- Implementation remains on `codex/laftel-work-id-matching`; no remote push, main integration, deployment, or production viewing record was performed.

Final: Ruling: Episode renumbering/combined seasons, Netflix identities, mapping moderation/correction UI, and automatic submission stay outside this approved scope; existing popup/content-script lifecycle behavior is unchanged. This supplies reusable Laftel work identity without expanding viewing semantics. Cost if wrong: unusual episode numbering and pre-existing lifecycle limitations still require manual handling; mistaken mappings need a later correction path.
