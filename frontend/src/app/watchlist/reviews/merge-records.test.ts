import assert from "node:assert/strict";
import test from "node:test";
import type { MyProgressActivity, WatchEntry } from "@/app/lib/api";
import { mergeRecords, onlyReviews } from "./merge-records";

const entry = {
  id: 1,
  anime: { id: 10, titleRomaji: "Series", titleKorean: null },
  status: "WATCHING",
  progress: 7,
  score: null,
  comment: null,
  createdAt: "2026-07-15T00:00:00Z",
  updatedAt: "2026-07-15T00:00:00Z",
} as WatchEntry;

const progress = {
  id: 99,
  anime: { id: 10, titleRomaji: "Series", titleKorean: null, coverImageUrl: null },
  progress: 7,
  createdAt: "2026-07-15T01:00:00Z",
} satisfies MyProgressActivity;

test("merges a progress activity with watch status and deletion identity", () => {
  const records = mergeRecords([entry], [], [progress]);

  assert.deepEqual(records, [{
    key: "p99",
    kind: "progress",
    sourceId: 99,
    animeId: 10,
    title: "Series",
    status: "WATCHING",
    episodeNumber: 7,
    score: null,
    comment: null,
    updatedAt: "2026-07-15T01:00:00Z",
  }]);
});

test("excludes series rows with no score or comment", () => {
  assert.deepEqual(mergeRecords([entry], [], []), []);
});

 test("review tab includes only real ratings or comments", () => {
  const mixed = mergeRecords([entry], [{ id: 4, anime: entry.anime, episodeNumber: 2, score: null, comment: "", updatedAt: entry.updatedAt } as never], [progress]);
  assert.deepEqual(onlyReviews(mixed), []);
  const rated = mergeRecords([{ ...entry, score: 4 }], []);
  assert.equal(onlyReviews(rated).length, 1);
});
