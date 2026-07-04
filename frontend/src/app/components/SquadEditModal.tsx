"use client";

import { useState } from "react";
import { apiPatch, apiUpload, type Squad } from "@/app/lib/api";
import { ImageCropModal } from "./ImageCropModal";

type Props = {
  squad: Squad;
  onUpdated: (s: Squad) => void;
  onClose: () => void;
};

export function SquadEditModal({ squad, onUpdated, onClose }: Props) {
  const [name, setName] = useState(squad.name);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState(squad.avatarUrl);

  const SIZE_LIMIT = 2 * 1024 * 1024;

  function pickAvatar() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      if (file.size > SIZE_LIMIT) {
        alert("이미지가 너무 커요. 2MB 이하로 올려주세요.");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => setCropSrc(reader.result as string);
      reader.readAsDataURL(file);
    };
    input.click();
  }

  async function handleCropConfirm(file: File) {
    setCropSrc(null);
    setUploading(true);
    try {
      const updated = await apiUpload<Squad>(`/api/squad/${squad.id}/avatar`, file);
      setAvatarUrl(updated.avatarUrl);
      onUpdated(updated);
    } finally {
      setUploading(false);
    }
  }

  async function saveName() {
    if (!name.trim() || name.trim() === squad.name) { onClose(); return; }
    setSaving(true);
    try {
      const updated = await apiPatch<Squad>(`/api/squad/${squad.id}/name`, { name: name.trim() });
      onUpdated(updated);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {cropSrc && (
        <ImageCropModal
          src={cropSrc}
          aspect={1}
          onConfirm={handleCropConfirm}
          onCancel={() => setCropSrc(null)}
        />
      )}

      <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
          <h2 className="mb-5 text-base font-semibold text-neutral-800">스쿼드 수정</h2>

          {/* 아바타 */}
          <div className="mb-5 flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={pickAvatar}
              disabled={uploading}
              className="group relative h-24 w-24 overflow-hidden rounded-2xl bg-neutral-200 shadow-sm disabled:opacity-50"
            >
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-3xl font-bold text-neutral-400">
                  {squad.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition group-hover:opacity-100">
                <span className="text-xs font-medium text-white">변경</span>
              </div>
            </button>
            {uploading && <p className="text-xs text-neutral-500">업로드 중…</p>}
          </div>

          {/* 이름 */}
          <div className="mb-6">
            <label className="mb-1.5 block text-xs font-medium text-neutral-600">스쿼드 이름</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={30}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-800 outline-none focus:border-neutral-500"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100"
            >
              취소
            </button>
            <button
              type="button"
              onClick={saveName}
              disabled={saving || !name.trim()}
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
            >
              {saving ? "저장 중…" : "저장"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
