"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, type SquadMember } from "@/app/lib/api";

type Props = {
  squadId: number;
  onClose: () => void;
};

export function SquadMembersModal({ squadId, onClose }: Props) {
  const [members, setMembers] = useState<SquadMember[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    apiGet<SquadMember[]>(`/api/squad/${squadId}/members`)
      .then(setMembers)
      .catch(() => setError(true));
  }, [squadId]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-neutral-800">멤버</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-neutral-500 hover:text-neutral-800"
          >
            닫기
          </button>
        </div>

        {error && (
          <p className="text-sm text-neutral-500">멤버 목록을 불러오지 못했어요.</p>
        )}
        {!error && members === null && (
          <p className="text-sm text-neutral-500">불러오는 중…</p>
        )}
        {!error && members !== null && (
          <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto">
            {members.map((m) => (
              <li key={m.userId}>
                <Link
                  href={`/users/${m.userId}`}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-neutral-50"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={m.avatarUrl ?? "/default-avatar.png"}
                    alt=""
                    className="h-9 w-9 rounded-full object-cover"
                  />
                  <span className="text-sm font-medium text-neutral-800">{m.displayName}</span>
                  {m.role === "OWNER" && (
                    <span className="ml-auto rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">
                      관리자
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
