CREATE TABLE anime (
    id              BIGSERIAL PRIMARY KEY,
    anilist_id      INT          UNIQUE,           -- nullable to allow future self-hosted entries
    title_romaji    VARCHAR(255) NOT NULL,
    title_native    VARCHAR(255) NOT NULL,
    title_english   VARCHAR(255),
    cover_image_url VARCHAR(512),
    episodes        INT,
    status          VARCHAR(32)  NOT NULL,
    format          VARCHAR(32)  NOT NULL,
    season_year     INT,
    cached_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_anime_anilist_id ON anime(anilist_id);
