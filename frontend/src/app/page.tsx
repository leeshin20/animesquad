"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  apiGet,
  type FeedItem,
  type Me,
  type Squad,
  type WatchEntry,
} from "@/app/lib/api";
import { displayTitle } from "@/app/lib/anilist-labels";

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
  return me ? <Dashboard me={me} /> : <Landing />;
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

function Dashboard({ me }: { me: Me }) {
  const [feed, setFeed] = useState<FeedItem[] | null>(null);
  const [entries, setEntries] = useState<WatchEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [squads, mine] = await Promise.all([
          apiGet<Squad[]>("/api/squads"),
          apiGet<WatchEntry[]>("/api/watch"),
        ]);
        setEntries(mine.slice(0, 5));

        const pages = await Promise.all(
          squads.map((s) => apiGet<FeedItem[]>(`/api/squads/${s.id}/feed?limit=10`))
        );
        const merged = pages
          .flat()
          .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
          .slice(0, 10);
        setFeed(merged);
      } catch (e) {
        setError(String(e));
      }
    })();
  }, []);

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          안녕하세요, {me.displayName}님 👋
        </h1>
        <p className="mt-1 text-sm text-neutral-500">스쿼드 활동과 최근 기록을 한눈에</p>
      </header>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="grid gap-8 md:grid-cols-2">
        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-neutral-700">스쿼드 활동</h2>
            <Link
              href="/squads"
              className="text-xs text-neutral-500 hover:text-neutral-900"
            >
              스쿼드 전체 →
            </Link>
          </div>
          <FeedList items={feed} />
        </section>

        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-neutral-700">최근 기록한 애니</h2>
            <Link
              href="/watchlist"
              className="text-xs text-neutral-500 hover:text-neutral-900"
            >
              내 목록 →
            </Link>
          </div>
          <RecentList entries={entries} />
        </section>
      </div>
    </div>
  );
}

function FeedList({ items }: { items: FeedItem[] | null }) {
  if (items === null) return <Skeleton lines={5} />;
  if (items.length === 0)
    return <EmptyCard text="아직 스쿼드 활동이 없어요." />;
  return (
    <ul className="divide-y divide-neutral-200 overflow-hidden rounded-xl border border-neutral-200">
      {items.map((it) => (
        <li key={it.id} className="flex gap-3 px-4 py-3">
          {it.anime?.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={it.anime.coverImageUrl}
              alt=""
              className="h-12 w-9 flex-none rounded-sm object-cover"
            />
          ) : (
            <div className="h-12 w-9 flex-none rounded-sm bg-neutral-100" />
          )}
          <div className="flex min-w-0 flex-1 flex-col justify-center">
            <p className="truncate text-sm text-neutral-800">{describe(it)}</p>
            <p className="mt-0.5 text-xs text-neutral-400">
              {new Date(it.createdAt).toLocaleString()}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function RecentList({ entries }: { entries: WatchEntry[] | null }) {
  if (entries === null) return <Skeleton lines={5} />;
  if (entries.length === 0)
    return (
      <EmptyCard
        text={
          <>
            아직 기록이 없어요.{" "}
            <Link href="/search" className="font-medium text-neutral-900 underline underline-offset-2">
              검색하러 가기
            </Link>
          </>
        }
      />
    );
  return (
    <ul className="divide-y divide-neutral-200 overflow-hidden rounded-xl border border-neutral-200">
      {entries.map((e) => (
        <li key={e.id} className="flex gap-3 px-4 py-3">
          {e.anime.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={e.anime.coverImageUrl}
              alt=""
              className="h-12 w-9 flex-none rounded-sm object-cover"
            />
          ) : (
            <div className="h-12 w-9 flex-none rounded-sm bg-neutral-100" />
          )}
          <div className="flex min-w-0 flex-1 flex-col justify-center">
            <p className="truncate text-sm font-medium text-neutral-800">
              {displayTitle(e.anime)}
            </p>
            <p className="mt-0.5 text-xs text-neutral-500">
              {e.progress}
              {e.anime.episodes ? ` / ${e.anime.episodes}` : ""}화
              {e.score != null ? ` · ${e.score}/10` : ""}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Skeleton({ lines }: { lines: number }) {
  return (
    <ul className="divide-y divide-neutral-200 overflow-hidden rounded-xl border border-neutral-200">
      {Array.from({ length: lines }).map((_, i) => (
        <li key={i} className="flex gap-3 px-4 py-3">
          <div className="h-12 w-9 flex-none animate-pulse rounded-sm bg-neutral-100" />
          <div className="flex flex-1 flex-col justify-center gap-2">
            <div className="h-3 w-3/4 animate-pulse rounded bg-neutral-100" />
            <div className="h-2 w-1/3 animate-pulse rounded bg-neutral-100" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function EmptyCard({ text }: { text: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-500">
      {text}
    </div>
  );
}

function describe(it: FeedItem): string {
  const who = it.actor?.displayName ?? "누군가";
  const what = it.anime ? displayTitle(it.anime) : "작품";
  const p = it.payload as Record<string, unknown>;
  switch (it.type) {
    case "ANIME_ADDED":
      return `${who} 님이 "${what}" 추가`;
    case "STATUS_CHANGED":
      return `${who} 님이 "${what}" 상태 변경`;
    case "PROGRESS_UPDATED":
      return `${who} 님이 "${what}" ${p.progress}화까지 봄`;
    case "RATED":
      return `${who} 님이 "${what}"에 ${p.score}/10`;
    case "EPISODE_RATED":
      return `${who} 님이 "${what}" ${p.episode}화에 ${p.score}/10`;
    case "JOINED_SQUAD":
      return `${who} 님이 스쿼드에 참여`;
  }
}
