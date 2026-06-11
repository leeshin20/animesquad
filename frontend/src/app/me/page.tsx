"use client";

import { useEffect, useState } from "react";
import { apiGet, type Me } from "@/app/lib/api";

export default function MePage() {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<Me>("/api/me").then(setMe).catch((e) => setError(String(e)));
  }, []);

  if (error) return <main style={{ padding: 40 }}>로그인이 필요해요. <a href="/">홈으로</a></main>;
  if (!me) return <main style={{ padding: 40 }}>불러오는 중…</main>;

  return (
    <main style={{ padding: 40, fontFamily: "sans-serif" }}>
      <h1>안녕하세요, {me.displayName}님</h1>
      <p>{me.email}</p>
      {me.avatarUrl && <img src={me.avatarUrl} alt="" width={64} height={64} style={{ borderRadius: 32 }} />}
    </main>
  );
}
