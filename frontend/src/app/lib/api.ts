const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8080";

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export type Me = {
  id: number;
  email: string;
  displayName: string;
  avatarUrl: string | null;
};

export type Squad = {
  id: number;
  name: string;
  ownerId: number;
  inviteCode: string;
  createdAt: string;
};

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "PATCH",
    credentials: "include",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export type AniListMedia = {
  anilistId: number;
  titleRomaji: string;
  titleNative: string;
  titleEnglish: string | null;
  coverImageUrl: string | null;
  episodes: number | null;
  status: string;
  format: string;
  seasonYear: number | null;
};

export type AnimeView = {
  id: number;
  anilistId: number;
  titleRomaji: string;
  titleNative: string;
  titleEnglish: string | null;
  coverImageUrl: string | null;
  episodes: number | null;
  status: string;
  format: string;
  seasonYear: number | null;
};

export type WatchStatus =
  | "WATCHING" | "COMPLETED" | "ON_HOLD" | "DROPPED" | "PLAN_TO_WATCH";

export type WatchEntry = {
  id: number;
  anime: AnimeView;
  status: WatchStatus;
  progress: number;
  score: number | null;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FeedItem = {
  id: number;
  type:
    | "ANIME_ADDED" | "STATUS_CHANGED" | "PROGRESS_UPDATED"
    | "RATED" | "EPISODE_RATED" | "JOINED_SQUAD";
  actor: { id: number; displayName: string; avatarUrl: string | null } | null;
  anime: { id: number; titleRomaji: string; coverImageUrl: string | null } | null;
  payload: Record<string, unknown>;
  createdAt: string;
};
