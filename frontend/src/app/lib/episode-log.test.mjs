import assert from "node:assert/strict";
import test from "node:test";
import episodeLog from "./episode-log.js";

const { scoreForEpisodeReview } = episodeLog;

test("preserves an existing score when adding only a comment", () => {
  assert.equal(scoreForEpisodeReview(null, 4), 4);
});

test("uses a newly selected score", () => {
  assert.equal(scoreForEpisodeReview(5, 3), 5);
});

test("keeps score null for a new comment-only review", () => {
  assert.equal(scoreForEpisodeReview(null, null), null);
});
