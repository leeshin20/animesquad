import Link from "next/link";
import { type WatchEntry } from "@/app/lib/api";
import { displayTitle } from "@/app/lib/anilist-labels";

export function RecentWatchedGrid({ entries }: { entries: WatchEntry[] | null }) {
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

export type RecentComment = {
  key: string;
  animeId: number;
  title: string;
  episodeNumber: number | null;
  score: number | null;
  comment: string;
  updatedAt: string;
};

export function RecentCommentList({ items }: { items: RecentComment[] | null }) {
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

type SquadCardData = {
  id: number;
  name: string;
  avatarUrl: string | null;
  memberCount: number;
  inviteCode?: string;
};

export function MySquadList({
  squads,
  linkToSquads = true,
}: {
  squads: SquadCardData[] | null;
  linkToSquads?: boolean;
}) {
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
      {squads.slice(0, 3).map((s) => {
        const content = (
          <>
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
              {s.inviteCode && (
                <p className="mt-0.5 text-xs text-neutral-500">
                  스쿼드 코드 <code className="font-mono text-neutral-700">{s.inviteCode}</code>
                </p>
              )}
            </div>
          </>
        );

        return linkToSquads ? (
          <Link
            key={s.id}
            href={`/squads/${s.id}`}
            className="flex items-center gap-4 rounded-xl border border-neutral-200 p-4 transition hover:bg-neutral-50"
          >
            {content}
          </Link>
        ) : (
          <div
            key={s.id}
            className="flex items-center gap-4 rounded-xl border border-neutral-200 p-4"
          >
            {content}
          </div>
        );
      })}
    </div>
  );
}
