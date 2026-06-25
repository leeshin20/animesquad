"use client";

import { useState } from "react";
import { apiPut, apiPatch, type WatchEntry } from "@/app/lib/api";
import { displayTitle } from "@/app/lib/anilist-labels";
import { StarsInput } from "@/app/components/Stars";
import { DiscardConfirm } from "@/app/components/DiscardConfirm";

export function EpisodeLogModal({
  entry,
  onClose,
  onSaved,
}: {
  entry: WatchEntry;
  onClose: () => void;
  onSaved: () => void;
}) {
  const max = entry.anime.episodes;
  const defaultEp = Math.min(entry.progress + 1, max ?? entry.progress + 1);
  const [ep, setEp] = useState<string>(String(defaultEp));
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const dirty = score != null || comment.trim() !== "";
  const requestClose = () => (dirty ? setConfirming(true) : onClose());

  async function save() {
    const epNum = Number(ep);
    if (!Number.isFinite(epNum) || epNum < 1) {
      setError("유효한 화 번호를 입력해주세요");
      return;
    }
    if (max != null && epNum > max) {
      setError(`최종화는 ${max}화예요`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (score != null) {
        // PUT episode rating — backend auto-bumps progress to epNum
        await apiPut(`/api/watch/${entry.anime.id}/episodes/${epNum}`, {
          score,
          comment: comment.trim() || null,
        });
      } else {
        // Just bump progress
        await apiPatch(`/api/watch/${entry.anime.id}`, { progress: epNum });
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
        <h3 className="text-lg font-semibold tracking-tight">
          {displayTitle(entry.anime)}
        </h3>
        <p className="mt-1 text-xs text-neutral-500">
          현재 {entry.progress}
          {max ? `/${max}` : ""}화
        </p>

        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="text-xs font-medium text-neutral-600">화 번호</span>
            <input
              type="number"
              min={1}
              max={max ?? undefined}
              value={ep}
              onChange={(e) => setEp(e.target.value)}
              className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
            />
          </label>

          <div>
            <span className="text-xs font-medium text-neutral-600">평점 (선택)</span>
            <div className="mt-1">
              <StarsInput value={score} onChange={setScore} />
            </div>
          </div>

          <label className="block">
            <span className="text-xs font-medium text-neutral-600">감상평 (선택, 최대 280자)</span>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={280}
              rows={3}
              placeholder="이번 화 어땠나요?"
              className="mt-1 w-full resize-none rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
            />
          </label>

          {error && (
            <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
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

      {confirming && (
        <DiscardConfirm onDiscard={onClose} onKeep={() => setConfirming(false)} />
      )}
    </div>
  );
}
