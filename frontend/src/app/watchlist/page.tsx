"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, type WatchEntry, type WatchStatus } from "@/app/lib/api";
import { aniFormat, displayTitle } from "@/app/lib/anilist-labels";
import { StarIcon, Stars } from "@/app/components/Stars";
import { SeriesReviewModal } from "@/app/components/SeriesReviewModal";
import { EpisodeLogModal } from "@/app/components/EpisodeLogModal";
import { STATUSES, STATUS_LABEL, STATUS_STYLE } from "@/app/lib/watch-status";

type StatusFilter = WatchStatus | "ALL";
type ScoreFilter = "ALL" | 1 | 2 | 3 | 4 | 5 | "NONE";
type SortKey = "UPDATED" | "TITLE";
type SortDir = "ASC" | "DESC";

const SORT_LABEL: Record<SortKey, string> = {
  UPDATED: "날짜순",
  TITLE: "이름순",
};

function compareEntries(a: WatchEntry, b: WatchEntry, key: SortKey): number {
  switch (key) {
    case "UPDATED":
      return a.updatedAt < b.updatedAt ? -1 : a.updatedAt > b.updatedAt ? 1 : 0;
    case "TITLE":
      return displayTitle(a.anime).localeCompare(displayTitle(b.anime), "ko");
  }
}

function sortEntries(entries: WatchEntry[], key: SortKey, dir: SortDir): WatchEntry[] {
  const sign = dir === "ASC" ? 1 : -1;
  return [...entries].sort((a, b) => sign * compareEntries(a, b, key));
}

