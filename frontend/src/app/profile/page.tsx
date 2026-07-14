"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  apiGet, apiPatch, apiUpload, apiPostEmpty, apiDelete,
  type Me, type MyEpisodeReview, type Squad, type WatchEntry,
} from "@/app/lib/api";
import { displayTitle } from "@/app/lib/anilist-labels";

export default function MePage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [entries, setEntries] = useState<WatchEntry[] | null>(null);
  const [episodeReviews, setEpisodeReviews] = useState<MyEpisodeReview[] | null>(null);
  const [squads, setSquads] = useState<Squad[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const didInit = useRef(false);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    apiGet<Me>("/api/me").then(setMe).catch((e) => setError(String(e)));
    apiGet<WatchEntry[]>("/api/watch").then(setEntries).catch(() => setEntries([]));
    apiGet<MyEpisodeReview[]>("/api/me/episode-reviews?limit=10")
      .then(setEpisodeReviews).catch(() => setEpisodeReviews([]));
    apiGet<Squad[]>("/api/squad").then(setSquads).catch(() => setSquads([]));
  }, []);

  async function logout() {
    try {
      await apiPostEmpty("/api/me/logout");
      router.push("/");
    } catch (e) {
      setError(String(e));
    }
  }

  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function deleteAccount() {
    if (!confirm("정말 탈퇴할까요? 모든 기록이 삭제되며 복구할 수 없어요.")) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiDelete("/api/me");
      router.push("/");
    } catch (e) {
      setDeleteError(String(e));
    } finally {
      setDeleting(false);
    }
  }

  if (error)
    return (
      <p className="text-sm text-neutral-600">
        로그인이 필요해요.{" "}
        <a className="underline underline-offset-2 hover:text-neutral-900" href="/">
          홈으로
        </a>
      </p>
    );
  if (!me) return <p className="text-sm text-neutral-500">불러오는 중…</p>;

  if (editing) {
    return (
      <ProfileEditor
        me={me}
        onSaved={(updated) => { setMe(updated); setEditing(false); }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  const recentWatched = (entries ?? [])
    .filter((e) => e.status !== "PLAN_TO_WATCH")
    .slice(0, 6);
  const recentComments: RecentComment[] | null =
    entries === null || episodeReviews === null
      ? null
      : [
          ...entries
            .filter((e) => e.comment)
            .map((e) => ({
              key: `w${e.id}`,
              animeId: e.anime.id,
              title: displayTitle(e.anime),
              episodeNumber: null as number | null,
              score: e.score,
              comment: e.comment!,
              updatedAt: e.updatedAt,
            })),
          ...episodeReviews
            .filter((r) => r.anime && r.comment)
            .map((r) => ({
              key: `e${r.id}`,
              animeId: r.anime!.id,
              title: displayTitle(r.anime!),
              episodeNumber: r.episodeNumber as number | null,
              score: r.score as number | null,
              comment: r.comment!,
              updatedAt: r.updatedAt,
            })),
        ]
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .slice(0, 4);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 rounded-xl border border-neutral-200 p-6">
        {me.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={me.avatarUrl} alt="" className="h-16 w-16 rounded-full object-cover" />
        ) : (
          <div className="h-16 w-16 rounded-full bg-neutral-200" />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold">{me.displayName}</h1>
          <p className="text-sm text-neutral-500">{me.email}</p>
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
        >
          프로필 수정
        </button>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        {/* 좌측 — 최근 감상 + 최근 소감 */}
        <div className="flex min-w-0 flex-col gap-8">
          <section className="min-w-0">
            <SectionHeader title="최근 감상" linkHref="/watchlist/anime" linkLabel="전체 보기" />
            <RecentWatchedGrid entries={entries === null ? null : recentWatched} />
          </section>

          <section className="min-w-0">
            <SectionHeader title="최근 기록" linkHref="/watchlist/reviews" linkLabel="전체 보기" />
            <RecentCommentList items={recentComments} />
          </section>
        </div>

        {/* 우측 — 내 스쿼드 */}
        <section className="min-w-0">
          <h2 className="mb-3 text-sm font-semibold text-neutral-700">소속 스쿼드</h2>
          <MySquadList squads={squads} />
        </section>
      </div>

      <button
        type="button"
        onClick={logout}
        className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-600 transition hover:bg-neutral-100"
      >
        로그아웃
      </button>
      <button
        type="button"
        onClick={deleteAccount}
        disabled={deleting}
        className="rounded-md border border-rose-200 px-3 py-1.5 text-sm font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
      >
        {deleting ? "탈퇴 중…" : "회원 탈퇴"}
      </button>
      {deleteError && (
        <p className="text-sm text-rose-600">{deleteError}</p>
      )}
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

function RecentWatchedGrid({ entries }: { entries: WatchEntry[] | null }) {
  if (entries === null) {
    return (
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i}>
            <div className="aspect-[2/3] w-full animate-pulse rounded-lg bg-neutral-100" />
            <div className="mt-2 h-3 w-3/4 animate-pulse rounded bg-neutral-100" />
          </div>
        ))}
      </div>
    );
  }
  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-500">
        아직 감상 기록이 없어요.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
      {entries.map((e) => {
        const title = displayTitle(e.anime);
        return (
          <Link key={e.id} href={`/anime/${e.anime.id}`} className="transition hover:opacity-80">
            {e.anime.coverImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={e.anime.coverImageUrl}
                alt=""
                className="aspect-[2/3] w-full rounded-lg object-cover"
              />
            ) : (
              <div className="aspect-[2/3] w-full rounded-lg bg-neutral-100" />
            )}
            <p className="mt-2 truncate text-xs font-medium text-neutral-800" title={title}>
              {title}
            </p>
            <p className="mt-0.5 text-xs text-neutral-500">
              {e.progress}
              {e.anime.episodes ? `/${e.anime.episodes}` : ""}화
            </p>
          </Link>
        );
      })}
    </div>
  );
}

