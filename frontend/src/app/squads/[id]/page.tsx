"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiGet, type FeedItem, type Squad } from "@/app/lib/api";
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
  const [squad, setSquad] = useState<Squad | null>(null);
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
    apiGet<Squad>(`/api/squad/${squadId}`).then(setSquad).catch((e) => setError(String(e)));
    loadMore();
    loadRecent();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          {squad?.name ?? " "}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          {squad ? <>초대 코드 <code className="font-mono">{squad.inviteCode}</code></> : " "}
        </p>
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
      {groupByAnime(items).map((g) => <SquadRecentCard key={g.anime.id} group={g} />)}
    </div>
  );
}

type AnimeWatchGroup = {
  anime: NonNullable<SquadWatchItem["anime"]>;
  watchers: SquadWatchItem[];
};

/** Group entries by anime, preserving the incoming (recency) order of both
 *  groups and watchers within each group. */
function groupByAnime(items: SquadWatchItem[]): AnimeWatchGroup[] {
  const map = new Map<number, AnimeWatchGroup>();
  const order: number[] = [];
  for (const it of items) {
    if (!it.anime) continue;
    let g = map.get(it.anime.id);
    if (!g) {
      g = { anime: it.anime, watchers: [] };
      map.set(it.anime.id, g);
      order.push(it.anime.id);
    }
    g.watchers.push(it);
  }
  return order.map((id) => map.get(id)!);
}

function SquadRecentCard({ group }: { group: AnimeWatchGroup }) {
  const { anime, watchers } = group;
  const title = displayTitle(anime);
  const lead = watchers[0];
  return (
    <div>
      <Link href={`/anime/${anime.id}`} className="relative block transition hover:opacity-80">
        {anime.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={anime.coverImageUrl}
            alt=""
            className="aspect-[2/3] w-full rounded-lg object-cover"
          />
        ) : (
          <div className="aspect-[2/3] w-full rounded-lg bg-neutral-100" />
        )}
        <WatcherStack watchers={watchers} />
      </Link>
      <p className="mt-2 truncate text-sm font-medium text-neutral-800" title={title}>
        {title}
      </p>
      <p className="mt-0.5 flex items-center gap-1 text-xs text-neutral-500">
        <span>
          {lead.progress}
          {lead.episodes ? `/${lead.episodes}` : ""}화
        </span>
        {lead.score != null && (
          <>
            <span>·</span>
            <Stars value={lead.score} size="sm" />
          </>
        )}
      </p>
      <p className="mt-0.5 truncate text-xs text-neutral-400">
        {watchers.length > 1
          ? `${watchers.length}명 감상 중`
          : lead.actor?.displayName}
      </p>
    </div>
  );
}

function WatcherStack({ watchers }: { watchers: SquadWatchItem[] }) {
  const withActor = watchers.filter((w) => w.actor);
  if (withActor.length === 0) return null;
  const MAX = 3;
  const shown = withActor.slice(0, MAX);
  const extra = withActor.length - shown.length;
  return (
    <div className="absolute bottom-1 right-1 flex -space-x-2">
      {shown.map((w) => (
        <div key={w.id} className="rounded-full ring-2 ring-white">
          <Avatar name={w.actor!.displayName} url={w.actor!.avatarUrl} size={7} />
        </div>
      ))}
      {extra > 0 && (
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-700 text-xs font-medium text-white ring-2 ring-white">
          +{extra}
        </div>
      )}
    </div>
  );
}
