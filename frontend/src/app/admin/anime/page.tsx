"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPatch, type AnimeView } from "@/app/lib/api";
import { aniFormat } from "@/app/lib/anilist-labels";

export default function AdminAnimePage() {
  const [items, setItems] = useState<AnimeView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  async function refresh() {
    setError(null);
    try {
      setItems(await apiGet<AnimeView[]>("/api/admin/anime"));
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => { refresh(); }, []);

  const filtered = (items ?? []).filter((a) => {
    if (!q.trim()) return true;
    const needle = q.toLowerCase();
    return (
      a.titleRomaji.toLowerCase().includes(needle) ||
      (a.titleEnglish ?? "").toLowerCase().includes(needle) ||
      (a.titleKorean ?? "").toLowerCase().includes(needle) ||
      a.titleNative.includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">관리자 · 한국어 제목</h1>
        <p className="mt-1 text-sm text-neutral-500">
          캐시된 작품의 한국어 제목을 직접 입력합니다.
        </p>
      </header>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="제목으로 필터"
        className="w-full rounded-lg border border-neutral-300 px-4 py-2 text-sm focus:border-neutral-900 focus:outline-none"
      />

      {items === null ? (
        <p className="text-sm text-neutral-400">불러오는 중…</p>
      ) : filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-500">
          {items.length === 0 ? "아직 캐시된 작품이 없어요." : "검색 결과 없음"}
        </p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((a) => (
            <Row key={a.id} anime={a} onSaved={refresh} onError={setError} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({
  anime,
  onSaved,
  onError,
}: {
  anime: AnimeView;
  onSaved: () => void;
  onError: (s: string) => void;
}) {
  const [value, setValue] = useState(anime.titleKorean ?? "");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const dirty = (anime.titleKorean ?? "") !== value.trim();

  async function save() {
    setSaving(true);
    try {
      await apiPatch(`/api/admin/anime/${anime.id}`, { titleKorean: value });
      setSavedAt(Date.now());
      onSaved();
    } catch (e) {
      onError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="flex gap-4 rounded-xl border border-neutral-200 p-4">
      {anime.coverImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={anime.coverImageUrl}
          alt=""
          className="h-24 w-16 flex-none rounded-md object-cover"
        />
      ) : (
        <div className="h-24 w-16 flex-none rounded-md bg-neutral-100" />
      )}
      <div className="flex flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="font-medium">{anime.titleRomaji}</span>
          {anime.titleEnglish && (
            <span className="text-sm text-neutral-500">{anime.titleEnglish}</span>
          )}
        </div>
        <div className="text-xs text-neutral-500">
          {anime.titleNative} · {aniFormat(anime.format)} · {anime.seasonYear ?? "-"} · AniList#{anime.anilistId}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="한국어 제목 (비우면 미설정)"
            className="min-w-[240px] flex-1 rounded-md border border-neutral-300 px-3 py-1.5 text-sm focus:border-neutral-900 focus:outline-none"
          />
          <button
            onClick={save}
            disabled={!dirty || saving}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
          >
            {saving ? "저장 중…" : "저장"}
          </button>
          {savedAt && !dirty && (
            <span className="text-xs text-emerald-600">저장됨 ✓</span>
          )}
        </div>
      </div>
    </li>
  );
}
