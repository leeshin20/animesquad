"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  apiGet, apiGetOrNull, apiPost, apiPut, apiDelete,
  type AnimeView, type WatchEntry, type WatchStatus, type AnimeReview, type EpisodeReview, type AnimeStats, type Me,
} from "@/app/lib/api";
import { aniFormat, displayTitle } from "@/app/lib/anilist-labels";
import { Stars, StarsInput } from "@/app/components/Stars";
import { Avatar } from "@/app/components/Timeline";
import { EpisodeLogModal } from "@/app/components/EpisodeLogModal";
import { SeriesReviewModal } from "@/app/components/SeriesReviewModal";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";
import { STATUSES, STATUS_LABEL, STATUS_STYLE } from "@/app/lib/watch-status";

export default function AnimeDetailPage({ params }: { params: { id: string } }) {
  const animeId = params.id;
  const [anime, setAnime] = useState<AnimeView | null>(null);
  const [mine, setMine] = useState<WatchEntry | null>(null);
  const [reviews, setReviews] = useState<AnimeReview[] | null>(null);
  const [episodeReviews, setEpisodeReviews] = useState<EpisodeReview[] | null>(null);
  const [stats, setStats] = useState<AnimeStats | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const didInit = useRef(false);

  async function loadAll() {
    try {
      const [a, m, r, er, st, meRes] = await Promise.all([
        apiGet<AnimeView>(`/api/anime/${animeId}`),
        apiGetOrNull<WatchEntry>(`/api/watch/${animeId}`),
        apiGet<AnimeReview[]>(`/api/anime/${animeId}/reviews`),
        apiGet<EpisodeReview[]>(`/api/anime/${animeId}/episode-reviews`),
        apiGet<AnimeStats>(`/api/anime/${animeId}/stats`),
        apiGetOrNull<Me>("/api/me"),
      ]);
      setAnime(a); setMine(m); setReviews(r); setEpisodeReviews(er); setStats(st); setMe(meRes);
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
          <div className="flex min-h-[11rem] flex-col">
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

      <ReviewsSection
        reviews={reviews}
        episodeReviews={episodeReviews}
        meId={me?.id ?? null}
        animeId={animeId}
        mine={mine}
        onChanged={loadAll}
      />
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
        className="mt-auto self-start rounded-md border border-neutral-300 px-2 py-1 text-sm focus:border-neutral-900 focus:outline-none"
      >
        <option value="">내 목록에 추가…</option>
        {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
      </select>
    );
  }

  const maxed = anime.episodes != null && mine.progress >= anime.episodes;

  return (
    <>
      <div className="mt-auto flex flex-wrap gap-2 pt-4">
        <button
          type="button"
          onClick={() => setModal("series")}
          className={`rounded-md border px-3 py-1.5 text-sm font-medium transition hover:brightness-95 ${STATUS_STYLE[mine.status]}`}
        >
          {STATUS_LABEL[mine.status]} · 감상평 작성
        </button>
        <button
          type="button"
          onClick={() => setModal("episode")}
          title={maxed ? "기록 수정" : "회차 기록"}
          className="rounded-md border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100"
        >
          {maxed ? "기록 수정" : `+ 회차 기록 (${mine.progress + 1}화)`}
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
  meId,
  animeId,
  mine,
  onChanged,
}: {
  reviews: AnimeReview[] | null;
  episodeReviews: EpisodeReview[] | null;
  meId: number | null;
  animeId: string;
  mine: WatchEntry | null;
  onChanged: () => void;
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
          종합 감상평
        </button>
        <button type="button" onClick={() => setTab("episode")} className={tabClass(tab === "episode")}>
          회차별 감상평
        </button>
      </div>
      {tab === "all" ? (
        <ReviewList reviews={reviews} meId={meId} mine={mine} onChanged={onChanged} />
      ) : (
        <EpisodeReviewSection reviews={episodeReviews} meId={meId} animeId={animeId} onChanged={onChanged} />
      )}
    </section>
  );
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

/** Stable sort that floats the current user's own reviews to the top. */
function sortMineFirst<T extends { actor: { id: number } | null }>(
  reviews: T[],
  meId: number | null,
): T[] {
  if (meId == null) return reviews;
  return [...reviews].sort(
    (a, b) => (b.actor?.id === meId ? 1 : 0) - (a.actor?.id === meId ? 1 : 0),
  );
}

function ReviewList({
  reviews,
  meId,
  mine,
  onChanged,
}: {
  reviews: AnimeReview[] | null;
  meId: number | null;
  mine: WatchEntry | null;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);

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
    <>
      <ul className="space-y-2">
        {sortMineFirst(reviews, meId).map((r, i) => {
          const isMine = meId != null && r.actor?.id === meId && mine != null;
          return (
            <li key={i} className="flex items-start gap-3 rounded-lg border border-neutral-200 p-3">
              <Avatar name={r.actor?.displayName ?? "?"} url={r.actor?.avatarUrl ?? null} size={8} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">{r.actor?.displayName ?? "알 수 없음"}</span>
                  <span className="text-xs text-neutral-500">
                    {STATUS_LABEL[r.status]} · {r.progress}화
                  </span>
                  {r.score != null && <Stars value={r.score} size="sm" />}
                  <span className="ml-auto text-xs text-neutral-400">{formatDateTime(r.updatedAt)}</span>
                </div>
                {r.comment && <p className="mt-1 text-sm text-neutral-600">{r.comment}</p>}
                {isMine && (
                  <div className="mt-2 flex gap-3">
                    <button type="button" onClick={() => setEditing(true)} className="text-xs font-medium text-neutral-500 hover:text-neutral-900">
                      수정
                    </button>
                    <button type="button" onClick={() => setConfirming(true)} className="text-xs font-medium text-rose-500 hover:text-rose-700">
                      삭제
                    </button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {editing && mine && (
        <SeriesReviewModal
          entry={mine}
          statusOptions={STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); onChanged(); }}
        />
      )}
      {confirming && mine && (
        <ConfirmDialog
          message="이 감상평을 삭제할까요? 별점·코멘트만 지워지고 시청 기록은 남아요."
          onCancel={() => setConfirming(false)}
          onConfirm={async () => {
            try { await apiDelete(`/api/watch/${mine.anime.id}/review`); } catch { /* noop */ }
            setConfirming(false);
            onChanged();
          }}
        />
      )}
    </>
  );
}

function EpisodeReviewSection({
  reviews,
  meId,
  animeId,
  onChanged,
}: {
  reviews: EpisodeReview[] | null;
  meId: number | null;
  animeId: string;
  onChanged: () => void;
}) {
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
  const shown = sortMineFirst(reviews.filter((r) => r.episodeNumber === activeEp), meId);

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
          <EpisodeReviewCard
            key={i}
            review={r}
            isMine={meId != null && r.actor?.id === meId}
            animeId={animeId}
            onChanged={onChanged}
          />
        ))}
      </ul>
    </div>
  );
}

function EpisodeReviewCard({
  review,
  isMine,
  animeId,
  onChanged,
}: {
  review: EpisodeReview;
  isMine: boolean;
  animeId: string;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [score, setScore] = useState<number | null>(review.score);
  const [comment, setComment] = useState(review.comment);
  const [saving, setSaving] = useState(false);

  function startEdit() {
    setScore(review.score);
    setComment(review.comment);
    setEditing(true);
  }

  async function save() {
    if (score == null) return;
    setSaving(true);
    try {
      await apiPut(`/api/watch/${animeId}/episodes/${review.episodeNumber}`, {
        score,
        comment: comment.trim(),
      });
      setEditing(false);
      onChanged();
    } catch {
      /* keep editing so the user can retry */
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="flex items-start gap-3 rounded-lg border border-neutral-200 p-3">
      <Avatar name={review.actor?.displayName ?? "?"} url={review.actor?.avatarUrl ?? null} size={8} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">{review.actor?.displayName ?? "알 수 없음"}</span>
          <span className="text-xs text-neutral-500">{review.episodeNumber}화</span>
          {!editing && <Stars value={review.score} size="sm" />}
          <span className="ml-auto text-xs text-neutral-400">{formatDateTime(review.updatedAt)}</span>
        </div>

        {editing ? (
          <div className="mt-2 space-y-2">
            <StarsInput value={score} onChange={setScore} size="sm" />
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={280}
              rows={2}
              className="w-full resize-none rounded-md border border-neutral-300 px-2 py-1 text-sm focus:border-neutral-900 focus:outline-none"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(false)} className="rounded-md px-2.5 py-1 text-xs text-neutral-600 hover:bg-neutral-100">
                취소
              </button>
              <button type="button" onClick={save} disabled={saving || score == null} className="rounded-md bg-neutral-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-neutral-700 disabled:opacity-50">
                {saving ? "저장 중…" : "저장"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="mt-1 text-sm text-neutral-600">{review.comment}</p>
            {isMine && (
              <div className="mt-2 flex gap-3">
                <button type="button" onClick={startEdit} className="text-xs font-medium text-neutral-500 hover:text-neutral-900">
                  수정
                </button>
                <button type="button" onClick={() => setConfirming(true)} className="text-xs font-medium text-rose-500 hover:text-rose-700">
                  삭제
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {confirming && (
        <ConfirmDialog
          message={`${review.episodeNumber}화 감상평을 삭제할까요?`}
          onCancel={() => setConfirming(false)}
          onConfirm={async () => {
            try { await apiDelete(`/api/watch/${animeId}/episodes/${review.episodeNumber}`); } catch { /* noop */ }
            setConfirming(false);
            onChanged();
          }}
        />
      )}
    </li>
  );
}
