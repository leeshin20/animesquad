-- Convert scores from 1-10 to 1-5 using ceiling halving (e.g. 1-2 -> 1, 9-10 -> 5).
-- watch_entry.score is nullable; episode_rating.score is NOT NULL.

ALTER TABLE watch_entry DROP CONSTRAINT IF EXISTS watch_entry_score_check;
ALTER TABLE episode_rating DROP CONSTRAINT IF EXISTS episode_rating_score_check;

UPDATE watch_entry SET score = CEIL(score::numeric / 2) WHERE score IS NOT NULL;
UPDATE episode_rating SET score = CEIL(score::numeric / 2);

ALTER TABLE watch_entry
    ADD CONSTRAINT watch_entry_score_check
    CHECK (score IS NULL OR (score BETWEEN 1 AND 5));

ALTER TABLE episode_rating
    ADD CONSTRAINT episode_rating_score_check
    CHECK (score BETWEEN 1 AND 5);
