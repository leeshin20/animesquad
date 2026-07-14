import type { WatchEntry, MyEpisodeReview, WatchStatus } from "@/app/lib/api";
import { displayTitle } from "@/app/lib/anilist-labels";

export type ReviewRecord = {
  key: string;
  animeId: number;
  title: string;
  status: WatchStatus | null;
  episodeNumber: number | null;
  score: number | null;
  comment: string | null;
  updatedAt: string;
};

export function mergeRecords(
  entries: WatchEntry[],
  episodeReviews: MyEpisodeReview[]
): ReviewRecord[] {
  const statusByAnimeId = new Map<number, WatchStatus>(
    entries.map((e) => [e.anime.id, e.status])
  );

  const seriesRecords: ReviewRecord[] = entries
    .filter((e) => e.score != null || e.comment != null)
    .map((e) => ({
      key: `s${e.id}`,
      animeId: e.anime.id,
      title: displayTitle(e.anime),
      status: e.status,
      episodeNumber: null,
      score: e.score,
      comment: e.comment,
      updatedAt: e.updatedAt,
    }));

  const episodeRecords: ReviewRecord[] = episodeReviews
    .filter((r) => r.anime != null)
    .map((r) => ({
      key: `e${r.id}`,
      animeId: r.anime!.id,
      title: displayTitle(r.anime!),
      status: statusByAnimeId.get(r.anime!.id) ?? null,
      episodeNumber: r.episodeNumber,
      score: r.score,
      comment: r.comment,
      updatedAt: r.updatedAt,
    }));

  return [...seriesRecords, ...episodeRecords];
}
