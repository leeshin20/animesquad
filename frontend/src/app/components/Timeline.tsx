"use client";

import Link from "next/link";
import type { FeedItem } from "@/app/lib/api";
import { displayTitle } from "@/app/lib/anilist-labels";

export type FeedItemWithSquad = FeedItem & { squad?: { id: number; name: string } };

export function Timeline({
  items,
  showSquad = false,
}: {
  items: FeedItemWithSquad[] | null;
  showSquad?: boolean;
}) {
  if (items === null) {
    return (
      <div className="divide-y divide-neutral-200 rounded-xl border border-neutral-200">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-3 px-4 py-4">
            <div className="h-10 w-10 flex-none animate-pulse rounded-full bg-neutral-100" />
            <div className="flex flex-1 flex-col gap-2">
              <div className="h-3 w-1/3 animate-pulse rounded bg-neutral-100" />
              <div className="h-3 w-2/3 animate-pulse rounded bg-neutral-100" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-500">
        아직 활동이 없어요.
      </div>
    );
  }
  return (
    <ul className="divide-y divide-neutral-200 overflow-hidden rounded-xl border border-neutral-200">
      {items.map((it) => (
        <TimelineItem key={it.id} item={it} showSquad={showSquad} />
      ))}
    </ul>
  );
}

function TimelineItem({
  item, showSquad,
}: { item: FeedItemWithSquad; showSquad: boolean }) {
  const name = item.actor?.displayName ?? "누군가";
  return (
    <li className="flex gap-3 px-4 py-4 transition hover:bg-neutral-50">
      <Avatar name={name} url={item.actor?.avatarUrl ?? null} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
          <span className="font-semibold text-neutral-900">{name}</span>
          {showSquad && item.squad && (
            <Link
              href={`/squads/${item.squad.id}`}
              className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600 hover:bg-neutral-200"
            >
              {item.squad.name}
            </Link>
          )}
          <span className="text-xs text-neutral-400">{relativeTime(item.createdAt)}</span>
        </div>
        <p className="text-sm text-neutral-700">{actionText(item)}</p>
        {item.anime && (
          <Link
            href="/watchlist"
            className="mt-1 inline-flex max-w-sm items-center gap-3 rounded-lg border border-neutral-200 p-2 transition hover:border-neutral-300"
          >
            {item.anime.coverImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.anime.coverImageUrl}
                alt=""
                className="h-12 w-9 flex-none rounded-sm object-cover"
              />
            ) : (
              <div className="h-12 w-9 flex-none rounded-sm bg-neutral-100" />
            )}
            <span className="truncate text-sm text-neutral-800">
              {displayTitle(item.anime)}
            </span>
          </Link>
        )}
      </div>
    </li>
  );
}

export function Avatar({ name, url, size = 10 }: { name: string; url: string | null; size?: 7 | 8 | 10 }) {
  const dim =
    size === 7 ? "h-7 w-7 text-xs" :
    size === 8 ? "h-8 w-8 text-sm" :
    "h-10 w-10 text-sm";
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className={`${dim} flex-none rounded-full object-cover`} />;
  }
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <div className={`${dim} flex flex-none items-center justify-center rounded-full bg-neutral-200 font-medium text-neutral-600`}>
      {initial}
    </div>
  );
}

function actionText(it: FeedItem): string {
  const p = it.payload as Record<string, unknown>;
  switch (it.type) {
    case "ANIME_ADDED":
      return `리스트에 추가했어요`;
    case "STATUS_CHANGED":
      return `상태를 ${p.from} → ${p.to} 로 바꿨어요`;
    case "PROGRESS_UPDATED":
      return `${p.progress}화까지 봤어요`;
    case "RATED":
      return `${p.score}/5 평점을 남겼어요`;
    case "EPISODE_RATED":
      return `${p.episode}화에 ${p.score}/5 평점을 남겼어요`;
    case "JOINED_SQUAD":
      return `스쿼드에 참여했어요`;
  }
}

export function relativeTime(iso: string): string {
  const now = Date.now();
  const t = new Date(iso).getTime();
  const diffSec = Math.floor((now - t) / 1000);
  if (diffSec < 60) return "방금";
  const m = Math.floor(diffSec / 60);
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}일 전`;
  return new Date(iso).toLocaleDateString();
}
