CREATE TABLE activity (
    id          BIGSERIAL PRIMARY KEY,
    squad_id    BIGINT      NOT NULL REFERENCES squad(id) ON DELETE CASCADE,
    actor_id    BIGINT      NOT NULL REFERENCES users(id),
    type        VARCHAR(32) NOT NULL,
    anime_id    BIGINT      REFERENCES anime(id),
    payload     JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_squad_id_desc ON activity(squad_id, id DESC);
