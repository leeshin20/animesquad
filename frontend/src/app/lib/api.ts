const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8080";

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

/** Like apiGet but returns null on 404 (e.g. "anime not in my list"). */
export async function apiGetOrNull<T>(path: string): Promise<T | null> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    cache: "no-store",
  });
  if (res.status === 404) return null;
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

export async function apiPostJsonEmpty(path: string, body: unknown): Promise<void> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
}

export type Me = {
  id: number;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  isAdmin: boolean;
  onboardingComplete: boolean;
  profileVisibility: "PUBLIC" | "SQUAD_ONLY" | "PRIVATE";
};

export type Squad = {
  id: number;
  name: string;
  ownerId: number;
  inviteCode: string;
  createdAt: string;
  announcement: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  memberCount: number;
};

export type SquadMember = {
  userId: number;
  displayName: string;
  avatarUrl: string | null;
  role: "OWNER" | "MEMBER";
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

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "PUT",
    credentials: "include",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

/** DELETE with no body/response. */
export async function apiDelete(path: string): Promise<void> {
  const res = await fetch(`${BASE}${path}`, {
    method: "DELETE",
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
}

/** POST with no JSON body/response (e.g. logout). */
export async function apiPostEmpty(path: string): Promise<void> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
}

/** Multipart file upload. */
export async function apiUpload<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    body: form,
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
  titleKorean: string | null;
  searchKeywords: string | null;
  coverImageUrl: string | null;
  episodes: number | null;
  status: string;
  format: string;
  seasonYear: number | null;
  season: string | null;
  startDate: string | null;
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
  anime: { id: number; titleRomaji: string; titleKorean: string | null; coverImageUrl: string | null } | null;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type AnimeReview = {
  actor: { id: number; displayName: string; avatarUrl: string | null } | null;
  status: WatchStatus;
  progress: number;
  score: number | null;
  comment: string | null;
  updatedAt: string;
};

export type EpisodeReview = {
  actor: { id: number; displayName: string; avatarUrl: string | null } | null;
  episodeNumber: number;
  score: number | null;
  comment: string;
  updatedAt: string;
};

export type MyEpisodeReview = {
  id: number;
  anime: { id: number; titleRomaji: string; titleKorean: string | null; coverImageUrl: string | null } | null;
  episodeNumber: number;
  score: number | null;
  comment: string | null;
  updatedAt: string;
};

export type MyProgressActivity = {
  id: number;
  anime: {
    id: number;
    titleRomaji: string;
    titleKorean: string | null;
    coverImageUrl: string | null;
  };
  progress: number;
  createdAt: string;
};

export type AnimeStats = {
  averageScore: number | null;
  watcherCount: number;
};

export type PublicSquadRef = {
  id: number;
  name: string;
  avatarUrl: string | null;
  memberCount: number;
};

export type UserProfile = {
  id: number;
  displayName: string;
  avatarUrl: string | null;
  accessible: boolean;
  recentWatched: WatchEntry[] | null;
  recentEpisodeReviews: MyEpisodeReview[] | null;
  squads: PublicSquadRef[] | null;
};

export type WatchImportLineStatus = "MATCHED" | "UNMATCHED" | "INVALID" | "DUPLICATE";

export type WatchImportAnimeRef = {
  id: number;
  titleKorean: string | null;
  titleRomaji: string;
  coverImageUrl: string | null;
};

export type WatchImportLine = {
  lineNumber: number;
  rawLine: string;
  title: string | null;
  progress: number | null;
  status: WatchImportLineStatus;
  anime: WatchImportAnimeRef | null;
  message: string | null;
};

export type WatchImportPreview = {
  targetUser: { id: number; email: string; displayName: string };
  lines: WatchImportLine[];
};

export type WatchImportCommitResponse = {
  created: number;
  updated: number;
};

export type EpisodeWatch = {
  id: number;
  anime: NonNullable<FeedItem["anime"]>;
  episodeNumber: number;
  recordedAt: string;
  source: "EXTENSION" | "MANUAL" | "UNKNOWN" | "LEGACY";
};
