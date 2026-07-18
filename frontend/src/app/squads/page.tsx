"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, apiPost, type Squad } from "@/app/lib/api";

const ERROR_MESSAGES: Record<string, string> = {
  "API 409": "스쿼드는 최대 3개까지만 참여할 수 있어요.",
};

function friendlyError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  return ERROR_MESSAGES[raw] ?? raw;
}

export default function SquadsPage() {
  const [squads, setSquads] = useState<Squad[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  async function refresh() {
    try {
      setSquads(await apiGet<Squad[]>("/api/squad"));
    } catch (e) {
      setStatus(String(e));
    }
  }

  useEffect(() => { refresh(); }, []);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setStatus(null);
    try {
      await apiPost<Squad>("/api/squad", { name });
      setName("");
      await refresh();
    } catch (e) { setStatus(friendlyError(e)); }
  }

  async function onJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setStatus(null);
    try {
      await apiPost<Squad>("/api/squad/join", { inviteCode: code });
      setCode("");
      await refresh();
    } catch (e) { setStatus(friendlyError(e)); }
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">내 스쿼드</h1>
        <p className="mt-1 text-sm text-neutral-500">함께 추적하는 작은 그룹들</p>
      </header>

      {status && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {status}
        </div>
      )}

      <ul className="divide-y divide-neutral-200 overflow-hidden rounded-xl border border-neutral-200">
        {squads.map((s) => (
          <li key={s.id}>
            <Link
              href={`/squads/${s.id}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-neutral-50"
            >
              <span className="font-medium">{s.name}</span>
              <span className="font-mono text-xs text-neutral-500">{s.inviteCode}</span>
            </Link>
          </li>
        ))}
        {squads.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-neutral-500">
            아직 가입한 스쿼드가 없어요.
          </li>
        )}
      </ul>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-xl border border-neutral-200 p-5">
          <h2 className="text-sm font-semibold text-neutral-700">새 스쿼드 만들기</h2>
          <form onSubmit={onCreate} className="mt-3 flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="스쿼드 이름"
              className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-md bg-brand-strong px-4 py-2 text-sm font-medium text-white hover:bg-green-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-strong focus-visible:ring-offset-2"
            >
              만들기
            </button>
          </form>
        </section>

        <section className="rounded-xl border border-neutral-200 p-5">
          <h2 className="text-sm font-semibold text-neutral-700">초대 코드로 참여</h2>
          <form onSubmit={onJoin} className="mt-3 flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="초대 코드"
              className="flex-1 rounded-md border border-neutral-300 px-3 py-2 font-mono text-sm tracking-wider focus:border-neutral-900 focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-md bg-brand-strong px-4 py-2 text-sm font-medium text-white hover:bg-green-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-strong focus-visible:ring-offset-2"
            >
              참여
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
