"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, apiPatch, type WatchEntry, type WatchStatus } from "@/app/lib/api";
import { aniFormat } from "@/app/lib/anilist-labels";

const STATUSES: WatchStatus[] = ["WATCHING", "COMPLETED", "ON_HOLD", "DROPPED", "PLAN_TO_WATCH"];

const STATUS_LABEL: Record<WatchStatus, string> = {
  WATCHING: "보는 중",
  COMPLETED: "완료",
  ON_HOLD: "보류",
  DROPPED: "중단",
  PLAN_TO_WATCH: "볼 예정",
};

export default function MyListPage() {
  const [entries, setEntries] = useState<WatchEntry[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  async function refresh() {
    try { setEntries(await apiGet<WatchEntry[]>("/api/watch")); }
    catch (e) { setStatus(String(e)); }
  }

  useEffect(() => { refresh(); }, []);

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
          <Link href="/anime/search" className="font-medium text-neutral-900 underline underline-offset-2">
            검색하러 가기
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {entries.map((e) => (
            <Row key={e.id} entry={e} onSaved={refresh} onError={setStatus} />
          ))}
        </ul>
      )}
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
  const [score, setScore] = useState<string>(entry.score == null ? "" : String(entry.score));
  const [comment, setComment] = useState<string>(entry.comment ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await apiPatch(`/api/watch/${entry.anime.id}`, {
        status,
        progress: progress === "" ? null : Number(progress),
        score: score === "" ? null : Number(score),
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
          <div className="font-medium">{entry.anime.titleRomaji}</div>
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
          <input
            type="number" min={1} max={10} value={score}
            onChange={(e) => setScore(e.target.value)}
            placeholder="점수"
            className={`${inputCls} w-20`}
          />
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
