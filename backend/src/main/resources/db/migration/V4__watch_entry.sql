CREATE TABLE watch_entry (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT      NOT NULL REFERENCES users(id),
    anime_id    BIGINT      NOT NULL REFERENCES anime(id),
    status      VARCHAR(20) NOT NULL,
    progress    INT         NOT NULL DEFAULT 0,
    score       INT,
    comment     TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, anime_id),
    CHECK (progress >= 0),
    CHECK (score IS NULL OR (score BETWEEN 1 AND 10))
);

CREATE INDEX idx_watch_entry_user ON watch_entry(user_id);
