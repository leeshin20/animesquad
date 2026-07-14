"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  apiGet,
  apiPost,
  type Me,
  type WatchImportCommitResponse,
  type WatchImportLine,
  type WatchImportPreview,
} from "@/app/lib/api";

const STATUS_LABELS: Record<WatchImportLine["status"], string> = {
  MATCHED: "매칭됨",
  UNMATCHED: "미매칭",
  INVALID: "입력 오류",
  DUPLICATE: "중복",
};

export default function AdminWatchImportPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [email, setEmail] = useState("");
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<WatchImportPreview | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WatchImportCommitResponse | null>(null);

  useEffect(() => {
    apiGet<Me>("/api/me")
      .then(setMe)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  function clearStalePreview() {
    setPreview(null);
    setSelected(new Set());
    setResult(null);
    setError(null);
  }

  async function createPreview() {
    if (previewing || committing) return;
    setPreviewing(true);
    setError(null);
    setResult(null);
    try {
      const response = await apiPost<WatchImportPreview>(
        "/api/admin/watch-import/preview",
        { email, text }
      );
      setPreview(response);
      setSelected(new Set(
        response.lines
          .filter((line) => line.status === "MATCHED" && line.anime)
          .map((line) => line.lineNumber)
      ));
    } catch (e) {
      setPreview(null);
      setSelected(new Set());
      setError(String(e));
    } finally {
      setPreviewing(false);
    }
  }

  function toggle(lineNumber: number) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(lineNumber)) next.delete(lineNumber);
      else next.add(lineNumber);
      return next;
    });
  }

  async function commit() {
    if (!preview || selected.size === 0 || previewing || committing) return;
    const items = preview.lines
      .filter(
        (line) =>
          selected.has(line.lineNumber) &&
          line.status === "MATCHED" &&
          line.anime &&
          line.progress
      )
      .map((line) => ({ animeId: line.anime!.id, progress: line.progress! }));
    if (items.length === 0) return;

    setCommitting(true);
    setError(null);
    setResult(null);
    try {
      const response = await apiPost<WatchImportCommitResponse>(
        "/api/admin/watch-import/commit",
        { targetUserId: preview.targetUser.id, items }
      );
      setResult(response);
    } catch (e) {
      setError(String(e));
    } finally {
      setCommitting(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-neutral-400">불러오는 중…</p>;
  }

  if (!me?.isAdmin) {
    return (
      <div aria-live="polite" className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
        관리자 권한이 필요해요
      </div>
    );
  }

  const busy = previewing || committing;

  return (
    <div className="space-y-6">
      <header>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">관리자 · 감상 기록 가져오기</h1>
          <Link href="/admin/anime" className="text-sm font-medium text-neutral-600 hover:text-neutral-900">
            한국어 제목 관리로 돌아가기
          </Link>
        </div>
        <p className="mt-1 text-sm text-neutral-500">
          대상 사용자와 작품별 진도를 확인한 뒤 선택한 기록만 가져옵니다.
        </p>
      </header>

      <div className="space-y-4 rounded-xl border border-neutral-200 p-5">
        <label className="block text-sm font-medium text-neutral-700">
          대상 사용자 이메일
          <input
            type="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              clearStalePreview();
            }}
            disabled={busy}
            className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2 font-normal focus:border-neutral-900 focus:outline-none disabled:bg-neutral-100"
          />
        </label>

        <label className="block text-sm font-medium text-neutral-700">
          감상 기록
          <textarea
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              clearStalePreview();
            }}
            disabled={busy}
            rows={10}
            placeholder={"월드 이즈 댄싱3화\n아주르 레인 미속전진! 2!!2화"}
            className="mt-1.5 w-full resize-y rounded-lg border border-neutral-300 px-3 py-2 font-normal focus:border-neutral-900 focus:outline-none disabled:bg-neutral-100"
          />
        </label>

        <button
          type="button"
          onClick={createPreview}
          disabled={busy || !email.trim() || !text.trim()}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
        >
          {previewing ? "미리보는 중…" : "미리보기"}
        </button>
      </div>

      <div aria-live="polite" className="space-y-2">
        {error && (
          <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}
        {result && (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            신규 {result.created}개, 기존 {result.updated}개 갱신 완료 · 피드에는 표시되지 않아요
          </p>
        )}
      </div>

      {preview && (
        <section className="space-y-4">
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3">
            <p className="font-medium text-neutral-900">{preview.targetUser.displayName}</p>
            <p className="text-sm text-neutral-500">{preview.targetUser.email}</p>
          </div>

          <ul className="space-y-2">
            {preview.lines.map((line) => (
              <PreviewRow
                key={line.lineNumber}
                line={line}
                checked={selected.has(line.lineNumber)}
                disabled={busy}
                onToggle={() => toggle(line.lineNumber)}
              />
            ))}
          </ul>

          <button
            type="button"
            onClick={commit}
            disabled={busy || selected.size === 0}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
          >
            {committing ? "가져오는 중…" : `선택 항목 가져오기 (${selected.size}개)`}
          </button>
        </section>
      )}
    </div>
  );
}

function PreviewRow({
  line,
  checked,
  disabled,
  onToggle,
}: {
  line: WatchImportLine;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const selectable = line.status === "MATCHED" && line.anime !== null;
  const message = line.status === "UNMATCHED"
    ? "직접 검색해서 추가해주세요"
    : line.message;

  return (
    <li className="flex gap-3 rounded-xl border border-neutral-200 p-4">
      {selectable && (
        <label className="flex-none pt-1">
          <span className="sr-only">{line.lineNumber}번 줄 선택</span>
          <input
            type="checkbox"
            checked={checked}
            onChange={onToggle}
            disabled={disabled}
            className="h-4 w-4 accent-neutral-900"
          />
        </label>
      )}

      {line.anime?.coverImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={line.anime.coverImageUrl} alt="" className="h-20 w-14 flex-none rounded-md object-cover" />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-neutral-400">{line.lineNumber}번 줄</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(line.status)}`}>
            {STATUS_LABELS[line.status]}
          </span>
        </div>
        <p className="mt-1 break-words text-sm text-neutral-600">{line.rawLine}</p>
        {line.title && (
          <p className="mt-1 text-sm text-neutral-700">
            {line.title}{line.progress != null ? ` · ${line.progress}화` : ""}
          </p>
        )}
        {line.anime && (
          <p className="mt-1 font-medium text-neutral-900">
            매칭: {line.anime.titleKorean || line.anime.titleRomaji}
          </p>
        )}
        {message && <p className="mt-1 text-sm text-rose-600">{message}</p>}
      </div>
    </li>
  );
}

function statusClass(status: WatchImportLine["status"]) {
  return status === "MATCHED"
    ? "bg-emerald-50 text-emerald-700"
    : status === "UNMATCHED"
      ? "bg-neutral-100 text-neutral-600"
      : "bg-rose-50 text-rose-700";
}