export default function MyListPage() {
  const [entries, setEntries] = useState<WatchEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>("ALL");
  const [sort, setSort] = useState<SortKey>("UPDATED");
  const [sortDir, setSortDir] = useState<SortDir>("DESC");

  async function refresh(showLoading = false) {
    if (showLoading) setLoading(true);
    try { setEntries(await apiGet<WatchEntry[]>("/api/watch")); }
    catch (e) { setStatus(String(e)); }
    finally { setLoading(false); }
  }

  useEffect(() => { refresh(true); }, []);

  const statusCounts: Record<StatusFilter, number> = {
    ALL: entries.length,
    WATCHING: 0, COMPLETED: 0, ON_HOLD: 0, DROPPED: 0, PLAN_TO_WATCH: 0,
  };
  entries.forEach((e) => { statusCounts[e.status]++; });

  const afterStatus = statusFilter === "ALL"
    ? entries
    : entries.filter((e) => e.status === statusFilter);

  const scoreCounts: Record<ScoreFilter, number> = {
    ALL: afterStatus.length, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, NONE: 0,
  };
  afterStatus.forEach((e) => {
    if (e.score == null) scoreCounts.NONE++;
    else scoreCounts[e.score as 1 | 2 | 3 | 4 | 5]++;
  });

  const afterScore = afterStatus.filter((e) => {
    if (scoreFilter === "ALL") return true;
    if (scoreFilter === "NONE") return e.score == null;
    return e.score === scoreFilter;
  });

  const filtered = sortEntries(afterScore, sort, sortDir);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">내 목록</h1>
      </header>

      {status && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {status}
        </div>
      )}

      {loading ? (
        <ul className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <li key={i} className="flex gap-4 rounded-xl border border-neutral-200 p-4">
              <div className="h-24 w-16 flex-none animate-pulse rounded-md bg-neutral-100" />
              <div className="flex flex-1 flex-col gap-2">
                <div className="h-4 w-1/2 animate-pulse rounded bg-neutral-100" />
                <div className="h-3 w-1/3 animate-pulse rounded bg-neutral-100" />
                <div className="mt-auto flex gap-2 pt-1">
                  <div className="h-8 w-20 animate-pulse rounded-md bg-neutral-100" />
                  <div className="h-8 w-28 animate-pulse rounded-md bg-neutral-100" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 px-6 py-10 text-center text-sm text-neutral-500">
          아직 리스트가 비어 있어요.{" "}
          <Link href="/search" className="font-medium text-neutral-900 underline underline-offset-2">
            검색하러 가기
          </Link>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <StatusFilterBar current={statusFilter} counts={statusCounts} onChange={setStatusFilter} />
            <label className="flex items-center gap-2 text-sm text-neutral-500">
              정렬
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="rounded-md border border-neutral-300 px-2 py-1 text-sm focus:border-neutral-900 focus:outline-none"
              >
                {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                  <option key={k} value={k}>{SORT_LABEL[k]}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setSortDir((d) => (d === "ASC" ? "DESC" : "ASC"))}
                className="inline-flex items-center gap-1 rounded-md border border-neutral-300 px-2 py-1 text-sm text-neutral-600 hover:bg-neutral-100"
                title={sortDir === "DESC" ? "내림차순" : "오름차순"}
              >
                {sortDir === "DESC" ? "↓ 내림차순" : "↑ 오름차순"}
              </button>
            </label>
          </div>

          <ScoreFilterBar current={scoreFilter} counts={scoreCounts} onChange={setScoreFilter} />

          {filtered.length === 0 ? (
            <p className="rounded-xl border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-500">
              조건에 맞는 작품이 없어요.
            </p>
          ) : (
            <ul className="space-y-3">
              {filtered.map((e) => (
                <Row key={e.id} entry={e} onSaved={refresh} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function StatusFilterBar({
  current, counts, onChange,
}: {
  current: StatusFilter;
  counts: Record<StatusFilter, number>;
  onChange: (f: StatusFilter) => void;
}) {
  const tabs: { value: StatusFilter; label: string }[] = [
    { value: "ALL", label: "전체" },
    { value: "WATCHING", label: STATUS_LABEL.WATCHING },
    { value: "COMPLETED", label: STATUS_LABEL.COMPLETED },
    { value: "ON_HOLD", label: STATUS_LABEL.ON_HOLD },
    { value: "DROPPED", label: STATUS_LABEL.DROPPED },
    { value: "PLAN_TO_WATCH", label: STATUS_LABEL.PLAN_TO_WATCH },
  ];
  return <Pills tabs={tabs} current={current} counts={counts} onChange={onChange} />;
}

function ScoreFilterBar({
  current, counts, onChange,
}: {
  current: ScoreFilter;
  counts: Record<ScoreFilter, number>;
  onChange: (f: ScoreFilter) => void;
}) {
  const starLabel = (n: number) => (
    <span className="inline-flex items-center gap-0.5">
      <span>{n}</span>
      <StarIcon size="sm" />
    </span>
  );
  const tabs: { value: ScoreFilter; label: React.ReactNode }[] = [
    { value: "ALL", label: "평점 전체" },
    { value: 5, label: starLabel(5) },
    { value: 4, label: starLabel(4) },
    { value: 3, label: starLabel(3) },
    { value: 2, label: starLabel(2) },
    { value: 1, label: starLabel(1) },
    { value: "NONE", label: "미평가" },
  ];
  return <Pills tabs={tabs} current={current} counts={counts} onChange={onChange} />;
}

function Pills<T extends string | number>({
  tabs, current, counts, onChange,
}: {
  tabs: { value: T; label: React.ReactNode }[];
  current: T;
  counts: Record<T, number>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {tabs.map((t) => {
        const active = current === t.value;
        return (
          <button
            key={String(t.value)}
            onClick={() => onChange(t.value)}
            className={
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm transition " +
              (active
                ? "bg-neutral-900 text-white"
                : "border border-neutral-200 text-neutral-600 hover:bg-neutral-100")
            }
          >
            {t.label}
            <span className={"text-xs " + (active ? "text-neutral-300" : "text-neutral-400")}>
              {counts[t.value]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Row({
  entry, onSaved,
}: {
  entry: WatchEntry;
  onSaved: () => void;
}) {
  const [modal, setModal] = useState<"series" | "episode" | null>(null);
  const maxed = entry.anime.episodes != null && entry.progress >= entry.anime.episodes;

  return (
    <li className="flex gap-4 rounded-xl border border-neutral-200 p-4">
      {entry.anime.coverImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={entry.anime.coverImageUrl}
          alt=""
          className="h-24 w-16 flex-none rounded-md object-cover"
        />
      ) : (
        <div className="h-24 w-16 flex-none rounded-md bg-neutral-100" />
      )}
      <div className="flex flex-1 flex-col gap-2">
        <div>
          <Link href={`/anime/${entry.anime.id}`} className="font-medium hover:underline">
            {displayTitle(entry.anime)}
          </Link>
          <div className="flex items-center justify-between gap-2 text-xs text-neutral-500">
            <span>{aniFormat(entry.anime.format)} · {entry.progress}/{entry.anime.episodes ?? "?"}화</span>
            {entry.score != null && <Stars value={entry.score} size="sm" />}
          </div>
        </div>

        <div className="mt-auto flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={() => setModal("series")}
            title="시청 상태 · 시리즈 평가"
            className={`rounded-md border px-3 py-1.5 text-sm font-medium transition ${STATUS_STYLE[entry.status]}`}
          >
            {STATUS_LABEL[entry.status]}
          </button>
          <button
            type="button"
            onClick={() => setModal("episode")}
            title={maxed ? "기록 수정" : "회차 기록"}
            className="rounded-md border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100"
          >
            {maxed ? "기록 수정" : `+ 회차 기록 (${entry.progress + 1}화)`}
          </button>
        </div>
      </div>

      {modal === "series" && (
        <SeriesReviewModal
          entry={entry}
          statusOptions={STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); onSaved(); }}
        />
      )}
      {modal === "episode" && (
        <EpisodeLogModal
          entry={entry}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); onSaved(); }}
        />
      )}
    </li>
  );
}
