"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPut, apiPatch, type WatchEntry } from "@/app/lib/api";
import { displayTitle } from "@/app/lib/anilist-labels";
import { StarsInput } from "@/app/components/Stars";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";
import { DiscardConfirm } from "@/app/components/DiscardConfirm";
import { buildEpisodeTweetText, openTwitterIntent } from "@/app/lib/twitter";
import { scoreForEpisodeReview } from "@/app/lib/episode-log";

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
  const [overwriting, setOverwriting] = useState(false);
  const [ratedEps, setRatedEps] = useState<Map<number, number | null>>(new Map());
  const [shareOnSave, setShareOnSave] = useState(false);

  // 이미 평가한 회차를 알아두면 저장 전 덮어쓰기 경고를 띄울 수 있다.
  useEffect(() => {
    apiGet<{ episodeNumber: number; score: number | null }[]>(`/api/watch/${entry.anime.id}/episodes`)
      .then((list) => setRatedEps(new Map(list.map((r) => [r.episodeNumber, r.score]))))
      .catch(() => { /* 조회 실패 시 경고 없이 진행 */ });
  }, [entry.anime.id]);

  const dirty = score != null || comment.trim() !== "";
  const requestClose = () => (dirty ? setConfirming(true) : onClose());

  function save() {
    const epNum = Number(ep);
    if (!Number.isFinite(epNum) || epNum < 1) {
      setError("유효한 회차를 입력해주세요");
      return;
    }
    if (max != null && epNum > max) {
      setError(`최종화는 ${max}화예요`);
      return;
    }
    if ((score != null || comment.trim() !== "") && ratedEps.has(epNum)) {
      setError(null);
      setOverwriting(true);
      return;
    }
    doSave(epNum);
  }

  async function doSave(epNum: number) {
    setOverwriting(false);
    setSaving(true);
    setError(null);
    try {
      if (score != null || comment.trim() !== "") {
        await apiPut(`/api/watch/${entry.anime.id}/episodes/${epNum}`, {
          score: scoreForEpisodeReview(score, ratedEps.get(epNum) ?? null),
          comment: comment.trim() || null,
        });
      } else {
        await apiPatch(`/api/watch/${entry.anime.id}`, { progress: epNum });
      }
      if (shareOnSave) {
        const title = displayTitle(entry.anime);
        openTwitterIntent(buildEpisodeTweetText(title, epNum, score, comment));
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
          <div>
            <span className="text-xs font-medium text-neutral-600">회차</span>
            <div className="mt-1 flex items-center gap-1.5">
              <button
                type="button"
                aria-label="이전 회차"
                onClick={() => setEp((v) => String(Math.max(1, (Number(v) || 1) - 1)))}
                disabled={(Number(ep) || 1) <= 1}
                className="flex h-9 w-9 items-center justify-center rounded-md border border-neutral-300 text-lg text-neutral-700 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                −
              </button>
              <input
                type="text"
                inputMode="numeric"
                value={ep}
                onChange={(e) => setEp(e.target.value.replace(/[^0-9]/g, ""))}
                className="h-9 w-16 rounded-md border border-neutral-300 text-center text-sm focus:border-neutral-900 focus:outline-none"
              />
              <button
                type="button"
                aria-label="다음 회차"
                onClick={() => setEp((v) => String(max != null ? Math.min(max, (Number(v) || 0) + 1) : (Number(v) || 0) + 1))}
                disabled={max != null && (Number(ep) || 0) >= max}
                className="flex h-9 w-9 items-center justify-center rounded-md border border-neutral-300 text-lg text-neutral-700 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                +
              </button>
            </div>
          </div>

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
            <p className="mt-1 text-right text-xs text-neutral-400">
              {comment.length}/280
            </p>
          </label>

          {error && (
            <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm text-neutral-600">
          <input
            type="checkbox"
            checked={shareOnSave}
            onChange={(e) => setShareOnSave(e.target.checked)}
            className="h-4 w-4 rounded border-neutral-300"
          />
          트위터에 공유하기
        </label>

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
      {overwriting && (
        <ConfirmDialog
          message="이미 작성된 감상평이 있습니다. 수정하시겠습니까?"
          confirmLabel="수정"
          onConfirm={() => doSave(Number(ep))}
          onCancel={() => setOverwriting(false)}
        />
      )}
    </div>
  );
}
