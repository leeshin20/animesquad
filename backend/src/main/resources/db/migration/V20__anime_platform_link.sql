CREATE TABLE anime_platform_link (
    id                BIGSERIAL PRIMARY KEY,
    platform          VARCHAR(16) NOT NULL CHECK (platform = 'LAFTEL'),
    platform_anime_id VARCHAR(20) NOT NULL CHECK (platform_anime_id ~ '^[1-9][0-9]{0,19}$'),
    anime_id          BIGINT NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
    UNIQUE (platform, platform_anime_id)
);

CREATE INDEX idx_anime_platform_link_anime ON anime_platform_link(anime_id);
