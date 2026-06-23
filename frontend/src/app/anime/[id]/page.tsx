"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  apiGet, apiGetOrNull, apiPost,
  type AnimeView, type WatchEntry, type WatchStatus, type AnimeReview, type EpisodeReview, type AnimeStats,
} from "@/app/lib/api";
import { aniFormat, displayTitle } from "@/app/lib/anilist-labels";
import { Stars } from "@/app/components/Stars";
import { Avatar } from "@/app/components/Timeline";
import { EpisodeLogModal } from "@/app/components/EpisodeLogModal";
import { SeriesReviewModal } from "@/app/components/SeriesReviewModal";

const STATUSES: WatchStatus[] = ["WATCHING", "COMPLETED", "ON_HOLD", "DROPPED", "PLAN_TO_WATCH"];
const STATUS_LABEL: Record<WatchStatus, string> = {
  WATCHING: "보는 중", COMPLETED: "완료", ON_HOLD: "보류",
  DROPPED: "중단", PLAN_TO_WATCH: "볼 예정",
};

export default function AnimeDetailPage({ params }: { params: { id: string } }) {
  const animeId = params.id;
  const [anime, setAnime] = useState<AnimeView | null>(null);
  const [mine, setMine] = useState<WatchEntry | null>(null);
  const [reviews, setReviews] = useState<AnimeReview[] | null>(null);
  const [episodeReviews, setEpisodeReviews] = useState<EpisodeReview[] | null>(null);
  const [stats, setStats] = useState<AnimeStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const didInit = useRef(false);

  async function loadAll() {
    try {
      const [a, m, r, er, st] = await Promise.all([
        apiGet<AnimeView>(`/api/anime/${animeId}`),
        apiGetOrNull<WatchEntry>(`/api/watch/${animeId}`),
        apiGet<AnimeReview[]>(`/api/anime/${animeId}/reviews`),
        apiGet<EpisodeReview[]>(`/api/anime/${animeId}/episode-reviews`),
        apiGet<AnimeStats>(`/api/anime/${animeId}/stats`),
      ]);
      setAnime(a); setMine(m); setReviews(r); setEpisodeReviews(er); setStats(st);
    } catch (e) { setError(String(e)); }
  }

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    loadAll();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  return (
    <div className="space-y-6">
      <Link href="/watchlist" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← 뒤로
      </Link>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      {anime && (
        <header className="flex gap-5">
          {anime.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={anime.coverImageUrl} alt="" className="h-44 w-30 flex-none rounded-lg object-cover" />
          ) : (
            <div className="h-44 w-30 flex-none rounded-lg bg-neutral-100" />
          )}
          <div>
            {stats && (
              <p className="mb-1 flex items-center gap-1.5 text-sm text-neutral-600">
                {stats.averageScore != null && (
                  <span className="font-medium text-amber-500">
                    ★ {stats.averageScore.toFixed(1)}
                  </span>
                )}
                <span className="text-neutral-400">{stats.watcherCount}명 감상</span>
              </p>
            )}
            <h1 className="text-2xl font-semibold tracking-tight">{displayTitle(anime)}</h1>
            {anime.titleKorean && <p className="text-sm text-neutral-500">{anime.titleRomaji}</p>}
            <p className="mt-1 text-xs text-neutral-500">
              {aniFormat(anime.format)} · {anime.episodes ?? "?"}화
            </p>
            <MyActions anime={anime} mine={mine} onSaved={loadAll} onError={setError} />
          </div>
        </header>
      )}

      <ReviewsSection reviews={reviews} episodeReviews={episodeReviews} />
    </div>
  );
}

