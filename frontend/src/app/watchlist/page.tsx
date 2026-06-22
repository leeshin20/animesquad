"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, apiPatch, type WatchEntry, type WatchStatus } from "@/app/lib/api";
import { aniFormat, displayTitle } from "@/app/lib/anilist-labels";
import { Stars, StarsInput } from "@/app/components/Stars";

const STATUSES: WatchStatus[] = ["WATCHING", "COMPLETED", "ON_HOLD", "DROPPED", "PLAN_TO_WATCH"];

const STATUS_LABEL: Record<WatchStatus, string> = {
  WATCHING: "보는 중",
  COMPLETED: "완료",
  ON_HOLD: "보류",
  DROPPED: "중단",
  PLAN_TO_WATCH: "볼 예정",
};

type StatusFilter = WatchStatus | "ALL";
type ScoreFilter = "ALL" | 1 | 2 | 3 | 4 | 5 | "NONE";
type SortKey = "UPDATED" | "ADDED" | "TITLE" | "SCORE";

const SORT_LABEL: Record<SortKey, string> = {
  UPDATED: "최신 순",
  ADDED: "추가한 날짜 순",
  TITLE: "가나다 순",
  SCORE: "평점 순",
};

function sortEntries(entries: WatchEntry[], key: SortKey): WatchEntry[] {
  const arr = [...entries];
  switch (key) {
    case "UPDATED":
      return arr.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    case "ADDED":
      return arr.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    case "TITLE":
      return arr.sort((a, b) =>
        displayTitle(a.anime).localeCompare(displayTitle(b.anime), "ko")
      );
    case "SCORE":
      return arr.sort((a, b) => {
        if (a.score == null && b.score == null) return 0;
        if (a.score == null) return 1;
        if (b.score == null) return -1;
        return b.score - a.score;
      });
  }
}

export default function MyListPage() {
  const [entries, setEntries] = useState<WatchEntry[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>("ALL");
  const [sort, setSort] = useState<SortKey>("UPDATED");

  async function refresh() {
    try { setEntries(await apiGet<WatchEntry[]>("/api/watch")); }
    catch (e) { setStatus(String(e)); }
  }

  useEffect(() => { refresh(); }, []);

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

  const filtered = sortEntries(afterScore, sort);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">내 리스트</h1>
        <p className="mt-1 text-sm text-neutral-500">상태·진도·평점을 한 줄에서 수정하세요</p>
      </header>

      {status && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {status}
        </div>
      )}

      {entries.length === 0 ? (
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
                <Row key={e.id} entry={e} onSaved={refresh} onError={setStatus} />
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
  const tabs: { value: ScoreFilter; label: React.ReactNode }[] = [
    { value: "ALL", label: "평점 전체" },
    { value: 5, label: <Stars value={5} size="sm" /> },
    { value: 4, label: <Stars value={4} size="sm" /> },
    { value: 3, label: <Stars value={3} size="sm" /> },
    { value: 2, label: <Stars value={2} size="sm" /> },
    { value: 1, label: <Stars value={1} size="sm" /> },
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
  entry, onSaved, onError,
}: {
  entry: WatchEntry;
  onSaved: () => void;
  onError: (s: string) => void;
}) {
  const [status, setStatus] = useState<WatchStatus>(entry.status);
  const [progress, setProgress] = useState<string>(String(entry.progress));
  const [score, setScore] = useState<number | null>(entry.score);
  const [comment, setComment] = useState<string>(entry.comment ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await apiPatch(`/api/watch/${entry.anime.id}`, {
        status,
        progress: progress === "" ? null : Number(progress),
        score,
        comment: comment === "" ? null : comment,
      });
      onSaved();
    } catch (err) { onError(String(err)); }
    finally { setSaving(false); }
  }

  const inputCls =
    "rounded-md border border-neutral-300 px-2 py-1 text-sm focus:border-neutral-900 focus:outline-none";

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
          <div className="font-medium">{displayTitle(entry.anime)}</div>
          <div className="text-xs text-neutral-500">
            {aniFormat(entry.anime.format)} · {entry.anime.episodes ?? "?"}화
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as WatchStatus)}
            className={inputCls}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
          <input
            type="number" min={0} value={progress}
            onChange={(e) => setProgress(e.target.value)}
            placeholder="진도"
            className={`${inputCls} w-20`}
          />
          <StarsInput value={score} onChange={setScore} size="sm" />
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="한줄평 (최대 280자)"
            maxLength={280}
            className={`${inputCls} min-w-[200px] flex-1`}
          />
          <button
            onClick={save}
            disabled={saving}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
          >
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </li>
  );
}
