import type { FeedItem } from "./api";

type SquadRef = { id: number; name: string };
export type WatchFeedItem = FeedItem & {
  squad?: SquadRef;
  squads?: SquadRef[];
  episodes?: number[];
};

const TWO_HOURS = 2 * 60 * 60 * 1000;
const scope = (item: WatchFeedItem) => (item.squads ?? (item.squad ? [item.squad] : []));
const scopeKey = (item: WatchFeedItem) => scope(item).map(s => s.id).sort((a, b) => a - b).join(",");
const episode = (item: WatchFeedItem) => Number(item.payload.episode ?? item.payload.progress);
const reviewKey = (item: WatchFeedItem, squad: number | string) =>
  `${item.actor?.id}:${item.anime?.id}:${episode(item)}:${squad}`;

/** Display projection only: callers retain raw rows and raw IDs for pagination. */
export function projectWatchFeed(raw: WatchFeedItem[]): WatchFeedItem[] {
  const rows = [...raw].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id - b.id);
  const copies = new Map<string, WatchFeedItem>();
  const normalized: WatchFeedItem[] = [];
  const reviews = new Set<string>();
  for (const row of rows) {
    if (row.type === "EPISODE_RATED" && (row.payload.score != null || row.payload.comment)) {
      for (const squad of scope(row).map(s => s.id).concat(scope(row).length ? [] : [0])) {
        reviews.add(reviewKey(row, squad));
      }
    }
    const key = row.type === "PROGRESS_UPDATED" && row.payload.episodeWatchId != null
      ? `${row.actor?.id}:${row.anime?.id}:${row.payload.episodeWatchId}` : null;
    const prior = key ? copies.get(key) : null;
    if (prior) {
      prior.squads = [...new Map([...scope(prior), ...scope(row)].map(s => [s.id, s])).values()]
        .sort((a, b) => a.id - b.id);
    } else {
      const copy = { ...row, squads: [...scope(row)] };
      normalized.push(copy);
      if (key) copies.set(key, copy);
    }
  }

  const output: WatchFeedItem[] = [];
  const lastByActor = new Map<number, number>();
  for (const original of normalized) {
    const row = { ...original };
    const actor = row.actor?.id;
    if (row.type === "PROGRESS_UPDATED") {
      const scopes = scope(row);
      if (scopes.length) {
        row.squads = scopes.filter(s => !reviews.has(reviewKey(row, s.id)));
        if (!row.squads.length) continue;
      } else if (reviews.has(reviewKey(row, 0))) continue;
      if (row.payload.episodeWatchId != null && Number.isSafeInteger(episode(row)) && episode(row) > 0) {
        row.episodes = [episode(row)];
      }
    }
    const previousIndex = actor == null ? undefined : lastByActor.get(actor);
    const previous = previousIndex == null ? undefined : output[previousIndex];
    const gap = previous ? Date.parse(row.createdAt) - Date.parse(previous.createdAt) : Infinity;
    if (previous?.type === "PROGRESS_UPDATED" && row.type === "PROGRESS_UPDATED"
      && row.anime?.id != null && previous.anime?.id === row.anime.id
      && previous.episodes && row.episodes && scopeKey(previous) === scopeKey(row)
      && row.episodes[0] === previous.episodes[previous.episodes.length - 1] + 1
      && gap >= 0 && gap <= TWO_HOURS) {
      output[previousIndex!] = { ...row, episodes: [...previous.episodes, ...row.episodes] };
    } else {
      output.push(row);
      if (actor != null) lastByActor.set(actor, output.length - 1);
    }
  }
  return output.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id - a.id);
}
