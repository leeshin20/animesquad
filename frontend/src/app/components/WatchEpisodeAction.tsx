"use client";

import { useState } from "react";
import { apiPost, type WatchEntry } from "@/app/lib/api";
import { EpisodeLogModal } from "./EpisodeLogModal";

export function WatchEpisodeAction({ entry, onSaved }: { entry: WatchEntry; onSaved: () => void }) {
  const next = Math.min(entry.progress + 1, entry.anime.episodes ?? entry.progress + 1);
  const finished = entry.anime.episodes != null && entry.progress >= entry.anime.episodes;
  const [choosing, setChoosing] = useState(false);
  const [episode, setEpisode] = useState(String(next));
  const [review, setReview] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function record(ep: number) {
    if (saving) return;
    if (!Number.isSafeInteger(ep) || ep < 1 || (entry.anime.episodes != null && ep > entry.anime.episodes)) {
      setError("유효한 회차를 선택해주세요"); return;
    }
    setSaving(true); setError(null); setMessage(null);
    try {
      await apiPost(`/api/watch/${entry.anime.id}/progress`, { progress: ep, source: "MANUAL" });
      setMessage(`${ep}화 시청 기록 저장 완료`); setChoosing(false); onSaved();
    } catch { setError("기록을 저장하지 못했어요. 다시 시도해주세요."); }
    finally { setSaving(false); }
  }

  return (
    <div className="mt-2 space-y-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        {!finished && <button type="button" disabled={saving} onClick={() => record(next)} className="rounded-md bg-brand-strong px-3 py-1.5 font-medium text-white disabled:opacity-50">{saving ? "저장 중…" : `${next}화 시청함`}</button>}
        <button type="button" disabled={saving} onClick={() => { setEpisode(String(next)); setChoosing(!choosing); }} className="rounded-md border border-neutral-200 px-2 py-1.5 text-neutral-600">회차 선택</button>
        {entry.progress > 0 && <button type="button" disabled={saving} onClick={() => setReview(entry.progress)} className="text-neutral-500 underline underline-offset-2">감상 남기기</button>}
      </div>
      {choosing && <form className="flex flex-wrap items-center gap-2" onSubmit={e => { e.preventDefault(); record(Number(episode)); }}>
        <label className="flex items-center gap-1"><input aria-label="기록할 회차" type="number" min={1} max={entry.anime.episodes ?? undefined} value={episode} onChange={e => setEpisode(e.target.value)} className="w-16 rounded border border-neutral-300 px-2 py-1" />화</label>
        <button disabled={saving} className="rounded bg-brand-strong px-2 py-1 text-white">시청함</button>
        <button type="button" disabled={saving} onClick={() => { const ep = Number(episode); if (Number.isSafeInteger(ep) && ep > 0) setReview(ep); }} className="text-neutral-500">감상 남기기</button>
      </form>}
      {message && <p role="status" className="text-green-700">{message}</p>}
      {error && <p role="alert" className="text-rose-700">{error}</p>}
      {review != null && <EpisodeLogModal entry={entry} initialEpisode={review} onClose={() => setReview(null)} onSaved={() => { setReview(null); onSaved(); }} />}
    </div>
  );
}