type RecentComment = {
  key: string;
  animeId: number;
  title: string;
  episodeNumber: number | null;
  score: number | null;
  comment: string;
  updatedAt: string;
};

function RecentCommentList({ items }: { items: RecentComment[] | null }) {
  if (items === null) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-neutral-100" />
        ))}
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-500">
        아직 작성한 소감이 없어요.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {items.map((c) => (
        <Link
          key={c.key}
          href={`/anime/${c.animeId}`}
          className="block rounded-xl border border-neutral-200 p-4 transition hover:bg-neutral-50"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 truncate text-sm font-medium text-neutral-800">
              {c.title}
              {c.episodeNumber != null && (
                <span className="ml-1.5 text-xs font-normal text-neutral-500">
                  {c.episodeNumber}화
                </span>
              )}
            </p>
            {c.score != null && (
              <span className="shrink-0 text-xs font-medium text-amber-600">★ {c.score}</span>
            )}
          </div>
          <p className="mt-1.5 line-clamp-2 whitespace-pre-wrap break-words text-sm text-neutral-600">
            {c.comment}
          </p>
        </Link>
      ))}
    </div>
  );
}

function MySquadList({ squads }: { squads: Squad[] | null }) {
  if (squads === null) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-neutral-100" />
        ))}
      </div>
    );
  }
  if (squads.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-500">
        아직 속한 스쿼드가 없어요.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {squads.slice(0, 3).map((s) => (
        <Link
          key={s.id}
          href={`/squads/${s.id}`}
          className="flex items-center gap-4 rounded-xl border border-neutral-200 p-4 transition hover:bg-neutral-50"
        >
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-neutral-200 shadow-sm">
            {s.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-neutral-400">
                {s.name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-neutral-900">{s.name}</p>
            <p className="mt-0.5 text-xs text-neutral-500">멤버 {s.memberCount}명</p>
            <p className="mt-0.5 text-xs text-neutral-500">
              스쿼드 코드 <code className="font-mono text-neutral-700">{s.inviteCode}</code>
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}

function ProfileEditor({
  me, onSaved, onCancel,
}: {
  me: Me;
  onSaved: (updated: Me) => void;
  onCancel: () => void;
}) {
  const [displayName, setDisplayName] = useState(me.displayName);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function pickFile(f: File | null) {
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  async function save() {
    const name = displayName.trim();
    if (!name) {
      setError("닉네임을 입력해주세요");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let updated: Me | null = null;
      if (name !== me.displayName) {
        updated = await apiPatch<Me>("/api/me", { displayName: name });
      }
      if (file) {
        updated = await apiUpload<Me>("/api/me/avatar", file);
      }
      onSaved(updated ?? me);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  const shownAvatar = preview ?? me.avatarUrl;

  return (
    <div className="max-w-md space-y-5 rounded-xl border border-neutral-200 p-6">
      <h1 className="text-lg font-semibold tracking-tight">프로필 수정</h1>

      <div className="flex items-center gap-4">
        {shownAvatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shownAvatar} alt="" className="h-16 w-16 rounded-full object-cover" />
        ) : (
          <div className="h-16 w-16 rounded-full bg-neutral-200" />
        )}
        <div>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
          >
            사진 변경
          </button>
          {file && <p className="mt-1 text-xs text-neutral-500">{file.name}</p>}
        </div>
      </div>

      <label className="block">
        <span className="text-xs font-medium text-neutral-600">닉네임</span>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={50}
          className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
        />
      </label>

      {error && (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
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
  );
}
