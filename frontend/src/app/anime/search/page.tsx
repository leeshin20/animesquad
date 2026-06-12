"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost, type AniListMedia, type WatchEntry, type WatchStatus } from "@/app/lib/api";

const STATUSES: WatchStatus[] = ["WATCHING", "COMPLETED", "ON_HOLD", "DROPPED", "PLAN_TO_WATCH"];

export default function AnimeSearchPage() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<AniListMedia[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [added, setAdded] = useState<Record<number, true>>({});

  useEffect(() => {
    if (!q.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      try {
        setStatus(null);
        setResults(await apiGet<AniListMedia[]>(`/api/anime/search?q=${encodeURIComponent(q)}`));
      } catch (e) { setStatus(String(e)); }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  async function add(anilistId: number, status: WatchStatus) {
    setStatus(null);
    try {
      await apiPost<WatchEntry>("/api/watch", { anilistId, status });
      setAdded((m) => ({ ...m, [anilistId]: true }));
    } catch (e) { setStatus(String(e)); }
  }

  return (
    <main style={{ padding: 40, fontFamily: "sans-serif", maxWidth: 800 }}>
      <h1>작품 검색</h1>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="제목을 입력하세요"
        style={{ width: "100%", padding: 8, fontSize: 16 }}
      />
      {status && <p style={{ color: "crimson" }}>{status}</p>}

      <ul style={{ listStyle: "none", padding: 0, marginTop: 24 }}>
        {results.map((m) => (
          <li key={m.anilistId} style={{ display: "flex", gap: 16, padding: 12, borderBottom: "1px solid #eee" }}>
            {m.coverImageUrl && (
              <img src={m.coverImageUrl} alt="" width={60} height={84} style={{ objectFit: "cover" }} />
            )}
            <div style={{ flex: 1 }}>
              <strong>{m.titleRomaji}</strong>
              {m.titleEnglish && <span style={{ color: "#666" }}> · {m.titleEnglish}</span>}
              <div style={{ fontSize: 12, color: "#666" }}>
                {m.format} · {m.seasonYear ?? "-"} · {m.episodes ?? "?"}화 · {m.status}
              </div>
              <div style={{ marginTop: 8 }}>
                {added[m.anilistId] ? (
                  <span style={{ color: "#388e3c" }}>리스트에 추가됨 ✓</span>
                ) : (
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      const s = e.target.value as WatchStatus;
                      if (s) add(m.anilistId, s);
                    }}
                  >
                    <option value="">리스트에 추가…</option>
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
