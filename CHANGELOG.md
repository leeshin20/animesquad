# Changelog

## Plan 1 — 2026-06-10
- Monorepo skeleton (backend / frontend)
- Spring Boot 3 + Postgres + Flyway + JPA
- Google OAuth → JWT cookie → `/api/me`
- Next.js landing + `/me` page

## Plan 2 — 2026-06-12
- Squad CRUD: create / list-mine / detail / join-by-code
- 10-char unambiguous invite codes
- Membership-gated detail (404-equivalent for non-members)
- `/api/**` now requires auth
- Frontend `/squads` page with create & join forms

## Plan 3 — 2026-06-12
- `anime` cache table (V3)
- AniList GraphQL proxy: `GET /api/anime/search?q=…`
- `AnimeService.upsertFromAniList` (used by Plan 4 watch module)

## Plan 4 — 2026-06-12
- `watch_entry` table (V4) with per-user uniqueness + score/progress checks
- `POST/GET /api/watch`, `PATCH /api/watch/{animeId}`
- `AniListClient.fetchById` + `AnimeService.findOrFetchByAnilistId` for cache-miss adds
- Frontend `/anime/search` with debounced query + add-to-list
- Frontend `/my/list` with inline edit (status / progress / score / comment)

## Plan 5 — 2026-06-12
- `episode_rating` table (V5)
- `PUT /api/watch/{animeId}/episodes/{ep}` (upsert, replace semantics)
- `GET /api/watch/{animeId}/episodes`
- Auto progress bump: rating episode N when current progress < N moves progress to N
