"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  apiGet,
  apiPatch,
  apiPut,
  type FeedItem,
  type Me,
  type Squad,
  type WatchEntry,
} from "@/app/lib/api";
import { displayTitle } from "@/app/lib/anilist-labels";
import { Stars, StarsInput } from "@/app/components/Stars";
import { Timeline, type FeedItemWithSquad } from "@/app/components/Timeline";

export default function HomePage() {
  const [me, setMe] = useState<Me | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    apiGet<Me>("/api/me")
      .then((u) => setMe(u))
      .catch(() => setMe(null))
      .finally(() => setChecked(true));
  }, []);

  if (!checked) {
    return <p className="py-16 text-center text-sm text-neutral-400">불러오는 중…</p>;
  }
  return me ? <Dashboard /> : <Landing />;
}

function Landing() {
  const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8080";
  return (
    <section className="mx-auto max-w-2xl py-16 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">AnimeSquad</h1>
      <p className="mt-4 text-neutral-600">
        친구들과 애니메이션 시청 현황을 공유하세요.
      </p>
      <a
        href={`${apiBase}/oauth2/authorization/google`}
        className="mt-8 inline-flex items-center justify-center rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-700"
      >
        Google로 시작하기
      </a>
    </section>
  );
}

function Dashboard() {
  const [feed, setFeed] = useState<FeedItemWithSquad[] | null>(null);
  const [entries, setEntries] = useState<WatchEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadAll() {
    try {
      const [squads, mine] = await Promise.all([
        apiGet<Squad[]>("/api/squad"),
        apiGet<WatchEntry[]>("/api/watch"),
      ]);
      setEntries(mine.slice(0, 10));

      const pages = await Promise.all(
        squads.map(async (s) => {
          const items = await apiGet<FeedItem[]>(`/api/squad/${s.id}/feed?limit=20`);
          return items.map((it) => ({ ...it, squad: { id: s.id, name: s.name } }));
        })
      );
      const merged = pages
        .flat()
        .filter((it) => it.type !== "ANIME_ADDED")
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, 30);
      setFeed(merged);
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => { loadAll(); }, []);

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
        <section>
          <SectionHeader title="내가 최근 기록한 애니" linkHref="/watchlist" linkLabel="내 목록 전체" />
          <MyRecentGrid entries={entries} onChanged={loadAll} />
        </section>

        <section>
          <SectionHeader title="스쿼드 활동" linkHref="/squads" linkLabel="스쿼드 전체" />
          <Timeline items={feed} showSquad />
        </section>
      </div>
    </div>
  );
}

function SectionHeader({
  title, linkHref, linkLabel,
}: { title: string; linkHref: string; linkLabel: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between">
      <h2 className="text-sm font-semibold text-neutral-700">{title}</h2>
      <Link href={linkHref} className="text-xs text-neutral-500 hover:text-neutral-900">
        {linkLabel} →
      </Link>
    </div>
  );
}

function MyRecentGrid({
  entries,
  onChanged,
}: {
  entries: WatchEntry[] | null;
  onChanged: () => void;
}) {
  if (entries === null) return <GridSkeleton />;
  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-500">
        아직 기록이 없어요.{" "}
        <Link href="/search" className="font-medium text-neutral-900 underline underline-offset-2">
          검색하러 가기
        </Link>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3">
      {entries.map((e) => (
        <MyRecentCard key={e.id} entry={e} onChanged={onChanged} />
      ))}
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i}>
          <div className="aspect-[2/3] w-full animate-pulse rounded-lg bg-neutral-100" />
          <div className="mt-2 h-3 w-3/4 animate-pulse rounded bg-neutral-100" />
          <div className="mt-1 h-2 w-1/2 animate-pulse rounded bg-neutral-100" />
        </div>
      ))}
    </div>
  );
}

function MyRecentCard({
  entry,
  onChanged,
}: {
  entry: WatchEntry;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const maxed = entry.anime.episodes != null && entry.progress >= entry.anime.episodes;

  return (
    <div>
      <Link href="/watchlist" className="block transition hover:opacity-80">
        {entry.anime.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={entry.anime.coverImageUrl}
            alt=""
            className="aspect-[2/3] w-full rounded-lg object-cover"
          />
        ) : (
          <div className="aspect-[2/3] w-full rounded-lg bg-neutral-100" />
        )}
        <p className="mt-2 truncate text-sm font-medium text-neutral-800">
          {displayTitle(entry.anime)}
        </p>
      </Link>
      <p className="mt-0.5 flex items-center gap-1 text-xs text-neutral-500">
        <span>
          {entry.progress}
          {entry.anime.episodes ? `/${entry.anime.episodes}` : ""}화
        </span>
        {entry.score != null && (
          <>
            <span>·</span>
            <Stars value={entry.score} size="sm" />
          </>
        )}
      </p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={maxed}
        title={maxed ? "최종화까지 봤어요" : "감상 기록"}
        className="mt-1.5 w-full rounded-md border border-neutral-200 px-2 py-1 text-xs font-medium text-neutral-700 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {maxed ? "완료" : `+ 감상 기록 (${entry.progress + 1}화)`}
      </button>

      {open && (
        <EpisodeLogModal
          entry={entry}
          onClose={() => setOpen(false)}
          onSaved={() => { setOpen(false); onChanged(); }}
        />
      )}
    </div>
  );
}

function EpisodeLogModal({
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
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
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
