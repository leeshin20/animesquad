# Manual Anime Search ID Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AniList ID가 없는 수동 작품이 검색 화면에서 다른 수동 작품의 감상 기록과 충돌하지 않게 한다.

**Architecture:** 검색 화면의 클라이언트 식별자를 nullable 외부 ID에서 non-null 내부 DB ID로 바꾼다. 기존 백엔드의 `{ animeId, status }` 추가 경로를 재사용한다.

**Tech Stack:** Next.js 14, React, TypeScript, Spring Boot integration tests

## Global Constraints

- `frontend/src/app/search/page.tsx`의 식별자 사용만 최소 수정한다.
- 백엔드와 DB 스키마는 변경하지 않는다.
- AniList 작품과 수동 작품 모두 내부 `anime.id`로 상태를 연결한다.
- 기존 미추적 파일과 관련 없는 린트 경고를 수정하지 않는다.

---

### Task 1: 검색 화면 내부 ID 통일

**Files:**
- Modify: `frontend/src/app/search/page.tsx`
- Test: `backend/src/test/java/com/animesquad/watch/WatchControllerIT.java`

**Interfaces:**
- Consumes: `AnimeView.id`, `WatchEntry.anime.id`, `POST /api/watch`의 `{ animeId, status }` 계약.
- Produces: 내부 ID로 상태 버튼, 모달, 추가 요청이 동일 작품을 가리키는 검색 화면.

- [ ] **Step 1: Run a source regression check and verify RED**

Run:

```bash
if rg -n 'entries\[m\.anilistId\]|key=\{m\.anilistId\}|add\(m\.anilistId' frontend/src/app/search/page.tsx; then exit 1; fi
```

Expected: FAIL after printing the old nullable AniList ID references.

- [ ] **Step 2: Apply the minimal implementation**

Change entry indexing to `e.anime.id`, use `m.id` for the React key and entry lookup, rename `add(animeId, status)`, post `{ animeId, status }`, and call `add(m.id, s)`.

- [ ] **Step 3: Run the source regression check and verify GREEN**

Run the Step 1 command again.

Expected: exit 0 with no matches.

- [ ] **Step 4: Run static and backend contract verification**

Run:

```bash
cd frontend && pnpm exec tsc --noEmit && pnpm lint
cd ../backend && ./gradlew test --tests '*WatchControllerIT'
```

Expected: both commands exit 0; only the pre-existing `NavBar.tsx` hook warning may remain.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/search/page.tsx docs/superpowers/specs/2026-07-15-manual-anime-search-id-design.md docs/superpowers/plans/2026-07-15-manual-anime-search-id.md
git commit -m "fix(search): 수동 작품 감상 기록 매핑 수정"
```
