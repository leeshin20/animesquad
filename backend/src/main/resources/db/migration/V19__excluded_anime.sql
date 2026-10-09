CREATE TABLE excluded_anime (
    id              BIGSERIAL PRIMARY KEY,
    anilist_id      INT UNIQUE,
    title_romaji    VARCHAR(255) NOT NULL,
    title_native    VARCHAR(255) NOT NULL,
    title_english   VARCHAR(255),
    title_korean    VARCHAR(255),
    search_keywords TEXT,
    cover_image_url VARCHAR(512),
    episodes        INT,
    status          VARCHAR(32) NOT NULL,
    format          VARCHAR(32) NOT NULL,
    season_year     INT,
    season          VARCHAR(10),
    start_date      DATE,
    excluded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
