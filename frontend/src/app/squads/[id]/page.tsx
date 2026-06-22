"use client";

import { useEffect, useRef, useState } from "react";
import { apiGet, type FeedItem } from "@/app/lib/api";
import { displayTitle } from "@/app/lib/anilist-labels";

const PAGE_SIZE = 30;

export default function SquadFeedPage({ params }: { params: { id: string } }) {
  const squadId = params.id;
  const [items, setItems] = useState<FeedItem[]>([]);
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
      setItems((cur) => [...cur, ...page]);
      if (page.length < PAGE_SIZE) setDone(true);
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    loadMore();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">스쿼드 피드</h1>
        <p className="mt-1 text-sm text-neutral-500">최근 활동을 시간 역순으로 보여줍니다</p>
      </header>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      <ul className="divide-y divide-neutral-200 overflow-hidden rounded-xl border border-neutral-200">
        {items.map((it) => (
          <li key={it.id} className="flex gap-3 px-4 py-3">
            {it.anime?.coverImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={it.anime.coverImageUrl}
                alt=""
                className="h-14 w-10 flex-none rounded-sm object-cover"
              />
            ) : (
              <div className="h-14 w-10 flex-none rounded-sm bg-neutral-100" />
            )}
            <div className="flex min-w-0 flex-1 flex-col justify-center">
              <p className="text-sm text-neutral-800">{describe(it)}</p>
              <p className="mt-0.5 text-xs text-neutral-400">
                {new Date(it.createdAt).toLocaleString()}
              </p>
            </div>
          </li>
        ))}
        {done && items.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-neutral-500">
            아직 활동이 없어요.
          </li>
        )}
      </ul>

      {!done && (
        <div className="text-center">
          <button
            onClick={loadMore}
            disabled={loading}
            className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-50"
          >
            {loading ? "불러오는 중…" : "더 보기"}
          </button>
        </div>
      )}
    </div>
  );
}

function describe(it: FeedItem): string {
  const who = it.actor?.displayName ?? "누군가";
  const what = it.anime ? displayTitle(it.anime) : "작품";
  const p = it.payload as Record<string, unknown>;
  switch (it.type) {
    case "ANIME_ADDED":
      return `${who} 님이 "${what}" 추가 (${p.status})`;
    case "STATUS_CHANGED":
      return `${who} 님이 "${what}" 상태를 ${p.from} → ${p.to}`;
    case "PROGRESS_UPDATED":
      return `${who} 님이 "${what}" ${p.progress}화까지 봄`;
    case "RATED":
      return `${who} 님이 "${what}"에 ${p.score}/5`;
    case "EPISODE_RATED":
      return `${who} 님이 "${what}" ${p.episode}화에 ${p.score}/5`;
    case "JOINED_SQUAD":
      return `${who} 님이 스쿼드에 참여`;
  }
}
