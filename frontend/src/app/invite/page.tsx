"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPostJsonEmpty } from "@/app/lib/api";

const ERROR_MESSAGES: Record<string, string> = {
  "API 401": "가입 정보가 만료됐어요. Google 로그인을 다시 진행해주세요.",
  "API 403": "초대코드가 올바르지 않아요.",
  "API 429": "시도 횟수가 너무 많아요. 잠시 후 다시 시도해주세요.",
  "API 503": "현재 신규 가입을 받을 수 없어요.",
};

export default function InvitePage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loginExpired, setLoginExpired] = useState(false);
  const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8080";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!code.trim() || submitting) return;

    setSubmitting(true);
    setError(null);
    setLoginExpired(false);
    try {
      await apiPostJsonEmpty("/api/auth/invite/complete", { code });
      router.replace("/onboarding");
    } catch (caught) {
      const status = caught instanceof Error ? caught.message : String(caught);
      setError(ERROR_MESSAGES[status] ?? "가입 처리 중 오류가 발생했어요.");
      setLoginExpired(status === "API 401");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">초대코드를 입력해주세요</h1>
        <p className="mt-1 text-sm text-neutral-500">가입을 완료하려면 초대코드가 필요해요.</p>
      </header>

      <form onSubmit={submit} className="space-y-4">
        <input
          type="password"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="초대코드"
          aria-label="초대코드"
          autoComplete="off"
          disabled={submitting}
          className="w-full rounded-lg border border-neutral-300 px-4 py-2.5 text-sm focus:border-neutral-900 focus:outline-none disabled:bg-neutral-100"
        />
        <button
          type="submit"
          disabled={submitting || !code.trim()}
          className="w-full rounded-md bg-brand-strong px-4 py-2.5 text-sm font-medium text-white transition hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-light focus-visible:ring-offset-2"
        >
          {submitting ? "가입 처리 중…" : "가입하기"}
        </button>
      </form>

      <div aria-live="polite">
        {error && (
          <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
            {loginExpired && (
              <>
                {" "}
                <a
                  href={`${apiBase}/oauth2/authorization/google`}
                  className="font-medium underline underline-offset-2"
                >
                  Google 로그인
                </a>
              </>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
