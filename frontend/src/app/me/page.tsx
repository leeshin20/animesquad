"use client";

import { useEffect, useState } from "react";
import { apiGet, type Me } from "@/app/lib/api";

export default function MePage() {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<Me>("/api/me").then(setMe).catch((e) => setError(String(e)));
  }, []);

  if (error)
    return (
      <p className="text-sm text-neutral-600">
        로그인이 필요해요.{" "}
        <a className="underline underline-offset-2 hover:text-neutral-900" href="/">
          홈으로
        </a>
      </p>
    );
  if (!me) return <p className="text-sm text-neutral-500">불러오는 중…</p>;

  return (
    <div className="flex items-center gap-4 rounded-xl border border-neutral-200 p-6">
      {me.avatarUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={me.avatarUrl} alt="" className="h-16 w-16 rounded-full" />
      )}
      <div>
        <h1 className="text-xl font-semibold">{me.displayName}</h1>
        <p className="text-sm text-neutral-500">{me.email}</p>
      </div>
    </div>
  );
}
