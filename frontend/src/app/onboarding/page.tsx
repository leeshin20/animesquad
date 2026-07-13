"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiGet, apiPatch, apiUpload, apiPostEmpty, type Me } from "@/app/lib/api";

export default function OnboardingPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [termsChecked, setTermsChecked] = useState(false);
  const [privacyChecked, setPrivacyChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    apiGet<Me>("/api/me")
      .then((m) => {
        if (m.onboardingComplete) {
          router.replace("/");
          return;
        }
        setMe(m);
        setDisplayName(m.displayName);
      })
      .catch(() => router.replace("/"));
  }, [router]);

  function pickFile(f: File | null) {
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  async function submit() {
    const name = displayName.trim();
    if (!name) {
      setError("닉네임을 입력해주세요");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (name !== me!.displayName) {
        await apiPatch<Me>("/api/me", { displayName: name });
      }
      if (file) {
        await apiUpload<Me>("/api/me/avatar", file);
      }
      await apiPostEmpty("/api/me/agree-terms");
      router.push("/");
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  if (!me) return <p className="text-sm text-neutral-500">불러오는 중…</p>;

  const avatarSrc = preview ?? me.avatarUrl ?? "/default-avatar.png";

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">환영해요!</h1>
        <p className="mt-1 text-sm text-neutral-500">시작하기 전에 프로필을 설정해주세요.</p>
      </div>

      {/* 프로필 사진 */}
      <div className="flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={avatarSrc} alt="" className="h-20 w-20 rounded-full object-cover" />
        <div>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            사진 선택
          </button>
          {file && <p className="mt-1 text-xs text-neutral-500">{file.name}</p>}
        </div>
      </div>

      {/* 닉네임 */}
      <label className="block">
        <span className="text-xs font-medium text-neutral-600">닉네임</span>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={50}
          className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
        />
      </label>

      {/* 약관 동의 */}
      <div className="space-y-2 rounded-xl border border-neutral-200 p-4">
        <p className="text-xs font-medium text-neutral-600">필수 동의</p>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={termsChecked}
            onChange={(e) => setTermsChecked(e.target.checked)}
            className="mt-0.5 shrink-0"
          />
          <span>
            <Link href="/terms" target="_blank" className="underline underline-offset-2 hover:text-neutral-900">
              이용약관
            </Link>
            에 동의합니다
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={privacyChecked}
            onChange={(e) => setPrivacyChecked(e.target.checked)}
            className="mt-0.5 shrink-0"
          />
          <span>
            <Link href="/privacy" target="_blank" className="underline underline-offset-2 hover:text-neutral-900">
              개인정보처리방침
            </Link>
            에 동의합니다
          </span>
        </label>
      </div>

      {error && (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={saving || !termsChecked || !privacyChecked}
        className="w-full rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
      >
        {saving ? "저장 중…" : "시작하기"}
      </button>
    </div>
  );
}
