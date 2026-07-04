"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { FeedItem } from "@/app/lib/api";
import { displayTitle } from "@/app/lib/anilist-labels";
import { Stars } from "@/app/components/Stars";
import { statusLabel, statusBadge } from "@/app/lib/watch-status";

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
  const ep = episodeOf(item);
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
          <span className="text-xs text-neutral-500">{relativeTime(item.createdAt)}</span>
        </div>
        <ItemBody item={item} />
        {item.anime && (
          <Link
            href={`/anime/${item.anime.id}`}
            className="mt-1 flex max-w-sm items-center gap-3 rounded-lg border border-neutral-200 p-2 transition hover:border-neutral-300"
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
            <span className="min-w-0 flex-1 truncate text-sm text-neutral-900">
              {displayTitle(item.anime)}
            </span>
            {ep != null && (
              <span className="flex-none text-xs font-medium text-neutral-600">{ep}화</span>
            )}
          </Link>
        )}
      </div>
    </li>
  );
}

function ItemBody({ item }: { item: FeedItem }) {
  const p = item.payload as Record<string, unknown>;

  if (item.type === "RATED") {
    const comment = typeof p.comment === "string" ? p.comment : null;
    return (
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-2 text-sm text-neutral-700">
          {p.score != null && <Stars value={Number(p.score)} size="sm" />}
          {p.status != null && (
            <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${statusBadge(p.status)}`}>
              {statusLabel(p.status)}
            </span>
          )}
        </div>
        {comment && <CollapsibleComment text={comment} />}
      </div>
    );
  }

  if (item.type === "EPISODE_RATED") {
    const comment = typeof p.comment === "string" ? p.comment : null;
    if (p.score == null && !comment) return null;
    return (
      <div className="flex flex-col gap-0.5">
        {p.score != null && <Stars value={Number(p.score)} size="sm" />}
        {comment && <CollapsibleComment text={comment} />}
      </div>
    );
  }

  if (item.type === "STATUS_CHANGED") {
    return (
      <p className="flex flex-wrap items-center gap-1 text-sm text-neutral-700">
        상태를 <StatusBadge v={p.from} /> → <StatusBadge v={p.to} /> 로 바꿨어요
      </p>
    );
  }

  // PROGRESS_UPDATED carries no rating/comment — the anime card below shows the episode.
  if (item.type === "PROGRESS_UPDATED") {
    return null;
  }

  return <p className="text-sm text-neutral-700">{actionText(item)}</p>;
}

function StatusBadge({ v }: { v: unknown }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${statusBadge(v)}`}>
      {statusLabel(v)}
    </span>
  );
}

function episodeOf(item: FeedItem): number | null {
  const p = item.payload as Record<string, unknown>;
  if (item.type === "EPISODE_RATED" && p.episode != null) return Number(p.episode);
  if (item.type === "PROGRESS_UPDATED" && p.progress != null) return Number(p.progress);
  return null;
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
      return `상태를 ${statusLabel(p.from)} → ${statusLabel(p.to)} 로 바꿨어요`;
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

function CollapsibleComment({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!expanded && ref.current) {
      setOverflows(ref.current.scrollHeight > ref.current.clientHeight);
    }
  }, [text, expanded]);

  return (
    <div>
      <p ref={ref} className={`whitespace-pre-wrap text-sm text-neutral-700 ${expanded ? "" : "line-clamp-3"}`}>
        {text}
      </p>
      {overflows && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="mt-1 flex items-center gap-0.5 text-xs text-neutral-500 hover:text-neutral-900"
        >
          {expanded ? (
            <>접기 <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="2,8 6,4 10,8" /></svg></>
          ) : (
            <>더보기 <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="2,4 6,8 10,4" /></svg></>
          )}
        </button>
      )}
    </div>
  );
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
