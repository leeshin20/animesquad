"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiGet, type FeedItem } from "@/app/lib/api";
import { displayTitle } from "@/app/lib/anilist-labels";
import { Stars } from "@/app/components/Stars";
import { Timeline, Avatar, type FeedItemWithSquad } from "@/app/components/Timeline";

const PAGE_SIZE = 30;

type SquadWatchItem = {
  id: number;
  anime: { id: number; titleRomaji: string; titleKorean: string | null; coverImageUrl: string | null } | null;
  episodes: number | null;
  status: string;
  progress: number;
  score: number | null;
  updatedAt: string;
  actor: { id: number; displayName: string; avatarUrl: string | null } | null;
};

export default function SquadFeedPage({ params }: { params: { id: string } }) {
  const squadId = params.id;
  const [items, setItems] = useState<FeedItemWithSquad[]>([]);
  const [recent, setRecent] = useState<SquadWatchItem[] | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const didInit = useRef(false);

  async function loadMore() {
    setLoading(true);
    setError(null);
    try {
      const cursor = items.length === 0 ? "" : `&cursor=${items[items.length - 1].id}`;
      const page = await apiGet<FeedItem[]>(
        `/api/squad/${squadId}/feed?limit=${PAGE_SIZE}${cursor}`);
      const visible = page.filter((it) => it.type !== "ANIME_ADDED");
      setItems((cur) => [...cur, ...visible]);
      if (page.length < PAGE_SIZE) setDone(true);
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }

  async function loadRecent() {
    try {
      setRecent(await apiGet<SquadWatchItem[]>(`/api/squad/${squadId}/recent-watch?limit=10`));
    } catch (e) { setError(String(e)); }
  }

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    loadMore();
    loadRecent();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">스쿼드 피드</h1>
        <p className="mt-1 text-sm text-neutral-500">최근 감상한 작품과 활동</p>
      </header>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
        <section>
          <h2 className="mb-3 text-sm font-semibold text-neutral-700">스쿼드의 최근 감상</h2>
          <SquadRecentGrid items={recent} />
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-neutral-700">스쿼드 활동</h2>
          <Timeline items={items} />
          {!done && (
            <div className="mt-3 text-center">
              <button
                onClick={loadMore}
                disabled={loading}
                className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-50"
              >
                {loading ? "불러오는 중…" : "더 보기"}
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function SquadRecentGrid({ items }: { items: SquadWatchItem[] | null }) {
  if (items === null) {
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
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-500">
        멤버들의 활동이 아직 없어요.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3">
      {items.map((it) => <SquadRecentCard key={it.id} item={it} />)}
    </div>
  );
}

function SquadRecentCard({ item }: { item: SquadWatchItem }) {
  if (!item.anime) return null;
  const title = displayTitle(item.anime);
  return (
    <div>
      <Link href="/watchlist" className="relative block transition hover:opacity-80">
        {item.anime.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.anime.coverImageUrl}
            alt=""
            className="aspect-[2/3] w-full rounded-lg object-cover"
          />
        ) : (
          <div className="aspect-[2/3] w-full rounded-lg bg-neutral-100" />
        )}
        {item.actor && (
          <div className="absolute bottom-1 right-1 ring-2 ring-white rounded-full">
            <Avatar name={item.actor.displayName} url={item.actor.avatarUrl} size={7} />
          </div>
        )}
      </Link>
      <p className="mt-2 truncate text-sm font-medium text-neutral-800" title={title}>
        {title}
      </p>
      <p className="mt-0.5 flex items-center gap-1 text-xs text-neutral-500">
        <span>
          {item.progress}
          {item.episodes ? `/${item.episodes}` : ""}화
        </span>
        {item.score != null && (
          <>
            <span>·</span>
            <Stars value={item.score} size="sm" />
          </>
        )}
      </p>
      {item.actor && (
        <p className="mt-0.5 truncate text-xs text-neutral-400">{item.actor.displayName}</p>
      )}
    </div>
  );
}
