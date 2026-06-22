"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  apiGet, apiGetOrNull, apiPost,
  type AnimeView, type WatchEntry, type WatchStatus, type SquadWatchGroup,
} from "@/app/lib/api";
import { aniFormat, displayTitle } from "@/app/lib/anilist-labels";
import { Stars } from "@/app/components/Stars";
import { Avatar } from "@/app/components/Timeline";
import { EpisodeLogModal } from "@/app/components/EpisodeLogModal";

const STATUSES: WatchStatus[] = ["WATCHING", "COMPLETED", "ON_HOLD", "DROPPED", "PLAN_TO_WATCH"];
const STATUS_LABEL: Record<WatchStatus, string> = {
  WATCHING: "보는 중", COMPLETED: "완료", ON_HOLD: "보류",
  DROPPED: "중단", PLAN_TO_WATCH: "볼 예정",
};

export default function AnimeDetailPage({ params }: { params: { id: string } }) {
  const animeId = params.id;
  const [anime, setAnime] = useState<AnimeView | null>(null);
  const [mine, setMine] = useState<WatchEntry | null>(null);
  const [groups, setGroups] = useState<SquadWatchGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const didInit = useRef(false);

  async function loadAll() {
    try {
      const [a, m, g] = await Promise.all([
        apiGet<AnimeView>(`/api/anime/${animeId}`),
        apiGetOrNull<WatchEntry>(`/api/watch/${animeId}`),
        apiGet<SquadWatchGroup[]>(`/api/anime/${animeId}/squad-watch`),
      ]);
      setAnime(a); setMine(m); setGroups(g);
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
            <h1 className="text-2xl font-semibold tracking-tight">{displayTitle(anime)}</h1>
            {anime.titleKorean && <p className="text-sm text-neutral-500">{anime.titleRomaji}</p>}
            <p className="mt-1 text-xs text-neutral-500">
              {aniFormat(anime.format)} · {anime.episodes ?? "?"}화
            </p>
          </div>
        </header>
      )}

      {anime && (
        <MyEvalPanel anime={anime} mine={mine} onSaved={loadAll} onError={setError} />
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-neutral-700">스쿼드별 평가</h2>
        <SquadGroups groups={groups} />
      </section>
    </div>
  );
}

function MyEvalPanel({
  anime, mine, onSaved, onError,
}: {
  anime: AnimeView;
  mine: WatchEntry | null;
  onSaved: () => void;
  onError: (s: string) => void;
}) {
  const [open, setOpen] = useState(false);

  if (!mine) {
    return (
      <div className="rounded-xl border border-neutral-200 p-4">
        <p className="mb-2 text-sm font-medium text-neutral-700">내 평가</p>
        <select
          defaultValue=""
          onChange={async (e) => {
            const s = e.target.value as WatchStatus;
            if (!s) return;
            try { await apiPost("/api/watch", { anilistId: anime.anilistId, status: s }); onSaved(); }
            catch (err) { onError(String(err)); }
          }}
          className="rounded-md border border-neutral-300 px-2 py-1 text-sm focus:border-neutral-900 focus:outline-none"
        >
          <option value="">내 목록에 추가…</option>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
      </div>
    );
  }

  const maxed = anime.episodes != null && mine.progress >= anime.episodes;

  return (
    <div className="rounded-xl border border-neutral-200 p-4">
      <p className="mb-2 text-sm font-medium text-neutral-700">내 평가</p>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
          {STATUS_LABEL[mine.status]}
        </span>
        <span className="text-xs text-neutral-500">
          {mine.progress}{anime.episodes ? `/${anime.episodes}` : ""}화
        </span>
        {mine.score != null && <Stars value={mine.score} size="sm" />}
        {mine.comment && <span className="text-neutral-600">· {mine.comment}</span>}
      </div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={maxed}
        title={maxed ? "최종화까지 봤어요" : "감상 기록"}
        className="mt-3 rounded-md border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {maxed ? "완료" : `+ 감상 기록 (${mine.progress + 1}화)`}
      </button>

      {open && (
        <EpisodeLogModal
          entry={mine}
          onClose={() => setOpen(false)}
          onSaved={() => { setOpen(false); onSaved(); }}
        />
      )}
    </div>
  );
}

function SquadGroups({ groups }: { groups: SquadWatchGroup[] | null }) {
  if (groups === null) {
    return <div className="h-20 animate-pulse rounded-xl bg-neutral-100" />;
  }
  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-500">
        스쿼드 멤버들의 평가가 아직 없어요.
      </div>
    );
  }
  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <div key={g.squadId}>
          <p className="mb-2 text-xs font-semibold text-neutral-500">{g.squadName}</p>
          <ul className="space-y-2">
            {g.members.map((m, i) => (
              <li key={i} className="flex items-start gap-3 rounded-lg border border-neutral-200 p-3">
                <Avatar name={m.actor?.displayName ?? "?"} url={m.actor?.avatarUrl ?? null} size={8} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium">{m.actor?.displayName ?? "알 수 없음"}</span>
                    <span className="text-xs text-neutral-500">
                      {STATUS_LABEL[m.status]} · {m.progress}화
                    </span>
                    {m.score != null && <Stars value={m.score} size="sm" />}
                  </div>
                  {m.comment && <p className="mt-1 text-sm text-neutral-600">{m.comment}</p>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
