"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  apiGet, apiPatch, apiUpload, apiPostEmpty, apiDelete,
  type Me, type MyEpisodeReview, type Squad, type WatchEntry,
} from "@/app/lib/api";
import { displayTitle } from "@/app/lib/anilist-labels";
import {
  MySquadList, RecentCommentList, RecentWatchedGrid, type RecentComment,
} from "@/app/profile/profile-sections";

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

function ProfileEditor({
  me, onSaved, onCancel,
}: {
  me: Me;
  onSaved: (updated: Me) => void;
  onCancel: () => void;
}) {
  const [displayName, setDisplayName] = useState(me.displayName);
  const [visibility, setVisibility] = useState<Me["profileVisibility"]>(me.profileVisibility);
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
      if (name !== me.displayName || visibility !== me.profileVisibility) {
        updated = await apiPatch<Me>("/api/me", {
          displayName: name,
          profileVisibility: visibility,
        });
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

      <fieldset>
        <legend className="text-xs font-medium text-neutral-600">공개범위</legend>
        <div className="mt-1.5 space-y-1.5">
          {(
            [
              { value: "PUBLIC", label: "전체공개" },
              { value: "SQUAD_ONLY", label: "스쿼드 멤버만 공개" },
              { value: "PRIVATE", label: "비공개" },
            ] as const
          ).map((opt) => (
            <label key={opt.value} className="flex items-center gap-2 text-sm text-neutral-700">
              <input
                type="radio"
                name="profileVisibility"
                checked={visibility === opt.value}
                onChange={() => setVisibility(opt.value)}
              />
              {opt.label}
            </label>
          ))}
        </div>
      </fieldset>

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
