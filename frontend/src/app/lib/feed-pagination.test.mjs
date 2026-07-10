import assert from "node:assert/strict";
import test from "node:test";
import pagination from "./feed-pagination.js";

const { nextFeedCursor } = pagination;

test("advances the cursor when an entire page is hidden", () => {
  const page = Array.from({ length: 30 }, (_, index) => ({
    id: 30 - index,
    type: index % 2 === 0 ? "ANIME_ADDED" : "STATUS_CHANGED",
  }));

  assert.equal(nextFeedCursor(page, null), 1);
});

test("keeps the existing cursor for an empty page", () => {
  assert.equal(nextFeedCursor([], 42), 42);
});
