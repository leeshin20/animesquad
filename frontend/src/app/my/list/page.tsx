"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPatch, type WatchEntry, type WatchStatus } from "@/app/lib/api";

const STATUSES: WatchStatus[] = ["WATCHING", "COMPLETED", "ON_HOLD", "DROPPED", "PLAN_TO_WATCH"];

export default function MyListPage() {
  const [entries, setEntries] = useState<WatchEntry[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  async function refresh() {
    try { setEntries(await apiGet<WatchEntry[]>("/api/watch")); }
    catch (e) { setStatus(String(e)); }
  }

  useEffect(() => { refresh(); }, []);

  return (
    <main style={{ padding: 40, fontFamily: "sans-serif", maxWidth: 900 }}>
      <h1>내 리스트</h1>
      {status && <p style={{ color: "crimson" }}>{status}</p>}
      {entries.length === 0 && <p style={{ color: "#666" }}>아직 리스트가 비어 있어요. <a href="/anime/search">검색하러 가기</a></p>}

      <ul style={{ listStyle: "none", padding: 0 }}>
        {entries.map((e) => (
          <Row key={e.id} entry={e} onSaved={refresh} onError={setStatus} />
        ))}
      </ul>
    </main>
  );
}

function Row({
  entry, onSaved, onError,
}: {
  entry: WatchEntry;
  onSaved: () => void;
  onError: (s: string) => void;
}) {
  const [status, setStatus] = useState<WatchStatus>(entry.status);
  const [progress, setProgress] = useState<string>(String(entry.progress));
  const [score, setScore] = useState<string>(entry.score == null ? "" : String(entry.score));
  const [comment, setComment] = useState<string>(entry.comment ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await apiPatch(`/api/watch/${entry.anime.id}`, {
        status,
        progress: progress === "" ? null : Number(progress),
        score: score === "" ? null : Number(score),
        comment: comment === "" ? null : comment,
      });
      onSaved();
    } catch (err) { onError(String(err)); }
    finally { setSaving(false); }
  }

  return (
    <li style={{ display: "flex", gap: 16, padding: 12, borderBottom: "1px solid #eee" }}>
      {entry.anime.coverImageUrl && (
        <img src={entry.anime.coverImageUrl} alt="" width={60} height={84} style={{ objectFit: "cover" }} />
      )}
      <div style={{ flex: 1 }}>
        <strong>{entry.anime.titleRomaji}</strong>
        <div style={{ fontSize: 12, color: "#666" }}>
          {entry.anime.format} · {entry.anime.episodes ?? "?"}화
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <select value={status} onChange={(e) => setStatus(e.target.value as WatchStatus)}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input
            type="number" min={0} value={progress}
            onChange={(e) => setProgress(e.target.value)}
            placeholder="진도"
            style={{ width: 70 }}
          />
          <input
            type="number" min={1} max={10} value={score}
            onChange={(e) => setScore(e.target.value)}
            placeholder="점수"
            style={{ width: 70 }}
          />
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="한줄평 (최대 280자)"
            maxLength={280}
            style={{ flex: 1, minWidth: 200 }}
          />
          <button onClick={save} disabled={saving}>저장</button>
        </div>
      </div>
    </li>
  );
}
