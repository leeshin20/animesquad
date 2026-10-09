"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost, type AnimeView } from "@/app/lib/api";
import { aniFormat } from "@/app/lib/anilist-labels";

type ExcludedAnime = AnimeView & { excludedAt: string };

export function ExcludedAnimeList({ onRestored }: { onRestored: () => void }) {
  const [items, setItems] = useState<ExcludedAnime[] | null>(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<number | null>(null);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setError(null);
      setItems(null);
      try {
        const query = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
        const list = await apiGet<ExcludedAnime[]>(`/api/admin/anime/excluded${query}`);
        if (!cancelled) setItems(list);
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [q, revision]);

  async function restore(anime: ExcludedAnime) {
    setRestoring(anime.id);
    setError(null);
    setResult(null);
    try {
      await apiPost(`/api/admin/anime/excluded/${anime.id}/restore`, {});
      setItems((prev) => prev?.filter((item) => item.id !== anime.id) ?? null);
      setResult(`${anime.titleKorean ?? anime.titleRomaji} 복원됨`);
      setRevision((prev) => prev + 1);
      onRestored();
    } catch (e) {
      setError(String(e));
    } finally {
      setRestoring(null);
    }
  }

  return (
    <section className="space-y-4">
      <p className="text-sm text-neutral-500">
        제외한 작품은 다시 가져와도 등록되지 않습니다. 복원하면 저장된 정보로 작품 목록에 돌아옵니다.
      </p>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="제외된 작품 제목으로 검색"
        aria-label="제외된 작품 검색"
        className="w-full rounded-lg border border-neutral-300 px-4 py-2 text-sm focus:border-neutral-900 focus:outline-none"
      />
      {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
      {result && <p role="status" className="text-sm text-emerald-600">{result}</p>}
      {items === null ? (
        !error && <p className="text-sm text-neutral-400">불러오는 중…</p>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-500">
          {q.trim() ? "검색 결과 없음" : "제외된 작품이 없어요"}
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((anime) => (
            <li key={anime.id} className="flex gap-4 rounded-xl border border-neutral-200 p-4">
              {anime.coverImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={anime.coverImageUrl} alt="" className="h-24 w-16 flex-none rounded-md object-cover" />
              ) : <div className="h-24 w-16 flex-none rounded-md bg-neutral-100" />}
              <div className="min-w-0 flex-1 space-y-2">
                <p className="font-medium">{anime.titleKorean ?? anime.titleRomaji}</p>
                <p className="text-sm text-neutral-500">{anime.titleRomaji} · {anime.titleNative}</p>
                <p className="text-xs text-neutral-500">
                  {aniFormat(anime.format)} · {anime.seasonYear ?? "-"} {anime.season ?? ""} · AniList#{anime.anilistId}
                </p>
                <p className="text-xs text-neutral-500">
                  제외일: {new Date(anime.excludedAt).toLocaleDateString("ko-KR")}
                </p>
                <button
                  onClick={() => restore(anime)}
                  disabled={restoring !== null}
                  className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-50 disabled:opacity-40"
                >
                  {restoring === anime.id ? "복원 중…" : "복원"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
