"use client";

import { useState } from "react";
import { apiPatch, type WatchEntry } from "@/app/lib/api";
import { displayTitle } from "@/app/lib/anilist-labels";
import { StarsInput } from "@/app/components/Stars";

export function SeriesReviewModal({
  entry,
  onClose,
  onSaved,
}: {
  entry: WatchEntry;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [score, setScore] = useState<number | null>(entry.score);
  const [comment, setComment] = useState(entry.comment ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await apiPatch(`/api/watch/${entry.anime.id}`, {
        score,
        comment: comment.trim() || null,
      });
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
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold tracking-tight">{displayTitle(entry.anime)}</h3>
        <p className="mt-1 text-xs text-neutral-500">시리즈 전체 평가</p>

        <div className="mt-5 space-y-4">
          <div>
            <span className="text-xs font-medium text-neutral-600">전체 별점 (선택)</span>
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
              placeholder="작품 전체는 어땠나요?"
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
            onClick={onClose}
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
    </div>
  );
}
