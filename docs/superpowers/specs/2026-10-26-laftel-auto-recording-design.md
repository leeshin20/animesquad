# Laftel 80% automatic recording

User request: automatically mark the current episode watched when playback position reaches 80% of total duration; keep the actual-logo button text fixed as `🟢 자동 기록 중`.

- Laftel only. Use currentTime / duration >= 0.8, for the detected main video (at least 300 seconds) while playing or genuinely ended, not seeking/buffering. This is position-based, not cumulative unique viewing time. No extra 30-second wait.
- On SPA episode changes, do not carry the prior media position into the next episode. Arm again after a new media lifecycle or a below-threshold sample.
- Prefer confirmed platform ID mappings; otherwise permit only one exact title/alias match. No guesses from the first search result. Unresolved/missing episode/auth failures remain pending for manual correction inside the existing panel.
- Record only progress, never change scores/comments or a preexisting watch status. Add one atomic advance-only API that inserts missing WATCHING entries and advances existing progress with ON CONFLICT ... WHERE old progress < new progress. Replays, retries and concurrent tabs must not reduce progress or produce duplicate activity.
- Check containing-tab URL and fresh content playback state again before writing. Do not trust message-supplied anime IDs/position. Retry transient failures no more than once a minute; do not mark failed attempts saved. No generic API proxy.
- Save a new ID mapping only after progress succeeds. Mapping-only failures must not repeat the progress write. Preserve manual recording/search fallback.
- Fixed label stays unchanged before/after completion or errors. Show actual readiness/error/completion inside the clicked panel so the fixed label is not the only feedback.
- Alternatives: reuse PATCH plus GET (can regress under concurrent writers); use episode-rating PUT (can erase existing comments). Advance-only API is the smallest safe write.
- No partial-minute resume storage, timer UI, Netflix/Crunchyroll auto-recording, ratings automation or production test records.
