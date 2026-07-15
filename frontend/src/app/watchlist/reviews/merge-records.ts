import type {
  WatchEntry, MyEpisodeReview, MyProgressActivity, WatchStatus,
} from "@/app/lib/api";
import { displayTitle } from "@/app/lib/anilist-labels";

export type ReviewRecord = {
  key: string;
  kind: "series" | "episode" | "progress";
  sourceId: number;
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
  episodeReviews: MyEpisodeReview[],
  progressActivities: MyProgressActivity[] = []
): ReviewRecord[] {
  const statusByAnimeId = new Map<number, WatchStatus>(
    entries.map((e) => [e.anime.id, e.status])
  );

  const seriesRecords: ReviewRecord[] = entries
    .filter((e) => e.score != null || e.comment != null)
    .map((e) => ({
      key: `s${e.id}`,
      kind: "series",
      sourceId: e.id,
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
      kind: "episode",
      sourceId: r.id,
      animeId: r.anime!.id,
      title: displayTitle(r.anime!),
      status: statusByAnimeId.get(r.anime!.id) ?? null,
      episodeNumber: r.episodeNumber,
      score: r.score,
      comment: r.comment,
      updatedAt: r.updatedAt,
    }));

  const progressRecords: ReviewRecord[] = progressActivities.map((activity) => ({
    key: `p${activity.id}`,
    kind: "progress",
    sourceId: activity.id,
    animeId: activity.anime.id,
    title: displayTitle(activity.anime),
    status: statusByAnimeId.get(activity.anime.id) ?? null,
    episodeNumber: activity.progress,
    score: null,
    comment: null,
    updatedAt: activity.createdAt,
  }));

  return [...seriesRecords, ...episodeRecords, ...progressRecords];
}
