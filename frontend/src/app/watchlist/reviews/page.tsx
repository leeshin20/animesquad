"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  apiDelete,
  apiGet,
  type MyEpisodeReview,
  type MyProgressActivity,
  type WatchEntry,
  type WatchStatus,
} from "@/app/lib/api";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";
import { Stars, StarIcon } from "@/app/components/Stars";
import { relativeTime } from "@/app/components/Timeline";
import { STATUS_LABEL, statusLabel, statusBadge } from "@/app/lib/watch-status";
import { mergeRecords, type ReviewRecord } from "./merge-records";

type StatusFilter = WatchStatus | "ALL";
type ScoreFilter = "ALL" | 1 | 2 | 3 | 4 | 5 | "NONE";
type SortKey = "UPDATED" | "TITLE";
type SortDir = "ASC" | "DESC";

const SORT_LABEL: Record<SortKey, string> = {
  UPDATED: "날짜순",
  TITLE: "이름순",
};

function compareRecords(a: ReviewRecord, b: ReviewRecord, key: SortKey): number {
  switch (key) {
    case "UPDATED":
      return a.updatedAt < b.updatedAt ? -1 : a.updatedAt > b.updatedAt ? 1 : 0;
    case "TITLE":
      return a.title.localeCompare(b.title, "ko");
  }
}

function sortRecords(records: ReviewRecord[], key: SortKey, dir: SortDir): ReviewRecord[] {
  const sign = dir === "ASC" ? 1 : -1;
  return [...records].sort((a, b) => sign * compareRecords(a, b, key));
}

export default function ReviewsPage() {
  const [entries, setEntries] = useState<WatchEntry[] | null>(null);
  const [episodeReviews, setEpisodeReviews] = useState<MyEpisodeReview[] | null>(null);
  const [progressActivities, setProgressActivities] = useState<MyProgressActivity[] | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ReviewRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>("ALL");
  const [sort, setSort] = useState<SortKey>("UPDATED");
  const [sortDir, setSortDir] = useState<SortDir>("DESC");

  async function loadRecords() {
    setError(null);
    try {
      const [watchRows, episodeRows, progressRows] = await Promise.all([
        apiGet<WatchEntry[]>("/api/watch"),
        apiGet<MyEpisodeReview[]>("/api/me/episode-reviews?limit=500&commentOnly=false"),
        apiGet<MyProgressActivity[]>("/api/me/progress-activities?limit=500"),
      ]);
      setEntries(watchRows);
      setEpisodeReviews(episodeRows);
      setProgressActivities(progressRows);
    } catch (error) {
      setError(String(error));
    }
  }

  useEffect(() => { loadRecords(); }, []);

  const loading = entries === null || episodeReviews === null || progressActivities === null;
  const records = loading ? [] : mergeRecords(entries, episodeReviews, progressActivities);

  function deleteMessage(record: ReviewRecord): string {
    if (record.kind === "series") {
      return "이 시리즈 감상평을 삭제할까요? 상태와 진도는 유지됩니다.";
    }
    if (record.kind === "episode") {
      return `${record.episodeNumber}화 감상평을 삭제할까요? 현재 진도는 유지됩니다.`;
    }
    const restored = Math.max(0, (record.episodeNumber ?? 0) - 1);
    return `${record.episodeNumber}화 기록을 삭제할까요? 현재 진도가 ${restored}화로 복구됩니다.`;
  }

  async function deleteRecord(record: ReviewRecord) {
    setDeleting(true);
    setError(null);
    try {
      if (record.kind === "series") {
        await apiDelete(`/api/watch/${record.animeId}/review`);
      } else if (record.kind === "episode") {
        await apiDelete(`/api/watch/${record.animeId}/episodes/${record.episodeNumber}`);
      } else {
        await apiDelete(`/api/me/progress-activities/${record.sourceId}`);
      }
      setPendingDelete(null);
      await loadRecords();
    } catch (error) {
      setError(String(error));
    } finally {
      setDeleting(false);
    }
  }

  const statusCounts: Record<StatusFilter, number> = {
    ALL: records.length,
    WATCHING: 0, COMPLETED: 0, ON_HOLD: 0, DROPPED: 0, PLAN_TO_WATCH: 0,
  };
  records.forEach((r) => { if (r.status) statusCounts[r.status]++; });

  const afterStatus = statusFilter === "ALL"
    ? records
    : records.filter((r) => r.status === statusFilter);

  const scoreCounts: Record<ScoreFilter, number> = {
    ALL: afterStatus.length, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, NONE: 0,
  };
  afterStatus.forEach((r) => {
    if (r.score == null) scoreCounts.NONE++;
    else scoreCounts[r.score as 1 | 2 | 3 | 4 | 5]++;
  });

  const afterScore = afterStatus.filter((r) => {
    if (scoreFilter === "ALL") return true;
    if (scoreFilter === "NONE") return r.score == null;
    return r.score === scoreFilter;
  });

  const filtered = sortRecords(afterScore, sort, sortDir);

  if (error) {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
        {error}
      </div>
    );
  }

  if (loading) {
    return (
      <ul className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <li key={i} className="h-20 animate-pulse rounded-xl border border-neutral-200 bg-neutral-100" />
        ))}
      </ul>
    );
  }

  if (records.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 px-6 py-10 text-center text-sm text-neutral-500">
        아직 감상 기록이 없어요.
      </div>
    );
  }

  return (
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
            title={
              sort === "UPDATED"
                ? sortDir === "DESC" ? "최신순" : "오래된순"
                : sortDir === "DESC" ? "Z~A" : "A~Z"
            }
          >
            {sort === "UPDATED"
              ? sortDir === "DESC" ? "↓ 최신순" : "↑ 오래된순"
              : sortDir === "DESC" ? "↓ Z~A" : "↑ A~Z"}
          </button>
        </label>
      </div>

      <ScoreFilterBar current={scoreFilter} counts={scoreCounts} onChange={setScoreFilter} />

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-500">
          조건에 맞는 기록이 없어요.
        </p>
      ) : (
        <ul className="space-y-3">
          {filtered.map((r) => (
            <RecordRow key={r.key} record={r} onDelete={setPendingDelete} />
          ))}
        </ul>
      )}

      {pendingDelete && (
        <ConfirmDialog
          message={deleteMessage(pendingDelete)}
          confirmLabel={deleting ? "삭제 중…" : "삭제"}
          onCancel={() => { if (!deleting) setPendingDelete(null); }}
          onConfirm={() => { if (!deleting) deleteRecord(pendingDelete); }}
        />
      )}
    </>
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

