const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8080";

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    cache: "no-store",
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
