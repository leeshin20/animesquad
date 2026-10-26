"use client";

import { useState } from "react";
import { apiDelete, apiPatch, type WatchEntry, type WatchStatus } from "@/app/lib/api";
import { displayTitle } from "@/app/lib/anilist-labels";
import { StarsInput } from "@/app/components/Stars";
import { DiscardConfirm } from "@/app/components/DiscardConfirm";
import { buildSeriesTweetText, openTwitterIntent } from "@/app/lib/twitter";
import { STATUS_LABEL } from "@/app/lib/watch-status";

export function SeriesReviewModal({
  entry,
  statusOptions,
  onClose,
  onSaved,
}: {
  entry: WatchEntry;
  statusOptions: { value: WatchStatus; label: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState<WatchStatus>(entry.status);
  const [progress, setProgress] = useState(String(entry.progress));
  const [score, setScore] = useState<number | null>(entry.score);
  const [comment, setComment] = useState(entry.comment ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [shareOnSave, setShareOnSave] = useState(false);

  // A review only makes sense once watching has progressed past 볼 예정/보는 중.
  const canReview = status !== "PLAN_TO_WATCH" && status !== "WATCHING";

  const dirty = status !== entry.status || Number(progress) !== entry.progress || score !== entry.score || comment.trim() !== (entry.comment ?? "");
  const requestClose = () => (dirty ? setConfirming(true) : onClose());

  async function remove() {
    setDeleting(true);
    setError(null);
    try {
      await apiDelete(`/api/watch/${entry.anime.id}`);
      onSaved();
    } catch (e) {
      setError(String(e));
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  async function save() {
    const nextProgress = Number(progress);
    if (!Number.isSafeInteger(nextProgress) || nextProgress < 0 ||
      (nextProgress !== entry.progress && entry.anime.episodes != null && nextProgress > entry.anime.episodes)) {
      setError("유효한 진도를 입력해주세요"); return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiPatch(`/api/watch/${entry.anime.id}`, {
        status,
        ...(nextProgress !== entry.progress ? { progress: nextProgress } : {}),
        score,
        comment: comment.trim() || null,
      });
      if (shareOnSave) {
        const title = displayTitle(entry.anime);
        const label = STATUS_LABEL[status];
        openTwitterIntent(buildSeriesTweetText(title, label, score, comment));
      }
      onSaved();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) requestClose(); }}
    >
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold tracking-tight">{displayTitle(entry.anime)}</h3>

        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="text-xs font-medium text-neutral-600">시청 상태</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as WatchStatus)}
              className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
            >
              {statusOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-neutral-600">현재 진도</span>
            <input aria-label="현재 진도" type="number" min={0} value={progress} onChange={e => setProgress(e.target.value)} className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
            <span className="mt-1 block text-xs text-neutral-400">기존 시청 기록은 유지됩니다.</span>
          </label>

          <div className={canReview ? "" : "pointer-events-none opacity-50"}>
            <div>
              <span className="text-xs font-medium text-neutral-600">전체 별점 (선택)</span>
              <div className="mt-1">
                <StarsInput value={score} onChange={setScore} />
              </div>
            </div>

            <label className="mt-4 block">
              <span className="text-xs font-medium text-neutral-600">감상평 (선택, 최대 280자)</span>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                maxLength={280}
                rows={3}
                placeholder="작품 전체는 어땠나요?"
                className="mt-1 w-full resize-none rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
              />
              <p className="mt-1 text-right text-xs text-neutral-400">
                {comment.length}/280
              </p>
            </label>

            {!canReview && (
              <p className="mt-2 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-600">
                별점과 감상평을 남기려면 시청 상태가 완료, 보류, 중단이어야 합니다.
              </p>
            )}

            {canReview && (
              <label className="flex items-center gap-2 text-sm text-neutral-600">
                <input
                  type="checkbox"
                  checked={shareOnSave}
                  onChange={(e) => setShareOnSave(e.target.checked)}
                  className="h-4 w-4 rounded border-neutral-300"
                />
                트위터에 공유하기
              </label>
            )}
          </div>

          {error && (
            <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          )}
        </div>

        {confirmDelete ? (
          <div className="mt-6 rounded-md bg-rose-50 p-3">
            <p className="text-sm text-rose-700">목록에서 삭제하면 모든 기록이 사라져요. 계속할까요?</p>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded-md px-3 py-1.5 text-sm text-neutral-600 hover:bg-rose-100"
              >
                취소
              </button>
              <button
                type="button"
                onClick={remove}
                disabled={deleting}
                className="rounded-md bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {deleting ? "삭제 중…" : "삭제"}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-6 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="rounded-md px-3 py-2 text-sm text-rose-500 hover:bg-rose-50"
            >
              목록에서 삭제
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={requestClose}
                className="rounded-md px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-100"
              >
                취소
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
              >
                {saving ? "저장 중…" : "저장"}
              </button>
            </div>
          </div>
        )}
      </div>

      {confirming && (
        <DiscardConfirm onDiscard={onClose} onKeep={() => setConfirming(false)} />
      )}
    </div>
  );
}
