"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiDelete, apiGet, type EpisodeWatch, type WatchEntry } from "@/app/lib/api";
import { displayTitle } from "@/app/lib/anilist-labels";
import { relativeTime } from "@/app/components/Timeline";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";
import { EpisodeLogModal } from "@/app/components/EpisodeLogModal";

const PAGE_SIZE = 50;
export default function WatchHistoryPage() {
  const [rows, setRows] = useState<EpisodeWatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [cursor, setCursor] = useState<number | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<EpisodeWatch | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [openingReview, setOpeningReview] = useState(false);
  const [review, setReview] = useState<{ entry: WatchEntry; episode: number } | null>(null);

  async function load(cursor?: number) {
    setLoading(true); setError(null);
    try {
      const page = await apiGet<EpisodeWatch[]>(`/api/me/episode-watches?limit=${PAGE_SIZE}${cursor == null ? "" : `&cursor=${cursor}`}`);
      setRows(current => cursor == null ? page : [...current, ...page]);
      setDone(page.length < PAGE_SIZE);
      if (page.length) setCursor(page[page.length - 1].id); else if (cursor == null) setCursor(undefined);
    } catch { setError("시청 기록을 불러오지 못했어요. 다시 시도해주세요."); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function remove(row: EpisodeWatch) {
    setDeleting(true); setError(null);
    try {
      await apiDelete(`/api/me/episode-watches/${row.id}`);
      setRows(current => current.filter(item => item.id !== row.id)); setPendingDelete(null);
    } catch (error) {
      setPendingDelete(null);
      setError(String(error).includes("409") ? "해당 회차의 감상평을 먼저 삭제해주세요." : "기록을 삭제하지 못했어요. 다시 시도해주세요.");
    } finally { setDeleting(false); }
  }
  async function openReview(row: EpisodeWatch) {
    setOpeningReview(true); setError(null);
    try {
      const entry = await apiGet<WatchEntry>(`/api/watch/${row.anime.id}`);
      setReview({ entry, episode: row.episodeNumber });
    } catch { setError("작품 정보를 불러오지 못했어요. 다시 시도해주세요."); }
    finally { setOpeningReview(false); }
  }

  return <div className="space-y-4">
    <p className="text-sm text-neutral-500">본 회차가 쌓이는 곳이에요. 감상은 남기고 싶을 때 추가하세요.</p>
    {error && <div role="alert" className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}<button disabled={loading} onClick={() => load()} className="ml-3 underline">다시 불러오기</button></div>}
    {!loading && !error && rows.length === 0 && <div className="rounded-xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">아직 시청 기록이 없어요. 확장 프로그램으로 자동 기록하거나 <Link href="/search" className="underline">작품을 찾아</Link> 시청함을 눌러보세요.</div>}
    <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200">
      {rows.map(row => <li key={row.id} className="flex flex-wrap items-center gap-3 p-4">
        <Link href={`/anime/${row.anime.id}`} className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{displayTitle(row.anime)} · {row.episodeNumber}화 시청</p>
          <p className="mt-1 text-xs text-neutral-500">{relativeTime(row.recordedAt)}{row.source === "LEGACY" ? " · 이전 기록" : row.source === "EXTENSION" ? " · 확장 프로그램" : ""}</p>
        </Link>
        <button disabled={openingReview || deleting} onClick={() => openReview(row)} className="text-xs text-neutral-500 underline underline-offset-2">감상 남기기</button>
        <button disabled={deleting} onClick={() => setPendingDelete(row)} aria-label={`${row.episodeNumber}화 시청 기록 삭제`} className="text-xs text-neutral-400 hover:text-rose-600">삭제</button>
      </li>)}
    </ul>
    {loading && <p role="status" className="text-center text-sm text-neutral-400">불러오는 중…</p>}
    {!loading && !done && cursor != null && <button onClick={() => load(cursor)} className="w-full rounded-md border border-neutral-200 p-2 text-sm">더 보기</button>}
    {pendingDelete && <ConfirmDialog message={`${pendingDelete.episodeNumber}화 시청 기록을 삭제할까요? 현재 진도인 회차를 지우면 한 회차 내려갑니다. 확장에서 다시 감지하면 재기록될 수 있어요.`} confirmLabel={deleting ? "삭제 중…" : "삭제"} onConfirm={() => { if (!deleting) remove(pendingDelete); }} onCancel={() => { if (!deleting) setPendingDelete(null); }} />}
    {review && <EpisodeLogModal entry={review.entry} initialEpisode={review.episode} onClose={() => setReview(null)} onSaved={() => setReview(null)} />}
  </div>;
}
