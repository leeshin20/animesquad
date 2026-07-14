"use client";

import { useEffect, useState } from "react";
import { apiGet, type UserProfile } from "@/app/lib/api";
import { displayTitle } from "@/app/lib/anilist-labels";
import {
  MySquadList,
  RecentCommentList,
  RecentWatchedGrid,
  type RecentComment,
} from "@/app/profile/profile-sections";

type LoadError = "unauthorized" | "failed";

export default function UserProfilePage({ params }: { params: { id: string } }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState<LoadError | null>(null);

  useEffect(() => {
    let ignore = false;
    setProfile(null);
    setError(null);

    apiGet<UserProfile>(`/api/users/${params.id}`)
      .then((nextProfile) => {
        if (!ignore) setProfile(nextProfile);
      })
      .catch((e) => {
        if (!ignore) {
          setError(e instanceof Error && e.message === "API 401" ? "unauthorized" : "failed");
        }
      });

    return () => {
      ignore = true;
    };
  }, [params.id]);

  if (error) {
    return (
      <p className="text-sm text-neutral-600">
        {error === "unauthorized" ? "로그인이 필요해요." : "프로필을 불러오지 못했어요."}{" "}
        <a className="underline underline-offset-2 hover:text-neutral-900" href="/">
          홈으로
        </a>
      </p>
    );
  }
  if (!profile) return <p className="text-sm text-neutral-500">불러오는 중…</p>;

  if (!profile.accessible) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-neutral-200 p-10 text-center">
        {profile.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.avatarUrl} alt="" className="h-16 w-16 rounded-full object-cover" />
        ) : (
          <div className="h-16 w-16 rounded-full bg-neutral-200" />
        )}
        <h1 className="text-lg font-semibold">{profile.displayName}</h1>
        <p className="text-sm text-neutral-500">비공개 프로필이에요.</p>
      </div>
    );
  }

  const recentWatched = (profile.recentWatched ?? [])
    .filter((e) => e.status !== "PLAN_TO_WATCH")
    .slice(0, 6);

  const recentComments: RecentComment[] = [
    ...(profile.recentWatched ?? [])
      .filter((e) => e.comment)
      .map((e) => ({
        key: `w${e.id}`,
        animeId: e.anime.id,
        title: displayTitle(e.anime),
        episodeNumber: null as number | null,
        score: e.score,
        comment: e.comment!,
        updatedAt: e.updatedAt,
      })),
    ...(profile.recentEpisodeReviews ?? [])
      .filter((r) => r.anime && r.comment)
      .map((r) => ({
        key: `e${r.id}`,
        animeId: r.anime!.id,
        title: displayTitle(r.anime!),
        episodeNumber: r.episodeNumber as number | null,
        score: r.score as number | null,
        comment: r.comment!,
        updatedAt: r.updatedAt,
      })),
  ]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 4);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 rounded-xl border border-neutral-200 p-6">
        {profile.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.avatarUrl} alt="" className="h-16 w-16 rounded-full object-cover" />
        ) : (
          <div className="h-16 w-16 rounded-full bg-neutral-200" />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold">{profile.displayName}</h1>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col gap-8">
          <section className="min-w-0">
            <h2 className="mb-3 text-sm font-semibold text-neutral-700">최근 감상</h2>
            <RecentWatchedGrid entries={recentWatched} />
          </section>

          <section className="min-w-0">
            <h2 className="mb-3 text-sm font-semibold text-neutral-700">최근 기록</h2>
            <RecentCommentList items={recentComments} />
          </section>
        </div>

        <section className="min-w-0">
          <h2 className="mb-3 text-sm font-semibold text-neutral-700">소속 스쿼드</h2>
          <MySquadList squads={profile.squads} />
        </section>
      </div>
    </div>
  );
}
