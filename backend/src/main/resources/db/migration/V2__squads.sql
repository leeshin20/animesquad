CREATE TABLE squad (
    id           BIGSERIAL PRIMARY KEY,
    name         VARCHAR(80)  NOT NULL,
    owner_id     BIGINT       NOT NULL REFERENCES users(id),
    invite_code  VARCHAR(16)  NOT NULL UNIQUE,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE membership (
    id         BIGSERIAL PRIMARY KEY,
    user_id    BIGINT      NOT NULL REFERENCES users(id),
    squad_id   BIGINT      NOT NULL REFERENCES squad(id) ON DELETE CASCADE,
    role       VARCHAR(16) NOT NULL,
    joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, squad_id)
);

CREATE INDEX idx_membership_user ON membership(user_id);
CREATE INDEX idx_membership_squad ON membership(squad_id);
