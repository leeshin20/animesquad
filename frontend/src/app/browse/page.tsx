"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiGet, apiPost, type AnimeView, type WatchEntry, type WatchStatus } from "@/app/lib/api";
import { displayTitle, aniFormat, aniStatus } from "@/app/lib/anilist-labels";
import { STATUSES, STATUS_LABEL, STATUS_STYLE } from "@/app/lib/watch-status";
import { SeriesReviewModal } from "@/app/components/SeriesReviewModal";

const SEASONS = [
  { value: "WINTER", label: "겨울" },
  { value: "SPRING", label: "봄" },
  { value: "SUMMER", label: "여름" },
  { value: "FALL",   label: "가을" },
] as const;

const SEASON_LABEL: Record<string, string> =
  Object.fromEntries(SEASONS.map((s) => [s.value, s.label]));

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** "2026-07-05" → "2026년 7월 5일 (일)" */
function airingLabel(startDate: string): string {
  const d = new Date(`${startDate}T00:00:00`);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`;
}

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
  return (
    <Suspense>
      <BrowseContent />
    </Suspense>
  );
}

function BrowseContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { year: defaultYear, season: defaultSeason } = getCurrentSeason();

  // URL이 상태의 원본 — 새로고침·공유해도 선택한 시즌 유지
  const yearParam = Number(searchParams.get("year"));
  const year = YEARS.includes(yearParam) ? yearParam : defaultYear;
  const seasonParam = searchParams.get("season")?.toUpperCase() ?? "";
  const season = seasonParam in SEASON_LABEL ? seasonParam : defaultSeason;

  function setSelection(nextYear: number, nextSeason: string) {
    router.replace(`/browse?year=${nextYear}&season=${nextSeason}`, { scroll: false });
  }

  const [results, setResults] = useState<AnimeView[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // undefined = 로딩 중, null = 로그인 안 됨
  const [entries, setEntries] = useState<Record<number, WatchEntry> | null | undefined>(undefined);
  const [modalEntry, setModalEntry] = useState<WatchEntry | null>(null);

  const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8080";

  async function loadEntries() {
    try {
      const mine = await apiGet<WatchEntry[]>("/api/watch");
      setEntries(Object.fromEntries(mine.map((e) => [e.anime.id, e])));
    } catch { setEntries(null); }
  }

  useEffect(() => { loadEntries(); }, []);

  useEffect(() => {
    setLoading(true);
    setResults(null);
    setError(null);
    apiGet<AnimeView[]>(`/api/anime/browse?year=${year}&season=${season}`)
      .then(setResults)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [year, season]);

  async function add(animeId: number, status: WatchStatus) {
    try {
      await apiPost("/api/watch", { animeId, status });
      loadEntries();
    } catch (e) { setError(String(e)); }
  }

  const selectClass = "rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none";

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">탐색</h1>
        <p className="mt-1 text-sm text-neutral-500">연도와 분기를 선택해 작품을 찾아보세요</p>
      </header>

      <div className="flex gap-3">
        <select
          value={year}
          onChange={(e) => setSelection(Number(e.target.value), season)}
          className={selectClass}
        >
          {YEARS.map((y) => (
            <option key={y} value={y}>{y}년</option>
          ))}
        </select>

        <select
          value={season}
          onChange={(e) => setSelection(year, e.target.value)}
          className={selectClass}
        >
          {SEASONS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* 결과 */}
      {loading && (
        <div className="grid grid-cols-3 gap-4 max-lg:grid-cols-2 max-sm:grid-cols-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-44 animate-pulse rounded-xl bg-neutral-100" />
          ))}
        </div>
      )}

      {!loading && !error && results !== null && results.length === 0 && (
        <div className="rounded-xl border border-dashed border-neutral-300 px-4 py-12 text-center text-sm text-neutral-500">
          이 시즌 캐시된 작품이 없어요.
        </div>
      )}

      {!loading && results !== null && results.length > 0 && (
        <div className="grid grid-cols-3 gap-4 max-lg:grid-cols-2 max-sm:grid-cols-1">
          {results.map((anime) => {
            const entry = entries?.[anime.id];
            return (
              <div
                key={anime.id}
                className="flex overflow-hidden rounded-xl border border-neutral-200 transition hover:border-neutral-300"
              >
                <Link href={`/anime/${anime.id}`} className="flex-none transition hover:opacity-80">
                  {anime.coverImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={anime.coverImageUrl}
                      alt=""
                      className="h-full w-28 object-cover"
                    />
                  ) : (
                    <div className="h-full w-28 bg-neutral-100" />
                  )}
                </Link>

                <div className="flex min-w-0 flex-1 flex-col p-4">
                  <Link
                    href={`/anime/${anime.id}`}
                    className="line-clamp-2 text-sm font-medium text-neutral-900 hover:underline"
                  >
                    {displayTitle(anime)}
                  </Link>
                  <p className="mt-1 text-xs text-neutral-500">
                    {aniFormat(anime.format)} · {anime.episodes ?? "?"}화 · {aniStatus(anime.status)}
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {anime.startDate
                      ? airingLabel(anime.startDate)
                      : `${anime.seasonYear ?? "-"}년 ${anime.season ? SEASON_LABEL[anime.season] ?? "" : ""}`}
                  </p>

                  <div className="mt-auto flex justify-end pt-3">
                    {entries === undefined ? (
                      <div className="h-6 w-16 rounded-md bg-neutral-100" />
                    ) : entries === null ? (
                      <a
                        href={`${apiBase}/oauth2/authorization/google`}
                        className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-600 transition hover:bg-neutral-50"
                      >
                        로그인하고 추가
                      </a>
                    ) : entry ? (
                      <button
                        type="button"
                        onClick={() => setModalEntry(entry)}
                        title="시청 상태 · 시리즈 평가"
                        className={`rounded-md border px-2.5 py-1 text-xs font-medium transition ${STATUS_STYLE[entry.status]}`}
                      >
                        {STATUS_LABEL[entry.status]}
                      </button>
                    ) : (
                      <select
                        defaultValue=""
                        onChange={(e) => {
                          const s = e.target.value as WatchStatus;
                          if (s) add(anime.id, s);
                        }}
                        className="rounded-md border border-neutral-300 px-2 py-1 text-xs focus:border-neutral-900 focus:outline-none"
                      >
                        <option value="">추가하기…</option>
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

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
