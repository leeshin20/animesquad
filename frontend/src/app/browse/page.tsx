"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, type AnimeView } from "@/app/lib/api";
import { displayTitle, aniFormat } from "@/app/lib/anilist-labels";

const SEASONS = [
  { value: "WINTER", label: "겨울" },
  { value: "SPRING", label: "봄" },
  { value: "SUMMER", label: "여름" },
  { value: "FALL",   label: "가을" },
] as const;

function getCurrentSeason(): { year: number; season: string } {
  const d = new Date();
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  const season =
    month <= 3 ? "WINTER" :
    month <= 6 ? "SPRING" :
    month <= 9 ? "SUMMER" : "FALL";
  return { year, season };
}

const YEARS = (() => {
  const current = new Date().getFullYear();
  return Array.from({ length: 7 }, (_, i) => current - 5 + i);
})();

export default function BrowsePage() {
  const { year: defaultYear, season: defaultSeason } = getCurrentSeason();
  const [year, setYear] = useState(defaultYear);
  const [season, setSeason] = useState(defaultSeason);
  const [results, setResults] = useState<AnimeView[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setResults(null);
    setError(null);
    apiGet<AnimeView[]>(`/api/anime/browse?year=${year}&season=${season}`)
      .then(setResults)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [year, season]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">시즌 탐색</h1>
        <p className="mt-1 text-sm text-neutral-500">연도와 분기를 선택해 작품을 찾아보세요</p>
      </header>

      {/* 연도 태그 */}
      <div className="flex flex-wrap gap-2">
        {YEARS.map((y) => (
          <button
            key={y}
            type="button"
            onClick={() => setYear(y)}
            className={
              "rounded-full px-3 py-1 text-sm font-medium transition " +
              (year === y
                ? "bg-neutral-900 text-white"
                : "border border-neutral-300 text-neutral-600 hover:border-neutral-500 hover:text-neutral-900")
            }
          >
            {y}
          </button>
        ))}
      </div>

      {/* 분기 태그 */}
      <div className="flex gap-2">
        {SEASONS.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => setSeason(s.value)}
            className={
              "rounded-full px-3 py-1 text-sm font-medium transition " +
              (season === s.value
                ? "bg-neutral-900 text-white"
                : "border border-neutral-300 text-neutral-600 hover:border-neutral-500 hover:text-neutral-900")
            }
          >
            {s.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* 결과 */}
      {loading && (
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i}>
              <div className="aspect-[2/3] w-full animate-pulse rounded-lg bg-neutral-100" />
              <div className="mt-2 h-3 w-3/4 animate-pulse rounded bg-neutral-100" />
            </div>
          ))}
        </div>
      )}

      {!loading && !error && results !== null && results.length === 0 && (
        <div className="rounded-xl border border-dashed border-neutral-300 px-4 py-12 text-center text-sm text-neutral-500">
          이 시즌 캐시된 작품이 없어요.
        </div>
      )}

      {!loading && results !== null && results.length > 0 && (
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5">
          {results.map((anime) => (
            <Link key={anime.id} href={`/anime/${anime.id}`} className="group">
              {anime.coverImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={anime.coverImageUrl}
                  alt=""
                  className="aspect-[2/3] w-full rounded-lg object-cover transition group-hover:opacity-80"
                />
              ) : (
                <div className="aspect-[2/3] w-full rounded-lg bg-neutral-100" />
              )}
              <p className="mt-2 truncate text-sm font-medium text-neutral-800">
                {displayTitle(anime)}
              </p>
              <p className="mt-0.5 text-xs text-neutral-500">
                {aniFormat(anime.format)} · {anime.episodes ?? "?"}화
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
