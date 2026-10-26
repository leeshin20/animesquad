# Laftel inline recording design

User-approved direction: show the actual AnimeSquad logo and status next to Laftel's work title; clicking it opens a small recording panel inside the page.

- Laftel playback only. Anchor next to the observed `/item/{workId}` link; wait for this link rather than guessing class names. Keep the player and other providers unchanged.
- Status progresses from 시청 중 to 기록하기 after existing ending detection, then 기록 완료 only after a successful server write. Clicking before the ending shows account/current work plus the existing waiting guidance.
- Reuse the popup in an extension iframe inside a Shadow DOM panel. This keeps the existing search, ID mapping, alias learning, score, comment, retry and account behaviors; no second implementation of recording.
- Alternatives considered: a separate inline form duplicates record logic; opening the toolbar popup fails the request for an in-page panel. The embedded existing form meets the chosen direction with one recording implementation.
- Bind context, readiness, completion and close actions to the containing tab's verified Laftel URL. Do not trust a caller-provided work ID or reuse another tab's pending record. Revalidate before writing. Discard stale frames on episode navigation.
- Keep extension API calls in the extension origin. Expose only the iframe's required resources to `https://laftel.net/*`, and accept embedded commands only from that extension iframe. No new permissions.
- Keep the toolbar popup available. Prefer the inline button after ending when it mounted successfully; retain popup fallback otherwise. Never write production viewing records during verification.
