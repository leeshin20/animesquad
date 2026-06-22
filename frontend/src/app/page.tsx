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
import { Timeline, type FeedItemWithSquad } from "@/app/components/Timeline";

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
        .filter((it) => it.type !== "ANIME_ADDED")
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, 30);
      setFeed(merged);
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => { loadAll(); }, []);

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
        <section>
          <SectionHeader title="내가 최근 기록한 애니" linkHref="/watchlist" linkLabel="내 목록 전체" />
          <MyRecentGrid entries={entries} onChanged={loadAll} />
        </section>

        <section>
          <SectionHeader title="스쿼드 활동" linkHref="/squads" linkLabel="스쿼드 전체" />
          <Timeline items={feed} showSquad />
        </section>
      </div>
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

function MyRecentGrid({
  entries,
  onChanged,
}: {
  entries: WatchEntry[] | null;
  onChanged: () => void;
}) {
  if (entries === null) return <GridSkeleton />;
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
    <div className="grid grid-cols-2 gap-3">
      {entries.map((e) => (
        <MyRecentCard key={e.id} entry={e} onChanged={onChanged} />
      ))}
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i}>
          <div className="aspect-[2/3] w-full animate-pulse rounded-lg bg-neutral-100" />
          <div className="mt-2 h-3 w-3/4 animate-pulse rounded bg-neutral-100" />
          <div className="mt-1 h-2 w-1/2 animate-pulse rounded bg-neutral-100" />
        </div>
      ))}
    </div>
  );
}

function MyRecentCard({
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
      // ignore
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
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
