"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPatch, apiPost, apiDelete, type AnimeView } from "@/app/lib/api";
import { aniFormat } from "@/app/lib/anilist-labels";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";

export default function AdminAnimePage() {
  const [items, setItems] = useState<AnimeView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkConfirming, setBulkConfirming] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkResult, setBulkResult] = useState<string | null>(null);

  const refresh = useCallback(async (query: string) => {
    setError(null);
    try {
      const path = query.trim()
        ? `/api/admin/anime?q=${encodeURIComponent(query.trim())}`
        : "/api/admin/anime";
      const list = await apiGet<AnimeView[]>(path);
      setItems(list);
      // 목록이 바뀌면 화면에 없는 항목은 선택에서 제거
      setSelected((prev) => new Set(list.filter((a) => prev.has(a.id)).map((a) => a.id)));
    } catch (e) {
      setError(String(e));
    }
  }, []);

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (!items) return;
    setSelected(selected.size === items.length ? new Set() : new Set(items.map((a) => a.id)));
  }

  async function bulkDelete() {
    setBulkDeleting(true);
    setBulkResult(null);
    try {
      const res = await apiPost<{ deleted: number; skipped: number }>(
        "/api/admin/anime/bulk-delete",
        { ids: Array.from(selected) }
      );
      setBulkConfirming(false);
      setBulkResult(
        res.skipped > 0
          ? `${res.deleted}개 삭제, ${res.skipped}개 건너뜀 (시청·평가 기록 있음)`
          : `${res.deleted}개 삭제됨`
      );
      refresh(q);
    } catch (e) {
      setBulkConfirming(false);
      setError(String(e));
    } finally {
      setBulkDeleting(false);
    }
  }

  // 검색어가 비면 기본(한글 미설정) 목록, 입력하면 전체 대상 검색 — 300ms 디바운스
  useEffect(() => {
    const t = setTimeout(() => { refresh(q); }, 300);
    return () => clearTimeout(t);
  }, [q, refresh]);

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

      <BulkCacheSection onDone={() => refresh(q)} onError={setError} />

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="제목으로 검색 (한글 단 작품도 검색돼요)"
        className="w-full rounded-lg border border-neutral-300 px-4 py-2 text-sm focus:border-neutral-900 focus:outline-none"
      />

      {items === null ? (
        <p className="text-sm text-neutral-400">불러오는 중…</p>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-500">
          {q.trim() ? "검색 결과 없음" : "한글 제목 미설정 작품이 없어요 (모두 처리됨)"}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-neutral-600">
              <input
                type="checkbox"
                checked={selected.size === items.length}
                onChange={toggleAll}
                className="h-4 w-4 accent-neutral-900"
              />
              전체 선택
            </label>
            <button
              onClick={() => setBulkConfirming(true)}
              disabled={selected.size === 0 || bulkDeleting}
              className="rounded-md border border-rose-200 px-3 py-1.5 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-40"
            >
              {bulkDeleting ? "삭제 중…" : `선택 삭제 (${selected.size}개)`}
            </button>
            {bulkResult && <span className="text-sm text-emerald-600">{bulkResult}</span>}
          </div>
          <ul className="space-y-2">
            {items.map((a) => (
              <Row
                key={a.id}
                anime={a}
                checked={selected.has(a.id)}
                onToggle={() => toggle(a.id)}
                onSaved={() => refresh(q)}
                onError={setError}
              />
            ))}
          </ul>
        </>
      )}

      {bulkConfirming && (
        <ConfirmDialog
          message={`선택한 ${selected.size}개 작품을 캐시에서 삭제할까요? 되돌릴 수 없어요.`}
          onConfirm={bulkDelete}
          onCancel={() => setBulkConfirming(false)}
        />
      )}
    </div>
  );
}

const SEASONS = [
  { value: "WINTER", label: "겨울" },
  { value: "SPRING", label: "봄" },
  { value: "SUMMER", label: "여름" },
  { value: "FALL", label: "가을" },
];

