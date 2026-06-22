"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  apiGet,
  apiPatch,
  type FeedItem,
  type Me,
  type Squad,
  type WatchEntry,
} from "@/app/lib/api";
import { displayTitle } from "@/app/lib/anilist-labels";
import { Stars } from "@/app/components/Stars";

export default function HomePage() {
  const [me, setMe] = useState<Me | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    apiGet<Me>("/api/me")
      .then((u) => setMe(u))
      .catch(() => setMe(null))
      .finally(() => setChecked(true));
  }, []);

  if (!checked) {
    return <p className="py-16 text-center text-sm text-neutral-400">불러오는 중…</p>;
  }
  return me ? <Dashboard /> : <Landing />;
}

function Landing() {
  const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8080";
  return (
    <section className="mx-auto max-w-2xl py-16 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">AnimeSquad</h1>
      <p className="mt-4 text-neutral-600">
        친구들과 애니메이션 시청 현황을 공유하세요.
      </p>
      <a
        href={`${apiBase}/oauth2/authorization/google`}
        className="mt-8 inline-flex items-center justify-center rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-700"
      >
        Google로 시작하기
      </a>
    </section>
  );
}

type FeedItemWithSquad = FeedItem & { squad: { id: number; name: string } };

function Dashboard() {
  const [feed, setFeed] = useState<FeedItemWithSquad[] | null>(null);
  const [entries, setEntries] = useState<WatchEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadAll() {
    try {
      const [squads, mine] = await Promise.all([
        apiGet<Squad[]>("/api/squad"),
        apiGet<WatchEntry[]>("/api/watch"),
      ]);
      setEntries(mine.slice(0, 10));

      const pages = await Promise.all(
        squads.map(async (s) => {
          const items = await apiGet<FeedItem[]>(`/api/squad/${s.id}/feed?limit=20`);
          return items.map((it) => ({ ...it, squad: { id: s.id, name: s.name } }));
        })
      );
      const merged = pages
        .flat()
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, 30);
      setFeed(merged);
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => { loadAll(); }, []);

  return (
    <div className="space-y-10">
      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      <section>
        <SectionHeader title="내가 최근 기록한 애니" linkHref="/watchlist" linkLabel="내 목록 전체" />
        <RecentCardRow entries={entries} onChanged={loadAll} />
      </section>

      <section>
        <SectionHeader title="스쿼드 활동" linkHref="/squads" linkLabel="스쿼드 전체" />
        <Timeline items={feed} />
      </section>
    </div>
  );
}

function SectionHeader({
  title, linkHref, linkLabel,
}: { title: string; linkHref: string; linkLabel: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between">
      <h2 className="text-sm font-semibold text-neutral-700">{title}</h2>
      <Link href={linkHref} className="text-xs text-neutral-500 hover:text-neutral-900">
        {linkLabel} →
      </Link>
    </div>
  );
}

function RecentCardRow({
  entries,
  onChanged,
}: {
  entries: WatchEntry[] | null;
  onChanged: () => void;
}) {
  if (entries === null) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="w-32 flex-none">
            <div className="aspect-[2/3] w-full animate-pulse rounded-lg bg-neutral-100" />
            <div className="mt-2 h-3 w-3/4 animate-pulse rounded bg-neutral-100" />
            <div className="mt-1 h-2 w-1/2 animate-pulse rounded bg-neutral-100" />
          </div>
        ))}
      </div>
    );
  }
  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-500">
        아직 기록이 없어요.{" "}
        <Link href="/search" className="font-medium text-neutral-900 underline underline-offset-2">
          검색하러 가기
        </Link>
      </div>
    );
  }
  return (
    <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
      {entries.map((e) => (
        <RecentCard key={e.id} entry={e} onChanged={onChanged} />
      ))}
    </div>
  );
}

function RecentCard({
  entry,
  onChanged,
}: {
  entry: WatchEntry;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const maxed = entry.anime.episodes != null && entry.progress >= entry.anime.episodes;

  async function bump() {
    if (busy || maxed) return;
    setBusy(true);
    try {
      await apiPatch(`/api/watch/${entry.anime.id}`, { progress: entry.progress + 1 });
      onChanged();
    } catch {
      // swallow; surface via global error if needed
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-32 flex-none">
      <Link href="/watchlist" className="block transition hover:opacity-80">
        {entry.anime.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={entry.anime.coverImageUrl}
            alt=""
            className="aspect-[2/3] w-full rounded-lg object-cover"
          />
        ) : (
          <div className="aspect-[2/3] w-full rounded-lg bg-neutral-100" />
        )}
        <p className="mt-2 truncate text-sm font-medium text-neutral-800">
          {displayTitle(entry.anime)}
        </p>
      </Link>
      <p className="mt-0.5 flex items-center gap-1 text-xs text-neutral-500">
        <span>
          {entry.progress}
          {entry.anime.episodes ? `/${entry.anime.episodes}` : ""}화
        </span>
        {entry.score != null && (
          <>
            <span>·</span>
            <Stars value={entry.score} size="sm" />
          </>
        )}
      </p>
      <button
        type="button"
        onClick={bump}
        disabled={busy || maxed}
        title={maxed ? "최종화까지 봤어요" : "다음 화 봤어요"}
        className="mt-1.5 w-full rounded-md border border-neutral-200 px-2 py-1 text-xs font-medium text-neutral-700 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? "저장 중…" : maxed ? "완료" : `+1화 (${entry.progress + 1}화)`}
      </button>
    </div>
  );
}

function Timeline({ items }: { items: FeedItemWithSquad[] | null }) {
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
        아직 스쿼드 활동이 없어요.
      </div>
    );
  }
  return (
    <ul className="divide-y divide-neutral-200 overflow-hidden rounded-xl border border-neutral-200">
      {items.map((it) => <TimelineItem key={it.id} item={it} />)}
    </ul>
  );
}

function TimelineItem({ item }: { item: FeedItemWithSquad }) {
  const name = item.actor?.displayName ?? "누군가";
  return (
    <li className="flex gap-3 px-4 py-4 transition hover:bg-neutral-50">
      <Avatar name={name} url={item.actor?.avatarUrl ?? null} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
          <span className="font-semibold text-neutral-900">{name}</span>
          <Link
            href={`/squads/${item.squad.id}`}
            className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600 hover:bg-neutral-200"
          >
            {item.squad.name}
          </Link>
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

function Avatar({ name, url }: { name: string; url: string | null }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className="h-10 w-10 flex-none rounded-full object-cover" />;
  }
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-neutral-200 text-sm font-medium text-neutral-600">
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

function relativeTime(iso: string): string {
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
