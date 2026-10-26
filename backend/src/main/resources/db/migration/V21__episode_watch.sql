CREATE TABLE episode_watch (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    anime_id BIGINT NOT NULL REFERENCES anime(id),
    episode_number INT NOT NULL CHECK (episode_number > 0),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    source VARCHAR(16) NOT NULL CHECK (source IN ('EXTENSION', 'MANUAL', 'UNKNOWN', 'LEGACY')),
    UNIQUE (user_id, anime_id, episode_number)
);
CREATE INDEX idx_episode_watch_user_id ON episode_watch(user_id, id DESC);
CREATE INDEX idx_episode_watch_user_date ON episode_watch(user_id, recorded_at DESC);

INSERT INTO episode_watch (user_id, anime_id, episode_number, recorded_at, source)
SELECT user_id, anime_id, episode, min(recorded_at), 'LEGACY'
FROM (
    SELECT a.actor_id AS user_id, a.anime_id,
           (a.payload->>'progress')::int AS episode, a.created_at AS recorded_at
    FROM activity a JOIN watch_entry w ON w.user_id = a.actor_id AND w.anime_id = a.anime_id
    WHERE a.type = 'PROGRESS_UPDATED'
      AND jsonb_typeof(a.payload->'progress') = 'number'
      AND (a.payload->>'progress')::numeric BETWEEN 1 AND w.progress
    UNION ALL
    SELECT user_id, anime_id, episode_number, created_at FROM episode_rating
) observations
GROUP BY user_id, anime_id, episode
ON CONFLICT DO NOTHING;

UPDATE activity a SET payload = a.payload || jsonb_build_object('episodeWatchId', w.id, 'episode', w.episode_number)
FROM episode_watch w
WHERE a.type = 'PROGRESS_UPDATED' AND a.actor_id = w.user_id AND a.anime_id = w.anime_id
  AND a.payload->>'progress' = w.episode_number::text;
