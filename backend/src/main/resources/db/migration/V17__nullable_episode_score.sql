ALTER TABLE episode_rating
    ALTER COLUMN score DROP NOT NULL;

ALTER TABLE episode_rating
    ADD CONSTRAINT episode_rating_content_check
    CHECK (score IS NOT NULL OR NULLIF(BTRIM(comment), '') IS NOT NULL);