function BulkCacheSection({
  onDone,
  onError,
}: {
  onDone: () => void;
  onError: (s: string) => void;
}) {
  const now = new Date();
  const [year, setYear] = useState<string>(String(now.getFullYear()));
  const [season, setSeason] = useState<string>("FALL");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<number | null>(null);

  async function go() {
    setBusy(true);
    setResult(null);
    try {
      const res = await apiPost<{ cached: number }>(
        "/api/admin/anime/bulk-cache-season",
        { year: Number(year), season }
      );
      setResult(res.cached);
      onDone();
    } catch (e) {
      onError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-neutral-200 p-5">
      <h2 className="text-sm font-semibold text-neutral-700">시즌 일괄 캐싱</h2>
      <p className="mt-1 text-xs text-neutral-500">
        AniList에서 해당 시즌 작품을 인기순으로 가져와 캐시에 저장합니다 (최대 250개).
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="number"
          value={year}
          onChange={(e) => setYear(e.target.value)}
          className="w-24 rounded-md border border-neutral-300 px-2 py-1.5 text-sm focus:border-neutral-900 focus:outline-none"
        />
        <select
          value={season}
          onChange={(e) => setSeason(e.target.value)}
          className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm focus:border-neutral-900 focus:outline-none"
        >
          {SEASONS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <button
          onClick={go}
          disabled={busy}
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
        >
          {busy ? "가져오는 중…" : "가져오기"}
        </button>
        {result != null && (
          <span className="text-sm text-emerald-600">{result}개 캐시됨</span>
        )}
      </div>
    </section>
  );
}

function Row({
  anime,
  checked,
  onToggle,
  onSaved,
  onError,
}: {
  anime: AnimeView;
  checked: boolean;
  onToggle: () => void;
  onSaved: () => void;
  onError: (s: string) => void;
}) {
  const [value, setValue] = useState(anime.titleKorean ?? "");
  const [keywords, setKeywords] = useState(anime.searchKeywords ?? "");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const dirty =
    (anime.titleKorean ?? "") !== value.trim() ||
    (anime.searchKeywords ?? "") !== keywords.trim();

  async function save() {
    setSaving(true);
    try {
      await apiPatch(`/api/admin/anime/${anime.id}`, { titleKorean: value, searchKeywords: keywords });
      setSavedAt(Date.now());
      onSaved();
    } catch (e) {
      onError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setDeleting(true);
    try {
      await apiDelete(`/api/admin/anime/${anime.id}`);
      setConfirming(false);
      onSaved();
    } catch (e) {
      setConfirming(false);
      onError(String(e));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <li className="flex gap-4 rounded-xl border border-neutral-200 p-4">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="mt-1 h-4 w-4 flex-none self-start accent-neutral-900"
      />
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
          <input
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="검색 키워드 (쉼표 구분, 예: 뱅드림, 방드림)"
            className="min-w-[240px] flex-1 rounded-md border border-neutral-300 px-3 py-1.5 text-sm focus:border-neutral-900 focus:outline-none"
          />
          <button
            onClick={save}
            disabled={!dirty || saving}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
          >
            {saving ? "저장 중…" : "저장"}
          </button>
          <button
            onClick={() => setConfirming(true)}
            disabled={deleting}
            className="rounded-md border border-rose-200 px-3 py-1.5 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-40"
          >
            삭제
          </button>
          {savedAt && !dirty && (
            <span className="text-xs text-emerald-600">저장됨 ✓</span>
          )}
        </div>
      </div>

      {confirming && (
        <ConfirmDialog
          message={`'${anime.titleRomaji}'을(를) 캐시에서 삭제할까요? 되돌릴 수 없어요.`}
          onConfirm={remove}
          onCancel={() => setConfirming(false)}
        />
      )}
    </li>
  );
}
