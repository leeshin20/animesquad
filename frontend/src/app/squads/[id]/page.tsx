"use client";

import { useEffect, useRef, useState } from "react";
import { apiGet, type FeedItem } from "@/app/lib/api";

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
        `/api/squads/${squadId}/feed?limit=${PAGE_SIZE}${cursor}`);
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
    <main style={{ padding: 40, fontFamily: "sans-serif", maxWidth: 720 }}>
      <h1>스쿼드 피드</h1>
      {error && <p style={{ color: "crimson" }}>{error}</p>}

      <ul style={{ listStyle: "none", padding: 0 }}>
        {items.map((it) => (
          <li key={it.id} style={{ display: "flex", gap: 12, padding: 10, borderBottom: "1px solid #eee" }}>
            {it.anime?.coverImageUrl && (
              <img src={it.anime.coverImageUrl} alt="" width={40} height={56} style={{ objectFit: "cover" }} />
            )}
            <div>
              <div>{describe(it)}</div>
              <div style={{ fontSize: 12, color: "#999" }}>{new Date(it.createdAt).toLocaleString()}</div>
            </div>
          </li>
        ))}
      </ul>

      {!done && (
        <button onClick={loadMore} disabled={loading} style={{ marginTop: 12 }}>
          {loading ? "불러오는 중…" : "더 보기"}
        </button>
      )}
      {done && items.length === 0 && <p style={{ color: "#666" }}>아직 활동이 없어요.</p>}
    </main>
  );
}

function describe(it: FeedItem): string {
  const who = it.actor?.displayName ?? "누군가";
  const what = it.anime?.titleRomaji ?? "작품";
  const p = it.payload as Record<string, unknown>;
  switch (it.type) {
    case "ANIME_ADDED":
      return `${who} 님이 "${what}" 추가 (${p.status})`;
    case "STATUS_CHANGED":
      return `${who} 님이 "${what}" 상태를 ${p.from} → ${p.to}`;
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
