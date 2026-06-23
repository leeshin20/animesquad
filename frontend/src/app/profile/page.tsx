"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPatch, apiUpload, apiPostEmpty, type Me } from "@/app/lib/api";

export default function MePage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<Me>("/api/me").then(setMe).catch((e) => setError(String(e)));
  }, []);

  async function logout() {
    try {
      await apiPostEmpty("/api/me/logout");
      router.push("/");
    } catch (e) {
      setError(String(e));
    }
  }

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

  if (editing) {
    return (
      <ProfileEditor
        me={me}
        onSaved={(updated) => { setMe(updated); setEditing(false); }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 rounded-xl border border-neutral-200 p-6">
        {me.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={me.avatarUrl} alt="" className="h-16 w-16 rounded-full object-cover" />
        ) : (
          <div className="h-16 w-16 rounded-full bg-neutral-200" />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold">{me.displayName}</h1>
          <p className="text-sm text-neutral-500">{me.email}</p>
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
        >
          프로필 수정
        </button>
      </div>
      <button
        type="button"
        onClick={logout}
        className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-600 transition hover:bg-neutral-100"
      >
        로그아웃
      </button>
    </div>
  );
}

function ProfileEditor({
  me, onSaved, onCancel,
}: {
  me: Me;
  onSaved: (updated: Me) => void;
  onCancel: () => void;
}) {
  const [displayName, setDisplayName] = useState(me.displayName);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function pickFile(f: File | null) {
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  async function save() {
    const name = displayName.trim();
    if (!name) {
      setError("닉네임을 입력해주세요");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let updated: Me | null = null;
      if (name !== me.displayName) {
        updated = await apiPatch<Me>("/api/me", { displayName: name });
      }
      if (file) {
        updated = await apiUpload<Me>("/api/me/avatar", file);
      }
      onSaved(updated ?? me);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  const shownAvatar = preview ?? me.avatarUrl;

  return (
    <div className="max-w-md space-y-5 rounded-xl border border-neutral-200 p-6">
      <h1 className="text-lg font-semibold tracking-tight">프로필 수정</h1>

      <div className="flex items-center gap-4">
        {shownAvatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shownAvatar} alt="" className="h-16 w-16 rounded-full object-cover" />
        ) : (
          <div className="h-16 w-16 rounded-full bg-neutral-200" />
        )}
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
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
          >
            사진 변경
          </button>
          {file && <p className="mt-1 text-xs text-neutral-500">{file.name}</p>}
        </div>
      </div>

      <label className="block">
        <span className="text-xs font-medium text-neutral-600">닉네임</span>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={50}
          className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
        />
      </label>

      {error && (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-100"
        >
          취소
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          {saving ? "저장 중…" : "저장"}
        </button>
      </div>
    </div>
  );
}
