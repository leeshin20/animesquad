"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost, type AniListMedia, type WatchEntry, type WatchStatus } from "@/app/lib/api";
import { aniFormat, aniStatus } from "@/app/lib/anilist-labels";

const STATUSES: WatchStatus[] = ["WATCHING", "COMPLETED", "ON_HOLD", "DROPPED", "PLAN_TO_WATCH"];

const STATUS_LABEL: Record<WatchStatus, string> = {
  WATCHING: "보는 중",
  COMPLETED: "완료",
  ON_HOLD: "보류",
  DROPPED: "중단",
  PLAN_TO_WATCH: "볼 예정",
};

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
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">작품 검색</h1>
        <p className="mt-1 text-sm text-neutral-500">AniList에서 가져온 결과</p>
      </header>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="제목을 입력하세요"
        className="w-full rounded-lg border border-neutral-300 px-4 py-2.5 text-sm focus:border-neutral-900 focus:outline-none"
      />

      {status && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {status}
        </div>
      )}

      <ul className="space-y-3">
        {results.map((m) => (
          <li
            key={m.anilistId}
            className="flex gap-4 rounded-xl border border-neutral-200 p-4 hover:border-neutral-300"
          >
            {m.coverImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={m.coverImageUrl}
                alt=""
                className="h-24 w-16 flex-none rounded-md object-cover"
              />
            ) : (
              <div className="h-24 w-16 flex-none rounded-md bg-neutral-100" />
            )}
            <div className="flex flex-1 flex-col">
              <div className="font-medium">{m.titleRomaji}</div>
              {m.titleEnglish && (
                <div className="text-sm text-neutral-500">{m.titleEnglish}</div>
              )}
              <div className="mt-1 text-xs text-neutral-500">
                {aniFormat(m.format)} · {m.seasonYear ?? "-"} · {m.episodes ?? "?"}화 · {aniStatus(m.status)}
              </div>
              <div className="mt-auto pt-3">
                {added[m.anilistId] ? (
                  <span className="text-sm font-medium text-emerald-600">
                    리스트에 추가됨 ✓
                  </span>
                ) : (
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      const s = e.target.value as WatchStatus;
                      if (s) add(m.anilistId, s);
                    }}
                    className="rounded-md border border-neutral-300 px-2 py-1 text-sm focus:border-neutral-900 focus:outline-none"
                  >
                    <option value="">리스트에 추가…</option>
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