function MyActions({
  anime, mine, onSaved, onError,
}: {
  anime: AnimeView;
  mine: WatchEntry | null;
  onSaved: () => void;
  onError: (s: string) => void;
}) {
  const [modal, setModal] = useState<"series" | "episode" | null>(null);

  if (!mine) {
    return (
      <select
        defaultValue=""
        onChange={async (e) => {
          const s = e.target.value as WatchStatus;
          if (!s) return;
          try { await apiPost("/api/watch", { anilistId: anime.anilistId, status: s }); onSaved(); }
          catch (err) { onError(String(err)); }
        }}
        className="mt-4 rounded-md border border-neutral-300 px-2 py-1 text-sm focus:border-neutral-900 focus:outline-none"
      >
        <option value="">내 목록에 추가…</option>
        {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
      </select>
    );
  }

  const maxed = anime.episodes != null && mine.progress >= anime.episodes;

  return (
    <>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setModal("series")}
          className="rounded-md border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100"
        >
          시리즈 평가
        </button>
        <button
          type="button"
          onClick={() => setModal("episode")}
          disabled={maxed}
          title={maxed ? "최종화까지 봤어요" : "회차 기록"}
          className="rounded-md border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {maxed ? "회차 기록 완료" : `+ 회차 기록 (${mine.progress + 1}화)`}
        </button>
      </div>

      {modal === "series" && (
        <SeriesReviewModal
          entry={mine}
          statusOptions={STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); onSaved(); }}
        />
      )}
      {modal === "episode" && (
        <EpisodeLogModal
          entry={mine}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); onSaved(); }}
        />
      )}
    </>
  );
}

function ReviewsSection({
  reviews,
  episodeReviews,
}: {
  reviews: AnimeReview[] | null;
  episodeReviews: EpisodeReview[] | null;
}) {
  const [tab, setTab] = useState<"all" | "episode">("all");

  const tabClass = (active: boolean) =>
    `rounded-full px-3 py-1 text-sm font-medium transition ${
      active ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
    }`;

  return (
    <section>
      <div className="mb-3 flex gap-1.5">
        <button type="button" onClick={() => setTab("all")} className={tabClass(tab === "all")}>
          전체 감상평
        </button>
        <button type="button" onClick={() => setTab("episode")} className={tabClass(tab === "episode")}>
          회차별 감상평
        </button>
      </div>
      {tab === "all" ? (
        <ReviewList reviews={reviews} />
      ) : (
        <EpisodeReviewSection reviews={episodeReviews} />
      )}
    </section>
  );
}

function ReviewList({ reviews }: { reviews: AnimeReview[] | null }) {
  if (reviews === null) {
    return <div className="h-20 animate-pulse rounded-xl bg-neutral-100" />;
  }
  if (reviews.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-500">
        아직 감상평이 없어요.
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {reviews.map((r, i) => (
        <li key={i} className="flex items-start gap-3 rounded-lg border border-neutral-200 p-3">
          <Avatar name={r.actor?.displayName ?? "?"} url={r.actor?.avatarUrl ?? null} size={8} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium">{r.actor?.displayName ?? "알 수 없음"}</span>
              <span className="text-xs text-neutral-500">
                {STATUS_LABEL[r.status]} · {r.progress}화
              </span>
              {r.score != null && <Stars value={r.score} size="sm" />}
            </div>
            {r.comment && <p className="mt-1 text-sm text-neutral-600">{r.comment}</p>}
          </div>
        </li>
      ))}
    </ul>
  );
}

function EpisodeReviewSection({ reviews }: { reviews: EpisodeReview[] | null }) {
  const episodes = reviews
    ? Array.from(new Set(reviews.map((r) => r.episodeNumber))).sort((a, b) => a - b)
    : [];
  const [selected, setSelected] = useState<number | null>(null);

  if (reviews === null) {
    return <div className="h-20 animate-pulse rounded-xl bg-neutral-100" />;
  }
  if (episodes.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-500">
        아직 회차별 감상평이 없어요.
      </div>
    );
  }

  const activeEp = selected != null && episodes.includes(selected) ? selected : episodes[0];
  const shown = reviews.filter((r) => r.episodeNumber === activeEp);

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {episodes.map((ep) => (
          <button
            key={ep}
            type="button"
            onClick={() => setSelected(ep)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              ep === activeEp
                ? "bg-neutral-900 text-white"
                : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            }`}
          >
            {ep}화
          </button>
        ))}
      </div>
      <ul className="space-y-2">
        {shown.map((r, i) => (
          <li key={i} className="flex items-start gap-3 rounded-lg border border-neutral-200 p-3">
            <Avatar name={r.actor?.displayName ?? "?"} url={r.actor?.avatarUrl ?? null} size={8} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium">{r.actor?.displayName ?? "알 수 없음"}</span>
                <span className="text-xs text-neutral-500">{r.episodeNumber}화</span>
                <Stars value={r.score} size="sm" />
              </div>
              <p className="mt-1 text-sm text-neutral-600">{r.comment}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
