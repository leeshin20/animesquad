"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost, type Squad } from "@/app/lib/api";

export default function SquadsPage() {
  const [squads, setSquads] = useState<Squad[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  async function refresh() {
    try {
      setSquads(await apiGet<Squad[]>("/api/squads"));
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
      await apiPost<Squad>("/api/squads", { name });
      setName("");
      await refresh();
    } catch (e) { setStatus(String(e)); }
  }

  async function onJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setStatus(null);
    try {
      await apiPost<Squad>("/api/squads/join", { inviteCode: code });
      setCode("");
      await refresh();
    } catch (e) { setStatus(String(e)); }
  }

  return (
    <main style={{ padding: 40, fontFamily: "sans-serif", maxWidth: 600 }}>
      <h1>내 스쿼드</h1>
      {status && <p style={{ color: "crimson" }}>{status}</p>}

      <ul>
        {squads.map((s) => (
          <li key={s.id}>
            <a href={`/squads/${s.id}`} style={{ textDecoration: "none", color: "inherit" }}>
              <strong>{s.name}</strong>
            </a>
            {" "}— 초대 코드: <code>{s.inviteCode}</code>
          </li>
        ))}
        {squads.length === 0 && <li style={{ color: "#666" }}>아직 가입한 스쿼드가 없어요.</li>}
      </ul>

      <section style={{ marginTop: 32 }}>
        <h2>새 스쿼드 만들기</h2>
        <form onSubmit={onCreate}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="스쿼드 이름" />
          <button type="submit" style={{ marginLeft: 8 }}>만들기</button>
        </form>
      </section>

      <section style={{ marginTop: 32 }}>
        <h2>초대 코드로 참여</h2>
        <form onSubmit={onJoin}>
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="초대 코드" />
          <button type="submit" style={{ marginLeft: 8 }}>참여</button>
        </form>
      </section>
    </main>
  );
}
