import assert from "node:assert/strict";
import test from "node:test";
import { projectWatchFeed, type WatchFeedItem } from "./watch-feed";

function watched(ep: number, minutes = ep * 25, actor = 1, anime = 10, squad?: number): WatchFeedItem {
  return {
    id: ep * 100 + minutes, type: "PROGRESS_UPDATED",
    actor: { id: actor, displayName: "A", avatarUrl: null },
    anime: { id: anime, titleRomaji: "Frieren", titleKorean: null, coverImageUrl: null },
    payload: { episodeWatchId: actor * 10000 + anime * 100 + ep, progress: ep, episode: ep },
    createdAt: new Date(Date.UTC(2026, 9, 26, 0, minutes)).toISOString(),
    ...(squad ? { squad: { id: squad, name: String(squad) } } : {}),
  };
}

test("groups contiguous episodes across other actors and raw page boundaries", () => {
  const firstPage = [watched(3), watched(8, 60, 2), watched(2)];
  assert.deepEqual(projectWatchFeed(firstPage).find(i => i.actor?.id === 1)?.episodes, [2, 3]);
  const projected = projectWatchFeed([...firstPage, watched(1)]);
  assert.equal(projected.length, 2);
  assert.deepEqual(projected[0].episodes, [1, 2, 3]);
  assert.equal(projected[0].id, watched(3).id);
});

test("does not invent gaps or group reverse episodes or sessions over two hours", () => {
  assert.equal(projectWatchFeed([watched(1), watched(3)]).length, 2);
  assert.equal(projectWatchFeed([watched(2, 25), watched(1, 50)]).length, 2);
  assert.equal(projectWatchFeed([watched(1, 0), watched(2, 121)]).length, 2);
  assert.equal(projectWatchFeed([watched(1, 0), watched(2, 120)]).length, 1);
});

test("another anime by the same viewer breaks the session", () => {
  assert.equal(projectWatchFeed([watched(1), watched(1, 35, 1, 20), watched(2)]).length, 3);
});

test("deduplicates shared squad copies but preserves visibility boundaries", () => {
  const a = watched(1, 25, 1, 10, 1), b = { ...watched(1, 25, 1, 10, 2), id: 999 };
  const projected = projectWatchFeed([a, b, watched(2, 50, 1, 10, 1)]);
  assert.equal(projected.length, 2);
  assert.deepEqual(projected[1].squads?.map(s => s.id), [1, 2]);
});

test("review hides the watched copy only in the same squad and deletion reveals it", () => {
  const watch = watched(1, 25, 1, 10, 1);
  const review: WatchFeedItem = { ...watch, id: 700, type: "EPISODE_RATED", payload: { episode: 1, comment: "좋다" } };
  assert.equal(projectWatchFeed([watch, review]).length, 1);
  assert.equal(projectWatchFeed([watch]).length, 1);
  const other = { ...watch, id: 800, squad: { id: 2, name: "B" } };
  const projected = projectWatchFeed([watch, other, review]);
  assert.equal(projected.length, 2);
  assert.deepEqual(projected.find(i => i.type === "PROGRESS_UPDATED")?.squads?.map(s => s.id), [2]);
});

test("unknown legacy snapshots remain individual and input is not mutated", () => {
  const one = watched(1), two = watched(2);
  one.payload = { progress: 1 }; two.payload = { progress: 2 };
  assert.equal(projectWatchFeed([one, two]).length, 2);
  assert.equal(one.episodes, undefined);
});
