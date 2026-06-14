CREATE TABLE episode_rating (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT      NOT NULL REFERENCES users(id),
    anime_id        BIGINT      NOT NULL REFERENCES anime(id),
    episode_number  INT         NOT NULL,
    score           INT         NOT NULL,
    comment         TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, anime_id, episode_number),
    CHECK (episode_number > 0),
    CHECK (score BETWEEN 1 AND 10)
);

CREATE INDEX idx_episode_rating_user_anime ON episode_rating(user_id, anime_id);
