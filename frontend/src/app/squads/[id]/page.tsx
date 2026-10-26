"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiGet, apiPatch, type FeedItem, type Me, type Squad } from "@/app/lib/api";
import { SquadEditModal } from "@/app/components/SquadEditModal";
import { SquadMembersModal } from "@/app/components/SquadMembersModal";
import { HorizontalScroll } from "@/app/components/HorizontalScroll";
import { displayTitle } from "@/app/lib/anilist-labels";
import { projectWatchFeed } from "@/app/lib/watch-feed";
import { nextFeedCursor } from "@/app/lib/feed-pagination";
import { Timeline, Avatar, type FeedItemWithSquad } from "@/app/components/Timeline";
import { NoticeBanner } from "@/app/components/NoticeBanner";

const PAGE_SIZE = 30;

type SquadWatchItem = {
  id: number;
  anime: { id: number; titleRomaji: string; titleKorean: string | null; coverImageUrl: string | null } | null;
  episodes: number | null;
  status: string;
  progress: number;
  score: number | null;
  updatedAt: string;
  actor: { id: number; displayName: string; avatarUrl: string | null } | null;
};

export default function SquadFeedPage({ params }: { params: { id: string } }) {
  const squadId = params.id;
  const [squad, setSquad] = useState<Squad | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [items, setItems] = useState<FeedItemWithSquad[]>([]);
  const [recent, setRecent] = useState<SquadWatchItem[] | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const didInit = useRef(false);

  async function loadMore() {
    setLoading(true);
    setError(null);
    try {
      const cursorParam = cursor == null ? "" : `&cursor=${cursor}`;
      const page = await apiGet<FeedItem[]>(
        `/api/squad/${squadId}/feed?limit=${PAGE_SIZE}${cursorParam}`);
      const visible = page.filter(
        (it) => it.type !== "ANIME_ADDED" && it.type !== "STATUS_CHANGED");
      setItems((cur) => [...cur, ...visible]);
      setCursor(nextFeedCursor(page, cursor));
      if (page.length < PAGE_SIZE) setDone(true);
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }

  async function loadRecent() {
    try {
      const data = await apiGet<SquadWatchItem[]>(`/api/squad/${squadId}/recent-watch?limit=30`);
      setRecent(data.filter((it) => it.status !== "PLAN_TO_WATCH"));
    } catch (e) { setError(String(e)); }
  }

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    apiGet<Squad>(`/api/squad/${squadId}`).then(setSquad).catch((e) => setError(String(e)));
    apiGet<Me>("/api/me").then(setMe).catch(() => setMe(null));
    loadMore();
    loadRecent();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  const isOwner = me != null && squad != null && me.id === squad.ownerId;

  return (
    <div className="space-y-6">
      {/* 최상단 — 공지 */}
      {squad && (
        <SquadAnnouncementBanner
          squadId={squadId}
          announcement={squad.announcement}
          isOwner={isOwner}
          onUpdated={(a) => setSquad((s) => (s ? { ...s, announcement: a } : s))}
        />
      )}

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
        <div className="flex min-w-0 flex-col gap-6">
          <SquadHeader
            squad={squad}
            isOwner={isOwner}
            onUpdated={(s) => setSquad(s)}
          />

          <section className="min-w-0">
            <h2 className="mb-3 text-sm font-semibold text-neutral-700">스쿼드의 최근 감상</h2>
            <SquadRecentGrid items={recent} />
          </section>
        </div>

        <section className="min-w-0">
          <h2 className="mb-3 text-sm font-semibold text-neutral-700">스쿼드 활동</h2>
          <Timeline items={projectWatchFeed(items)} currentUserId={me?.id} />
          {!done && (
            <div className="mt-3 text-center">
              <button
                onClick={loadMore}
                disabled={loading}
                className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-50"
              >
                {loading ? "불러오는 중…" : "더 보기"}
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function SquadAnnouncementBanner({
  squadId,
  announcement,
  isOwner,
  onUpdated,
}: {
  squadId: string;
  announcement: string | null;
  isOwner: boolean;
  onUpdated: (a: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  function startEdit() {
    setDraft(announcement ?? "");
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    try {
      const updated = await apiPatch<Squad>(
        `/api/squad/${squadId}/announcement`, { announcement: draft });
      onUpdated(updated.announcement);
      setEditing(false);
    } catch {
      // keep editing so the user can retry
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <NoticeBanner>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          placeholder="스쿼드 공지를 입력하세요 (비우면 삭제)"
          className="w-full resize-none rounded-md border border-amber-300 bg-white px-2 py-1 text-sm text-neutral-800 outline-none focus:border-amber-400"
        />
        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-md px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
          >
            취소
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-md bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </NoticeBanner>
    );
  }

  if (!announcement) {
    if (!isOwner) return null;
    return (
      <button
        type="button"
        onClick={startEdit}
        className="w-full rounded-lg border border-dashed border-amber-300 bg-amber-50/50 px-4 py-2 text-sm font-medium text-amber-700 transition hover:bg-amber-50"
      >
        + 스쿼드 공지 작성
      </button>
    );
  }

  return (
    <NoticeBanner>
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 whitespace-pre-wrap break-words">{announcement}</p>
        {isOwner && (
          <button
            type="button"
            onClick={startEdit}
            className="shrink-0 rounded-md px-2 py-0.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
          >
            수정
          </button>
        )}
      </div>
    </NoticeBanner>
  );
}

function SquadRecentGrid({ items }: { items: SquadWatchItem[] | null }) {
  if (items === null) {
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
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-500">
        멤버들의 활동이 아직 없어요.
      </div>
    );
  }
  return (
    <HorizontalScroll>
      {groupByAnime(items).map((g) => <SquadRecentCard key={g.anime.id} group={g} />)}
    </HorizontalScroll>
  );
}

type AnimeWatchGroup = {
  anime: NonNullable<SquadWatchItem["anime"]>;
  watchers: SquadWatchItem[];
};

/** Group entries by anime, preserving the incoming (recency) order of both
 *  groups and watchers within each group. */
function groupByAnime(items: SquadWatchItem[]): AnimeWatchGroup[] {
  const map = new Map<number, AnimeWatchGroup>();
  const order: number[] = [];
  for (const it of items) {
    if (!it.anime) continue;
    let g = map.get(it.anime.id);
    if (!g) {
      g = { anime: it.anime, watchers: [] };
      map.set(it.anime.id, g);
      order.push(it.anime.id);
    }
    g.watchers.push(it);
  }
  return order.map((id) => map.get(id)!);
}

function SquadRecentCard({ group }: { group: AnimeWatchGroup }) {
  const { anime, watchers } = group;
  const title = displayTitle(anime);
  const watchersWithActor = watchers.filter((watcher) => watcher.actor);
  return (
    <div className="w-20 shrink-0 snap-start lg:w-auto lg:snap-align-none">
      <div className="relative">
        <Link href={`/anime/${anime.id}`} className="block transition hover:opacity-80">
          {anime.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={anime.coverImageUrl}
              alt=""
              className="aspect-[2/3] w-full rounded-lg object-cover"
            />
          ) : (
            <div className="aspect-[2/3] w-full rounded-lg bg-neutral-100" />
          )}
        </Link>
        <WatcherStack watchers={watchers} />
      </div>
      <p className="mt-2 truncate text-sm font-medium text-neutral-800" title={title}>
        {title}
      </p>
      <p className="mt-0.5 truncate text-xs text-neutral-400">
        {watchersWithActor.length}명 감상 중
      </p>
    </div>
  );
}

function WatcherStack({ watchers }: { watchers: SquadWatchItem[] }) {
  const withActor = watchers.filter((w) => w.actor);
  if (withActor.length === 0) return null;
  const MAX = 3;
  const shown = withActor.slice(0, MAX);
  const extra = withActor.length - shown.length;
  return (
    <div className="absolute bottom-1 right-1 flex -space-x-2">
      {shown.map((w) => (
        <Link
          key={w.id}
          href={`/users/${w.actor!.id}`}
          className="rounded-full ring-2 ring-white"
          aria-label={`${w.actor!.displayName} 프로필`}
        >
          <Avatar name={w.actor!.displayName} url={w.actor!.avatarUrl} size={7} />
        </Link>
      ))}
      {extra > 0 && (
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-700 text-xs font-medium text-white ring-2 ring-white">
          +{extra}
        </div>
      )}
    </div>
  );
}

function SquadHeader({
  squad,
  isOwner,
  onUpdated,
}: {
  squad: Squad | null;
  isOwner: boolean;
  onUpdated: (s: Squad) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copyInviteCode(code: string) {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <>
    {editing && squad && (
      <SquadEditModal
        squad={squad}
        onUpdated={(s) => onUpdated(s)}
        onClose={() => setEditing(false)}
      />
    )}
    {showMembers && squad && (
      <SquadMembersModal
        squadId={squad.id}
        onClose={() => setShowMembers(false)}
      />
    )}
    <div className="relative overflow-hidden rounded-xl border border-neutral-200">
      {/* 수정 버튼 */}
      {isOwner && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-800"
          title="스쿼드 수정"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 2L12 4L5 11H3V9L10 2Z" />
          </svg>
        </button>
      )}

      {/* 아바타 + 정보 */}
      <div className="flex items-center gap-4 p-4">
        <div className="relative shrink-0">
          <div className="h-24 w-24 overflow-hidden rounded-2xl bg-neutral-200 shadow-sm">
            {squad?.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={squad.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-3xl font-bold text-neutral-400">
                {squad?.name?.charAt(0).toUpperCase() ?? ""}
              </div>
            )}
          </div>
        </div>

        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold tracking-tight text-neutral-900">
            {squad?.name ?? ""}
          </h1>
          {squad && (
            <>
              <button
                type="button"
                onClick={() => copyInviteCode(squad.inviteCode)}
                className="mt-0.5 block text-xs text-neutral-500 hover:text-neutral-800"
                title="클릭해서 복사"
              >
                스쿼드 코드{" "}
                <code className="font-mono text-neutral-700">{squad.inviteCode}</code>
                {copied && <span className="ml-1 text-neutral-400">복사됨</span>}
              </button>
              <button
                type="button"
                onClick={() => setShowMembers(true)}
                className="mt-1 block text-xs text-neutral-600 hover:text-neutral-900 hover:underline"
              >
                멤버 <span className="font-medium text-neutral-800">{squad.memberCount}</span>명
              </button>
            </>
          )}
        </div>
      </div>
    </div>
    </>
  );
}
