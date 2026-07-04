-- Backfill missing 'status' field in RATED activity payloads.
-- Joins each RATED activity to the actor's current watch_entry to get the status.
UPDATE activity a
SET payload = a.payload || jsonb_build_object('status', w.status)
FROM watch_entry w
WHERE a.type = 'RATED'
  AND a.actor_id = w.user_id
  AND a.anime_id = w.anime_id
  AND NOT (a.payload ? 'status');
