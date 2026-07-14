"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiGet, apiPost, type AnimeView, type WatchEntry, type WatchStatus } from "@/app/lib/api";
import { aniFormat, aniStatus, displayTitle } from "@/app/lib/anilist-labels";
import { STATUSES, STATUS_LABEL, STATUS_STYLE } from "@/app/lib/watch-status";
import { SeriesReviewModal } from "@/app/components/SeriesReviewModal";

export default function AnimeSearchPage() {
  return (
    <Suspense>
      <AnimeSearch />
    </Suspense>
  );
}

function AnimeSearch() {
  const searchParams = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") ?? "");

  useEffect(() => {
    setQ(searchParams.get("q") ?? "");
  }, [searchParams]);
  const [results, setResults] = useState<AnimeView[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [entries, setEntries] = useState<Record<number, WatchEntry>>({});
  const [modalEntry, setModalEntry] = useState<WatchEntry | null>(null);

  async function loadEntries() {
    try {
      const mine = await apiGet<WatchEntry[]>("/api/watch");
      setEntries(Object.fromEntries(mine.map((e) => [e.anime.id, e])));
    } catch { /* 검색은 목록 없이도 동작 */ }
  }

  useEffect(() => { loadEntries(); }, []);

  useEffect(() => {
    const next = q.trim()
      ? `/search?q=${encodeURIComponent(q.trim())}`
      : "/search";
    window.history.replaceState(null, "", next);
    if (!q.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      try {
        setStatus(null);
        setResults(await apiGet<AnimeView[]>(`/api/anime/search?q=${encodeURIComponent(q)}`));
      } catch (e) { setStatus(String(e)); }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  async function add(animeId: number, status: WatchStatus) {
    setStatus(null);
    try {
      const entry = await apiPost<WatchEntry>("/api/watch", { animeId, status });
      setEntries((m) => ({ ...m, [animeId]: entry }));
    } catch (e) { setStatus(String(e)); }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">작품 검색</h1>
      </header>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="제목을 입력하세요 (한국어/로마자/영어/일본어)"
        className="w-full rounded-lg border border-neutral-300 px-4 py-2.5 text-sm focus:border-neutral-900 focus:outline-none"
      />

      {status && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {status}
        </div>
      )}

      {q.trim() && results.length === 0 && !status && (
        <p className="rounded-xl border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-500">
          검색 결과가 없어요.
        </p>
      )}

      <ul className="space-y-3">
        {results.map((m) => (
          <li
            key={m.id}
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
              <Link href={`/anime/${m.id}`} className="font-medium hover:underline">{displayTitle(m)}</Link>
              {m.titleKorean && (
                <div className="text-sm text-neutral-500">{m.titleRomaji}</div>
              )}
              {m.titleEnglish && (
                <div className="text-sm text-neutral-500">{m.titleEnglish}</div>
              )}
              <div className="mt-1 text-xs text-neutral-500">
                {aniFormat(m.format)} · {m.seasonYear ?? "-"} · {m.episodes ?? "?"}화 · {aniStatus(m.status)}
              </div>
              <div className="mt-auto pt-3">
                {entries[m.id] ? (
                  <button
                    type="button"
                    onClick={() => setModalEntry(entries[m.id])}
                    title="시청 상태 · 시리즈 평가"
                    className={`rounded-md border px-3 py-1.5 text-sm font-medium transition ${STATUS_STYLE[entries[m.id].status]}`}
                  >
                    {STATUS_LABEL[entries[m.id].status]}
                  </button>
                ) : (
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      const s = e.target.value as WatchStatus;
                      if (s) add(m.id, s);
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

      {modalEntry && (
        <SeriesReviewModal
          entry={modalEntry}
          statusOptions={STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
          onClose={() => setModalEntry(null)}
          onSaved={() => { setModalEntry(null); loadEntries(); }}
        />
      )}
    </div>
  );
}