function RecordRow({
  record,
  onDelete,
}: {
  record: ReviewRecord;
  onDelete: (record: ReviewRecord) => void;
}) {
  return (
    <li className="flex items-start gap-3 rounded-xl border border-neutral-200 p-4 transition hover:bg-neutral-50">
      <Link href={`/anime/${record.animeId}`} className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 truncate text-sm font-medium text-neutral-800">{record.title}</p>
          <span className="shrink-0 text-xs text-neutral-400">{relativeTime(record.updatedAt)}</span>
        </div>
        <div className="mt-1.5 flex items-center gap-1.5">
          {record.episodeNumber != null ? (
            <span className="flex-none whitespace-nowrap rounded bg-blue-50 px-1.5 py-0.5 text-sm font-medium text-blue-700">
              {record.episodeNumber}화
            </span>
          ) : record.status != null ? (
            <span className={`flex-none whitespace-nowrap rounded px-1.5 py-0.5 text-sm font-medium ${statusBadge(record.status)}`}>
              {statusLabel(record.status)}
            </span>
          ) : null}
          {record.score != null ? (
            <Stars value={record.score} size="sm" />
          ) : (
            <span className="text-sm text-neutral-500">별점 없음</span>
          )}
        </div>
        {record.comment && (
          <p className="mt-1.5 line-clamp-2 whitespace-pre-wrap break-words text-sm text-neutral-600">
            {record.comment}
          </p>
        )}
      </Link>
      <button
        type="button"
        onClick={() => onDelete(record)}
        className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-rose-500 hover:bg-rose-50 hover:text-rose-700"
      >
        삭제
      </button>
    </li>
  );
}
